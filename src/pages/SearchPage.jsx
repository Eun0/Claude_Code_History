import { useEffect, useState } from 'react'
import { api } from '../api.js'

export default function SearchPage({ query }) {
  const [results, setResults] = useState(null)
  const [error, setError] = useState(null)

  useEffect(() => {
    if (!query) {
      setResults([])
      return
    }
    setResults(null)
    setError(null)
    api
      .search({ q: query })
      .then(setResults)
      .catch((e) => setError(String(e)))
  }, [query])

  if (error) return <div className="search-page"><div className="empty">{error}</div></div>
  if (!query) return <div className="search-page"><div className="empty">Type a query in the top bar.</div></div>
  if (!results) return <div className="search-page"><div className="loading">Searching…</div></div>
  if (results.length === 0)
    return <div className="search-page"><div className="empty">No matches for "{query}"</div></div>

  return (
    <div className="search-page">
      <h2>Search</h2>
      <p className="result-count">
        {results.length} result{results.length !== 1 ? 's' : ''} for "{query}"
      </p>
      {results.map((r, i) => (
        <a
          key={i}
          className="search-result"
          href={`#/p/${encodeURIComponent(r.projectId)}/s/${encodeURIComponent(r.sessionId)}?msg=${encodeURIComponent(r.messageUuid)}`}
        >
          <div className="crumb">
            {r.projectId} · {r.sessionId.slice(0, 8)} · {r.matchedIn} · {formatTime(r.timestamp)}
          </div>
          <div
            className="snippet"
            dangerouslySetInnerHTML={{ __html: highlightSnippet(r.snippet, query) }}
          />
        </a>
      ))}
    </div>
  )
}

function formatTime(iso) {
  if (!iso) return '—'
  try {
    return new Date(iso).toLocaleString([], {
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    })
  } catch {
    return iso
  }
}

function escapeHtml(s) {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

function highlightSnippet(snippet, query) {
  const esc = escapeHtml(snippet || '')
  if (!query) return esc
  const escQ = query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  return esc.replace(new RegExp(escQ, 'gi'), (m) => `<mark>${m}</mark>`)
}
