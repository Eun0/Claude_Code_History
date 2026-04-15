import { useEffect, useMemo } from 'react'
import MessageRow from './MessageRow.jsx'
import SidechainGroup from './SidechainGroup.jsx'
import { groupSidechains } from '../lib/groupSidechains.js'
import { useMemos, actions as memoActions, pendingDrag } from '../state/memoStore.js'
import { buildMemosByMessage } from '../lib/memosByMessage.js'

// Merge consecutive continuation assistant nodes into one visual "turn".
// Invisible events (system, tool_result) sitting between two mergeable
// assistants don't break the chain — we track the index of the last
// assistant in the output and merge into it regardless of intermediate
// hidden nodes.
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
      if (node.usage) {
        prev.usage = {
          input_tokens:
            (prev.usage?.input_tokens || 0) + (node.usage.input_tokens || 0),
          output_tokens:
            (prev.usage?.output_tokens || 0) + (node.usage.output_tokens || 0),
          cache_creation_input_tokens:
            (prev.usage?.cache_creation_input_tokens || 0) +
            (node.usage.cache_creation_input_tokens || 0),
          cache_read_input_tokens:
            (prev.usage?.cache_read_input_tokens || 0) +
            (node.usage.cache_read_input_tokens || 0),
        }
      }
      continue
    }
    if (node.kind === 'assistant') {
      out.push({
        ...node,
        blocks: [...(node.blocks || [])],
        uuids: [node.uuid],
      })
      lastAssistantIdx = out.length - 1
    } else if (node.kind === 'system' || node.kind === 'tool_result') {
      // Invisible / internal events sit in the stream but don't break merging.
      out.push(node)
    } else {
      // user, summary, sidechain_group — real breaks
      out.push(node)
      lastAssistantIdx = -1
    }
  }
  return out
}

export default function MessageList({ messages, highlightedUuid }) {
  const { state } = useMemos()
  // Merge on the flat list first so intermediate system events don't block
  // merging; then wrap sidechain nodes.
  const merged = useMemo(() => mergeAssistantTurns(messages), [messages])
  const grouped = useMemo(() => groupSidechains(merged), [merged])
  const memosByMessage = useMemo(
    () => buildMemosByMessage(state.memos, state.editingMemoId),
    [state.memos, state.editingMemoId]
  )

  // End a drag whenever the mouse is released anywhere in the document.
  // Three cases on mouseup:
  //  1) row-drag was active → just end it (existing behaviour).
  //  2) only an "armed" pending anchor exists, and the user drag-selected
  //     text within a single row → leave the text selection alone, just clear
  //     the pending anchor so a later click elsewhere starts fresh.
  //  3) only an armed anchor exists with no text selected → treat it as a
  //     plain click and toggle the row.
  useEffect(() => {
    const onUp = () => {
      const anchor = pendingDrag.get()
      pendingDrag.clear()
      if (state.drag) {
        memoActions.endDrag()
        return
      }
      if (!anchor) return
      const sel = window.getSelection && window.getSelection()
      const hasText = sel && !sel.isCollapsed && sel.toString().length > 0
      if (hasText) return
      // Mimic a click-toggle on the anchor row by reusing beginDrag's toggle
      // logic and immediately ending the drag.
      memoActions.beginDrag(anchor)
      memoActions.endDrag()
    }
    document.addEventListener('mouseup', onUp)
    return () => document.removeEventListener('mouseup', onUp)
  }, [state.drag])

  // Apply content filters
  const filtered = useMemo(() => {
    return grouped.filter((node) => {
      if (node.kind === 'system' && !state.showSystem) return false
      return true
    })
  }, [grouped, state.showSystem])

  return (
    <div
      className={
        'messages' +
        (state.selectMode ? ' select-mode' : '') +
        (state.drag ? ' row-dragging' : '')
      }
    >
      {filtered.map((node, i) => {
        if (node.kind === 'sidechain_group') {
          return (
            <SidechainGroup
              key={`sc-${i}`}
              group={node}
              memosByMessage={memosByMessage}
              highlightedUuid={highlightedUuid}
            />
          )
        }
        return (
          <MessageRow
            key={node.uuid ? `msg_${node.uuid}` : `sys_${i}`}
            node={node}
            memosByMessage={memosByMessage}
            highlightedUuid={highlightedUuid}
          />
        )
      })}
    </div>
  )
}
