import { useState } from 'react'
import MemoCard from './MemoCard.jsx'
import { useMemos } from '../state/memoStore.js'

export default function DraggableMemoList() {
  const { state, actions } = useMemos()
  const [draggingIndex, setDraggingIndex] = useState(null)
  const [overIndex, setOverIndex] = useState(null)

  const memos = state.memos

  if (memos.length === 0) {
    return (
      <div className="empty">
        No memos yet.<br />
        Select messages to begin.
      </div>
    )
  }

  const onDragStart = (e, i) => {
    setDraggingIndex(i)
    e.dataTransfer.effectAllowed = 'move'
  }
  const onDragOver = (e, i) => {
    e.preventDefault()
    e.dataTransfer.dropEffect = 'move'
    setOverIndex(i)
  }
  const onDrop = (e, i) => {
    e.preventDefault()
    if (draggingIndex == null || draggingIndex === i) {
      setDraggingIndex(null)
      setOverIndex(null)
      return
    }
    const ids = memos.map((m) => m.id)
    const [moved] = ids.splice(draggingIndex, 1)
    ids.splice(i, 0, moved)
    actions.reorderMemos(ids)
    setDraggingIndex(null)
    setOverIndex(null)
  }

  return (
    <div onDragEnd={() => { setDraggingIndex(null); setOverIndex(null) }}>
      {memos.map((memo, i) => (
        <MemoCard
          key={memo.id}
          memo={memo}
          index={i}
          dragging={draggingIndex === i}
          dragOver={overIndex === i && draggingIndex !== i}
          onDragStart={onDragStart}
          onDragOver={onDragOver}
          onDrop={onDrop}
        />
      ))}
    </div>
  )
}
