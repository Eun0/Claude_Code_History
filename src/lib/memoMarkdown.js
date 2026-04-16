// Shared markdown renderer for memo sections. Used server-side
// (/api/sessions/:sid/memos/markdown) and client-side (/editor's Copy MD)
// so both surfaces produce byte-identical output for the same memo.

import { cleanUserText, mergeAssistantTurns } from './renderMessageHtml.js'

function renderUserBody(node) {
  const parts = []
  for (const b of node.blocks || []) {
    if (b.type === 'text') {
      const cleaned = cleanUserText(b.text || '')
      if (cleaned) parts.push(cleaned)
    } else if (b.type === 'image') {
      parts.push('*(image)*')
    }
  }
  return parts.join('\n\n')
}

function renderAssistantBody(node) {
  const parts = []
  for (const b of node.blocks || []) {
    if (b.type === 'text') {
      const t = (b.text || '').trim()
      if (t) parts.push(t)
    } else if (b.type === 'image') {
      parts.push('*(image)*')
    }
    // thinking, tool_use: intentionally dropped for clean share mode
  }
  return parts.join('\n\n')
}

function quote(body) {
  return body
    .split('\n')
    .map((l) => (l.length ? `> ${l}` : '>'))
    .join('\n')
}

export function renderTurns(nodes) {
  const merged = mergeAssistantTurns(nodes)
  const out = []
  for (const n of merged) {
    if (n.kind === 'user') {
      const body = renderUserBody(n)
      if (!body) continue
      const slash = n.slashCommand ? ` \`/${n.slashCommand.replace(/^\//, '')}\`` : ''
      out.push(`### 👤 You${slash}`)
      out.push('')
      out.push(quote(body))
      out.push('')
    } else if (n.kind === 'assistant') {
      const body = renderAssistantBody(n)
      if (!body) continue
      out.push('### 🤖 Claude')
      out.push('')
      out.push(quote(body))
      out.push('')
    }
  }
  return out.join('\n').trimEnd()
}

// Render one memo as a full section (`## N. title` + note + turns).
// Callers assemble the whole document (doc title, intro, join) themselves.
export function renderMemoSection({ title, note, index, nodes }) {
  const out = []
  out.push(`## ${index + 1}. ${title || '(untitled)'}`)
  out.push('')
  if (note) {
    out.push(note)
    out.push('')
  }
  const body = renderTurns(nodes || [])
  if (body) {
    out.push(body)
    out.push('')
  }
  return out.join('\n').trimEnd()
}
