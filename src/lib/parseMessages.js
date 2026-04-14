// Pure ESM module — shared between server and client.
// Takes an array of JSONL records (already JSON.parsed) and produces
// a flat ordered array of render nodes suitable for UI rendering.
//
// Node types:
//   { kind: 'user',       uuid, timestamp, blocks, isSidechain, slashCommand?, meta }
//   { kind: 'assistant',  uuid, timestamp, blocks, isSidechain, model, usage, meta }
//   { kind: 'tool_result', uuid, timestamp, toolUseId, content, isError, isSidechain, meta }
//     (synthetic: emitted when a user message is purely a tool_result wrapper)
//   { kind: 'summary',     text }
//   { kind: 'system',      level, text }  (for hidden events surfaced via toggle)
//
// Blocks (inside user/assistant):
//   { type: 'text', text }
//   { type: 'thinking', thinking }
//   { type: 'tool_use', id, name, input }
//   { type: 'tool_result', tool_use_id, content, is_error }
//   { type: 'image', media_type, data }

const COMMAND_NAME_RE = /<command-name>([\s\S]*?)<\/command-name>/

function extractSlashCommand(content) {
  const text = typeof content === 'string' ? content : ''
  const m = text.match(COMMAND_NAME_RE)
  return m ? m[1].trim() : null
}

function normalizeUserContent(content) {
  // User content can be a string or an array of blocks.
  if (typeof content === 'string') {
    return [{ type: 'text', text: content }]
  }
  if (!Array.isArray(content)) return []
  const out = []
  for (const b of content) {
    if (!b || typeof b !== 'object') continue
    if (b.type === 'text') {
      out.push({ type: 'text', text: b.text || '' })
    } else if (b.type === 'tool_result') {
      // Tool result content itself may be a string or array of blocks
      out.push({
        type: 'tool_result',
        tool_use_id: b.tool_use_id,
        content: normalizeToolResultContent(b.content),
        is_error: !!b.is_error,
      })
    } else if (b.type === 'image') {
      out.push({
        type: 'image',
        media_type: b.source?.media_type || 'image/png',
        data: b.source?.data || '',
      })
    }
  }
  return out
}

function normalizeToolResultContent(content) {
  if (content == null) return ''
  if (typeof content === 'string') return content
  if (Array.isArray(content)) {
    // Could be array of { type: 'text', text } or { type: 'image', ... }
    return content
      .map((b) => {
        if (typeof b === 'string') return b
        if (b?.type === 'text') return b.text || ''
        if (b?.type === 'image') return '[image]'
        return ''
      })
      .join('\n')
  }
  return String(content)
}

function normalizeAssistantContent(content) {
  if (!Array.isArray(content)) return []
  const out = []
  for (const b of content) {
    if (!b || typeof b !== 'object') continue
    if (b.type === 'text') {
      out.push({ type: 'text', text: b.text || '' })
    } else if (b.type === 'thinking') {
      out.push({ type: 'thinking', thinking: b.thinking || '' })
    } else if (b.type === 'tool_use') {
      out.push({
        type: 'tool_use',
        id: b.id,
        name: b.name,
        input: b.input,
      })
    } else if (b.type === 'image') {
      out.push({
        type: 'image',
        media_type: b.source?.media_type || 'image/png',
        data: b.source?.data || '',
      })
    }
  }
  return out
}

export function parseMessages(records) {
  const nodes = []
  let sessionMeta = {
    startedAt: null,
    endedAt: null,
    cwd: null,
    gitBranch: null,
    model: null,
    version: null,
    summary: null,
    aiTitle: null,
    tokenTotals: {
      input: 0,
      output: 0,
      cacheCreate: 0,
      cacheRead: 0,
    },
  }

  for (const rec of records) {
    if (!rec || typeof rec !== 'object') continue

    // Capture session-wide metadata
    if (rec.timestamp) {
      if (!sessionMeta.startedAt) sessionMeta.startedAt = rec.timestamp
      sessionMeta.endedAt = rec.timestamp
    }
    if (rec.cwd && !sessionMeta.cwd) sessionMeta.cwd = rec.cwd
    if (rec.gitBranch && !sessionMeta.gitBranch) sessionMeta.gitBranch = rec.gitBranch
    if (rec.version && !sessionMeta.version) sessionMeta.version = rec.version
    if (rec.message?.model && !sessionMeta.model) sessionMeta.model = rec.message.model

    if (rec.type === 'summary' && rec.summary) {
      sessionMeta.summary = rec.summary
      nodes.push({ kind: 'summary', text: rec.summary })
      continue
    }
    if (rec.type === 'ai-title' && rec.aiTitle) {
      sessionMeta.aiTitle = rec.aiTitle
      continue
    }

    // Ignore meta-only user records injected by the CLI harness
    if (rec.type === 'user' && rec.isMeta) {
      continue
    }

    if (rec.type === 'user') {
      const blocks = normalizeUserContent(rec.message?.content)
      if (blocks.length === 0) continue

      // Pure tool_result wrappers → separate kind for cleaner rendering
      const allToolResults = blocks.every((b) => b.type === 'tool_result')
      if (allToolResults) {
        for (const tr of blocks) {
          nodes.push({
            kind: 'tool_result',
            uuid: rec.uuid,
            timestamp: rec.timestamp,
            toolUseId: tr.tool_use_id,
            content: tr.content,
            isError: tr.is_error,
            isSidechain: !!rec.isSidechain,
          })
        }
        continue
      }

      const slashCommand = extractSlashCommand(rec.message?.content)
      nodes.push({
        kind: 'user',
        uuid: rec.uuid,
        timestamp: rec.timestamp,
        blocks,
        isSidechain: !!rec.isSidechain,
        slashCommand,
      })
      continue
    }

    if (rec.type === 'assistant') {
      const blocks = normalizeAssistantContent(rec.message?.content)
      const usage = rec.message?.usage
      if (usage) {
        sessionMeta.tokenTotals.input += usage.input_tokens || 0
        sessionMeta.tokenTotals.output += usage.output_tokens || 0
        sessionMeta.tokenTotals.cacheCreate += usage.cache_creation_input_tokens || 0
        sessionMeta.tokenTotals.cacheRead += usage.cache_read_input_tokens || 0
      }
      nodes.push({
        kind: 'assistant',
        uuid: rec.uuid,
        timestamp: rec.timestamp,
        blocks,
        isSidechain: !!rec.isSidechain,
        model: rec.message?.model || null,
        usage: usage || null,
      })
      continue
    }

    // Hidden-by-default event types surface in a system node (toggleable)
    if (
      rec.type === 'file-history-snapshot' ||
      rec.type === 'queue-operation' ||
      rec.type === 'progress' ||
      rec.type === 'permission-mode'
    ) {
      nodes.push({
        kind: 'system',
        hidden: true,
        level: rec.type,
        text: summarizeSystem(rec),
      })
      continue
    }
  }

  const paired = pairToolResults(nodes)
  annotateContinuations(paired)
  return { nodes: paired, meta: sessionMeta }
}

// Attach each tool_result to its originating tool_use block, and drop the
// paired tool_result nodes from the flat list. This lets the UI render the
// tool call + its result as one quiet inline block under the assistant's text,
// rather than as a standalone row that visually competes with the message.
export function pairToolResults(nodes) {
  const resultMap = new Map()
  for (const n of nodes) {
    if (n.kind === 'tool_result' && n.toolUseId) {
      resultMap.set(n.toolUseId, {
        content: n.content,
        isError: n.isError,
        uuid: n.uuid,
      })
    }
  }
  const pairedIds = new Set()
  for (const n of nodes) {
    if (n.kind === 'assistant' && Array.isArray(n.blocks)) {
      for (const b of n.blocks) {
        if (b.type === 'tool_use' && resultMap.has(b.id)) {
          b.result = resultMap.get(b.id)
          pairedIds.add(b.id)
        }
      }
    }
  }
  return nodes.filter((n) => {
    if (n.kind === 'tool_result' && n.toolUseId && pairedIds.has(n.toolUseId)) {
      return false
    }
    return true
  })
}

// Mark consecutive same-speaker nodes so the UI can merge them.
// Tool results and invisible system events (file-history-snapshot,
// permission-mode, queue-operation, progress) don't break a speaker turn —
// Claude calls a tool / the CLI records a snapshot / etc., then Claude keeps
// speaking. Those should preserve `prevSpeaker` so the next assistant message
// is still marked as continuation.
// Crossing a sidechain (subagent) boundary, a user turn, or a session
// `summary` DOES break continuation.
export function annotateContinuations(nodes) {
  let prevSpeaker = null
  let prevSidechain = null
  for (const node of nodes) {
    if (node.kind === 'user' || node.kind === 'assistant') {
      const sameChain = prevSidechain === null || prevSidechain === !!node.isSidechain
      node.continued = sameChain && prevSpeaker === node.kind
      prevSpeaker = node.kind
      prevSidechain = !!node.isSidechain
    } else if (node.kind === 'tool_result' || node.kind === 'system') {
      node.continued = false
      // preserve prevSpeaker/prevSidechain — invisible events aren't a turn
    } else {
      // summary (visible session divider) and anything else: real break
      node.continued = false
      prevSpeaker = null
      prevSidechain = null
    }
  }
  return nodes
}

function summarizeSystem(rec) {
  if (rec.type === 'permission-mode') return `permission-mode: ${rec.permissionMode}`
  if (rec.type === 'file-history-snapshot') return 'file snapshot'
  if (rec.type === 'queue-operation') return `queue: ${rec.operation || ''}`
  if (rec.type === 'progress') return `progress: ${rec.hookEvent || ''}`
  return rec.type
}
