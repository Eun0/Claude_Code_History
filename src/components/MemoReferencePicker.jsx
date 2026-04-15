import { useEffect, useMemo, useRef, useState } from 'react'
import { api } from '../api.js'
import { fetchSession, extractMessageText } from '../state/sessionCache.js'
import ReferencedConversation from './ReferencedConversation.jsx'

// 두레이 "업무 참조"-style picker. Flat list of every memo across all sessions;
// click = insert (modal stays open for consecutive picks). Search weights
// title matches above note matches above session metadata, and — once the
// background conversation index is ready — also searches the referenced
// conversation text.
export default function MemoReferencePicker({ existingSourceIds, onPick, onClose }) {
  const [memos, setMemos] = useState(null)
  const [convById, setConvById] = useState(() => new Map())
  const [indexing, setIndexing] = useState(false)
  const [error, setError] = useState(null)
  const [q, setQ] = useState('')
  // Per-memo "show conversation" toggle. Lets the user verify what's inside
  // the memo before adding it — title + note alone often isn't enough to
  // remember which exchange a memo is from.
  const [expandedIds, setExpandedIds] = useState(() => new Set())
  // Selection happens locally in the picker; nothing is added to the doc
  // until the user clicks Done. Avoids accidental adds while browsing.
  const [selectedIds, setSelectedIds] = useState(() => new Set())
  const searchRef = useRef(null)

  const toggleExpanded = (id) => {
    setExpandedIds((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }
  const toggleSelected = (id) => {
    setSelectedIds((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  const onDone = () => {
    if (selectedIds.size === 0) {
      onClose()
      return
    }
    // Preserve the order shown in the result list so users get a predictable
    // insertion order when picking many at once.
    const byId = new Map((memos || []).map((m) => [m.id, m]))
    const ordered = []
    for (const r of results) {
      if (selectedIds.has(r.id)) ordered.push(r)
    }
    // Anything selected but not visible in current results (e.g. user
    // selected, then typed a query that filtered it out) should still come
    // along.
    for (const id of selectedIds) {
      if (!ordered.some((m) => m.id === id) && byId.has(id)) {
        ordered.push(byId.get(id))
      }
    }
    for (const m of ordered) onPick(m)
    onClose()
  }

  // Two-phase load: show memos immediately so the picker is usable while
  // session fetches (and text projection) happen in the background. When
  // the index lands, conversation text becomes part of the score.
  useEffect(() => {
    let cancelled = false
    api
      .listMemos()
      .then((list) => {
        if (cancelled) return
        setMemos(list)
        buildConversationIndex(list, cancelled, (map) => {
          if (!cancelled) setConvById(map)
        }, setIndexing)
      })
      .catch((e) => {
        if (!cancelled) setError(String(e))
      })
    return () => {
      cancelled = true
    }
  }, [])

  useEffect(() => {
    searchRef.current?.focus()
  }, [])

  useEffect(() => {
    function onKey(e) {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  const results = useMemo(() => {
    if (!memos) return []
    const query = q.trim().toLowerCase()
    if (!query) {
      return [...memos].sort((a, b) => cmpCreated(b, a))
    }
    const scored = []
    for (const m of memos) {
      const title = (m.title || '').toLowerCase()
      const note = (m.note || '').toLowerCase()
      const proj = (m.projectId || '').toLowerCase()
      const sid = (m.sessionId || '').toLowerCase()
      const conv = convById.get(m.id) || ''
      let score = 0
      if (title.startsWith(query)) score += 200
      else if (title.includes(query)) score += 100
      if (note.includes(query)) score += 10
      if (conv.includes(query)) score += 5
      if (proj.includes(query) || sid.includes(query)) score += 1
      if (score > 0) scored.push({ m, score })
    }
    scored.sort((a, b) => {
      if (a.score !== b.score) return b.score - a.score
      return cmpCreated(b.m, a.m)
    })
    return scored.map((s) => s.m)
  }, [memos, q, convById])

  const existing = existingSourceIds || new Set()

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal editor-picker" onClick={(e) => e.stopPropagation()}>
        <h3>메모 참조 추가</h3>
        <input
          ref={searchRef}
          type="search"
          className="editor-picker-search"
          placeholder="메모 제목, 내용, 대화 원문으로 검색…"
          value={q}
          onChange={(e) => setQ(e.target.value)}
        />
        {indexing && (
          <div className="editor-picker-indexing">대화 원문 인덱싱 중…</div>
        )}
        <div className="editor-picker-list">
          {error && <div className="empty">{error}</div>}
          {!error && !memos && <div className="loading">Loading…</div>}
          {!error && memos && results.length === 0 && (
            <div className="empty">
              {memos.length === 0 ? '저장된 메모가 없습니다.' : '검색 결과가 없습니다.'}
            </div>
          )}
          {results.map((m) => {
            const added = existing.has(m.id)
            const selected = selectedIds.has(m.id)
            const expanded = expandedIds.has(m.id)
            const msgCount = (m.messageUuids || []).length
            const hasConversation = msgCount > 0
            return (
              <div
                key={m.id}
                className={
                  'editor-picker-item' +
                  (expanded ? ' is-expanded' : '') +
                  (selected ? ' is-selected' : '') +
                  (added ? ' is-added' : '')
                }
              >
                <div
                  className="editor-picker-pick"
                  role="checkbox"
                  aria-checked={added || selected}
                  aria-disabled={added}
                  tabIndex={added ? -1 : 0}
                  onClick={() => {
                    if (added) return
                    toggleSelected(m.id)
                  }}
                  onKeyDown={(e) => {
                    if (added) return
                    if (e.key === 'Enter' || e.key === ' ') {
                      e.preventDefault()
                      toggleSelected(m.id)
                    }
                  }}
                >
                  <span className="editor-picker-check" aria-hidden>
                    {added ? '✓' : selected ? '✓' : ''}
                  </span>
                  <div className="editor-picker-body">
                  <div className="editor-picker-title">
                    {m.title || 'untitled'}
                    {added && <span className="editor-picker-badge">Added</span>}
                  </div>
                  {m.note && <div className="editor-picker-note">{m.note}</div>}
                  <div className="editor-picker-meta">
                    <span className="editor-picker-source">
                      {m.projectId || 'unknown project'} · {(m.sessionId || '').slice(0, 8)}
                    </span>
                    {hasConversation && (
                      <button
                        type="button"
                        className="editor-picker-conv-toggle"
                        onClick={(e) => {
                          e.stopPropagation()
                          toggleExpanded(m.id)
                        }}
                        aria-expanded={expanded}
                      >
                        {expanded ? '대화 숨기기 ▴' : `대화 ${msgCount}개 보기 ▾`}
                      </button>
                    )}
                  </div>
                  </div>
                </div>
                {expanded && hasConversation && (
                  <div className="editor-picker-conversation">
                    <ReferencedConversation
                      projectId={m.projectId}
                      sessionId={m.sessionId}
                      messageUuids={m.messageUuids}
                    />
                  </div>
                )}
              </div>
            )
          })}
        </div>
        <div className="actions">
          <button onClick={onClose}>Cancel</button>
          <button
            className="primary"
            onClick={onDone}
            disabled={selectedIds.size === 0}
          >
            {selectedIds.size > 0 ? `Add (${selectedIds.size})` : 'Add'}
          </button>
        </div>
      </div>
    </div>
  )
}

function cmpCreated(a, b) {
  const ta = a.createdAt || ''
  const tb = b.createdAt || ''
  if (ta === tb) return 0
  return ta < tb ? -1 : 1
}

// Fetch every referenced session once, project its messages to plain text,
// and build an `memoId -> lowercased-text` lookup. Session fetches are
// coalesced by sessionCache, so reopening the picker is essentially free.
function buildConversationIndex(memos, cancelledRef, setMap, setIndexing) {
  const byKey = new Map() // "projectId|sessionId" -> unique
  for (const m of memos) {
    if (!m.projectId || !m.sessionId) continue
    if (!m.messageUuids || m.messageUuids.length === 0) continue
    byKey.set(`${m.projectId}|${m.sessionId}`, {
      projectId: m.projectId,
      sessionId: m.sessionId,
    })
  }
  if (byKey.size === 0) return
  setIndexing(true)
  const tasks = [...byKey.values()].map(async ({ projectId, sessionId }) => {
    try {
      const data = await fetchSession(projectId, sessionId)
      return [`${projectId}|${sessionId}`, data.messages || []]
    } catch {
      return [`${projectId}|${sessionId}`, []]
    }
  })
  Promise.all(tasks).then((results) => {
    const sessionMessages = new Map(results)
    const out = new Map()
    for (const m of memos) {
      if (!m.projectId || !m.sessionId) continue
      if (!m.messageUuids || m.messageUuids.length === 0) continue
      const msgs = sessionMessages.get(`${m.projectId}|${m.sessionId}`) || []
      const wanted = new Set(m.messageUuids)
      const parts = []
      for (const msg of msgs) {
        if (!msg.uuid || !wanted.has(msg.uuid)) continue
        const t = extractMessageText(msg)
        if (t) parts.push(t)
      }
      if (parts.length) out.set(m.id, parts.join(' ').toLowerCase())
    }
    setMap(out)
    setIndexing(false)
  })
}
