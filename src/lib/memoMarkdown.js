// Shared markdown renderer for memo sections. Used server-side
// (/api/sessions/:sid/memos/markdown) and client-side (/editor's Copy MD)
// so both surfaces produce byte-identical output for the same memo.

// Strip Claude Code CLI wrappers the same way the web UserMessage / HTML
// exporter do, so copied markdown doesn't include `<command-name>` etc.
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

// Merge consecutive assistant nodes (with intervening tool_result / system
// events) into a single turn so they share one "Claude" header. Mirrors the
// exported HTML viewer's `mergeAssistantTurns`.
function mergeAssistantTurns(nodes) {
  const out = []
  let prevSpeaker = null
  let lastAssistantIdx = -1
  for (const n of nodes) {
    const isAssistant = n.kind === 'assistant'
    const continuesPrev =
      isAssistant && prevSpeaker === 'assistant' && lastAssistantIdx >= 0
    if (continuesPrev) {
      const prev = out[lastAssistantIdx]
      prev.blocks = (prev.blocks || []).concat(n.blocks || [])
    } else if (isAssistant) {
      out.push({ ...n, blocks: (n.blocks || []).slice() })
      lastAssistantIdx = out.length - 1
    } else if (n.kind === 'system' || n.kind === 'tool_result') {
      // invisible events — don't break the assistant run
    } else {
      out.push(n)
      lastAssistantIdx = -1
    }
    if (n.kind === 'user' || n.kind === 'assistant') {
      prevSpeaker = n.kind
    } else if (n.kind !== 'tool_result' && n.kind !== 'system') {
      prevSpeaker = null
    }
  }
  return out
}

function quote(body) {
  return body
    .split('\n')
    .map((l) => (l.length ? `> ${l}` : '>'))
    .join('\n')
}

function renderTurns(nodes) {
  const merged = mergeAssistantTurns(nodes)
  const out = []
  for (const n of merged) {
    if (n.kind === 'user') {
      const body = renderUserBody(n)
      if (!body) continue
      const slash = n.slashCommand ? ` \`/${n.slashCommand}\`` : ''
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
