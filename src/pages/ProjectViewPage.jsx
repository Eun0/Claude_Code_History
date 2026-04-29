import { useEffect, useState } from 'react'
import { api } from '../api.js'
import SessionSidebar from '../components/SessionSidebar.jsx'
import SessionViewPage from './SessionViewPage.jsx'

export default function ProjectViewPage({ serverId = null, projectId, sessionId, messageUuid }) {
  const [sessions, setSessions] = useState(null)
  const [error, setError] = useState(null)

  useEffect(() => {
    setSessions(null)
    setError(null)
    const fetch = serverId
      ? api.listRemoteSessions(serverId, projectId)
      : api.listSessions(projectId)
    fetch.then(setSessions).catch((e) => setError(String(e)))
  }, [serverId, projectId])

  return (
    <>
      <SessionSidebar
        serverId={serverId}
        projectId={projectId}
        sessions={sessions}
        activeSessionId={sessionId}
        error={error}
      />
      {sessionId ? (
        <SessionViewPage
          serverId={serverId}
          projectId={projectId}
          sessionId={sessionId}
          messageUuid={messageUuid}
        />
      ) : (
        <div className="session-empty">
          <div className="empty-inner">
            <h2>Select a session</h2>
            <p>Pick a session from the sidebar to view its conversation.</p>
          </div>
        </div>
      )}
    </>
  )
}
