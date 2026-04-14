import MessageRow from './MessageRow.jsx'

export default function SidechainGroup({ group, memosByMessage, highlightedUuid }) {
  const firstText = findFirstAgentDescription(group.nodes)
  return (
    <details className="sidechain-group">
      <summary>
        {firstText || `subagent (${group.nodes.length} messages)`}
      </summary>
      <div>
        {group.nodes.map((n) => (
          <MessageRow
            key={n.uuid || Math.random()}
            node={n}
            memosByMessage={memosByMessage}
            highlightedUuid={highlightedUuid}
          />
        ))}
      </div>
    </details>
  )
}

function findFirstAgentDescription(nodes) {
  for (const n of nodes) {
    if (n.kind !== 'assistant') continue
    for (const b of n.blocks || []) {
      if (b.type === 'tool_use' && (b.name === 'Agent' || b.name === 'Task')) {
        return (b.input?.description || '').slice(0, 60)
      }
    }
  }
  return ''
}
