// Serialize a session's memos to a Markdown string — clean share mode.
// Pure rendering lives in ../src/lib/memoMarkdown.js so the in-app /editor
// produces byte-identical output when copying a memo's markdown.
import { readMemos } from './memoStore.js'
import { readSessionParsed } from './sessions.js'
import { renderMemoSection } from '../src/lib/memoMarkdown.js'

export async function renderMemosMarkdown(projectId, sessionId) {
  const [{ messages }, board] = await Promise.all([
    readSessionParsed(projectId, sessionId),
    readMemos(sessionId),
  ])

  const byUuid = new Map()
  for (const n of messages) {
    if (n.uuid) byUuid.set(n.uuid, n)
  }

  const title = (board.title || '').trim() || 'Claude Code Memos'
  const out = [`# ${title}`, '']

  if (!board.memos.length) {
    out.push('_(No memos in this session yet.)_')
    return out.join('\n')
  }

  const sorted = [...board.memos].sort((a, b) => (a.order ?? 0) - (b.order ?? 0))
  for (let i = 0; i < sorted.length; i++) {
    const memo = sorted[i]
    const nodes = []
    for (const uuid of memo.messageUuids || []) {
      const node = byUuid.get(uuid)
      if (node) nodes.push(node)
    }
    out.push(
      renderMemoSection({
        title: memo.title,
        note: memo.note,
        index: i,
        nodes,
      })
    )
    out.push('')
  }

  return out.join('\n').trimEnd() + '\n'
}
