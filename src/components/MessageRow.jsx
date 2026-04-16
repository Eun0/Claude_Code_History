import { useEffect, useRef } from 'react'
import UserMessage from './UserMessage.jsx'
import AssistantMessage from './AssistantMessage.jsx'
import { renderToolResult } from '../lib/renderMessageHtml.js'
import { useMemos, pendingDrag } from '../state/memoStore.js'

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

  // Mouse-driven selection on the whole row, designed to coexist with native
  // text drag-selection so users can highlight + copy message text.
  //
  // - shift+mousedown: extend row-range from the previous anchor (preventDefault
  //   so the browser doesn't shift-extend a text selection at the same time).
  // - plain mousedown: only "arm" a pending anchor — do NOT preventDefault and
  //   do NOT toggle yet. Native text selection starts normally.
  // - mouseenter on a *different* row while pending: promote to a real row-drag
  //   (clearing any text selection that started inside the anchor row).
  // - mouseup (handled in MessageList): if the user actually drag-selected text
  //   we leave selection alone; if it was just a click, toggle the anchor row.
  // Links, buttons, <summary>, <pre>, <code>, and [data-no-select] children
  // pass through to their native behaviour.
  const onRowMouseDown = (e) => {
    if (uuids.length === 0) return
    if (e.button !== 0) return
    if (e.target.closest && e.target.closest(NON_SELECT_SELECTOR)) return
    if (e.shiftKey && state.lastSelectedUuid) {
      e.preventDefault()
      actions.selectRange(state.lastSelectedUuid, uuids[uuids.length - 1])
      return
    }
    pendingDrag.arm(uuids)
  }

  const onRowMouseEnter = () => {
    if (uuids.length === 0) return
    if (state.drag) {
      actions.dragExtend(uuids)
      return
    }
    const anchor = pendingDrag.get()
    if (!anchor) return
    // Cursor crossed to another row while mousedown is still held — the user
    // intends a multi-row selection, not a text selection. Drop any text
    // selection the browser started and switch to row-drag mode.
    if (anchor.some((u) => uuids.includes(u))) return
    const sel = window.getSelection && window.getSelection()
    if (sel && sel.removeAllRanges) sel.removeAllRanges()
    actions.beginDrag(anchor)
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
        <div
          className="message-content tool"
          dangerouslySetInnerHTML={{ __html: renderToolResult(node.content, node.isError) }}
        />
      )}
    </div>
  )
}
