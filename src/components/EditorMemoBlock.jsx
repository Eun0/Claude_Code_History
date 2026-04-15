import { useEffect, useRef, useState } from 'react'
import { marked } from 'marked'
import ReferencedConversation from './ReferencedConversation.jsx'

// A block in the Editor doc — mirrors the /preview page's edit-mode memo
// section (export-template/template.html + viewer.js makeNote). Title is a
// .memo-title-text input with a dashed-underline affordance. The note uses
// the click-to-edit pattern: display as a rendered `.note.editable` block
// (serif italic, accent left border), swap to a `.note-edit` textarea on
// click, commit and swap back on blur/Esc — same behavior as viewer.js.
//
// Edits here are local to the composed doc; source memos on the server are
// not mutated.
export default function EditorMemoBlock({
  block,
  index,
  total,
  onChange,
  onRemove,
  onMove,
  onDragStart,
  onDragOver,
  onDrop,
  dragging,
  dragOver,
  showSource = true,
}) {
  const [editingNote, setEditingNote] = useState(false)
  const textareaRef = useRef(null)

  const note = block.note || ''
  const noteHtml = note
    ? marked.parse(note, { gfm: true, breaks: false })
    : ''

  // Auto-size + focus the textarea when the user clicks into edit mode —
  // matches viewer.js's `ta.focus()` + `rows = Math.max(3, lines + 1)`.
  useEffect(() => {
    if (!editingNote) return
    const ta = textareaRef.current
    if (!ta) return
    ta.focus()
    ta.style.height = 'auto'
    ta.style.height = Math.max(ta.scrollHeight, 60) + 'px'
    try {
      const end = ta.value.length
      ta.setSelectionRange(end, end)
    } catch {
      // Firefox pre-focus can throw; no functional consequence.
    }
  }, [editingNote])

  const commitNote = (v) => {
    if (v !== note) onChange({ ...block, note: v })
    setEditingNote(false)
  }

  const sourceHref = block.sourceProjectId
    ? `#/p/${encodeURIComponent(block.sourceProjectId)}/s/${encodeURIComponent(
        block.sourceSessionId || ''
      )}`
    : null
  const num = String(index + 1).padStart(2, '0')

  return (
    <section
      className={
        'memo' +
        (dragging ? ' dragging' : '') +
        (dragOver ? ' drag-over' : '')
      }
      onDragOver={(e) => onDragOver(e, index)}
      onDrop={(e) => onDrop(e, index)}
    >
      {/* Always-visible toolbar on the right keeps reorder/delete obvious. */}
      <div className="memo-toolbar">
        <span
          className="memo-handle"
          draggable
          onDragStart={(e) => onDragStart(e, index)}
          onDragOver={(e) => onDragOver(e, index)}
          onDrop={(e) => onDrop(e, index)}
          aria-label="Drag to reorder"
          title="끌어서 순서 이동"
        >
          ⋮⋮
        </span>
        <button
          type="button"
          className="memo-move"
          aria-label="Move up"
          title="위로 이동"
          disabled={index === 0}
          onClick={() => onMove(block.refId, -1)}
        >
          ↑
        </button>
        <button
          type="button"
          className="memo-move"
          aria-label="Move down"
          title="아래로 이동"
          disabled={index === total - 1}
          onClick={() => onMove(block.refId, +1)}
        >
          ↓
        </button>
        <button
          type="button"
          className="memo-remove"
          aria-label="Remove block"
          title="제거"
          onClick={() => onRemove(block.refId)}
        >
          ✕
        </button>
      </div>
      <h2>
        <span className="index">№ {num}</span>
        <input
          className="memo-title-text editable"
          type="text"
          value={block.title}
          placeholder="untitled"
          onChange={(e) => onChange({ ...block, title: e.target.value })}
        />
      </h2>
      <div className="note-wrap">
        {editingNote ? (
          <textarea
            ref={textareaRef}
            className="note-edit"
            defaultValue={note}
            onBlur={(e) => commitNote(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Escape') e.currentTarget.blur()
            }}
            rows={Math.max(3, note.split('\n').length + 1)}
          />
        ) : note ? (
          <div
            className="note editable"
            onClick={() => setEditingNote(true)}
            dangerouslySetInnerHTML={{ __html: noteHtml }}
          />
        ) : (
          <div
            className="note editable is-placeholder"
            onClick={() => setEditingNote(true)}
          >
            <em>Click to add a note…</em>
          </div>
        )}
      </div>
      <ReferencedConversation
        projectId={block.sourceProjectId}
        sessionId={block.sourceSessionId}
        messageUuids={block.messageUuids}
      />
      {showSource && (
        <div className="memo-source">
          {sourceHref ? (
            <a href={sourceHref}>
              from {block.sourceProjectId} · {(block.sourceSessionId || '').slice(0, 8)}
            </a>
          ) : (
            <span>
              from {block.sourceProjectId || 'unknown'} · {(block.sourceSessionId || '').slice(0, 8)}
            </span>
          )}
        </div>
      )}
    </section>
  )
}
