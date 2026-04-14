import { useEffect, useRef, useState } from 'react'

export default function MemoEditorModal({ initial = {}, mode = 'create', onClose, onSubmit }) {
  const [title, setTitle] = useState(initial.title || '')
  const [note, setNote] = useState(initial.note || '')
  const [saving, setSaving] = useState(false)
  const titleRef = useRef(null)

  useEffect(() => {
    titleRef.current?.focus()
  }, [])

  useEffect(() => {
    function onKey(e) {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <h3>{mode === 'edit' ? 'Edit memo' : 'Add memo'}</h3>
        <div className="field">
          <label>Title (optional)</label>
          <input
            ref={titleRef}
            type="text"
            placeholder="e.g. Vite 설정 자동 생성"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
          />
        </div>
        <div className="field">
          <label>Memo (Markdown, optional)</label>
          <textarea
            rows={6}
            placeholder="Why is this memo worth sharing?"
            value={note}
            onChange={(e) => setNote(e.target.value)}
          />
        </div>
        <div className="actions">
          <button onClick={onClose}>Cancel</button>
          <button
            className="primary"
            disabled={saving}
            onClick={async () => {
              setSaving(true)
              try {
                await onSubmit({ title: title.trim(), note: note.trim() })
              } finally {
                setSaving(false)
              }
            }}
          >
            {saving ? 'Saving…' : 'Save'}
          </button>
        </div>
      </div>
    </div>
  )
}
