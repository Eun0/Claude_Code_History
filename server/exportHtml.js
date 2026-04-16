// Produce a self-contained HTML for a session's memos.
// The HTML embeds: session metadata, memos (with messages), and a vanilla-JS viewer.
import fs from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { codeToHtml } from 'shiki'
import { marked } from 'marked'
import { readMemos } from './memoStore.js'
import { readSessionParsed } from './sessions.js'
import { formatToolUse } from '../src/lib/formatTools.js'
import { renderDocBody } from '../src/lib/renderMessageHtml.js'

// Strip Claude Code CLI wrappers the same way the web UserMessage does.
function cleanUserText(s) {
  if (!s) return ''
  return s
    .replace(/<command-name>[\s\S]*?<\/command-name>/g, '')
    .replace(/<command-message>[\s\S]*?<\/command-message>/g, '')
    .replace(/<command-args>([\s\S]*?)<\/command-args>/g, (_, inner) => inner.trim())
    .replace(
      /<local-command-stdout>([\s\S]*?)<\/local-command-stdout>/g,
      (_, inner) => '```\n' + inner.trim() + '\n```'
    )
    .replace(/<local-command-caveat>[\s\S]*?<\/local-command-caveat>/g, '')
    .replace(/<system-reminder>[\s\S]*?<\/system-reminder>/g, '')
    .trim()
}

function isLocalPath(href) {
  if (!href) return true
  const raw = String(href).trim()
  const lower = raw.toLowerCase()
  if (
    lower.startsWith('javascript:') ||
    lower.startsWith('data:') ||
    lower.startsWith('vbscript:')
  ) return true
  if (/^[a-z][a-z0-9+.-]*:/i.test(raw)) return false
  if (raw.startsWith('//')) return false
  if (raw.startsWith('#')) return false
  return true
}

// Render a markdown string to HTML using `marked` (GFM enabled), then
// post-process links: local file paths become plain <strong>, external
// URLs get target="_blank" rel="noreferrer".
function renderMarkdown(text) {
  if (!text) return ''
  const rawHtml = marked.parse(text, { gfm: true, breaks: false })
  return rawHtml.replace(
    /<a\s+([^>]*?)href="([^"]*)"([^>]*)>([\s\S]*?)<\/a>/gi,
    (match, pre, href, post, inner) => {
      if (isLocalPath(href)) {
        return `<strong>${inner}</strong>`
      }
      if (!/\btarget=/.test(pre + post)) {
        return `<a ${pre}href="${href}"${post} target="_blank" rel="noreferrer">${inner}</a>`
      }
      return match
    }
  )
}

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const ROOT = path.resolve(__dirname, '..')
const TEMPLATE_PATH = path.join(ROOT, 'export-template', 'template.html')
const VIEWER_DIST = path.join(ROOT, 'dist', 'viewer.min.js') // built by scripts/build-export-viewer.js
const VIEWER_SRC = path.join(ROOT, 'export-template', 'viewer.js') // dev fallback

const IS_PROD = process.env.NODE_ENV === 'production'

let templateCache = null
let viewerCache = null

async function loadTemplate() {
  // In dev, always re-read so template edits show up without restarting.
  if (!IS_PROD) return fs.readFile(TEMPLATE_PATH, 'utf-8')
  if (!templateCache) {
    templateCache = await fs.readFile(TEMPLATE_PATH, 'utf-8')
  }
  return templateCache
}

async function loadViewer() {
  // In dev, prefer the source so edits to export-template/viewer.js
  // are picked up immediately (no rebuild, no cache).
  if (!IS_PROD) return fs.readFile(VIEWER_SRC, 'utf-8')
  if (viewerCache) return viewerCache
  try {
    viewerCache = await fs.readFile(VIEWER_DIST, 'utf-8')
  } catch {
    // Fallback: serve source directly if the bundle wasn't built.
    viewerCache = await fs.readFile(VIEWER_SRC, 'utf-8')
  }
  return viewerCache
}

async function highlightCode(code, lang) {
  try {
    return await codeToHtml(code, { lang: lang || 'text', theme: 'github-light' })
  } catch {
    return `<pre><code>${escapeHtml(code)}</code></pre>`
  }
}

function escapeHtml(s) {
  return String(s || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

async function prepareBlock(block, parentKind) {
  // Text blocks: pre-render markdown to HTML on the server so the exported
  // HTML viewer can just innerHTML the result. This matches the web UI's
  // react-markdown output (headings, lists, blockquotes, tables, GFM, etc.).
  if (block.type === 'text') {
    const raw = block.text || ''
    const cleaned = parentKind === 'user' ? cleanUserText(raw) : raw
    return { ...block, renderedHtml: renderMarkdown(cleaned) }
  }
  // Use the shared `formatToolUse` helper so the exported HTML renders tool
  // blocks exactly like the web UI.
  if (block.type === 'tool_use') {
    const f = formatToolUse(block)
    let body = f.summary || ''
    if (body.startsWith(block.name)) {
      body = body.slice(block.name.length).trim()
    }
    const prepared = {
      ...block,
      toolBody: body,
      toolDetail: f.detail || null,
    }
    if (f.bodyJson) {
      const json = JSON.stringify(f.bodyJson, null, 2)
      prepared.inputJsonHtml = await highlightCode(json, 'json')
    }
    return prepared
  }
  return block
}

async function prepareNode(node) {
  if (!node.blocks) return node
  const blocks = []
  for (const b of node.blocks) {
    blocks.push(await prepareBlock(b, node.kind))
  }
  return { ...node, blocks }
}

function renderNoteMarkdown(note) {
  // Tiny markdown: paragraphs + basic code fences + inline code + bold
  if (!note) return ''
  const esc = escapeHtml(note)
  let html = esc.replace(/```([\s\S]*?)```/g, (_, code) => `<pre><code>${code}</code></pre>`)
  html = html.replace(/`([^`]+)`/g, '<code>$1</code>')
  html = html.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
  html = html
    .split(/\n{2,}/)
    .map((p) => (p.startsWith('<pre>') ? p : `<p>${p.replace(/\n/g, '<br/>')}</p>`))
    .join('')
  return html
}

export async function buildMemoExport(projectId, sessionId, { title, editable = false } = {}) {
  const [{ meta, messages }, board, template] = await Promise.all([
    readSessionParsed(projectId, sessionId),
    readMemos(sessionId),
    loadTemplate(),
  ])

  const byUuid = new Map()
  for (const n of messages) {
    if (n.uuid) byUuid.set(n.uuid, n)
  }

  const sortedMemos = [...board.memos].sort((a, b) => (a.order ?? 0) - (b.order ?? 0))

  const preparedMemos = []
  for (const memo of sortedMemos) {
    const nodes = []
    for (const uuid of memo.messageUuids || []) {
      const node = byUuid.get(uuid)
      if (!node) continue
      nodes.push(await prepareNode(node))
    }
    preparedMemos.push({
      id: memo.id,
      title: memo.title || '',
      note: memo.note || '',
      noteHtml: renderNoteMarkdown(memo.note || ''),
      nodes,
    })
  }

  const customTitle = (title || '').trim()
  const boardTitle = (board.title || '').trim()
  const headingTitle = customTitle || boardTitle || 'Claude Memos'

  const payload = {
    sessionMeta: {
      projectId,
      sessionId,
      cwd: meta.cwd,
      gitBranch: meta.gitBranch,
      model: meta.model,
      startedAt: meta.startedAt,
      endedAt: meta.endedAt,
      summary: headingTitle,
    },
    memos: preparedMemos,
    generatedAt: new Date().toISOString(),
    editable,
  }

  const docTitle = customTitle
    ? customTitle
    : `Claude Memos — ${sessionId.slice(0, 8)}`

  if (editable) {
    // /preview — keep the interactive viewer.js path for edit mode
    const viewer = await loadViewer()
    const dataScript = `<script>window.__MEMOS__=${JSON.stringify(payload).replace(/</g, '\\u003c')};</script>`
    const viewerScript = `<script>${viewer}</script>`
    const replacements = {
      __DATA__: dataScript,
      __VIEWER__: viewerScript,
      __TITLE__: escapeHtml(docTitle),
      __BODY__: '',
    }
    return template.replace(/__DATA__|__VIEWER__|__TITLE__|__BODY__/g, (m) => replacements[m])
  }

  // Download — pre-rendered static HTML, no JavaScript required.
  // Uses the same renderDocBody that the React app and viewer.js share.
  const bodyHtml = renderDocBody(payload)
  const replacements = {
    __DATA__: '',
    __VIEWER__: '',
    __TITLE__: escapeHtml(docTitle),
    __BODY__: bodyHtml,
  }
  return template.replace(/__DATA__|__VIEWER__|__TITLE__|__BODY__/g, (m) => replacements[m])
}

// Cross-session export for /editor's Download HTML. Shares the template +
// viewer.js + prepareNode + renderNoteMarkdown pipeline with the single-
// session exporter so the output is byte-compatible (same shiki highlight,
// same formatTools output, same .memo styling) — just with blocks drawn
// from different (projectId, sessionId) pairs.
export async function buildCrossSessionExport({ docTitle, intro, blocks }) {
  const template = await loadTemplate()

  // Dedupe session reads across blocks that reference the same session.
  const sessionPromises = new Map()
  function readSessionOnce(projectId, sessionId) {
    const key = `${projectId}|${sessionId}`
    if (!sessionPromises.has(key)) {
      sessionPromises.set(key, readSessionParsed(projectId, sessionId))
    }
    return sessionPromises.get(key)
  }

  const preparedMemos = []
  for (const b of blocks || []) {
    if (!b.sourceProjectId || !b.sourceSessionId) continue
    let messages = []
    try {
      const res = await readSessionOnce(b.sourceProjectId, b.sourceSessionId)
      messages = res.messages || []
    } catch {
      // Skip this block's conversation if the session can't be read.
    }
    const byUuid = new Map()
    for (const n of messages) if (n.uuid) byUuid.set(n.uuid, n)

    const nodes = []
    for (const uuid of b.messageUuids || []) {
      const node = byUuid.get(uuid)
      if (!node) continue
      nodes.push(await prepareNode(node))
    }
    preparedMemos.push({
      id: b.refId || b.sourceMemoId || ('ref_' + preparedMemos.length),
      title: b.title || '',
      note: b.note || '',
      noteHtml: renderNoteMarkdown(b.note || ''),
      nodes,
    })
  }

  const headingTitle = (docTitle || '').trim() || 'Claude Code Memos'
  const payload = {
    sessionMeta: {
      projectId: null,
      sessionId: null,
      cwd: null,
      gitBranch: null,
      model: null,
      startedAt: null,
      endedAt: null,
      summary: headingTitle,
      intro: (intro || '').trim(),
    },
    memos: preparedMemos,
    generatedAt: new Date().toISOString(),
    editable: false,
  }

  // Cross-session downloads are always static (no edit mode).
  const bodyHtml = renderDocBody(payload)
  const replacements = {
    __DATA__: '',
    __VIEWER__: '',
    __TITLE__: escapeHtml(headingTitle),
    __BODY__: bodyHtml,
  }
  return template.replace(/__DATA__|__VIEWER__|__TITLE__|__BODY__/g, (m) => replacements[m])
}
