import { useState } from 'react'
import { api } from '../api.js'
import { useMemos } from '../state/memoStore.js'

export default function MemoExportBar({ projectId, sessionId }) {
  const { state } = useMemos()
  const [toast, setToast] = useState(null)
  const disabled = !state.sessionId || state.memos.length === 0
  const previewDisabled = !sessionId || !projectId

  const onExportHtml = () => {
    if (disabled) return
    const a = document.createElement('a')
    a.href = api.memosExportUrl(state.sessionId)
    // Empty `download` lets the server-supplied Content-Disposition filename win,
    // while still signalling download intent so the browser never navigates away.
    a.download = ''
    a.rel = 'noopener'
    document.body.appendChild(a)
    a.click()
    a.remove()
  }

  const onCopyMarkdown = async () => {
    if (disabled) return
    try {
      const md = await api.memosMarkdown(state.sessionId)
      await navigator.clipboard.writeText(md)
      setToast('Copied as Markdown')
      setTimeout(() => setToast(null), 2000)
    } catch (err) {
      setToast('Copy failed: ' + err.message)
      setTimeout(() => setToast(null), 3000)
    }
  }

  return (
    <>
      <div className="export-bar">
        <button
          className="primary"
          disabled={disabled}
          onClick={onExportHtml}
        >
          Download HTML
        </button>
        <button
          disabled={previewDisabled}
          onClick={() => {
            // Open the in-app session memo editor in a new tab. Same window
            // origin so localStorage / state stays separate but the tab feels
            // like a "side" workspace for editing this session's memos.
            const url = `${window.location.origin}${window.location.pathname}#/sessions/${encodeURIComponent(
              projectId
            )}/${encodeURIComponent(sessionId)}/edit`
            window.open(url, '_blank', 'noopener')
          }}
        >
          Preview & Edit
        </button>
        <button disabled={disabled} onClick={onCopyMarkdown}>
          Copy as Markdown
        </button>
      </div>
      {toast && <div className="toast">{toast}</div>}
    </>
  )
}
