// Thin fetch wrapper.
async function request(url, options = {}) {
  const res = await fetch(url, {
    headers: { 'Content-Type': 'application/json', ...(options.headers || {}) },
    ...options,
  })
  if (!res.ok) {
    const text = await res.text().catch(() => '')
    throw new Error(`${res.status} ${res.statusText}: ${text}`)
  }
  const ct = res.headers.get('content-type') || ''
  if (ct.includes('application/json')) return res.json()
  return res.text()
}

export const api = {
  listProjects: () => request('/api/projects'),
  listSessions: (projectId) =>
    request(`/api/projects/${encodeURIComponent(projectId)}/sessions`),
  getSession: (projectId, sessionId) =>
    request(
      `/api/projects/${encodeURIComponent(projectId)}/sessions/${encodeURIComponent(sessionId)}`
    ),

  // Memos
  listMemos: () => request('/api/memos'),
  getMemos: (sessionId) =>
    request(`/api/sessions/${encodeURIComponent(sessionId)}/memos`),
  updateBoardTitle: (sessionId, title) =>
    request(`/api/sessions/${encodeURIComponent(sessionId)}/memos`, {
      method: 'PATCH',
      body: JSON.stringify({ title }),
    }),
  createMemo: (sessionId, body) =>
    request(`/api/sessions/${encodeURIComponent(sessionId)}/memos`, {
      method: 'POST',
      body: JSON.stringify(body),
    }),
  updateMemo: (sessionId, memoId, body) =>
    request(
      `/api/sessions/${encodeURIComponent(sessionId)}/memos/${encodeURIComponent(memoId)}`,
      { method: 'PATCH', body: JSON.stringify(body) }
    ),
  deleteMemo: (sessionId, memoId) =>
    request(
      `/api/sessions/${encodeURIComponent(sessionId)}/memos/${encodeURIComponent(memoId)}`,
      { method: 'DELETE' }
    ),

  // Export
  memosExportUrl: (sessionId, title) => {
    const base = `/api/sessions/${encodeURIComponent(sessionId)}/memos/export`
    const t = (title || '').trim()
    return t ? `${base}?title=${encodeURIComponent(t)}` : base
  },
  memosPreviewUrl: (sessionId, title) => {
    const base = `/api/sessions/${encodeURIComponent(sessionId)}/memos/preview`
    const t = (title || '').trim()
    return t ? `${base}?title=${encodeURIComponent(t)}` : base
  },
  memosMarkdown: (sessionId) =>
    request(`/api/sessions/${encodeURIComponent(sessionId)}/memos/markdown`),

  // Search
  search: (params) => {
    const q = new URLSearchParams(params).toString()
    return request(`/api/search?${q}`)
  },
}
