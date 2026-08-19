// In-session interactive chat, backed by the official Claude Agent SDK.
//
// Design
// ------
// This viewer already (a) renders a session's JSONL via a shared renderer and
// (b) live-watches that JSONL over SSE (`/api/sessions/:id/watch`). When we
// resume a session with the SDK, Claude appends new user/assistant/tool
// messages to the SAME `<sessionId>.jsonl` file — so the existing watch path
// re-renders the conversation automatically. We therefore do NOT re-implement
// message rendering here. This service only owns the *control plane*:
//   - sending the user's prompt into a resumed session
//   - surfacing tool-permission requests to the UI and relaying the decision
//   - turn status (working / idle) + errors
//
// Permission policy: `permissionMode: 'default'` (the safe default — reads are
// allowed, dangerous ops like Bash/Write/Edit prompt). Each prompt is bridged
// to the browser via `canUseTool` → SSE `permission_request`; the user's choice
// comes back through `resolvePermission()`. "Allow for this session" replays the
// SDK's own `suggestions` as `updatedPermissions` so the same tool won't ask
// again this session.

import { query } from '@anthropic-ai/claude-agent-sdk'
import { readSessionMeta } from './sessionMeta.js'

/**
 * @typedef {Object} ChatState
 * @property {string} sessionId
 * @property {string} projectId
 * @property {string|null} cwd
 * @property {import('@anthropic-ai/claude-agent-sdk').Query|null} q
 * @property {Array<object>} queue       pending SDKUserMessages awaiting the stream
 * @property {(()=>void)|null} wake       resolver that wakes the input generator
 * @property {Set<import('node:http').ServerResponse>} clients  SSE subscribers
 * @property {Map<string,{resolve:(r:object)=>void, suggestions?:any[]}>} pendingPerms
 * @property {number} permCounter
 * @property {'idle'|'working'} status
 * @property {boolean} started           query() has been kicked off
 */

/** @type {Map<string, ChatState>} */
const sessions = new Map()

function getOrCreateState(sessionId, projectId) {
  let s = sessions.get(sessionId)
  if (!s) {
    s = {
      sessionId,
      projectId,
      cwd: null,
      q: null,
      queue: [],
      wake: null,
      clients: new Set(),
      pendingPerms: new Map(),
      permCounter: 0,
      status: 'idle',
      started: false,
    }
    sessions.set(sessionId, s)
  } else if (projectId && !s.projectId) {
    s.projectId = projectId
  }
  return s
}

function emit(state, event, payload = {}) {
  const line = `event: ${event}\ndata: ${JSON.stringify(payload)}\n\n`
  for (const res of state.clients) {
    try { res.write(line) } catch { /* dropped client; cleaned up on close */ }
  }
}

function setStatus(state, status) {
  state.status = status
  emit(state, 'status', { status })
}

// Async generator feeding user messages into the SDK's streaming-input mode.
// Stays open for the life of the session; `close()` tears it down.
async function* inputStream(state) {
  while (true) {
    if (state.queue.length === 0) {
      await new Promise((resolve) => { state.wake = resolve })
    }
    while (state.queue.length) {
      yield state.queue.shift()
    }
  }
}

// Render the user's AskUserQuestion selections into a tool feedback message.
// Claude reads this and continues the turn using the answers. We deliver it as
// a `deny` with `message` because that's the only canUseTool result that AskUser
// Question reliably treats as the user's answer in headless mode (the native
// `allow`+updatedInput answer encoding is undocumented and silently drops to
// "user did not answer").
function formatAnswers(questions, answers) {
  const lines = (questions || []).map((q, i) => {
    const a = answers?.[i]
    const picked = Array.isArray(a?.selected) ? a.selected.filter(Boolean) : []
    const custom = (a?.custom || '').trim()
    const all = [...picked, ...(custom ? [custom] : [])]
    const label = q.header || q.question || `Question ${i + 1}`
    return `- ${label}: ${all.length ? all.join(', ') : '(no selection)'}`
  })
  return `The user answered your question(s):\n${lines.join('\n')}\nProceed using these answers.`
}

// Bridge a single SDK permission prompt to the UI and await the user's verdict.
function makeCanUseTool(state) {
  return (toolName, input, opts = {}) => {
    const permId = `perm_${Date.now()}_${++state.permCounter}`

    // AskUserQuestion is not a yes/no permission — it's a multiple-choice prompt
    // for the user. Surface its questions to a dedicated UI and feed the
    // selections back as the tool's answer.
    if (toolName === 'AskUserQuestion' && Array.isArray(input?.questions)) {
      const questions = input.questions
      emit(state, 'question_request', { permId, questions })
      return new Promise((resolve) => {
        state.pendingPerms.set(permId, {
          kind: 'question',
          resolve,
          request: { permId, questions, kind: 'question' },
          questions,
        })
        if (opts.signal) {
          opts.signal.addEventListener('abort', () => {
            if (state.pendingPerms.delete(permId)) {
              emit(state, 'question_resolved', { permId })
              resolve({ behavior: 'deny', message: 'The user dismissed the question.' })
            }
          }, { once: true })
        }
      })
    }

    const request = {
      permId,
      toolName,
      input,
      title: opts.title || null,
      displayName: opts.displayName || null,
      description: opts.description || null,
      blockedPath: opts.blockedPath || null,
      decisionReason: opts.decisionReason || null,
      toolUseID: opts.toolUseID || null,
      // Whether a "for this session" choice is meaningful for this tool.
      canAllowSession: Array.isArray(opts.suggestions) && opts.suggestions.length > 0,
    }
    emit(state, 'permission_request', request)

    return new Promise((resolve) => {
      state.pendingPerms.set(permId, { resolve, suggestions: opts.suggestions, request })
      // If Claude/the turn is interrupted while we're waiting, fail closed.
      if (opts.signal) {
        opts.signal.addEventListener('abort', () => {
          if (state.pendingPerms.delete(permId)) {
            emit(state, 'permission_resolved', { permId, decision: 'aborted' })
            resolve({ behavior: 'deny', message: 'Aborted' })
          }
        }, { once: true })
      }
    })
  }
}

async function startQuery(state) {
  if (state.started) return
  state.started = true

  // Resume must run in the session's original cwd so the SDK appends to the
  // same project dir / JSONL file the watcher is tailing.
  try {
    const meta = await readSessionMeta(state.projectId, state.sessionId)
    state.cwd = meta?.cwd || null
  } catch { /* fall back to process cwd */ }

  const q = query({
    prompt: inputStream(state),
    options: {
      resume: state.sessionId,
      ...(state.cwd ? { cwd: state.cwd } : {}),
      permissionMode: 'default',
      canUseTool: makeCanUseTool(state),
    },
  })
  state.q = q

  ;(async () => {
    try {
      for await (const msg of q) {
        handleSdkMessage(state, msg)
      }
    } catch (err) {
      emit(state, 'chat_error', { message: String(err?.message || err) })
    } finally {
      setStatus(state, 'idle')
      state.started = false
      state.q = null
    }
  })()
}

function handleSdkMessage(state, msg) {
  switch (msg?.type) {
    case 'assistant':
      // Tokens land in the JSONL → the watch path renders them. We just keep
      // the "working" indicator alive.
      if (state.status !== 'working') setStatus(state, 'working')
      break
    case 'result': {
      // A turn finished. Surface the active session id so the client can detect
      // the (rare) case where resume forked into a new session file.
      const sid = msg.session_id || state.sessionId
      emit(state, 'turn_done', {
        sessionId: sid,
        durationMs: msg.duration_ms || 0,
        costUsd: msg.total_cost_usd || 0,
        isError: msg.is_error === true,
        subtype: msg.subtype || null,
      })
      setStatus(state, 'idle')
      break
    }
    default:
      break
  }
}

// ===== Public API (called by routes) =====

/** Register an SSE subscriber for a session's chat control events. */
export function addClient(sessionId, projectId, res) {
  const state = getOrCreateState(sessionId, projectId)
  state.clients.add(res)
  // Replay current status + any in-flight permission prompts so a late
  // subscriber (e.g. page reload mid-turn) gets the dialog back, not a hang.
  const only = { clients: new Set([res]) }
  emit(only, 'connected', { status: state.status })
  for (const [, pending] of state.pendingPerms) {
    if (!pending.request) continue
    if (pending.kind === 'question') emit(only, 'question_request', pending.request)
    else emit(only, 'permission_request', pending.request)
  }
  return () => { state.clients.delete(res) }
}

/** Send a user prompt into the (possibly not-yet-started) resumed session. */
export async function sendMessage(sessionId, projectId, text) {
  const state = getOrCreateState(sessionId, projectId)
  if (!state.started) await startQuery(state)
  state.queue.push({
    type: 'user',
    message: { role: 'user', content: text },
    parent_tool_use_id: null,
  })
  if (state.wake) { const w = state.wake; state.wake = null; w() }
  setStatus(state, 'working')
  return { ok: true }
}

/** Resolve a pending permission prompt. decision: 'allow'|'deny', scope: 'once'|'session'. */
export function resolvePermission(sessionId, permId, decision, scope = 'once') {
  const state = sessions.get(sessionId)
  if (!state) return { ok: false, error: 'no active chat session' }
  const pending = state.pendingPerms.get(permId)
  if (!pending) return { ok: false, error: 'unknown or already-resolved permission' }
  state.pendingPerms.delete(permId)

  let result
  if (decision === 'allow') {
    // The CLI's can_use_tool schema REQUIRES `updatedInput` (a record) on allow —
    // returning a bare {behavior:'allow'} fails with a ZodError and the tool is
    // reported as errored. Echo back the original tool input unchanged.
    result = { behavior: 'allow', updatedInput: pending.request?.input || {} }
    if (scope === 'session' && Array.isArray(pending.suggestions) && pending.suggestions.length) {
      result.updatedPermissions = pending.suggestions
    }
  } else {
    result = { behavior: 'deny', message: 'User denied this tool use.' }
  }
  pending.resolve(result)
  emit(state, 'permission_resolved', { permId, decision, scope })
  return { ok: true }
}

/**
 * Resolve a pending AskUserQuestion prompt with the user's selections.
 * answers: [{ selected: string[], custom?: string }] aligned to the questions.
 */
export function resolveQuestion(sessionId, permId, answers) {
  const state = sessions.get(sessionId)
  if (!state) return { ok: false, error: 'no active chat session' }
  const pending = state.pendingPerms.get(permId)
  if (!pending || pending.kind !== 'question') {
    return { ok: false, error: 'unknown or already-resolved question' }
  }
  state.pendingPerms.delete(permId)
  pending.resolve({ behavior: 'deny', message: formatAnswers(pending.questions, answers) })
  emit(state, 'question_resolved', { permId })
  return { ok: true }
}

/** Interrupt the in-flight turn (Esc-equivalent). */
export async function interrupt(sessionId) {
  const state = sessions.get(sessionId)
  if (!state || !state.q) return { ok: false, error: 'no active turn' }
  try {
    await state.q.interrupt()
    return { ok: true }
  } catch (err) {
    return { ok: false, error: String(err?.message || err) }
  }
}

/** Tear down a chat session entirely. */
export function stop(sessionId) {
  const state = sessions.get(sessionId)
  if (!state) return
  // Reject any dangling permission prompts so the SDK process doesn't hang.
  for (const [, pending] of state.pendingPerms) {
    try { pending.resolve({ behavior: 'deny', message: 'Session closed.' }) } catch { /* ok */ }
  }
  state.pendingPerms.clear()
  try { state.q?.close?.() } catch { /* ok */ }
  if (state.wake) { const w = state.wake; state.wake = null; w() }
  sessions.delete(sessionId)
}

export function disposeAll() {
  for (const id of Array.from(sessions.keys())) stop(id)
}
