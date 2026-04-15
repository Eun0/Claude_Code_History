import { useMemo, useState } from 'react'
import { readHiddenSessions, writeHiddenSessions } from '../state/hiddenSessions.js'

export default function SessionSidebar({ projectId, sessions, activeSessionId, error }) {
  const [hidden, setHidden] = useState(() => readHiddenSessions())
  const [view, setView] = useState('active') // 'active' | 'hidden'

  const hide = (id) => {
    setHidden((prev) => {
      if (prev.has(id)) return prev
      const next = new Set(prev)
      next.add(id)
      writeHiddenSessions(next)
      return next
    })
  }
  const unhide = (id) => {
    setHidden((prev) => {
      if (!prev.has(id)) return prev
      const next = new Set(prev)
      next.delete(id)
      writeHiddenSessions(next)
      return next
    })
  }

  const { visible, hiddenCount } = useMemo(() => {
    if (!sessions) return { visible: null, hiddenCount: 0 }
    const hiddenList = sessions.filter((s) => hidden.has(s.sessionId))
    const activeList = sessions.filter((s) => !hidden.has(s.sessionId))
    // The active session is kept visible even if hidden — clicking a session
    // and then hiding it shouldn't make the current view disappear.
    if (
      activeSessionId &&
      hidden.has(activeSessionId) &&
      !activeList.some((s) => s.sessionId === activeSessionId)
    ) {
      const active = sessions.find((s) => s.sessionId === activeSessionId)
      if (active) activeList.unshift(active)
    }
    return {
      visible: view === 'hidden' ? hiddenList : activeList,
      hiddenCount: hiddenList.length,
    }
  }, [sessions, hidden, view, activeSessionId])

  const showingHidden = view === 'hidden'

  return (
    <aside className="session-sidebar">
      <div className="sidebar-header">
        <div className="label">Sessions</div>
        <div className="sidebar-header-right">
          {hiddenCount > 0 && (
            <button
              type="button"
              className={'sidebar-hidden-toggle' + (showingHidden ? ' active' : '')}
              onClick={() => setView(showingHidden ? 'active' : 'hidden')}
              title={showingHidden ? '숨김 목록 닫기' : '숨김 세션 보기'}
            >
              {showingHidden ? 'Back' : `Hidden (${hiddenCount})`}
            </button>
          )}
          {visible && <div className="count">{visible.length}</div>}
        </div>
      </div>
      <div className="sidebar-list">
        {error && <div className="empty">{error}</div>}
        {!sessions && !error && <div className="loading">Loading…</div>}
        {sessions && sessions.length === 0 && <div className="empty">No sessions</div>}
        {visible &&
          visible.map((s) => {
            const isHidden = hidden.has(s.sessionId)
            return (
              <a
                key={s.sessionId}
                className={
                  'session-row' +
                  (s.sessionId === activeSessionId ? ' active' : '') +
                  (isHidden && !showingHidden ? ' is-hidden-active' : '') +
                  (showingHidden ? ' hidden-row' : '')
                }
                href={`#/p/${encodeURIComponent(projectId)}/s/${encodeURIComponent(s.sessionId)}`}
              >
                <div className="title">{s.title}</div>
                <div className="sub">
                  {formatDate(s.lastActivityAt)} · {formatSize(s.fileSize)}
                </div>
                <button
                  type="button"
                  className="session-row-hide"
                  aria-label={isHidden ? 'Unhide session' : 'Hide session'}
                  title={isHidden ? 'Unhide' : 'Hide'}
                  onClick={(e) => {
                    e.preventDefault()
                    e.stopPropagation()
                    if (isHidden) unhide(s.sessionId)
                    else hide(s.sessionId)
                  }}
                >
                  {isHidden ? (
                    <svg viewBox="0 0 12 12" width="12" height="12" aria-hidden="true">
                      <path
                        d="M3.2 5.2L5 3.4M3.2 5.2L5 7M3.2 5.2H7a2.8 2.8 0 0 1 0 5.6H5.5"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="1.4"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      />
                    </svg>
                  ) : (
                    <svg viewBox="0 0 12 12" width="12" height="12" aria-hidden="true">
                      <path
                        d="M3 3l6 6M9 3l-6 6"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="1.4"
                        strokeLinecap="round"
                      />
                    </svg>
                  )}
                </button>
              </a>
            )
          })}
        {visible && visible.length === 0 && (
          <div className="empty">
            {showingHidden ? 'No hidden sessions' : 'No active sessions'}
          </div>
        )}
      </div>
    </aside>
  )
}

function formatDate(iso) {
  if (!iso) return '—'
  return new Date(iso).toLocaleString([], {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}

function formatSize(bytes) {
  if (!bytes) return '0 B'
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`
}
