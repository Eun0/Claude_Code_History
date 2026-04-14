import { useEffect, useRef, useState } from 'react'
import { api } from '../api.js'
import MessageList from '../components/MessageList.jsx'
import SessionHeader from '../components/SessionHeader.jsx'
import MemoPanel from '../components/MemoPanel.jsx'
import MemoSelectionBar from '../components/MemoSelectionBar.jsx'
import { actions as memoActions } from '../state/memoStore.js'

export default function SessionViewPage({ projectId, sessionId, messageUuid }) {
  const [data, setData] = useState(null)
  const [error, setError] = useState(null)
  const [liveStatus, setLiveStatus] = useState('connecting')
  const sessionMainRef = useRef(null)

  // Initial load. Fetch session and memos in parallel and commit them in
  // one shot — memoStore first, then setData — so React's auto-batching
  // re-renders the messages with their `.in-memo` class already applied on
  // the very first paint. Doing the two sequentially used to leak a frame
  // where the new session's messages were visible without their yellow
  // background, then flickered into it once memos finished loading.
  useEffect(() => {
    setData(null)
    setError(null)
    let cancelled = false
    Promise.all([
      api.getSession(projectId, sessionId),
      api.getMemos(sessionId),
    ])
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
  }, [projectId, sessionId])

  // Listen for updates from the Preview & Edit tab (same origin, different
  // window). When the viewer saves a board title / memo title / memo note,
  // it broadcasts on 'memo-updates'; we refetch the board so the main UI
  // stays in sync without requiring a manual refresh.
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

  // After data is rendered, deep-link landing: scroll the target message to
  // the *top* of the scroll container (so the memo starts at the top of the
  // viewport, matching what the user sees as the "start position"), and run
  // the flash animation.
  //
  // Layout shift gotcha: messages above the target keep growing after the
  // first paint (Shiki code highlighting, sidechain groups, images, etc.),
  // which pushes the target downward. A single scrollIntoView at first
  // paint lands the target exactly where it WAS at that moment, then the
  // shift drops it below the viewport. We schedule retries at increasing
  // delays so the final scroll position matches the settled layout.
  useEffect(() => {
    if (!data || !messageUuid) return
    let cancelled = false

    const doScroll = (smooth) => {
      const el = document.querySelector(`[data-uuid="${messageUuid}"]`)
      if (!el) return false
      el.scrollIntoView({
        behavior: smooth ? 'smooth' : 'auto',
        block: 'start',
      })
      return true
    }

    const tryFlash = (attempt = 0) => {
      if (cancelled) return
      const el = document.querySelector(`[data-uuid="${messageUuid}"]`)
      if (!el) {
        // Row may not be in the DOM yet on the first paint after data load.
        if (attempt < 20) requestAnimationFrame(() => tryFlash(attempt + 1))
        return
      }
      doScroll(true)
      el.classList.remove('highlighted')
      void el.offsetWidth
      el.classList.add('highlighted')

      // Re-scroll after layout has had time to settle, in case async content
      // (code highlighting, sidechain expansion) shifted the target.
      const delays = [200, 500, 1000]
      delays.forEach((d) => {
        setTimeout(() => {
          if (!cancelled) doScroll(false)
        }, d)
      })
    }
    tryFlash()
    return () => {
      cancelled = true
    }
  }, [data, messageUuid])

  // Live updates via Server-Sent Events. The server watches the JSONL file
  // and pushes an `update` event whenever it changes; we re-fetch the full
  // session, merge via React keys, and auto-scroll if the user was already
  // near the bottom (following the conversation).
  useEffect(() => {
    if (!sessionId || !projectId) return
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
        const orderedUuids = (d.messages || [])
          .map((m) => m.uuid)
          .filter(Boolean)
        memoActions.updateOrderedUuids(orderedUuids)
        if (wasNearBottom && el) {
          requestAnimationFrame(() => {
            el.scrollTop = el.scrollHeight
          })
        }
      } catch (err) {
        console.warn('live refresh failed', err)
      }
    }

    const onConnected = () => setLiveStatus('live')
    const onUpdate = () => {
      setLiveStatus('live')
      refresh()
    }
    const onError = () => setLiveStatus('disconnected')

    es.addEventListener('connected', onConnected)
    es.addEventListener('update', onUpdate)
    es.addEventListener('error', onError)
    // Browsers fire the default 'error' when EventSource drops. We still
    // want to receive reconnection attempts — EventSource handles that.

    return () => {
      cancelled = true
      es.removeEventListener('connected', onConnected)
      es.removeEventListener('update', onUpdate)
      es.removeEventListener('error', onError)
      es.close()
    }
  }, [projectId, sessionId])

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
      </div>
      <MemoPanel sessionMeta={data.meta} />
      <MemoSelectionBar />
    </>
  )
}
