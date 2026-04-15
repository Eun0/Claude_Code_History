// Versioned localStorage key — SessionSidebar owns the write path, other
// memo surfaces (picker, MemoListPage) read-only so memos from hidden
// sessions are filtered out of search / aggregation just like hidden
// projects.
const HIDDEN_KEY = 'sessionSidebar.hidden.v1'

export function readHiddenSessions() {
  try {
    const raw = localStorage.getItem(HIDDEN_KEY)
    if (!raw) return new Set()
    const arr = JSON.parse(raw)
    return new Set(Array.isArray(arr) ? arr : [])
  } catch {
    return new Set()
  }
}

export function writeHiddenSessions(set) {
  try {
    localStorage.setItem(HIDDEN_KEY, JSON.stringify([...set]))
  } catch {}
}
