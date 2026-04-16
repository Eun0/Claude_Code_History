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
const TASK_NOTIF_RE = /<task-notification>([\s\S]*?)<\/task-notification>/g

function extractSlashCommand(content) {
  const text = typeof content === 'string' ? content : ''
  const m = text.match(COMMAND_NAME_RE)
  return m ? m[1].trim() : null
}

// Extract all <task-notification> blocks from a user record's text content.
// Returns an array of { taskId, status, summary } or null if none found.
function extractTaskNotifications(content) {
  const text = typeof content === 'string'
    ? content
    : Array.isArray(content)
      ? content.filter((b) => b.type === 'text').map((b) => b.text || '').join('')
      : ''
  const notifs = []
  let m
  TASK_NOTIF_RE.lastIndex = 0
  while ((m = TASK_NOTIF_RE.exec(text)) !== null) {
    const body = m[1]
    const status = (body.match(/<status>([\s\S]*?)<\/status>/) || [])[1] || ''
    const summary = (body.match(/<summary>([\s\S]*?)<\/summary>/) || [])[1] || ''
    const taskId = (body.match(/<task-id>([\s\S]*?)<\/task-id>/) || [])[1] || ''
    notifs.push({ taskId: taskId.trim(), status: status.trim(), summary: summary.trim() })
  }
  return notifs.length ? notifs : null
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
      // Task notifications (subagent/background command completion) are
      // injected as `type: 'user'` by the CLI but should render as a
      // collapsible Claude block, not a user bubble.
      const taskNotifs = extractTaskNotifications(rec.message?.content)
      if (taskNotifs) {
        // Emit as assistant continuation with a synthetic thinking-like
        // block so it merges into the preceding Claude message's tool
        // group as a collapsible item.
        const thinkingBlocks = taskNotifs.map((n) => ({
          type: 'thinking',
          thinking: `[Task ${n.status}] ${n.summary || n.taskId}`,
        }))
        nodes.push({
          kind: 'assistant',
          uuid: rec.uuid,
          timestamp: rec.timestamp,
          blocks: thinkingBlocks,
          isSidechain: !!rec.isSidechain,
          model: null,
          usage: null,
        })

        // If the record has content BESIDES the notification (rare but
        // possible), fall through to create a user node for the rest.
        const rawText = typeof rec.message?.content === 'string'
          ? rec.message.content
          : Array.isArray(rec.message?.content)
            ? rec.message.content.filter((b) => b.type === 'text').map((b) => b.text || '').join('')
            : ''
        const stripped = rawText.replace(TASK_NOTIF_RE, '').trim()
        if (!stripped) continue
        // Re-parse the stripped content for any remaining user text
        const remainderBlocks = normalizeUserContent(stripped)
        if (remainderBlocks.length === 0) continue
        // Fall through to create a user node below with remainderBlocks
        const slashCommand = extractSlashCommand(stripped)
        nodes.push({
          kind: 'user',
          uuid: rec.uuid,
          timestamp: rec.timestamp,
          blocks: remainderBlocks,
          isSidechain: !!rec.isSidechain,
          slashCommand,
        })
        continue
      }

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
            rawResult: rec.toolUseResult,
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
//
// Special case — AskUserQuestion: the "tool result" is really the user's
// answer. Burying it inside the collapsed tool group hides the most important
// part of the conversation, so we instead replace the tool_result row with a
// synthetic user message displaying the formatted Q/A pairs.
export function pairToolResults(nodes) {
  const resultIdxByToolId = new Map()
  for (let i = 0; i < nodes.length; i++) {
    const n = nodes[i]
    if (n.kind === 'tool_result' && n.toolUseId) {
      resultIdxByToolId.set(n.toolUseId, i)
    }
  }
  const pairedIds = new Set()
  const replacements = new Map() // index → synthetic node to substitute in
  for (const n of nodes) {
    if (n.kind === 'assistant' && Array.isArray(n.blocks)) {
      for (let bi = 0; bi < n.blocks.length; bi++) {
        const b = n.blocks[bi]
        if (b.type !== 'tool_use') continue
        const idx = resultIdxByToolId.get(b.id)
        if (b.name === 'AskUserQuestion') {
          // Replace the tool_use block with a plain text block so the
          // questions render as visible Claude text (outside the collapsed
          // tool group). The user's answers are surfaced separately as a
          // synthetic user message below.
          n.blocks[bi] = buildAskUserQuestionTextBlock(b)
          if (idx !== undefined) {
            replacements.set(idx, buildAskUserAnswerNode(b, nodes[idx]))
            pairedIds.add(b.id) // signals "drop the original tool_result row"
          }
          continue
        }
        if (idx === undefined) continue
        const resultNode = nodes[idx]
        b.result = {
          content: resultNode.content,
          isError: resultNode.isError,
          uuid: resultNode.uuid,
        }
        pairedIds.add(b.id)
      }
    }
  }
  const out = []
  for (let i = 0; i < nodes.length; i++) {
    const n = nodes[i]
    if (n.kind === 'tool_result' && n.toolUseId && pairedIds.has(n.toolUseId)) {
      const replacement = replacements.get(i)
      if (replacement) out.push(replacement)
      continue
    }
    out.push(n)
  }
  return out
}

// Convert an AskUserQuestion tool_use block into a visible text block listing
// the questions. Mirrors the user-side answer formatting so question and
// answer line up visually across the two bubbles.
function buildAskUserQuestionTextBlock(toolUseBlock) {
  const qs = Array.isArray(toolUseBlock?.input?.questions)
    ? toolUseBlock.input.questions
    : []
  const body = qs.length
    ? qs.map((q, i) => `질문 ${i + 1}: ${q?.question || ''}`).join('  \n')
    : '_(no questions)_'
  // Bold prefix sits on its own line above the question list, separated by a
  // blank line so markdown treats it as its own paragraph.
  const text = `**AskUserQuestion 도구 호출**\n\n${body}`
  return { type: 'text', text }
}

// Render the user's AskUserQuestion answers as a regular user bubble, since
// from the user's perspective those answers ARE their turn in the conversation.
function buildAskUserAnswerNode(toolUseBlock, resultNode) {
  const pairs = extractAskAnswers(toolUseBlock, resultNode)
  // Just the numbered answers — the question text already shows on Claude's
  // side, so repeating it here would be visual noise. Two trailing spaces
  // force a markdown hard line break between answers.
  const text = pairs.length
    ? pairs
        .map((p, i) => `답변 ${i + 1}: ${p.answer || '_(no answer)_'}`)
        .join('  \n')
    : '_(no answer recorded)_'
  return {
    kind: 'user',
    uuid: resultNode.uuid,
    timestamp: resultNode.timestamp,
    blocks: [{ type: 'text', text }],
    isSidechain: !!resultNode.isSidechain,
    slashCommand: null,
    askUserAnswer: true,
  }
}

function extractAskAnswers(toolUseBlock, resultNode) {
  // 1) Best source: the structured `answers` object that Claude Code writes
  //    to toolUseResult — preserves Q→A mapping cleanly even when the answer
  //    text contains commas, quotes, or newlines.
  const answers = resultNode?.rawResult?.answers
  if (answers && typeof answers === 'object' && !Array.isArray(answers)) {
    return Object.entries(answers).map(([q, a]) => ({
      question: q,
      answer: typeof a === 'string' ? a : JSON.stringify(a),
    }))
  }
  // 2) Fallback: parse the tool_result content string of shape
  //    `User has answered your questions: "Q1"="A1", "Q2"="A2". You can ...`
  //    Match `"..."=` then a balanced quoted answer that may contain escapes.
  const content = typeof resultNode?.content === 'string' ? resultNode.content : ''
  const out = []
  const re = /"((?:[^"\\]|\\.)*)"=\s*"((?:[^"\\]|\\.)*)"/g
  let m
  while ((m = re.exec(content)) !== null) {
    out.push({ question: unescapeJsonish(m[1]), answer: unescapeJsonish(m[2]) })
  }
  if (out.length > 0) return out
  // 3) Last resort: list the questions from the tool_use input with empty
  //    answers, so the user can at least see what was asked.
  const qs = Array.isArray(toolUseBlock?.input?.questions)
    ? toolUseBlock.input.questions
    : []
  return qs.map((q) => ({ question: q?.question || '', answer: '' }))
}

function unescapeJsonish(s) {
  return s
    .replace(/\\n/g, '\n')
    .replace(/\\t/g, '\t')
    .replace(/\\"/g, '"')
    .replace(/\\\\/g, '\\')
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
