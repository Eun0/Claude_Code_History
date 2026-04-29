import { useEffect, useRef, useState } from 'react'
import { api } from '../api.js'

export default function SearchPage({ query }) {
  const [results, setResults] = useState(null)
  const [error, setError] = useState(null)

  const [servers, setServers] = useState([])
  const [remoteEnabled, setRemoteEnabled] = useState(false)
  // { [serverId]: 'loading' | { results } | { error } }
  const [remoteState, setRemoteState] = useState({})
  const remoteRef = useRef({})

  const [activeTab, setActiveTab] = useState('local')

  useEffect(() => {
    api.listServers().then(setServers).catch(() => {})
  }, [])

  // Local search
  useEffect(() => {
    if (!query) { setResults([]); return }
    setResults(null)
    setError(null)
    api.search({ q: query }).then(setResults).catch((e) => setError(String(e)))
  }, [query])

  // Remote search
  useEffect(() => {
    if (!remoteEnabled || !query || servers.length === 0) return
    const cancelled = {}
    const next = {}
    for (const s of servers) {
      next[s.id] = 'loading'
      cancelled[s.id] = false
    }
    setRemoteState(next)
    remoteRef.current = cancelled

    for (const s of servers) {
      api.searchRemote(s.id, { q: query })
        .then((res) => {
          if (cancelled[s.id]) return
          setRemoteState((prev) => ({ ...prev, [s.id]: { results: res } }))
        })
        .catch((e) => {
          if (cancelled[s.id]) return
          setRemoteState((prev) => ({ ...prev, [s.id]: { error: String(e) } }))
        })
    }
    return () => {
      for (const id of Object.keys(cancelled)) cancelled[id] = true
    }
  }, [remoteEnabled, query, servers])

  const toggleRemote = () => {
    const next = !remoteEnabled
    setRemoteEnabled(next)
    if (!next) {
      for (const id of Object.keys(remoteRef.current)) remoteRef.current[id] = true
      setRemoteState({})
      setActiveTab('local')
    } else {
      setActiveTab('local')
    }
  }

  if (error) return <div className="search-page"><div className="empty">{error}</div></div>
  if (!query) return <div className="search-page"><div className="empty">Type a query in the top bar.</div></div>

  // Determine what to show in the active tab
  const activeResults = (() => {
    if (activeTab === 'local') return { kind: 'local', data: results }
    const state = remoteState[activeTab]
    if (!state || state === 'loading') return { kind: 'loading' }
    if (state.error) return { kind: 'error', message: state.error }
    return { kind: 'remote', data: state.results, serverId: activeTab }
  })()

  const localCount = results?.length ?? 0
  const showTabs = remoteEnabled && servers.length > 0

  return (
    <div className="search-page">
      <div className="search-page-header">
        <h2>Search</h2>
        {servers.length > 0 && (
          <label className="remote-search-toggle">
            <input type="checkbox" checked={remoteEnabled} onChange={toggleRemote} />
            서버에서도 검색
          </label>
        )}
      </div>

      {showTabs && (
        <div className="source-tabs">
          <a
            className={'source-tab' + (activeTab === 'local' ? ' active' : '')}
            href="#"
            onClick={(e) => { e.preventDefault(); setActiveTab('local') }}
          >
            Local{results ? ` (${localCount})` : ''}
          </a>
          {servers.map((s) => {
            const state = remoteState[s.id]
            const suffix =
              state === 'loading' ? ' …'
              : state?.results ? ` (${state.results.length})`
              : state?.error ? ' !'
              : ''
            return (
              <a
                key={s.id}
                className={'source-tab' + (activeTab === s.id ? ' active' : '')}
                href="#"
                onClick={(e) => { e.preventDefault(); setActiveTab(s.id) }}
              >
                {s.label}{suffix}
              </a>
            )
          })}
        </div>
      )}

      <TabContent activeResults={activeResults} query={query} showTabs={showTabs} />
    </div>
  )
}

function TabContent({ activeResults, query, showTabs }) {
  const { kind, data, serverId, message } = activeResults

  if (kind === 'loading') {
    return <div className="loading">검색 중…</div>
  }
  if (kind === 'error') {
    return <div className="empty">{message}</div>
  }
  if (kind === 'local' && data === null) {
    return <div className="loading">Searching…</div>
  }

  const items = data || []

  return (
    <>
      <p className="result-count">
        {items.length} result{items.length !== 1 ? 's' : ''} for "{query}"
      </p>
      {items.length === 0 ? (
        <div className="empty" style={{ padding: '32px 0', textAlign: 'left' }}>
          No matches for "{query}"
        </div>
      ) : (
        items.map((r, i) => (
          <SearchResult key={i} r={r} query={query} serverId={serverId || null} />
        ))
      )}
    </>
  )
}

function SearchResult({ r, query, serverId }) {
  const href = serverId
    ? `#/server/${encodeURIComponent(serverId)}/p/${encodeURIComponent(r.projectId)}/s/${encodeURIComponent(r.sessionId)}?msg=${encodeURIComponent(r.messageUuid)}`
    : `#/p/${encodeURIComponent(r.projectId)}/s/${encodeURIComponent(r.sessionId)}?msg=${encodeURIComponent(r.messageUuid)}`
  return (
    <a className="search-result" href={href}>
      <div className="crumb">
        {r.projectId} · {r.sessionId.slice(0, 8)} · {r.matchedIn} · {formatTime(r.timestamp)}
      </div>
      <div
        className="snippet"
        dangerouslySetInnerHTML={{ __html: highlightSnippet(r.snippet, query) }}
      />
    </a>
  )
}

function formatTime(iso) {
  if (!iso) return '—'
  try {
    return new Date(iso).toLocaleString([], {
      month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit',
    })
  } catch { return iso }
}

function escapeHtml(s) {
  return String(s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;')
    .replace(/>/g, '&gt;').replace(/"/g, '&quot;')
}

function highlightSnippet(snippet, query) {
  const esc = escapeHtml(snippet || '')
  if (!query) return esc
  const escQ = query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  return esc.replace(new RegExp(escQ, 'gi'), (m) => `<mark>${m}</mark>`)
}
