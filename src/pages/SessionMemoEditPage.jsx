import { useEffect, useMemo, useRef, useState } from 'react'
import { api } from '../api.js'
import MemoDoc from '../components/MemoDoc.jsx'

// In-app replacement for the standalone /preview page's edit mode.
// Loads a single session's memos from the server, renders via the same
// <MemoDoc> the cross-session editor uses, and writes changes straight
// back through the existing memo API. Edits broadcast on the
// 'memo-updates' channel so the main session view's side panel refreshes.

export default function SessionMemoEditPage({ projectId, sessionId }) {
  const [board, setBoard] = useState(null) // { sessionId, projectId, title, memos }
  const [error, setError] = useState(null)
  const [editMode, setEditMode] = useState(true)
  const [metaDate, setMetaDate] = useState(() => new Date())
  const [toast, setToast] = useState(null)
  const flashToast = (msg, ms = 2000) => {
    setToast(msg)
    setTimeout(() => setToast(null), ms)
  }

  // Cross-tab sync — when the main app saves a memo (or the legacy /preview
  // tab does), refetch so we stay in sync.
  const broadcastRef = useRef(null)
  useEffect(() => {
    if (typeof BroadcastChannel === 'undefined') return
    const ch = new BroadcastChannel('memo-updates')
    broadcastRef.current = ch
    return () => {
      try { ch.close() } catch {}
      broadcastRef.current = null
    }
  }, [])
  function notifyUpdate() {
    const ch = broadcastRef.current
    if (!ch || !sessionId) return
    try { ch.postMessage({ sessionId, at: Date.now() }) } catch {}
  }

  useEffect(() => {
    let cancelled = false
    setBoard(null)
    setError(null)
    api
      .getMemos(sessionId)
      .then((b) => {
        if (cancelled) return
        setBoard({
          sessionId,
          projectId,
          title: b?.title || '',
          memos: Array.isArray(b?.memos) ? b.memos : [],
        })
      })
      .catch((e) => {
        if (!cancelled) setError(String(e))
      })
    return () => {
      cancelled = true
    }
  }, [projectId, sessionId])

  // Memos arrive with their own ids; map to the block shape MemoDoc expects.
  // We keep refId === memo.id so server PATCH/DELETE is straightforward.
  const blocks = useMemo(() => {
    if (!board) return []
    return board.memos.map((m) => ({
      refId: m.id,
      sourceMemoId: m.id,
      sourceProjectId: projectId,
      sourceSessionId: sessionId,
      title: m.title || '',
      note: m.note || '',
      messageUuids: m.messageUuids || [],
      order: m.order ?? 0,
    }))
  }, [board, projectId, sessionId])

  // Debounced PATCH for title/note edits — keystrokes shouldn't fire one
  // request per character.
  const pendingEdits = useRef(new Map())
  const editTimer = useRef(null)
  const queueEdit = (memoId, patch) => {
    const cur = pendingEdits.current.get(memoId) || {}
    pendingEdits.current.set(memoId, { ...cur, ...patch })
    clearTimeout(editTimer.current)
    editTimer.current = setTimeout(flushEdits, 350)
  }
  const flushEdits = async () => {
    const map = pendingEdits.current
    if (map.size === 0) return
    pendingEdits.current = new Map()
    setMetaDate(new Date())
    let anyError = null
    for (const [memoId, patch] of map.entries()) {
      try {
        await api.updateMemo(sessionId, memoId, patch)
      } catch (err) {
        anyError = err
      }
    }
    if (anyError) {
      flashToast('Save failed: ' + anyError.message, 3000)
    } else {
      notifyUpdate()
    }
  }

  // Optimistic block update: set local state, then queue server PATCH.
  const onBlockChange = (next) => {
    setBoard((prev) => {
      if (!prev) return prev
      return {
        ...prev,
        memos: prev.memos.map((m) =>
          m.id === next.refId ? { ...m, title: next.title, note: next.note } : m
        ),
      }
    })
    queueEdit(next.refId, { title: next.title, note: next.note })
  }

  const onBlockRemove = (refId) => {
    if (!confirm('이 메모를 삭제하시겠습니까?')) return
    setBoard((prev) =>
      prev ? { ...prev, memos: prev.memos.filter((m) => m.id !== refId) } : prev
    )
    api
      .deleteMemo(sessionId, refId)
      .then(() => {
        notifyUpdate()
        flashToast('Removed')
      })
      .catch((err) => flashToast('Remove failed: ' + err.message, 3000))
  }

  const reorderToIds = (ids) => {
    setBoard((prev) => {
      if (!prev) return prev
      const byId = new Map(prev.memos.map((m) => [m.id, m]))
      const next = []
      for (const id of ids) {
        const m = byId.get(id)
        if (m) next.push({ ...m, order: next.length })
      }
      return { ...prev, memos: next }
    })
    // Atomic reorder endpoint — single read+write, no PATCH-race 404s.
    fetch('/api/sessions/' + encodeURIComponent(sessionId) + '/memos/order', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ orderedIds: ids }),
    })
      .then((res) => {
        if (!res.ok) throw new Error('HTTP ' + res.status)
        notifyUpdate()
      })
      .catch((err) => flashToast('Reorder failed: ' + err.message, 3000))
  }

  const onBlockMove = (refId, delta) => {
    const ids = blocks.map((b) => b.refId)
    const i = ids.indexOf(refId)
    if (i < 0) return
    const j = i + delta
    if (j < 0 || j >= ids.length) return
    const next = [...ids]
    const [moved] = next.splice(i, 1)
    next.splice(j, 0, moved)
    reorderToIds(next)
  }

  const onBlocksReorder = (orderedRefIds) => {
    reorderToIds(orderedRefIds)
  }

  // Board title edit: PATCH /memos with { title }.
  const boardTitleTimer = useRef(null)
  const onDocTitleChange = (next) => {
    setBoard((prev) => (prev ? { ...prev, title: next } : prev))
    clearTimeout(boardTitleTimer.current)
    boardTitleTimer.current = setTimeout(() => {
      api
        .updateBoardTitle(sessionId, next)
        .then(notifyUpdate)
        .catch((err) => flashToast('Save failed: ' + err.message, 3000))
    }, 350)
  }

  const onDownloadHtml = () => {
    const a = document.createElement('a')
    a.href = api.memosExportUrl(sessionId, board?.title || '')
    a.download = ''
    a.rel = 'noopener'
    document.body.appendChild(a)
    a.click()
    a.remove()
  }
  const onCopyMarkdown = async () => {
    try {
      const md = await api.memosMarkdown(sessionId)
      await navigator.clipboard.writeText(md)
      flashToast('Copied as Markdown')
    } catch (err) {
      flashToast('Copy failed: ' + err.message, 3000)
    }
  }

  if (error) {
    return (
      <div className="editor-page">
        <div className="wrap">
          <div className="empty">{error}</div>
        </div>
      </div>
    )
  }
  if (!board) {
    return (
      <div className="editor-page">
        <div className="wrap">
          <div className="loading">Loading…</div>
        </div>
      </div>
    )
  }

  return (
    <>
      <MemoDoc
        docTitle={board.title}
        onDocTitleChange={onDocTitleChange}
        intro=""
        // No editable intro here — session memo board has no intro field.
        // The lede shows the read-only "A curated excerpt…" default.
        metaDate={metaDate}
        blocks={blocks}
        onBlockChange={onBlockChange}
        onBlockRemove={onBlockRemove}
        onBlockMove={onBlockMove}
        onBlocksReorder={onBlocksReorder}
        showSourceLine={false}
        editMode={editMode}
        onEditModeChange={setEditMode}
        onDownloadHtml={onDownloadHtml}
        onCopyMarkdown={onCopyMarkdown}
      />
      {toast && <div className="toast">{toast}</div>}
    </>
  )
}
