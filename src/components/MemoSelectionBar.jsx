import { useState } from 'react'
import { useMemos } from '../state/memoStore.js'
import MemoEditorModal from './MemoEditorModal.jsx'

export default function MemoSelectionBar() {
  const { state, actions } = useMemos()
  const [showModal, setShowModal] = useState(false)

  // Edit Message mode: the selection bar becomes the Save/Cancel control for
  // the memo being re-sculpted. Shown even when the selection is empty so the
  // user can still cancel out or save a memo down to zero messages.
  if (state.editingMemoId) {
    const n = state.selectedUuids.size
    const editingMemo = state.memos.find((m) => m.id === state.editingMemoId)
    const label = editingMemo?.title
      ? `Editing "${editingMemo.title}"`
      : 'Editing memo'
    return (
      <div className="selection-bar editing">
        <span className="count">
          {label} · {n} message{n !== 1 ? 's' : ''}
        </span>
        <button className="primary" onClick={() => actions.saveEditMessages()}>
          Save
        </button>
        <button onClick={() => actions.cancelEditMessages()}>Cancel</button>
      </div>
    )
  }

  if (!state.selectMode || state.selectedUuids.size === 0) return null
  const n = state.selectedUuids.size

  return (
    <>
      <div className="selection-bar">
        <span className="count">{n} message{n !== 1 ? 's' : ''} selected</span>
        <button className="primary" onClick={() => setShowModal(true)}>
          Add memo
        </button>
        <button onClick={() => actions.clearSelection()}>Cancel</button>
      </div>
      {showModal && (
        <MemoEditorModal
          mode="create"
          onClose={() => setShowModal(false)}
          onSubmit={async ({ title, note }) => {
            await actions.createMemoFromSelection({ title, note })
            setShowModal(false)
          }}
        />
      )}
    </>
  )
}
