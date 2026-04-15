import { useEffect, useMemo, useRef, useState } from 'react'
import { api } from '../api.js'
import { readHiddenProjects, writeHiddenProjects } from '../state/hiddenProjects.js'

const SORT_OPTIONS = [
  { value: 'recent', label: 'Recent' },
  { value: 'name', label: 'Name' },
]

const PAGE_SIZE = 9

export default function ProjectListPage() {
  const [projects, setProjects] = useState(null)
  const [error, setError] = useState(null)
  const [query, setQuery] = useState('')
  const [hideEmpty, setHideEmpty] = useState(true)
  const [sortBy, setSortBy] = useState('recent') // 'recent' | 'name'
  const [hidden, setHidden] = useState(() => readHiddenProjects())
  const [view, setView] = useState('active') // 'active' | 'hidden'
  const [page, setPage] = useState(1)

  // Reset to page 1 when the user *intentionally* changes what they're
  // browsing (search/sort/empty-filter/view). Hiding or unhiding individual
  // cards is NOT in this list — staying on the current page is what users
  // expect. If the page becomes out of range after a hide, `safePage` below
  // clamps it down.
  useEffect(() => {
    setPage(1)
  }, [query, hideEmpty, sortBy, view])

  useEffect(() => {
    api.listProjects().then(setProjects).catch((e) => setError(String(e)))
  }, [])

  const hide = (id) => {
    setHidden((prev) => {
      if (prev.has(id)) return prev
      const next = new Set(prev)
      next.add(id)
      writeHiddenProjects(next)
      return next
    })
  }
  const unhide = (id) => {
    setHidden((prev) => {
      if (!prev.has(id)) return prev
      const next = new Set(prev)
      next.delete(id)
      writeHiddenProjects(next)
      return next
    })
  }

  // Auto-exit the "Hidden" view once the list becomes empty (e.g., user
  // unhid the last one) so they land back on the normal grid.
  useEffect(() => {
    if (view === 'hidden' && hidden.size === 0) setView('active')
  }, [view, hidden])

  const sortProjects = (list) => {
    return [...list].sort((a, b) => {
      if (sortBy === 'name') {
        return splitPath(a.decodedPath).name.localeCompare(
          splitPath(b.decodedPath).name,
          undefined,
          { sensitivity: 'base', numeric: true }
        )
      }
      const at = a.lastModified ? new Date(a.lastModified).getTime() : 0
      const bt = b.lastModified ? new Date(b.lastModified).getTime() : 0
      return bt - at
    })
  }

  const { visible, hiddenEmptyCount, hiddenTotal } = useMemo(() => {
    if (!projects) return { visible: [], hiddenEmptyCount: 0, hiddenTotal: 0 }
    const q = query.trim().toLowerCase()
    const matched = q
      ? projects.filter((p) => p.decodedPath.toLowerCase().includes(q))
      : projects
    // Hidden count is based on the full project list (not the search), so the
    // toolbar badge stays stable while typing a query.
    const hiddenTotal = projects.filter((p) => hidden.has(p.id)).length
    if (view === 'hidden') {
      const hiddenList = sortProjects(matched.filter((p) => hidden.has(p.id)))
      return { visible: hiddenList, hiddenEmptyCount: 0, hiddenTotal }
    }
    const activeMatched = matched.filter((p) => !hidden.has(p.id))
    const emptyInMatched = activeMatched.filter((p) => !p.sessionCount).length
    const filtered = hideEmpty
      ? activeMatched.filter((p) => p.sessionCount > 0)
      : activeMatched
    return {
      visible: sortProjects(filtered),
      hiddenEmptyCount: hideEmpty ? emptyInMatched : 0,
      hiddenTotal,
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projects, query, hideEmpty, sortBy, hidden, view])

  const body = (() => {
    if (error) return <div className="empty">{error}</div>
    if (!projects) return <div className="loading">Loading…</div>
    if (projects.length === 0)
      return <div className="empty">No projects found in ~/.claude/projects</div>

    const showingHidden = view === 'hidden'
    const totalPages = Math.max(1, Math.ceil(visible.length / PAGE_SIZE))
    const safePage = Math.min(Math.max(1, page), totalPages)
    const pageItems = visible.slice((safePage - 1) * PAGE_SIZE, safePage * PAGE_SIZE)
    return (
      <>
        <p className="page-sub">
          {projects.length} project{projects.length !== 1 ? 's' : ''} with recorded sessions
        </p>

        <div className="project-toolbar">
          <input
            type="search"
            className="project-search"
            placeholder={showingHidden ? 'Search hidden…' : 'Search projects…'}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            autoFocus
          />
          {hiddenTotal > 0 && (
            <button
              type="button"
              className={'hidden-toggle' + (showingHidden ? ' active' : '')}
              onClick={() => setView(showingHidden ? 'active' : 'hidden')}
              title={showingHidden ? 'Back to projects' : 'Manage hidden projects'}
            >
              {showingHidden ? 'Back' : `Hidden (${hiddenTotal})`}
            </button>
          )}
          <SortDropdown value={sortBy} onChange={setSortBy} />
        </div>

        {visible.length === 0 ? (
          <div className="project-empty-search">
            {showingHidden
              ? query.trim()
                ? `No hidden projects match "${query.trim()}"`
                : 'No hidden projects'
              : query.trim()
                ? `No projects match "${query.trim()}"`
                : 'No projects with sessions'}
          </div>
        ) : (
          <>
            <div className="project-grid">
              {pageItems.map((p) => (
                <ProjectCard
                  key={p.id}
                  project={p}
                  hidden={showingHidden}
                  onHide={hide}
                  onUnhide={unhide}
                />
              ))}
            </div>
            {totalPages > 1 && (
              <Pagination
                page={safePage}
                totalPages={totalPages}
                onChange={(n) => {
                  setPage(n)
                  window.scrollTo({ top: 0, behavior: 'smooth' })
                }}
              />
            )}
          </>
        )}

        {!showingHidden && hiddenEmptyCount > 0 && (
          <button
            type="button"
            className="show-empty-toggle"
            onClick={() => setHideEmpty(false)}
          >
            Show {hiddenEmptyCount} empty project{hiddenEmptyCount !== 1 ? 's' : ''}
          </button>
        )}
        {!showingHidden && !hideEmpty && (
          <button
            type="button"
            className="show-empty-toggle"
            onClick={() => setHideEmpty(true)}
          >
            Hide empty projects
          </button>
        )}
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

// Build a condensed page number list: first, last, and a window around the
// current page, with ellipses between non-adjacent groups. Keeps the control
// compact even at very high page counts.
function buildPageList(current, total) {
  if (total <= 7) return Array.from({ length: total }, (_, i) => i + 1)
  const core = new Set([1, 2, total - 1, total, current - 1, current, current + 1])
  const pages = [...core].filter((n) => n >= 1 && n <= total).sort((a, b) => a - b)
  const out = []
  for (let i = 0; i < pages.length; i++) {
    if (i > 0 && pages[i] - pages[i - 1] > 1) out.push('…')
    out.push(pages[i])
  }
  return out
}

function Pagination({ page, totalPages, onChange }) {
  const items = buildPageList(page, totalPages)
  const go = (n) => {
    const clamped = Math.min(Math.max(1, n), totalPages)
    if (clamped !== page) onChange(clamped)
  }
  return (
    <nav className="pagination" aria-label="Project list pagination">
      <button
        type="button"
        className="pagination-step"
        onClick={() => go(page - 1)}
        disabled={page <= 1}
        aria-label="Previous page"
      >
        ‹
      </button>
      {items.map((item, i) =>
        item === '…' ? (
          <span key={`e${i}`} className="pagination-ellipsis" aria-hidden="true">
            …
          </span>
        ) : (
          <button
            key={item}
            type="button"
            className={'pagination-num' + (item === page ? ' active' : '')}
            onClick={() => go(item)}
            aria-current={item === page ? 'page' : undefined}
          >
            {item}
          </button>
        )
      )}
      <button
        type="button"
        className="pagination-step"
        onClick={() => go(page + 1)}
        disabled={page >= totalPages}
        aria-label="Next page"
      >
        ›
      </button>
    </nav>
  )
}

function ProjectCard({ project: p, hidden, onHide, onUnhide }) {
  const { name, parent } = splitPath(p.decodedPath)
  const meta = (
    <>
      <div className="name">{name}</div>
      {parent && <div className="parent">{parent}</div>}
      <div className="meta">
        {p.sessionCount} session{p.sessionCount !== 1 ? 's' : ''}
        {p.lastModified ? ` · ${formatRelative(p.lastModified)}` : ''}
      </div>
    </>
  )

  if (hidden) {
    // In the manage-hidden view the card itself is inert — only the corner
    // restore button unhides, mirroring how the × button on active cards is
    // the sole destructive action.
    return (
      <div className="project-card hidden-card" title={p.decodedPath}>
        {meta}
        <button
          type="button"
          className="project-card-hide"
          aria-label="Unhide project"
          title="Unhide"
          onClick={() => onUnhide(p.id)}
        >
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
        </button>
      </div>
    )
  }

  return (
    <a
      className="project-card"
      href={`#/p/${encodeURIComponent(p.id)}`}
      title={p.decodedPath}
    >
      {meta}
      <button
        type="button"
        className="project-card-hide"
        aria-label="Hide project"
        title="Hide"
        onClick={(e) => {
          // Prevent the surrounding <a> from navigating.
          e.preventDefault()
          e.stopPropagation()
          onHide(p.id)
        }}
      >
        <svg viewBox="0 0 12 12" width="12" height="12" aria-hidden="true">
          <path
            d="M3 3l6 6M9 3l-6 6"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.4"
            strokeLinecap="round"
          />
        </svg>
      </button>
    </a>
  )
}

function SortDropdown({ value, onChange }) {
  const [open, setOpen] = useState(false)
  const rootRef = useRef(null)
  const current = SORT_OPTIONS.find((o) => o.value === value) || SORT_OPTIONS[0]

  useEffect(() => {
    if (!open) return
    const onDown = (e) => {
      if (rootRef.current && !rootRef.current.contains(e.target)) setOpen(false)
    }
    const onKey = (e) => {
      if (e.key === 'Escape') setOpen(false)
    }
    document.addEventListener('mousedown', onDown)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onDown)
      document.removeEventListener('keydown', onKey)
    }
  }, [open])

  return (
    <div className="project-sort" ref={rootRef}>
      <button
        type="button"
        className="project-sort-trigger"
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-label={`Sort by ${current.label}`}
        onClick={() => setOpen((v) => !v)}
      >
        <span>{current.label}</span>
        <svg viewBox="0 0 12 12" width="12" height="12" aria-hidden="true">
          <path
            d="M3 4.5 6 7.5 9 4.5"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.4"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      </button>
      {open && (
        <ul className="project-sort-menu" role="listbox">
          {SORT_OPTIONS.map((opt) => (
            <li
              key={opt.value}
              role="option"
              aria-selected={opt.value === value}
              className={`project-sort-option${opt.value === value ? ' active' : ''}`}
              onClick={() => {
                onChange(opt.value)
                setOpen(false)
              }}
            >
              {opt.label}
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

function splitPath(decoded) {
  const homeReplaced = decoded.replace(/^\/Users\/[^/]+/, '~')
  const idx = homeReplaced.lastIndexOf('/')
  if (idx <= 0) return { name: homeReplaced, parent: '' }
  const name = homeReplaced.slice(idx + 1) || homeReplaced
  const parent = homeReplaced.slice(0, idx)
  return { name, parent }
}

function formatRelative(iso) {
  const then = new Date(iso).getTime()
  if (!Number.isFinite(then)) return ''
  const diffMs = Date.now() - then
  const min = Math.round(diffMs / 60000)
  if (min < 1) return 'just now'
  if (min < 60) return `${min}m ago`
  const hr = Math.round(min / 60)
  if (hr < 24) return `${hr}h ago`
  const day = Math.round(hr / 24)
  if (day < 7) return `${day}d ago`
  return new Date(iso).toLocaleDateString([], { month: 'short', day: 'numeric' })
}
