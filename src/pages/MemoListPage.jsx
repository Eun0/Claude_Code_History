import { useEffect, useState } from 'react'
import { api } from '../api.js'
import { readHiddenProjects } from '../state/hiddenProjects.js'
import { readHiddenSessions } from '../state/hiddenSessions.js'

export default function MemoListPage() {
  const [memos, setMemos] = useState(null)
  const [error, setError] = useState(null)

  useEffect(() => {
    const hiddenP = readHiddenProjects()
    const hiddenS = readHiddenSessions()
    api
      .listMemos()
      .then((list) => {
        const visible =
          hiddenP.size || hiddenS.size
            ? list.filter(
                (m) =>
                  (!m.projectId || !hiddenP.has(m.projectId)) &&
                  (!m.sessionId || !hiddenS.has(m.sessionId))
              )
            : list
        setMemos(visible)
      })
      .catch((e) => setError(String(e)))
  }, [])

  const body = (() => {
    if (error) return <div className="empty">{error}</div>
    if (!memos) return <div className="loading">Loading…</div>
    if (memos.length === 0) return <div className="empty">No memos yet.</div>

    // Group memos by sessionId. Track count, latest createdAt (for sorting),
    // titles, and the topmost memo (smallest `order`) so the row can deep-link
    // to its first message.
    const groups = new Map()
    for (const m of memos) {
      let g = groups.get(m.sessionId)
      if (!g) {
        g = {
          sessionId: m.sessionId,
          projectId: m.projectId,
          count: 0,
          latest: '',
          titles: [],
          topMemo: null,
        }
        groups.set(m.sessionId, g)
      }
      g.count += 1
      if ((m.createdAt || '') > g.latest) g.latest = m.createdAt || ''
      g.titles.push(m.title || 'untitled')
      if (g.topMemo == null || (m.order ?? 0) < (g.topMemo.order ?? 0)) {
        g.topMemo = m
      }
    }
    const sessions = [...groups.values()].sort((a, b) =>
      a.latest === b.latest ? 0 : a.latest < b.latest ? 1 : -1
    )

    return (
      <>
        <p className="page-sub">
          {memos.length} memo{memos.length !== 1 ? 's' : ''} across {sessions.length} session
          {sessions.length !== 1 ? 's' : ''}
        </p>
        {sessions.map((s) => {
          // Deep-link to the first message of the topmost memo so the user
          // lands directly on it. SessionViewPage's deep-link useEffect
          // scrolls to the message and runs the flash animation. The flash
          // is implemented via inset box-shadow so it doesn't fight the
          // .in-memo row's solid yellow background (no flicker).
          const anchorUuid = s.topMemo?.messageUuids?.[0]
          const href = s.projectId
            ? `#/p/${encodeURIComponent(s.projectId)}/s/${encodeURIComponent(s.sessionId)}${
                anchorUuid ? `?msg=${encodeURIComponent(anchorUuid)}` : ''
              }`
            : '#/'
          return (
            <a key={s.sessionId} className="memo-row" href={href}>
              <div className="title">
                {s.projectId || 'unknown project'} · {s.sessionId.slice(0, 8)}
              </div>
              <div className="note">{s.titles.join(' · ')}</div>
              <div className="sub">
                {s.count} memo{s.count !== 1 ? 's' : ''} · last {formatDate(s.latest)}
              </div>
            </a>
          )
        })}
      </>
    )
  })()

  return (
    <div className="project-list-page">
      <h1>Memos</h1>
      {body}
    </div>
  )
}

function formatDate(iso) {
  if (!iso) return '—'
  try {
    return new Date(iso).toLocaleString([], {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    })
  } catch {
    return iso
  }
}
