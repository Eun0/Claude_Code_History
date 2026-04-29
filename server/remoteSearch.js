// Search Claude Code sessions on a remote server via SSH exec + grep.
import { getSftp, execRemote } from './remoteFs.js'
import { getServer } from './serverStore.js'

const MAX_GREP_LINES = 500
const MAX_RESULTS = 100
const SNIPPET_RADIUS = 60

function escapeShellSingleQuote(s) {
  // Inside single-quoted strings, the only special char is '.
  // Replace each ' with '\'' (end quote, literal quote, re-open quote).
  return s.replace(/'/g, "'\\''")
}

function extractText(rec) {
  const content = rec.message?.content
  if (typeof content === 'string') return content
  if (Array.isArray(content)) {
    return content
      .map((b) => {
        if (!b || typeof b !== 'object') return ''
        if (b.type === 'text') return b.text || ''
        if (b.type === 'thinking') return b.thinking || ''
        if (b.type === 'tool_use') return `${b.name || ''}\n${JSON.stringify(b.input || {})}`
        if (b.type === 'tool_result') {
          if (typeof b.content === 'string') return b.content
          if (Array.isArray(b.content))
            return b.content.filter((c) => c?.type === 'text').map((c) => c.text || '').join('\n')
        }
        return ''
      })
      .join('\n')
  }
  return ''
}

function matchedIn(rec) {
  const content = rec.message?.content
  if (!Array.isArray(content)) return rec.type || 'unknown'
  for (const b of content) {
    if (b?.type === 'tool_use') return 'tool_use'
    if (b?.type === 'tool_result') return 'tool_result'
  }
  return rec.type || 'unknown'
}

function toolNameOf(rec) {
  const blocks = rec.message?.content
  if (!Array.isArray(blocks)) return null
  for (const b of blocks) {
    if (b?.type === 'tool_use') return b.name
  }
  return null
}

function makeSnippet(text, matchIdx, queryLen) {
  const start = Math.max(0, matchIdx - SNIPPET_RADIUS)
  const end = Math.min(text.length, matchIdx + queryLen + SNIPPET_RADIUS)
  let snippet = text.slice(start, end)
  if (start > 0) snippet = '…' + snippet
  if (end < text.length) snippet = snippet + '…'
  return snippet.replace(/\s+/g, ' ')
}

async function resolveClaudePath(serverId, server) {
  try {
    const sftp = await getSftp(serverId)
    const relPath = (server.claudePath || '~/.claude/projects').replace(/^~\//, '')
    const homeDir = await new Promise((res, rej) =>
      sftp.realpath('.', (err, rp) => (err ? rej(err) : res(rp)))
    )
    return `${homeDir}/${relPath}`
  } catch {
    return (server.claudePath || '~/.claude/projects').replace(/^~/, `/home/${server.user}`)
  }
}

export async function searchRemote(serverId, { q, tool, from, to }) {
  if (!q || q.length < 2) return []

  const server = await getServer(serverId)
  if (!server) throw new Error(`Unknown server: ${serverId}`)

  const claudePath = await resolveClaudePath(serverId, server)
  const escaped = escapeShellSingleQuote(q)

  // grep -rn: recursive + line numbers. --text: treat binary as text.
  // --fixed-strings: no regex (safe, and we want literal search).
  // Output format: /path/project/session.jsonl:LINENUM:{...json...}
  const cmd = `grep -rn --fixed-strings --text --include='*.jsonl' '${escaped}' '${claudePath}' 2>/dev/null | head -${MAX_GREP_LINES}`

  const output = await execRemote(serverId, cmd)
  if (!output.trim()) return []

  const qLower = q.toLowerCase()
  const fromTs = from ? Date.parse(from) : null
  const toTs = to ? Date.parse(to) : null
  const results = []

  for (const line of output.split('\n')) {
    if (!line.trim()) continue

    // Parse: /abs/path/projectId/sessionId.jsonl:LINENUM:{json}
    const firstColon = line.indexOf(':')
    const secondColon = line.indexOf(':', firstColon + 1)
    if (firstColon < 0 || secondColon < 0) continue

    const filePath = line.slice(0, firstColon)
    const jsonStr = line.slice(secondColon + 1)

    if (!filePath.endsWith('.jsonl')) continue

    const parts = filePath.split('/')
    const filename = parts[parts.length - 1]
    const projectId = parts[parts.length - 2]
    const sessionId = filename.slice(0, -'.jsonl'.length)

    let rec
    try { rec = JSON.parse(jsonStr) } catch { continue }

    if (rec.type !== 'user' && rec.type !== 'assistant') continue
    if (rec.isMeta) continue
    if (fromTs && rec.timestamp && Date.parse(rec.timestamp) < fromTs) continue
    if (toTs && rec.timestamp && Date.parse(rec.timestamp) > toTs) continue
    if (tool && toolNameOf(rec) !== tool) continue

    const text = extractText(rec)
    const idx = text.toLowerCase().indexOf(qLower)
    if (idx < 0) continue

    results.push({
      serverId,
      serverLabel: server.label,
      projectId,
      sessionId,
      messageUuid: rec.uuid,
      timestamp: rec.timestamp || null,
      matchedIn: matchedIn(rec),
      snippet: makeSnippet(text, idx, q.length),
    })
    if (results.length >= MAX_RESULTS) break
  }

  return results
}
