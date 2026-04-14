import { useEffect, useState } from 'react'
import { api } from '../api.js'

export default function ProjectListPage() {
  const [projects, setProjects] = useState(null)
  const [error, setError] = useState(null)

  useEffect(() => {
    api.listProjects().then(setProjects).catch((e) => setError(String(e)))
  }, [])

  const body = (() => {
    if (error) return <div className="empty">{error}</div>
    if (!projects) return <div className="loading">Loading…</div>
    if (projects.length === 0)
      return <div className="empty">No projects found in ~/.claude/projects</div>
    return (
      <>
        <p className="page-sub">
          {projects.length} project{projects.length !== 1 ? 's' : ''} with recorded sessions
        </p>
        {projects.map((p) => (
          <a key={p.id} className="project-row" href={`#/p/${encodeURIComponent(p.id)}`}>
            <div className="path">{p.decodedPath}</div>
            <div className="sub">
              {p.sessionCount} session{p.sessionCount !== 1 ? 's' : ''} · last activity {formatDate(p.lastModified)}
            </div>
          </a>
        ))}
      </>
    )
  })()

  return (
    <div className="project-list-page">
      <h1>Projects</h1>
      {body}
    </div>
  )
}

function formatDate(iso) {
  if (!iso) return '—'
  return new Date(iso).toLocaleString([], {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}
