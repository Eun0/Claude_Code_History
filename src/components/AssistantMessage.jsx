import Markdown from './Markdown.jsx'
import ToolGroup from './ToolGroup.jsx'
import ImageBlock from './ImageBlock.jsx'

// Between two Claude-to-user text paragraphs, everything that's "work" —
// thinking, tool calls — should collapse into a single quiet group. Images
// and text are the user-facing content that breaks a group.
function groupBlocks(blocks) {
  const out = []
  let buf = []
  const flush = () => {
    if (buf.length) {
      out.push({ __kind: 'op_group', items: buf })
      buf = []
    }
  }
  for (const b of blocks) {
    if (b.type === 'text' || b.type === 'image') {
      flush()
      out.push(b)
    } else {
      // thinking, tool_use
      buf.push(b)
    }
  }
  flush()
  return out
}

export default function AssistantMessage({ node }) {
  const groups = groupBlocks(node.blocks || [])
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
      <div className="message-body">
        {groups.map((g, i) => {
          if (g.__kind === 'op_group') return <ToolGroup key={i} items={g.items} />
          if (g.type === 'text') return <Markdown key={i}>{g.text}</Markdown>
          if (g.type === 'image')
            return <ImageBlock key={i} media_type={g.media_type} data={g.data} />
          return null
        })}
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

function formatTokens(n) {
  if (!n) return '0'
  if (n < 1000) return String(n)
  if (n < 1_000_000) return (n / 1000).toFixed(1) + 'k'
  return (n / 1_000_000).toFixed(1) + 'M'
}
