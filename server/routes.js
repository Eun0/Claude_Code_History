import fs from 'node:fs'
import path from 'node:path'
import { listProjects, projectDir } from './projects.js'
import { listSessionsForProject } from './sessionMeta.js'
import { readSessionParsed } from './sessions.js'
import {
  readMemos,
  createMemo,
  updateMemo,
  deleteMemo,
  listAllMemos,
  setBoardTitle,
  reorderMemos,
} from './memoStore.js'
import { buildMemoExport } from './exportHtml.js'
import { renderMemosMarkdown } from './exportMarkdown.js'
import { searchAll } from './search.js'

// Map sessionId → projectId via on-disk scan. Cached for 10s.
let projectLookupCache = { at: 0, map: new Map() }
async function projectForSession(sessionId) {
  const now = Date.now()
  if (now - projectLookupCache.at > 10_000) {
    const projects = await listProjects()
    const map = new Map()
    for (const p of projects) {
      try {
        const sessions = await listSessionsForProject(p.id)
        for (const s of sessions) {
          map.set(s.sessionId, p.id)
        }
      } catch {}
    }
    projectLookupCache = { at: now, map }
  }
  return projectLookupCache.map.get(sessionId)
}

export async function registerRoutes(app) {
  // ---- Projects / sessions ----
  app.get('/api/projects', async () => {
    return await listProjects()
  })

  app.get('/api/projects/:id/sessions', async (req, reply) => {
    try {
      return await listSessionsForProject(req.params.id)
    } catch (err) {
      if (err.code === 'ENOENT') {
        reply.code(404)
        return { error: 'project not found' }
      }
      throw err
    }
  })

  app.get('/api/projects/:id/sessions/:sessionId', async (req, reply) => {
    try {
      return await readSessionParsed(req.params.id, req.params.sessionId)
    } catch (err) {
      if (err.code === 'ENOENT') {
        reply.code(404)
        return { error: 'session not found' }
      }
      throw err
    }
  })

  // ---- Memos (CRUD) ----
  // NOTE: static sub-paths (export, preview, markdown) are registered before
  // the parameterised :memoId routes so Fastify's radix tree matches them
  // first.

  // Flat list of every memo across all sessions, for the home Memos tab.
  app.get('/api/memos', async () => {
    const memos = await listAllMemos()
    // Backfill missing projectId via the session→project lookup so older
    // memo files (saved before projectId was tracked) still link correctly.
    for (const m of memos) {
      if (!m.projectId) {
        m.projectId = (await projectForSession(m.sessionId)) || null
      }
    }
    return memos
  })

  app.get('/api/sessions/:sessionId/memos', async (req) => {
    return await readMemos(req.params.sessionId)
  })

  // Board-level patch (currently only `title`).
  app.patch('/api/sessions/:sessionId/memos', async (req, reply) => {
    try {
      const patch = req.body || {}
      if (typeof patch.title !== 'string') {
        reply.code(400)
        return { error: 'title must be a string' }
      }
      return await setBoardTitle(req.params.sessionId, patch.title)
    } catch (err) {
      reply.code(400)
      return { error: String(err.message || err) }
    }
  })

  app.post('/api/sessions/:sessionId/memos', async (req, reply) => {
    try {
      const projectId = await projectForSession(req.params.sessionId)
      return await createMemo(req.params.sessionId, {
        ...req.body,
        projectId,
      })
    } catch (err) {
      reply.code(400)
      return { error: String(err.message || err) }
    }
  })

  // ---- Export / preview / markdown ----
  // Registered BEFORE the parameterised /:memoId routes below.

  app.get('/api/sessions/:sessionId/memos/export', async (req, reply) => {
    const sessionId = req.params.sessionId
    const projectId = await projectForSession(sessionId)
    if (!projectId) {
      reply.code(404)
      return { error: 'session not found in any project' }
    }
    const title = typeof req.query?.title === 'string' ? req.query.title : ''
    const html = await buildMemoExport(projectId, sessionId, { title })
    const date = new Date().toISOString().slice(0, 10).replace(/-/g, '')
    reply
      .header('Content-Type', 'text/html; charset=utf-8')
      .header(
        'Content-Disposition',
        `attachment; filename="claude-memos-${sessionId.slice(0, 8)}-${date}.html"`
      )
    return html
  })

  app.get('/api/sessions/:sessionId/memos/preview', async (req, reply) => {
    const sessionId = req.params.sessionId
    const projectId = await projectForSession(sessionId)
    if (!projectId) {
      reply.code(404)
      return { error: 'session not found in any project' }
    }
    const title = typeof req.query?.title === 'string' ? req.query.title : ''
    const html = await buildMemoExport(projectId, sessionId, { title, editable: true })
    reply.header('Content-Type', 'text/html; charset=utf-8')
    return html
  })

  app.get('/api/sessions/:sessionId/memos/markdown', async (req, reply) => {
    const sessionId = req.params.sessionId
    const projectId = await projectForSession(sessionId)
    if (!projectId) {
      reply.code(404)
      return { error: 'session not found in any project' }
    }
    const md = await renderMemosMarkdown(projectId, sessionId)
    reply.header('Content-Type', 'text/markdown; charset=utf-8')
    return md
  })

  // ---- Memo CRUD by id (parameterised — registered last) ----

  // Atomic reorder — single read+write so concurrent per-memo PATCHes
  // can't race. Body: { orderedIds: ['memo_a', 'memo_b', ...] }.
  app.patch('/api/sessions/:sessionId/memos/order', async (req, reply) => {
    try {
      const ids = (req.body && req.body.orderedIds) || []
      return await reorderMemos(req.params.sessionId, ids)
    } catch (err) {
      reply.code(400)
      return { error: String(err.message || err) }
    }
  })

  app.patch('/api/sessions/:sessionId/memos/:memoId', async (req, reply) => {
    try {
      return await updateMemo(req.params.sessionId, req.params.memoId, req.body || {})
    } catch (err) {
      if (err.code === 'ENOENT') {
        reply.code(404)
        return { error: 'memo not found' }
      }
      reply.code(400)
      return { error: String(err.message || err) }
    }
  })

  app.delete('/api/sessions/:sessionId/memos/:memoId', async (req, reply) => {
    try {
      await deleteMemo(req.params.sessionId, req.params.memoId)
      reply.code(204)
      return null
    } catch (err) {
      if (err.code === 'ENOENT') {
        reply.code(404)
        return { error: 'memo not found' }
      }
      throw err
    }
  })

  // ---- Search ----
  app.get('/api/search', async (req) => {
    const { q, tool, from, to } = req.query
    return await searchAll({ q, tool, from, to })
  })

  // ---- Live session watch (SSE) ----
  // Tails a session's JSONL file via fs.watch and pushes an `update` event
  // whenever the file changes. The client reacts by re-fetching the session
  // and merging in any new messages — no manual refresh needed.
  app.get('/api/sessions/:sessionId/watch', async (req, reply) => {
    const sessionId = req.params.sessionId
    const projectId = await projectForSession(sessionId)
    if (!projectId) {
      reply.code(404)
      return { error: 'session not found in any project' }
    }
    const filePath = path.join(projectDir(projectId), `${sessionId}.jsonl`)

    // Hand the raw socket to us; Fastify won't try to serialise a response.
    reply.hijack()
    const raw = reply.raw

    raw.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache, no-transform',
      Connection: 'keep-alive',
      'X-Accel-Buffering': 'no',
    })
    raw.write('event: connected\ndata: {}\n\n')

    // Debounce fs.watch events — macOS/APFS often fires multiple change
    // events in rapid succession for a single append.
    let debounceTimer = null
    const notifyUpdate = () => {
      clearTimeout(debounceTimer)
      debounceTimer = setTimeout(() => {
        try {
          raw.write('event: update\ndata: {}\n\n')
        } catch {}
      }, 150)
    }

    let watcher = null
    try {
      watcher = fs.watch(filePath, { persistent: false }, (eventType) => {
        if (eventType === 'change' || eventType === 'rename') {
          notifyUpdate()
        }
      })
    } catch (err) {
      try {
        raw.write(`event: error\ndata: ${JSON.stringify({ error: String(err.message || err) })}\n\n`)
        raw.end()
      } catch {}
      return
    }

    // Heartbeat comments keep proxies and browsers from dropping the
    // connection on idle.
    const heartbeat = setInterval(() => {
      try {
        raw.write(': heartbeat\n\n')
      } catch {}
    }, 25_000)

    const cleanup = () => {
      clearInterval(heartbeat)
      clearTimeout(debounceTimer)
      if (watcher) {
        try { watcher.close() } catch {}
        watcher = null
      }
      try { raw.end() } catch {}
    }

    req.raw.on('close', cleanup)
    req.raw.on('error', cleanup)
  })
}
