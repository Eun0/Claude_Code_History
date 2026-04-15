import { api } from '../api.js'

// Module-level promise cache — concurrent callers for the same session
// coalesce onto one fetch. Shared by ReferencedConversation (render) and
// MemoReferencePicker (search indexing).
const cache = new Map()

// Concurrency gate. With many memos + active picker indexing, we were
// firing 50+ parallel /api/projects/:id/sessions/:sid requests, tripping
// "TypeError: Failed to fetch" on the browser/server. A small queue serves
// the same total work but keeps each flight under the connection limit.
const MAX_INFLIGHT = 8
let inflight = 0
const waiting = []

function runNext() {
  if (inflight >= MAX_INFLIGHT) return
  const next = waiting.shift()
  if (!next) return
  inflight++
  next.run().then(
    (v) => {
      inflight--
      next.resolve(v)
      runNext()
    },
    (e) => {
      inflight--
      next.reject(e)
      runNext()
    }
  )
}

function queue(run) {
  return new Promise((resolve, reject) => {
    waiting.push({ run, resolve, reject })
    runNext()
  })
}

export function fetchSession(projectId, sessionId) {
  const key = `${projectId}|${sessionId}`
  if (!cache.has(key)) {
    const p = queue(() => api.getSession(projectId, sessionId)).catch((e) => {
      cache.delete(key)
      throw e
    })
    cache.set(key, p)
  }
  return cache.get(key)
}

// Plain-text projection of a parsed message node, used for text search. We
// keep it dumb (text/thinking/tool-name only) — tool_use inputs and results
// can be huge and are usually noise for "find the memo about X" queries.
export function extractMessageText(node) {
  if (!node) return ''
  const parts = []
  if (node.kind === 'summary' && node.text) parts.push(node.text)
  if (Array.isArray(node.blocks)) {
    for (const b of node.blocks) {
      if (b.type === 'text' && b.text) parts.push(b.text)
      else if (b.type === 'thinking' && b.thinking) parts.push(b.thinking)
      else if (b.type === 'tool_use' && b.name) parts.push(b.name)
    }
  }
  return parts.join(' ')
}
