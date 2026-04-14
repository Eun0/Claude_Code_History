export default function SessionSidebar({ projectId, sessions, activeSessionId, error }) {
  return (
    <aside className="session-sidebar">
      <div className="sidebar-header">
        <div className="label">Sessions</div>
        {sessions && <div className="count">{sessions.length}</div>}
      </div>
      <div className="sidebar-list">
        {error && <div className="empty">{error}</div>}
        {!sessions && !error && <div className="loading">Loading…</div>}
        {sessions && sessions.length === 0 && <div className="empty">No sessions</div>}
        {sessions &&
          sessions.map((s) => (
            <a
              key={s.sessionId}
              className={
                'session-row' + (s.sessionId === activeSessionId ? ' active' : '')
              }
              href={`#/p/${encodeURIComponent(projectId)}/s/${encodeURIComponent(s.sessionId)}`}
            >
              <div className="title">{s.title}</div>
              <div className="sub">
                {formatDate(s.lastActivityAt)} · {formatSize(s.fileSize)}
              </div>
            </a>
          ))}
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
