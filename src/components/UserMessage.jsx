import { renderUserBody } from '../lib/renderMessageHtml.js'
import Collapsible from './Collapsible.jsx'

export default function UserMessage({ node }) {
  const bodyHtml = renderUserBody(node.blocks, node.slashCommand)
  return (
    <div className="message-content user">
      <div className="message-header">
        {node.timestamp && (
          <span className="ts" title={node.timestamp}>
            {formatShortTime(node.timestamp)}
          </span>
        )}
        <span className="role user">You</span>
      </div>
      <div className="user-bubble">
        <Collapsible maxHeight={260}>
          <div
            className="message-body"
            dangerouslySetInnerHTML={{ __html: bodyHtml }}
          />
        </Collapsible>
      </div>
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
