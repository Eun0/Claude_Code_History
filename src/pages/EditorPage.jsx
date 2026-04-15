import { useEffect, useMemo, useRef, useState } from 'react'
import { api } from '../api.js'
import MemoReferencePicker from '../components/MemoReferencePicker.jsx'
import MemoDoc, { DEFAULT_TITLE, DEFAULT_INTRO } from '../components/MemoDoc.jsx'
import { readDraft, writeDraft, clearDraft } from '../state/editorDraft.js'
import {
  buildMarkdown,
  buildHtml,
  downloadBlob,
  suggestFilename,
} from '../lib/editorExport.js'

// Cross-session memo composer. Owns the draft state (localStorage) and the
// reference picker; renders into <MemoDoc> which handles all visual structure.

function newRefId() {
  return 'ref_' + Math.random().toString(36).slice(2, 10)
}

export default function EditorPage() {
  const initial = useMemo(
    () => readDraft() || { docTitle: DEFAULT_TITLE, intro: DEFAULT_INTRO, blocks: [] },
    []
  )
  const [docTitle, setDocTitle] = useState(initial.docTitle)
  const [intro, setIntro] = useState(initial.intro)
  const [blocks, setBlocks] = useState(initial.blocks)
  const [editMode, setEditMode] = useState(true)
  const [metaDate, setMetaDate] = useState(() => new Date())
  const [pickerOpen, setPickerOpen] = useState(false)
  const [toast, setToast] = useState(null)

  // Strip the `_t` cache-buster the top-nav Editor link uses to force a
  // remount. Keeping it in the URL would just pollute the bookmark/share
  // surface — we only needed it long enough for hashchange to fire.
  useEffect(() => {
    if (/[?&]_t=/.test(window.location.hash)) {
      window.history.replaceState(null, '', '#/editor')
    }
  }, [])

  // On mount: pull latest messageUuids from each source memo so the doc
  // reflects any edits made elsewhere (main app, another tab) since the
  // user last touched this draft. Locally-edited title/note stay put —
  // those are intentional overrides, not stale data. Same logic the
  // Refresh button uses, just automatic on page load.
  useEffect(() => {
    if (blocks.length === 0) return
    let cancelled = false
    api
      .listMemos()
      .then((all) => {
        if (cancelled) return
        const byId = new Map(all.map((m) => [m.id, m]))
        setBlocks((prev) =>
          prev.map((b) => {
            if (!b.sourceMemoId) return b
            const src = byId.get(b.sourceMemoId)
            if (!src) return b
            return { ...b, messageUuids: src.messageUuids || b.messageUuids || [] }
          })
        )
      })
      .catch(() => {})
    return () => {
      cancelled = true
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Persist draft + refresh meta date (debounced).
  const saveTimer = useRef(null)
  useEffect(() => {
    clearTimeout(saveTimer.current)
    saveTimer.current = setTimeout(() => {
      writeDraft({ docTitle, intro, blocks })
      setMetaDate(new Date())
    }, 250)
    return () => clearTimeout(saveTimer.current)
  }, [docTitle, intro, blocks])

  const existingSourceIds = useMemo(
    () => new Set(blocks.map((b) => b.sourceMemoId)),
    [blocks]
  )

  const onPick = (memo) => {
    setBlocks((prev) => [
      ...prev,
      {
        refId: newRefId(),
        sourceMemoId: memo.id,
        sourceSessionId: memo.sessionId,
        sourceProjectId: memo.projectId || null,
        title: memo.title || '',
        note: memo.note || '',
        messageUuids: memo.messageUuids || [],
      },
    ])
  }

  const onBlockChange = (next) => {
    setBlocks((prev) => prev.map((b) => (b.refId === next.refId ? next : b)))
  }
  const onBlockRemove = (refId) => {
    setBlocks((prev) => prev.filter((b) => b.refId !== refId))
  }
  const onBlockMove = (refId, delta) => {
    setBlocks((prev) => {
      const i = prev.findIndex((b) => b.refId === refId)
      if (i < 0) return prev
      const j = i + delta
      if (j < 0 || j >= prev.length) return prev
      const next = [...prev]
      const [moved] = next.splice(i, 1)
      next.splice(j, 0, moved)
      return next
    })
  }
  const onBlocksReorder = (orderedRefIds) => {
    setBlocks((prev) => {
      const byId = new Map(prev.map((b) => [b.refId, b]))
      const next = []
      for (const id of orderedRefIds) {
        const b = byId.get(id)
        if (b) next.push(b)
      }
      return next
    })
  }

  const flashToast = (msg, ms = 2000) => {
    setToast(msg)
    setTimeout(() => setToast(null), ms)
  }

  const onDownloadHtml = () => {
    const html = buildHtml({ docTitle, intro, blocks })
    downloadBlob(suggestFilename(docTitle, 'html'), 'text/html;charset=utf-8', html)
  }
  const onCopyMarkdown = async () => {
    try {
      const md = await buildMarkdown({ docTitle, intro, blocks })
      await navigator.clipboard.writeText(md)
      flashToast('Copied as Markdown')
    } catch (err) {
      flashToast('Copy failed: ' + err.message, 3000)
    }
  }
  const onClearDraft = () => {
    if (!confirm('작성 중인 문서를 비우시겠습니까? (되돌릴 수 없음)')) return
    clearDraft()
    setDocTitle(DEFAULT_TITLE)
    setIntro(DEFAULT_INTRO)
    setBlocks([])
  }


  const isAtDefault =
    docTitle === DEFAULT_TITLE && intro === DEFAULT_INTRO && blocks.length === 0

  return (
    <>
      <MemoDoc
        docTitle={docTitle}
        onDocTitleChange={setDocTitle}
        intro={intro}
        onIntroChange={setIntro}
        metaDate={metaDate}
        blocks={blocks}
        onBlockChange={onBlockChange}
        onBlockRemove={onBlockRemove}
        onBlockMove={onBlockMove}
        onBlocksReorder={onBlocksReorder}
        editMode={editMode}
        onEditModeChange={setEditMode}
        onDownloadHtml={onDownloadHtml}
        onCopyMarkdown={onCopyMarkdown}
        onClear={isAtDefault ? null : onClearDraft}
        onAddBlock={() => setPickerOpen(true)}
        addBlockLabel="＋ 메모 참조 추가"
      />
      {pickerOpen && (
        <MemoReferencePicker
          existingSourceIds={existingSourceIds}
          onPick={onPick}
          onClose={() => setPickerOpen(false)}
        />
      )}
      {toast && <div className="toast">{toast}</div>}
    </>
  )
}
