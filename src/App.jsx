import { useEffect, useState, useCallback } from 'react'
import ProjectListPage from './pages/ProjectListPage.jsx'
import ProjectViewPage from './pages/ProjectViewPage.jsx'
import SearchPage from './pages/SearchPage.jsx'
import MemoListPage from './pages/MemoListPage.jsx'
import EditorPage from './pages/EditorPage.jsx'
import SessionMemoEditPage from './pages/SessionMemoEditPage.jsx'
import SettingsPage from './pages/SettingsPage.jsx'
import SearchBar from './components/SearchBar.jsx'
import { clearDraft as clearEditorDraft } from './state/editorDraft.js'

// Hash router. Routes:
//  #/                                  → ProjectListPage (local)
//  #/memos                             → MemoListPage
//  #/editor                            → EditorPage (cross-session composer)
//  #/settings                          → SettingsPage (server management)
//  #/sessions/:projectId/:sid/edit     → SessionMemoEditPage (in-app preview & edit)
//  #/p/:projectId                      → ProjectViewPage (sidebar + empty main)
//  #/p/:projectId/s/:sid               → ProjectViewPage (sidebar + session view)
//  #/server/:id                        → ProjectListPage (remote server)
//  #/server/:id/p/:pid                 → ProjectViewPage (remote)
//  #/server/:id/p/:pid/s/:sid          → ProjectViewPage with session (remote)
//  #/search?q=...                      → SearchPage
function parseHash() {
  const raw = window.location.hash.slice(1) || '/'
  const [pathPart, queryPart] = raw.split('?')
  const params = new URLSearchParams(queryPart || '')
  const segs = pathPart.split('/').filter(Boolean)

  if (segs.length === 0) return { name: 'projects', params }
  if (segs[0] === 'memos') return { name: 'memos', params }
  if (segs[0] === 'editor') return { name: 'editor', params }
  if (segs[0] === 'search') return { name: 'search', params }
  if (segs[0] === 'settings') return { name: 'settings', params }
  if (
    segs[0] === 'sessions' &&
    segs.length >= 4 &&
    segs[3] === 'edit'
  ) {
    return {
      name: 'session-edit',
      projectId: segs[1],
      sessionId: segs[2],
      params,
    }
  }
  if (segs[0] === 'p' && segs.length >= 2) {
    const sessionId =
      segs.length === 4 && segs[2] === 's' ? segs[3] : null
    return { name: 'project', projectId: segs[1], sessionId, params }
  }
  // Remote server routes: #/server/:id[/p/:pid[/s/:sid]]
  if (segs[0] === 'server' && segs.length >= 2) {
    const serverId = segs[1]
    const projectId = segs[2] === 'p' && segs[3] ? segs[3] : null
    const sessionId = projectId && segs[4] === 's' && segs[5] ? segs[5] : null
    return { name: 'server-project', serverId, projectId, sessionId, params }
  }
  return { name: 'projects', params }
}

export function navigate(path) {
  window.location.hash = path
}

export default function App() {
  const [route, setRoute] = useState(parseHash())

  useEffect(() => {
    const handler = () => setRoute(parseHash())
    window.addEventListener('hashchange', handler)
    return () => window.removeEventListener('hashchange', handler)
  }, [])

  const onSearch = useCallback((q) => {
    navigate(`/search?q=${encodeURIComponent(q)}`)
  }, [])

  const isProjectsTab =
    route.name === 'projects' ||
    route.name === 'project' ||
    route.name === 'server-project'
  const isMemosTab = route.name === 'memos'
  const isEditorTab = route.name === 'editor'
  const isSettingsTab = route.name === 'settings'

  // Breadcrumb project link: aware of remote vs local
  const projectHref =
    route.serverId
      ? `#/server/${encodeURIComponent(route.serverId)}/p/${route.projectId}`
      : `#/p/${route.projectId}`

  const crumbs = (
    <div className="breadcrumbs">
      <nav className="topnav">
        <a
          href="#/"
          className={'topnav-link' + (isProjectsTab ? ' is-active' : '')}
        >
          Projects
        </a>
        <a
          href="#/memos"
          className={'topnav-link' + (isMemosTab ? ' is-active' : '')}
        >
          Memos
        </a>
        <a
          href="#/editor"
          className={'topnav-link' + (isEditorTab ? ' is-active' : '')}
          onClick={(e) => {
            e.preventDefault()
            clearEditorDraft()
            window.location.hash = '/editor?_t=' + Date.now()
          }}
        >
          Editor
        </a>
        <a
          href="#/settings"
          className={'topnav-link' + (isSettingsTab ? ' is-active' : '')}
        >
          Servers
        </a>
      </nav>
      {route.projectId && (
        <>
          {' / '}
          <a href={projectHref}>{route.projectId}</a>
        </>
      )}
      {route.sessionId && (
        <>
          {' / '}
          <span>{route.sessionId.slice(0, 8)}</span>
        </>
      )}
    </div>
  )

  return (
    <div className="app-root">
      <div className="topbar">
        <div className="logo" onClick={() => navigate('/')}>
          <img src="/favicon.svg" alt="" className="logo-icon" />
          Claude Code History
        </div>
        {crumbs}
        <div className="searchbar">
          <SearchBar onSubmit={onSearch} initialQuery={route.params.get('q') || ''} />
        </div>
      </div>
      <div className="main-body">
        {route.name === 'projects' && <ProjectListPage />}
        {route.name === 'memos' && <MemoListPage />}
        {route.name === 'editor' && (
          <EditorPage key={route.params.get('_t') || 'default'} />
        )}
        {route.name === 'session-edit' && (
          <SessionMemoEditPage
            projectId={route.projectId}
            sessionId={route.sessionId}
          />
        )}
        {route.name === 'project' && (
          <ProjectViewPage
            projectId={route.projectId}
            sessionId={route.sessionId}
            messageUuid={route.params.get('msg') || null}
          />
        )}
        {route.name === 'server-project' && !route.projectId && (
          <ProjectListPage serverId={route.serverId} />
        )}
        {route.name === 'server-project' && route.projectId && (
          <ProjectViewPage
            serverId={route.serverId}
            projectId={route.projectId}
            sessionId={route.sessionId}
            messageUuid={route.params.get('msg') || null}
          />
        )}
        {route.name === 'settings' && <SettingsPage />}
        {route.name === 'search' && <SearchPage query={route.params.get('q') || ''} />}
      </div>
    </div>
  )
}
