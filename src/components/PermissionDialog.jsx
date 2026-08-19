// Modal shown when the resumed Claude session asks to use a tool that requires
// permission (permissionMode: 'default'). The user picks Allow once / Allow for
// this session / Deny; the choice is relayed back through the chat control API.

function summarizeInput(toolName, input) {
  if (!input || typeof input !== 'object') return ''
  // Show the most useful field per common tool, else a compact JSON.
  if (typeof input.command === 'string') return input.command
  if (typeof input.file_path === 'string') return input.file_path
  if (typeof input.path === 'string') return input.path
  if (typeof input.url === 'string') return input.url
  if (typeof input.pattern === 'string') return input.pattern
  try {
    const s = JSON.stringify(input, null, 2)
    return s.length > 800 ? s.slice(0, 800) + '\n…' : s
  } catch {
    return ''
  }
}

export default function PermissionDialog({ request, onDecide, busy }) {
  if (!request) return null
  const { toolName, title, displayName, description, input, canAllowSession, blockedPath } = request
  const heading = title || `Claude가 ${displayName || toolName} 도구를 사용하려고 합니다`
  const detail = summarizeInput(toolName, input)

  return (
    <div className="perm-overlay" role="dialog" aria-modal="true">
      <div className="perm-dialog">
        <div className="perm-head">
          <span className="perm-tool">{displayName || toolName}</span>
          <h3 className="perm-title">{heading}</h3>
          {description ? <p className="perm-desc">{description}</p> : null}
          {blockedPath ? <p className="perm-desc perm-warn">경로: {blockedPath}</p> : null}
        </div>

        {detail ? (
          <pre className="perm-input"><code>{detail}</code></pre>
        ) : null}

        <div className="perm-actions">
          <button
            className="perm-btn perm-deny"
            disabled={busy}
            onClick={() => onDecide('deny', 'once')}
          >
            거부
          </button>
          {canAllowSession ? (
            <button
              className="perm-btn perm-allow-session"
              disabled={busy}
              onClick={() => onDecide('allow', 'session')}
            >
              이 세션 동안 허용
            </button>
          ) : null}
          <button
            className="perm-btn perm-allow"
            disabled={busy}
            onClick={() => onDecide('allow', 'once')}
          >
            허용
          </button>
        </div>
      </div>
    </div>
  )
}
