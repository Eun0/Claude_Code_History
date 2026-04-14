// Groups contiguous sidechain (subagent) messages together.
// Input: flat array of render nodes from parseMessages.
// Output: mixed array of nodes and { kind: 'sidechain_group', nodes: [...] } entries.

export function groupSidechains(nodes) {
  const out = []
  let buffer = null
  for (const n of nodes) {
    if (n.isSidechain) {
      if (!buffer) buffer = { kind: 'sidechain_group', nodes: [] }
      buffer.nodes.push(n)
    } else {
      if (buffer) {
        out.push(buffer)
        buffer = null
      }
      out.push(n)
    }
  }
  if (buffer) out.push(buffer)
  return out
}
