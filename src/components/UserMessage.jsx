import Markdown from './Markdown.jsx'
import ImageBlock from './ImageBlock.jsx'
import Collapsible from './Collapsible.jsx'

// Strip known CLI command wrappers from plain text before rendering.
function cleanText(s) {
  if (!s) return ''
  return s
    .replace(/<command-name>[\s\S]*?<\/command-name>/g, '')
    .replace(/<command-message>[\s\S]*?<\/command-message>/g, '')
    .replace(/<command-args>([\s\S]*?)<\/command-args>/g, (_, inner) => inner.trim())
    .replace(/<local-command-stdout>([\s\S]*?)<\/local-command-stdout>/g, (_, inner) => '```\n' + inner.trim() + '\n```')
    .replace(/<local-command-caveat>[\s\S]*?<\/local-command-caveat>/g, '')
    .replace(/<system-reminder>[\s\S]*?<\/system-reminder>/g, '')
    .trim()
}

export default function UserMessage({ node }) {
  return (
    <div className="message-content user">
      <div className="message-header">
        {node.slashCommand && (
          <span className="slash-badge">/{node.slashCommand.replace(/^\//, '')}</span>
        )}
        {node.timestamp && (
          <span className="ts" title={node.timestamp}>
            {formatShortTime(node.timestamp)}
          </span>
        )}
        <span className="role user">You</span>
      </div>
      <div className="user-bubble">
        <Collapsible maxHeight={260}>
          <div className="message-body">
            {node.blocks.map((b, i) => {
              if (b.type === 'text') {
                const cleaned = cleanText(b.text)
                if (!cleaned) return null
                return <Markdown key={i}>{cleaned}</Markdown>
              }
              if (b.type === 'image') {
                return <ImageBlock key={i} media_type={b.media_type} data={b.data} />
              }
              return null
            })}
          </div>
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
