import { useEffect, useMemo, useRef, useState } from 'react'
import { marked } from 'marked'
import EditorMemoBlock from './EditorMemoBlock.jsx'
import ReferencedConversation from './ReferencedConversation.jsx'

// Shared document renderer used by both /editor (cross-session composer)
// and the in-app session memo editor (replaces /preview's edit mode).
// Banner, h1 doc-title, p.lede, dl.meta, .memo blocks, footer all live
// here so the two surfaces stay visually identical and only diverge in
// persistence / "add block" behavior, which the parent controls via
// callbacks.

export const DEFAULT_TITLE = 'Claude Code Memos'
export const DEFAULT_INTRO = 'A curated excerpt from a Claude Code session.'
export const EMPTY_MEMOS_TEXT = '(No memos yet.)'

const DOWNLOAD_ICON = (
  <svg
    viewBox="0 0 16 16"
    width="14"
    height="14"
    fill="none"
    stroke="currentColor"
    strokeWidth="1.6"
    strokeLinecap="round"
    strokeLinejoin="round"
    aria-hidden="true"
  >
    <path d="M8 2.5v7.5" />
    <path d="M4.5 7 8 10.5 11.5 7" />
    <path d="M3 12.5h10" />
  </svg>
)
const COPY_ICON = (
  <svg
    viewBox="0 0 16 16"
    width="14"
    height="14"
    fill="none"
    stroke="currentColor"
    strokeWidth="1.6"
    strokeLinecap="round"
    strokeLinejoin="round"
    aria-hidden="true"
  >
    <rect x="4" y="3" width="9" height="11" rx="1.5" />
    <path d="M7 3V2.2a.7.7 0 0 1 .7-.7h1.6a.7.7 0 0 1 .7.7V3" />
  </svg>
)
const CLEAR_ICON = (
  <svg
    viewBox="0 0 16 16"
    width="14"
    height="14"
    fill="none"
    stroke="currentColor"
    strokeWidth="1.6"
    strokeLinecap="round"
    aria-hidden="true"
  >
    <path d="M4 4l8 8M12 4l-8 8" />
  </svg>
)

function formatDateLong(d) {
  if (!d) return ''
  const date = d instanceof Date ? d : new Date(d)
  try {
    return date.toLocaleString([], {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    })
  } catch {
    return date.toISOString()
  }
}

export default function MemoDoc({
  // Document fields. omit on*Change to render that field read-only.
  docTitle,
  onDocTitleChange,
  intro,
  onIntroChange,
  metaDate,
  defaultTitle = DEFAULT_TITLE,
  defaultIntro = DEFAULT_INTRO,
  emptyText = EMPTY_MEMOS_TEXT,
  footerText,

  // Blocks + per-block callbacks. blocks have shape:
  //   { refId, title, note, sourceProjectId, sourceSessionId, messageUuids }
  blocks,
  onBlockChange,
  onBlockRemove,
  onBlockMove,
  onBlocksReorder,
  showSourceLine = true,

  // Edit/preview switch
  editMode,
  onEditModeChange,
  editBannerLabel,

  // Banner action buttons (optional — render only when handler given)
  onDownloadHtml,
  onCopyMarkdown,
  onClear,

  // Add block (renders the dashed add button when provided)
  onAddBlock,
  addBlockLabel = '＋ 메모 참조 추가',
}) {
  const [draggingIndex, setDraggingIndex] = useState(null)
  const [overIndex, setOverIndex] = useState(null)

  // Auto-grow the intro textarea so the prose flows without an inner scrollbar.
  const introRef = useRef(null)
  useEffect(() => {
    const el = introRef.current
    if (!el) return
    el.style.height = 'auto'
    el.style.height = el.scrollHeight + 'px'
  }, [intro, editMode])

  const introHtml = useMemo(() => {
    const text = (intro || '').trim() || defaultIntro
    return marked.parse(text, { gfm: true, breaks: false })
  }, [intro, defaultIntro])

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
    if (onBlocksReorder) {
      const next = [...blocks]
      const [moved] = next.splice(draggingIndex, 1)
      next.splice(i, 0, moved)
      onBlocksReorder(next.map((b) => b.refId))
    }
    setDraggingIndex(null)
    setOverIndex(null)
  }

  const titleEditable = !!onDocTitleChange
  const introEditable = !!onIntroChange

  return (
    <div
      className="editor-page"
      onDragEnd={() => {
        setDraggingIndex(null)
        setOverIndex(null)
      }}
    >
      <div className="wrap">
        <div className={'edit-banner' + (editMode ? '' : ' preview')}>
          <span className="edit-banner-label">
            {editBannerLabel ?? defaultBannerLabel(editMode)}
          </span>
          {onEditModeChange && (
            <div className="mode-switch" role="tablist">
              <button
                type="button"
                className={'mode-switch-btn' + (editMode ? ' active' : '')}
                onClick={() => onEditModeChange(true)}
              >
                Edit
              </button>
              <button
                type="button"
                className={'mode-switch-btn' + (!editMode ? ' active' : '')}
                onClick={() => onEditModeChange(false)}
              >
                Preview
              </button>
            </div>
          )}
          {onDownloadHtml && (
            <button
              type="button"
              className="download-icon"
              onClick={onDownloadHtml}
              title="Download HTML"
              aria-label="Download HTML"
            >
              {DOWNLOAD_ICON}
            </button>
          )}
          {onCopyMarkdown && (
            <button
              type="button"
              className="download-icon"
              onClick={onCopyMarkdown}
              title="Copy as Markdown"
              aria-label="Copy as Markdown"
            >
              {COPY_ICON}
            </button>
          )}
          {onClear && (
            <button
              type="button"
              className="download-icon editor-clear-icon"
              onClick={onClear}
              title="Clear"
              aria-label="Clear"
            >
              {CLEAR_ICON}
            </button>
          )}
        </div>

        {editMode && titleEditable ? (
          <input
            className="doc-title editable"
            type="text"
            placeholder={defaultTitle}
            value={docTitle}
            onChange={(e) => onDocTitleChange(e.target.value)}
          />
        ) : (
          <h1 className="doc-title">{(docTitle || '').trim() || defaultTitle}</h1>
        )}

        {editMode && introEditable ? (
          <textarea
            ref={introRef}
            className="lede lede-editable"
            placeholder={defaultIntro}
            value={intro || ''}
            onChange={(e) => onIntroChange(e.target.value)}
            rows={1}
          />
        ) : (
          <div
            className="lede"
            dangerouslySetInnerHTML={{ __html: introHtml }}
          />
        )}

        <dl className="meta">
          <span className="m-item">
            <dt>date</dt>
            {formatDateLong(metaDate)}
          </span>
        </dl>

        <div id="memos">
          {blocks.length === 0 ? (
            <p className="lede">{emptyText}</p>
          ) : editMode ? (
            blocks.map((b, i) => (
              <EditorMemoBlock
                key={b.refId}
                block={b}
                index={i}
                total={blocks.length}
                onChange={onBlockChange}
                onRemove={onBlockRemove}
                onMove={onBlockMove}
                onDragStart={onDragStart}
                onDragOver={onDragOver}
                onDrop={onDrop}
                dragging={draggingIndex === i}
                dragOver={overIndex === i && draggingIndex !== i}
                showSource={showSourceLine}
              />
            ))
          ) : (
            blocks.map((b, i) => (
              <PreviewMemo
                key={b.refId}
                block={b}
                index={i}
                showSource={showSourceLine}
              />
            ))
          )}
        </div>

        {editMode && onAddBlock && (
          <button className="editor-add-btn" onClick={onAddBlock}>
            {addBlockLabel}
          </button>
        )}

        <footer>
          {footerText ?? `Downloaded ${formatDateLong(metaDate)}`}
        </footer>
      </div>
    </div>
  )
}

function defaultBannerLabel(editMode) {
  if (editMode) {
    return (
      <>
        <span className="edit-banner-dot">●</span>
        <strong>Edit mode</strong> — click any <em>doc title</em>, <em>memo title</em>, or <em>note</em> to edit.
      </>
    )
  }
  return (
    <>
      <span className="edit-banner-dot preview">●</span>
      <strong>Preview</strong> — viewing the exported document.
    </>
  )
}

// Read-only memo section used in Preview mode. Renders to the same markup
// the downloaded HTML produces so Preview ↔ download stay pixel-identical.
function PreviewMemo({ block, index, showSource }) {
  const num = String(index + 1).padStart(2, '0')
  const title = (block.title || '').trim() || 'untitled'
  const note = (block.note || '').trim()
  const noteHtml = useMemo(
    () => (note ? marked.parse(note, { gfm: true, breaks: false }) : ''),
    [note]
  )
  const srcBits = [block.sourceProjectId, (block.sourceSessionId || '').slice(0, 8)].filter(Boolean)
  const sourceHref = block.sourceProjectId
    ? `#/p/${encodeURIComponent(block.sourceProjectId)}/s/${encodeURIComponent(
        block.sourceSessionId || ''
      )}`
    : null
  return (
    <section className="memo">
      <h2>
        <span className="index">№ {num}</span>
        {title}
      </h2>
      {noteHtml && (
        <div className="note" dangerouslySetInnerHTML={{ __html: noteHtml }} />
      )}
      <ReferencedConversation
        projectId={block.sourceProjectId}
        sessionId={block.sourceSessionId}
        messageUuids={block.messageUuids}
      />
      {showSource && srcBits.length > 0 && (
        <div className="memo-source">
          {sourceHref ? (
            <a href={sourceHref}>from {srcBits.join(' · ')}</a>
          ) : (
            <>from {srcBits.join(' · ')}</>
          )}
        </div>
      )}
    </section>
  )
}
