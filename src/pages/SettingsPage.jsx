import { useEffect, useState } from 'react'
import { api } from '../api.js'

export default function SettingsPage() {
  const [hosts, setHosts] = useState(null)
  const [servers, setServers] = useState(null)
  const [error, setError] = useState(null)
  const [adding, setAdding] = useState(null)
  const [removing, setRemoving] = useState(null)

  const load = () => {
    Promise.all([api.listSshHosts(), api.listServers()])
      .then(([h, s]) => { setHosts(h); setServers(s) })
      .catch((e) => setError(String(e)))
  }

  useEffect(() => { load() }, [])

  const addServer = async (alias) => {
    setAdding(alias)
    try { await api.addServer(alias); load() }
    catch (e) { alert(String(e)) }
    finally { setAdding(null) }
  }

  const removeServer = async (id) => {
    setRemoving(id)
    try { await api.removeServer(id); load() }
    catch (e) { alert(String(e)) }
    finally { setRemoving(null) }
  }

  const addedAliases = new Set((servers || []).map((s) => s.sshAlias))
  const availableHosts = (hosts || []).filter((h) => !addedAliases.has(h.alias))

  return (
    <div className="settings-page">
      <h1>Server Connections</h1>
      {error && <div className="empty">{error}</div>}

      <div className="kanban-board">
        {/* Available column */}
        <div className="kanban-col">
          <div className="kanban-col-header">Available</div>
          {!hosts && !error && <div className="kanban-empty">Loading…</div>}
          {hosts && availableHosts.length === 0 && (
            <div className="kanban-empty">
              {hosts.length === 0 ? 'No hosts in ~/.ssh/config' : 'All connected'}
            </div>
          )}
          {availableHosts.map((h) => (
            <div key={h.alias} className="kanban-card">
              <div className="kanban-card-info">
                <span className="kanban-card-title">{h.alias}</span>
                <span className="kanban-card-sub">{h.user}@{h.hostname}:{h.port}</span>
              </div>
              <button
                type="button"
                className="btn-primary"
                disabled={adding === h.alias}
                onClick={() => addServer(h.alias)}
              >
                {adding === h.alias ? 'Adding…' : 'Add'}
              </button>
            </div>
          ))}
        </div>

        <div className="kanban-divider" />

        {/* Connected column */}
        <div className="kanban-col">
          <div className="kanban-col-header">Connected</div>
          {servers && servers.length === 0 && (
            <div className="kanban-empty">No servers connected yet</div>
          )}
          {(servers || []).map((s) => (
            <div key={s.id} className="kanban-card">
              <div className="kanban-card-info">
                <span className="kanban-card-title">{s.label}</span>
                <span className="kanban-card-sub">{s.user}@{s.hostname}:{s.port}</span>
              </div>
              <button
                type="button"
                className="btn-danger"
                disabled={removing === s.id}
                onClick={() => removeServer(s.id)}
              >
                {removing === s.id ? 'Removing…' : 'Remove'}
              </button>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
