// Thin fetch wrapper.
async function request(url, options = {}) {
  // Only advertise application/json when we actually have a body. Sending the
  // header on bodyless requests (DELETE, GET) trips Fastify's
  // FST_ERR_CTP_EMPTY_JSON_BODY guard with a 400.
  const hasBody = options.body != null
  const headers = {
    ...(hasBody ? { 'Content-Type': 'application/json' } : {}),
    ...(options.headers || {}),
  }
  const res = await fetch(url, { ...options, headers })
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

  // Remote servers
  listSshHosts: () => request('/api/ssh-hosts'),
  listServers: () => request('/api/servers'),
  addServer: (sshAlias) =>
    request('/api/servers', { method: 'POST', body: JSON.stringify({ sshAlias }) }),
  removeServer: (id) => request(`/api/servers/${encodeURIComponent(id)}`, { method: 'DELETE' }),

  listRemoteProjects: (serverId) =>
    request(`/api/servers/${encodeURIComponent(serverId)}/projects`),
  listRemoteSessions: (serverId, projectId) =>
    request(`/api/servers/${encodeURIComponent(serverId)}/projects/${encodeURIComponent(projectId)}/sessions`),
  getRemoteSession: (serverId, projectId, sessionId) =>
    request(`/api/servers/${encodeURIComponent(serverId)}/projects/${encodeURIComponent(projectId)}/sessions/${encodeURIComponent(sessionId)}`),

  searchRemote: (serverId, params) => {
    const q = new URLSearchParams(params).toString()
    return request(`/api/servers/${encodeURIComponent(serverId)}/search?${q}`)
  },
}
