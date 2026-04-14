import { useState } from 'react'
import { useMemos } from '../state/memoStore.js'

function fmt(n) {
  if (n == null) return '0'
  if (n < 1000) return String(n)
  if (n < 1_000_000) return (n / 1000).toFixed(1) + 'k'
  return (n / 1_000_000).toFixed(2) + 'M'
}

function formatDate(iso) {
  if (!iso) return null
  try {
    return new Date(iso).toLocaleString([], {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    })
  } catch {
    return null
  }
}

export default function SessionHeader({ meta, liveStatus }) {
  const { state, actions } = useMemos()
  const [resumeCopied, setResumeCopied] = useState(false)

  const resumeCommand = meta?.sessionId
    ? (meta?.cwd
        ? `cd "${meta.cwd}" && claude --resume ${meta.sessionId}`
        : `claude --resume ${meta.sessionId}`)
    : ''

  const onCopyResume = async () => {
    if (!resumeCommand) return
    try {
      await navigator.clipboard.writeText(resumeCommand)
      setResumeCopied(true)
      setTimeout(() => setResumeCopied(false), 1500)
    } catch {}
  }

  const tt = meta?.tokenTotals || {}
  const title = meta?.summary || meta?.aiTitle || 'Untitled session'
  const items = []
  if (meta?.startedAt) items.push(['date', formatDate(meta.startedAt)])
  if (meta?.cwd) items.push(['cwd', meta.cwd])
  if (meta?.gitBranch && meta.gitBranch !== 'HEAD') items.push(['branch', meta.gitBranch])
  if (meta?.model) items.push(['model', meta.model])
  items.push([
    'tokens',
    `${fmt(tt.input)} in · ${fmt(tt.output)} out · ${fmt(tt.cacheRead)} cache`,
  ])

  return (
    <div className="session-header">
      <div className="title">
        {title}
        {meta?.sessionId && (
          <button
            type="button"
            className="resume-btn"
            onClick={onCopyResume}
            title={resumeCopied ? 'Copied!' : `Copy: ${resumeCommand}`}
            aria-label="Copy resume command"
          >
            <span className="resume-icon" aria-hidden="true">
              {resumeCopied ? '✓' : '↻'}
            </span>
            <span className="resume-text">
              {resumeCopied ? 'copied' : 'resume'}
            </span>
          </button>
        )}
        {liveStatus && (
          <span
            className={'live-indicator live-' + liveStatus}
            title={
              liveStatus === 'live'
                ? 'Auto-updating as Claude Code writes new messages'
                : liveStatus === 'connecting'
                  ? 'Connecting to live feed…'
                  : 'Live feed disconnected'
            }
          >
            <span className="dot" />
            {liveStatus === 'live' ? 'live' : liveStatus === 'connecting' ? '…' : 'offline'}
          </span>
        )}
      </div>
      <dl className="meta">
        {items.map(([k, v]) =>
          v ? (
            <span key={k}>
              <dt>{k}</dt>
              {v}
            </span>
          ) : null
        )}
      </dl>
      <div className="filters">
        <label>
          <input
            type="checkbox"
            checked={state.showThinking}
            onChange={() => actions.toggleShowThinking()}
          />
          show thinking
        </label>
        <label>
          <input
            type="checkbox"
            checked={state.showSystem}
            onChange={() => actions.toggleShowSystem()}
          />
          show system events
        </label>
      </div>
    </div>
  )
}
