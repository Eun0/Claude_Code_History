import { renderAssistantBody } from '../lib/renderMessageHtml.js'

export default function AssistantMessage({ node }) {
  const bodyHtml = renderAssistantBody(node.blocks || [])
  return (
    <div className="message-content assistant">
      <div className="message-header">
        <span className="role assistant">Claude</span>
        {node.model && <span className="model-tag">{node.model}</span>}
        {node.usage && (
          <span className="token-tag">
            {formatTokens(node.usage.input_tokens)} in · {formatTokens(node.usage.output_tokens)} out
          </span>
        )}
        {node.timestamp && (
          <span className="ts" title={node.timestamp}>
            {formatShortTime(node.timestamp)}
          </span>
        )}
      </div>
      <div
        className="message-body"
        dangerouslySetInnerHTML={{ __html: bodyHtml }}
      />
    </div>
  )
}

function formatShortTime(iso) {
  try {
    return new Date(iso).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
  } catch {
    return ''
  }
}

function formatTokens(n) {
  if (!n) return '0'
  if (n < 1000) return String(n)
  if (n < 1_000_000) return (n / 1000).toFixed(1) + 'k'
  return (n / 1_000_000).toFixed(1) + 'M'
}
