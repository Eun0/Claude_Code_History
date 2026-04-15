import { useEffect, useMemo, useState } from 'react'
import UserMessage from './UserMessage.jsx'
import AssistantMessage from './AssistantMessage.jsx'
import ToolResultBlock from './ToolResultBlock.jsx'
import { groupSidechains } from '../lib/groupSidechains.js'
import { fetchSession } from '../state/sessionCache.js'

// Same merge rule as MessageList.jsx: consecutive assistant continuation
// nodes collapse into one visual turn; system/tool_result are transparent
// to the merge chain.
function mergeAssistantTurns(nodes) {
  const out = []
  let lastAssistantIdx = -1
  for (const node of nodes) {
    if (
      node.kind === 'assistant' &&
      node.continued &&
      lastAssistantIdx >= 0
    ) {
      const prev = out[lastAssistantIdx]
      prev.blocks = [...prev.blocks, ...(node.blocks || [])]
      prev.uuids = prev.uuids || [prev.uuid]
      prev.uuids.push(node.uuid)
      continue
    }
    if (node.kind === 'assistant') {
      out.push({ ...node, blocks: [...(node.blocks || [])], uuids: [node.uuid] })
      lastAssistantIdx = out.length - 1
    } else if (node.kind === 'system' || node.kind === 'tool_result') {
      out.push(node)
    } else {
      out.push(node)
      lastAssistantIdx = -1
    }
  }
  return out
}

// Read-only render of a memo's referenced messages. Mirrors viewer.js's
// renderNode output via the existing React UserMessage/AssistantMessage/
// ToolResultBlock components. No selection / drag / in-memo highlight —
// this is pure presentation, like the preview HTML.
export default function ReferencedConversation({ projectId, sessionId, messageUuids }) {
  const [messages, setMessages] = useState(null)
  const [error, setError] = useState(null)

  useEffect(() => {
    let cancelled = false
    if (!projectId || !sessionId) return
    fetchSession(projectId, sessionId)
      .then((data) => {
        if (cancelled) return
        setMessages(data.messages || [])
      })
      .catch((e) => {
        if (!cancelled) setError(String(e))
      })
    return () => {
      cancelled = true
    }
  }, [projectId, sessionId])

  const nodes = useMemo(() => {
    if (!projectId || !sessionId) return []
    if (!messages) return null
    const wanted = new Set(messageUuids || [])
    if (wanted.size === 0) return []
    const filtered = messages.filter((m) => m.uuid && wanted.has(m.uuid))
    const merged = mergeAssistantTurns(filtered)
    return groupSidechains(merged)
  }, [projectId, sessionId, messages, messageUuids])

  if (error) {
    return <div className="referenced-messages-error">대화를 불러올 수 없습니다 — {error}</div>
  }
  // Still fetching the session: show a placeholder so the user knows the
  // conversation is on its way (per-block fetches go through the
  // sessionCache concurrency queue and may take a moment to appear).
  if (messages == null && projectId && sessionId) {
    return (
      <div className="referenced-messages-loading">
        <span className="loading-spinner" aria-hidden />
        <span>대화 불러오는 중…</span>
      </div>
    )
  }
  if (nodes == null) return null
  if (nodes.length === 0) return null

  return (
    <div className="messages memo-messages">
      {nodes.map((node, i) => renderNode(node, i))}
    </div>
  )
}

function renderNode(node, i) {
  if (node.kind === 'summary') {
    return (
      <div className="summary-node" key={`sum-${i}`}>
        {node.text}
      </div>
    )
  }
  if (node.kind === 'system') {
    return null
  }
  if (node.kind === 'sidechain_group') {
    return (
      <details className="sidechain-group" key={`sc-${i}`}>
        <summary>{`subagent (${node.nodes?.length || 0} messages)`}</summary>
        <div>{node.nodes?.map((n, j) => renderNode(n, `${i}-${j}`))}</div>
      </details>
    )
  }
  const uuids =
    node.uuids && node.uuids.length > 0
      ? node.uuids
      : node.uuid
        ? [node.uuid]
        : []
  const rowClass = [
    'message-row',
    node.kind && 'kind-' + node.kind,
    node.continued && 'continuation',
  ]
    .filter(Boolean)
    .join(' ')
  return (
    <div className={rowClass} key={uuids[0] || `row-${i}`} data-uuid={uuids[0] || ''}>
      <div className="checkbox-gutter" aria-hidden />
      {node.kind === 'user' && <UserMessage node={node} />}
      {node.kind === 'assistant' && <AssistantMessage node={node} />}
      {node.kind === 'tool_result' && (
        <div className="message-content tool">
          <ToolResultBlock content={node.content} isError={node.isError} />
        </div>
      )}
    </div>
  )
}
