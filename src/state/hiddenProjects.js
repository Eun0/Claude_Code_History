// Versioned localStorage key — `ProjectListPage` owns the write path, other
// memo surfaces read-only so they can filter hidden projects out of search
// and aggregation views.
const HIDDEN_KEY = 'projectList.hidden.v1'

export function readHiddenProjects() {
  try {
    const raw = localStorage.getItem(HIDDEN_KEY)
    if (!raw) return new Set()
    const arr = JSON.parse(raw)
    return new Set(Array.isArray(arr) ? arr : [])
  } catch {
    return new Set()
  }
}

export function writeHiddenProjects(set) {
  try {
    localStorage.setItem(HIDDEN_KEY, JSON.stringify([...set]))
  } catch {}
}
