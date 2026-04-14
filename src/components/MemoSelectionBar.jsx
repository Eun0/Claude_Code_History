import { useState } from 'react'
import { useMemos } from '../state/memoStore.js'
import MemoEditorModal from './MemoEditorModal.jsx'

export default function MemoSelectionBar() {
  const { state, actions } = useMemos()
  const [showModal, setShowModal] = useState(false)

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
