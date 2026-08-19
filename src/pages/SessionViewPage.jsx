import { useEffect, useRef, useState } from 'react'
import { api } from '../api.js'
import MessageList from '../components/MessageList.jsx'
import SessionHeader from '../components/SessionHeader.jsx'
import MemoPanel from '../components/MemoPanel.jsx'
import MemoSelectionBar from '../components/MemoSelectionBar.jsx'
import ChatComposer from '../components/ChatComposer.jsx'
import PermissionDialog from '../components/PermissionDialog.jsx'
import QuestionDialog from '../components/QuestionDialog.jsx'
import { actions as memoActions } from '../state/memoStore.js'

export default function SessionViewPage({ serverId = null, projectId, sessionId, messageUuid }) {
  const [data, setData] = useState(null)
  const [error, setError] = useState(null)
  const [liveStatus, setLiveStatus] = useState(serverId ? 'remote' : 'connecting')
  const sessionMainRef = useRef(null)

  // Interactive chat (local sessions only).
  const [chatStatus, setChatStatus] = useState('idle') // 'idle' | 'working'
  const [permissionReq, setPermissionReq] = useState(null)
  const [permBusy, setPermBusy] = useState(false)
  const [questionReq, setQuestionReq] = useState(null)
  const [questionBusy, setQuestionBusy] = useState(false)
  const [chatError, setChatError] = useState(null)
  const canChat = !serverId

  // Initial load. Fetch session and memos in parallel and commit them in
  // one shot — memoStore first, then setData — so React's auto-batching
  // re-renders the messages with their `.in-memo` class already applied on
  // the very first paint.
  useEffect(() => {
    setData(null)
    setError(null)
    let cancelled = false
    const sessionFetch = serverId
      ? api.getRemoteSession(serverId, projectId, sessionId)
      : api.getSession(projectId, sessionId)
    Promise.all([sessionFetch, api.getMemos(sessionId)])
      .then(([sessionData, memosResp]) => {
        if (cancelled) return
        const orderedUuids = (sessionData.messages || [])
          .map((m) => m.uuid)
          .filter(Boolean)
        memoActions.loadForSession(
          sessionId,
          orderedUuids,
          memosResp?.memos || [],
          memosResp?.title || ''
        )
        setData(sessionData)
      })
      .catch((e) => {
        if (!cancelled) setError(String(e))
      })
    return () => {
      cancelled = true
    }
  }, [serverId, projectId, sessionId])

  // Listen for updates from the Preview & Edit tab (same origin, different window).
  useEffect(() => {
    if (typeof BroadcastChannel === 'undefined') return
    const ch = new BroadcastChannel('memo-updates')
    const onMsg = (ev) => {
      const d = ev.data
      if (!d || d.sessionId !== sessionId) return
      memoActions.refreshBoard()
    }
    ch.addEventListener('message', onMsg)
    return () => {
      ch.removeEventListener('message', onMsg)
      ch.close()
    }
  }, [sessionId])

  // Deep-link scroll + flash animation.
  useEffect(() => {
    if (!data || !messageUuid) return
    let cancelled = false

    const doScroll = (smooth) => {
      const el = document.querySelector(`[data-uuid="${messageUuid}"]`)
      if (!el) return false
      el.scrollIntoView({ behavior: smooth ? 'smooth' : 'auto', block: 'start' })
      return true
    }

    const tryFlash = (attempt = 0) => {
      if (cancelled) return
      const el = document.querySelector(`[data-uuid="${messageUuid}"]`)
      if (!el) {
        if (attempt < 20) requestAnimationFrame(() => tryFlash(attempt + 1))
        return
      }
      doScroll(true)
      el.classList.remove('highlighted')
      void el.offsetWidth
      el.classList.add('highlighted')
      const delays = [200, 500, 1000]
      delays.forEach((d) => {
        setTimeout(() => { if (!cancelled) doScroll(false) }, d)
      })
    }
    tryFlash()
    return () => { cancelled = true }
  }, [data, messageUuid])

  // Live updates via SSE — local sessions only (remote files can't be watched).
  useEffect(() => {
    if (!sessionId || !projectId || serverId) return
    let cancelled = false
    const url = `/api/sessions/${encodeURIComponent(sessionId)}/watch`
    const es = new EventSource(url)

    const refresh = async () => {
      try {
        const d = await api.getSession(projectId, sessionId)
        if (cancelled) return
        const el = sessionMainRef.current
        const wasNearBottom =
          !!el && el.scrollHeight - el.scrollTop - el.clientHeight < 240
        setData(d)
        const orderedUuids = (d.messages || []).map((m) => m.uuid).filter(Boolean)
        memoActions.updateOrderedUuids(orderedUuids)
        if (wasNearBottom && el) {
          requestAnimationFrame(() => { el.scrollTop = el.scrollHeight })
        }
      } catch (err) {
        console.warn('live refresh failed', err)
      }
    }

    const onConnected = () => setLiveStatus('live')
    const onUpdate = () => { setLiveStatus('live'); refresh() }
    const onError = () => setLiveStatus('disconnected')

    es.addEventListener('connected', onConnected)
    es.addEventListener('update', onUpdate)
    es.addEventListener('error', onError)

    return () => {
      cancelled = true
      es.removeEventListener('connected', onConnected)
      es.removeEventListener('update', onUpdate)
      es.removeEventListener('error', onError)
      es.close()
    }
  }, [serverId, projectId, sessionId])

  // Chat control events via SSE (local only). The conversation itself
  // re-renders through the /watch effect above; this stream carries status,
  // permission prompts, and errors.
  useEffect(() => {
    if (!canChat || !sessionId) return
    let cancelled = false
    const url = `/api/sessions/${encodeURIComponent(sessionId)}/chat/events`
    const es = new EventSource(url)

    const onStatus = (e) => {
      if (cancelled) return
      try { setChatStatus(JSON.parse(e.data).status || 'idle') } catch { /* ignore */ }
    }
    const onPermission = (e) => {
      if (cancelled) return
      try { setPermissionReq(JSON.parse(e.data)) } catch { /* ignore */ }
    }
    const onResolved = (e) => {
      if (cancelled) return
      try {
        const { permId } = JSON.parse(e.data)
        setPermissionReq((cur) => (cur && cur.permId === permId ? null : cur))
      } catch { /* ignore */ }
    }
    const onQuestion = (e) => {
      if (cancelled) return
      try { setQuestionReq(JSON.parse(e.data)) } catch { /* ignore */ }
    }
    const onQuestionResolved = (e) => {
      if (cancelled) return
      try {
        const { permId } = JSON.parse(e.data)
        setQuestionReq((cur) => (cur && cur.permId === permId ? null : cur))
      } catch { /* ignore */ }
    }
    const onDone = () => { if (!cancelled) setChatStatus('idle') }
    const onChatError = (e) => {
      if (cancelled) return
      try { setChatError(JSON.parse(e.data).message || 'chat error') } catch { /* ignore */ }
      setChatStatus('idle')
    }

    es.addEventListener('status', onStatus)
    es.addEventListener('permission_request', onPermission)
    es.addEventListener('permission_resolved', onResolved)
    es.addEventListener('question_request', onQuestion)
    es.addEventListener('question_resolved', onQuestionResolved)
    es.addEventListener('turn_done', onDone)
    es.addEventListener('chat_error', onChatError)

    return () => {
      cancelled = true
      es.close()
    }
  }, [canChat, sessionId])

  const handleSend = async (text) => {
    setChatError(null)
    setChatStatus('working')
    try {
      await api.sendChat(sessionId, text)
    } catch (err) {
      setChatError(String(err.message || err))
      setChatStatus('idle')
    }
  }

  const handleInterrupt = async () => {
    try { await api.interruptChat(sessionId) } catch { /* ignore */ }
  }

  const handleDecide = async (decision, scope) => {
    if (!permissionReq) return
    setPermBusy(true)
    try {
      await api.resolveChatPermission(sessionId, permissionReq.permId, decision, scope)
      setPermissionReq(null)
    } catch (err) {
      setChatError(String(err.message || err))
    } finally {
      setPermBusy(false)
    }
  }

  const handleAnswer = async (answers) => {
    if (!questionReq) return
    setQuestionBusy(true)
    try {
      await api.answerChatQuestion(sessionId, questionReq.permId, answers)
      setQuestionReq(null)
    } catch (err) {
      setChatError(String(err.message || err))
    } finally {
      setQuestionBusy(false)
    }
  }

  if (error) {
    return (
      <div className="session-empty">
        <div className="empty-inner">
          <h2>Error</h2>
          <p>{error}</p>
        </div>
      </div>
    )
  }
  if (!data) {
    return (
      <div className="session-empty">
        <div className="empty-inner">
          <p>Loading session…</p>
        </div>
      </div>
    )
  }

  return (
    <>
      <div className="session-main" ref={sessionMainRef}>
        <SessionHeader meta={data.meta} liveStatus={liveStatus} />
        <MessageList messages={data.messages} highlightedUuid={messageUuid} />
        {canChat ? (
          <>
            {chatError ? (
              <div className="chat-error" onClick={() => setChatError(null)}>
                {chatError}
              </div>
            ) : null}
            <ChatComposer
              status={chatStatus}
              onSend={handleSend}
              onInterrupt={handleInterrupt}
            />
          </>
        ) : null}
      </div>
      <MemoPanel sessionMeta={data.meta} projectId={projectId} sessionId={sessionId} serverId={serverId} />
      <MemoSelectionBar />
      <PermissionDialog request={permissionReq} onDecide={handleDecide} busy={permBusy} />
      <QuestionDialog
        key={questionReq?.permId || 'no-question'}
        request={questionReq}
        onSubmit={handleAnswer}
        busy={questionBusy}
      />
    </>
  )
}
