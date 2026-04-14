import { formatToolUse } from '../lib/formatTools.js'
import ToolResultBlock from './ToolResultBlock.jsx'

// Renders a run of "work" items (thinking + tool_use blocks) as a single
// quiet collapsible group sitting beneath the assistant's text.
export default function ToolGroup({ items }) {
  if (!items || items.length === 0) return null
  const summary = summarizeItems(items)
  return (
    <details className="tool-group">
      <summary>{summary}</summary>
      <div className="tool-group-body">
        {items.map((item, i) => (
          <GroupItem key={i} item={item} />
        ))}
      </div>
    </details>
  )
}

function GroupItem({ item }) {
  if (item.type === 'thinking') {
    return (
      <div className="tool-item think-item">
        <div className="tool-item-head">
          <span className="name think-name">thinking</span>
          <span className="body think-body">{item.thinking}</span>
        </div>
      </div>
    )
  }
  if (item.type === 'tool_use') {
    const f = formatToolUse(item)
    let body = f.summary
    if (body.startsWith(item.name)) body = body.slice(item.name.length).trim()
    return (
      <div className="tool-item">
        <div className="tool-item-head">
          <span className="name">{item.name}</span>
          <span className="body">{body || <span className="dim">—</span>}</span>
        </div>
        {f.detail && <pre className="tool-item-detail">{f.detail}</pre>}
        {f.bodyJson && (
          <pre className="tool-item-detail">{JSON.stringify(f.bodyJson, null, 2)}</pre>
        )}
        {item.result && (
          <ToolResultBlock content={item.result.content} isError={item.result.isError} />
        )}
      </div>
    )
  }
  return null
}

function summarizeItems(items) {
  const labels = items.map((i) => (i.type === 'thinking' ? 'thinking' : i.name))
  const unique = []
  for (const l of labels) if (!unique.includes(l)) unique.push(l)
  if (items.length === unique.length) return unique.join(', ')
  return unique.join(', ') + ` · ${items.length} ops`
}
