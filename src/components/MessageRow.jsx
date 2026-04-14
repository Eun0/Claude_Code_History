import { useEffect, useRef } from 'react'
import UserMessage from './UserMessage.jsx'
import AssistantMessage from './AssistantMessage.jsx'
import ToolResultBlock from './ToolResultBlock.jsx'
import { useMemos } from '../state/memoStore.js'

// Elements within a row that should NOT trigger row selection when clicked.
// Everything else (plain text, user bubble background, margins, etc.) is a
// valid click target for selecting the row.
const NON_SELECT_SELECTOR = 'a, button, input, textarea, summary, pre, code, [data-no-select]'

export default function MessageRow({ node, memosByMessage, highlightedUuid }) {
  const { state, actions } = useMemos()
  const ref = useRef(null)

  const uuids = node.uuids && node.uuids.length > 0
    ? node.uuids
    : node.uuid
      ? [node.uuid]
      : []

  const isSelected = uuids.some((u) => state.selectedUuids.has(u))
  const inMemo = uuids.some((u) => (memosByMessage?.get(u) || []).length > 0)
  const highlighted = uuids.some((u) => u === highlightedUuid)

  useEffect(() => {
    if (highlighted && ref.current) {
      ref.current.scrollIntoView({ behavior: 'smooth', block: 'center' })
    }
  }, [highlighted])

  const rowClass = [
    'message-row',
    node.kind && 'kind-' + node.kind,
    node.continued && 'continuation',
    isSelected && 'selected',
    inMemo && 'in-memo',
    highlighted && 'highlighted',
  ]
    .filter(Boolean)
    .join(' ')

  // Mouse-driven selection on the whole row.
  // - mousedown anywhere on the row (except interactive/code elements) starts
  //   a drag that toggles this row and establishes an anchor.
  // - mouseenter on another row while a drag is active extends the range.
  // - shift+mousedown extends range from the previous anchor.
  // Links, buttons, <summary>, <pre>, <code>, and [data-no-select] children
  // pass through to their native behaviour so the row selection never
  // hijacks a meaningful interaction or blocks copy-pasting code text.
  const onRowMouseDown = (e) => {
    if (uuids.length === 0) return
    if (e.button !== 0) return
    if (e.target.closest && e.target.closest(NON_SELECT_SELECTOR)) return
    e.preventDefault()
    if (e.shiftKey && state.lastSelectedUuid) {
      actions.selectRange(state.lastSelectedUuid, uuids[uuids.length - 1])
      return
    }
    actions.beginDrag(uuids)
  }

  const onRowMouseEnter = () => {
    if (!state.drag || uuids.length === 0) return
    actions.dragExtend(uuids)
  }

  if (node.kind === 'summary') {
    return (
      <div className="summary-node" ref={ref}>
        {node.text}
      </div>
    )
  }

  if (node.kind === 'system' && node.hidden) {
    if (!state.showSystem) return null
    return (
      <div className="system-row" ref={ref}>
        {node.text}
      </div>
    )
  }

  return (
    <div
      className={rowClass}
      data-uuid={uuids[0] || ''}
      ref={ref}
      onMouseDown={onRowMouseDown}
      onMouseEnter={onRowMouseEnter}
    >
      <div className="checkbox-gutter" aria-hidden>
        {uuids.length > 0 && (
          <input
            type="checkbox"
            checked={isSelected}
            readOnly
            tabIndex={-1}
          />
        )}
      </div>
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
