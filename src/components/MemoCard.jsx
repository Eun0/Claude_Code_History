import { useState } from 'react'
import { useMemos } from '../state/memoStore.js'
import MemoEditorModal from './MemoEditorModal.jsx'

export default function MemoCard({ memo, index, onDragStart, onDragOver, onDrop, dragging, dragOver }) {
  const { actions } = useMemos()
  const [editing, setEditing] = useState(false)

  const jump = () => {
    const firstUuid = memo.messageUuids?.[0]
    if (!firstUuid) return
    const el = document.querySelector(`[data-uuid="${firstUuid}"]`)
    if (el) {
      el.scrollIntoView({ behavior: 'smooth', block: 'center' })
      el.classList.remove('highlighted')
      void el.offsetWidth
      el.classList.add('highlighted')
    }
  }

  const num = String(index + 1).padStart(2, '0')
  const count = memo.messageUuids?.length || 0

  return (
    <>
      <div
        className={
          'memo-card' +
          (dragging ? ' dragging' : '') +
          (dragOver ? ' drag-over' : '')
        }
        draggable
        onDragStart={(e) => onDragStart(e, index)}
        onDragOver={(e) => onDragOver(e, index)}
        onDrop={(e) => onDrop(e, index)}
        onClick={jump}
      >
        <div className="memo-head">
          <span className="handle" aria-hidden>·······</span>
          <span className="memo-num">{num}</span>
          <div className={'memo-title' + (memo.title ? '' : ' empty')}>
            {memo.title || 'untitled'}
          </div>
        </div>
        {memo.note && <div className="memo-note">{memo.note}</div>}
        <div className="memo-meta">
          <span>{count} msg{count !== 1 ? 's' : ''}</span>
        </div>
        <div className="memo-actions" onClick={(e) => e.stopPropagation()}>
          <button onClick={() => setEditing(true)}>Edit</button>
          <button
            className="danger"
            onClick={() => {
              if (confirm('Delete this memo?')) actions.deleteMemo(memo.id)
            }}
          >
            Delete
          </button>
        </div>
      </div>
      {editing && (
        <MemoEditorModal
          mode="edit"
          initial={memo}
          onClose={() => setEditing(false)}
          onSubmit={async ({ title, note }) => {
            await actions.updateMemo(memo.id, { title, note })
            setEditing(false)
          }}
        />
      )}
    </>
  )
}
