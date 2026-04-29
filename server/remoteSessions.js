// Read Claude Code session data from a remote server via SFTP.
import { getSftp, listRemoteDir, statRemote, readRemoteFile, readRemoteFilePartial } from './remoteFs.js'
import { getServer } from './serverStore.js'
import { parseMessages } from '../src/lib/parseMessages.js'

function stripCommandTags(s) {
  return s
    .replace(/<command-name>[\s\S]*?<\/command-name>/g, '')
    .replace(/<command-message>[\s\S]*?<\/command-message>/g, '')
    .replace(/<command-args>([\s\S]*?)<\/command-args>/g, (_, inner) => inner.trim())
    .replace(/<local-command-stdout>[\s\S]*?<\/local-command-stdout>/g, '')
    .replace(/<local-command-caveat>[\s\S]*?<\/local-command-caveat>/g, '')
    .trim()
}

function extractText(content) {
  if (typeof content === 'string') return content
  if (Array.isArray(content)) {
    return content
      .map((b) => {
        if (typeof b === 'string') return b
        if (b?.type === 'text' && typeof b.text === 'string') return b.text
        return ''
      })
      .join(' ')
  }
  return ''
}

async function getRemoteRoot(serverId) {
  const server = await getServer(serverId)
  if (!server) throw new Error(`Unknown server: ${serverId}`)
  const sftp = await getSftp(serverId)

  let resolvedRoot
  try {
    const relPath = (server.claudePath || '~/.claude/projects').replace(/^~\//, '')
    const homeDir = await new Promise((res, rej) =>
      sftp.realpath('.', (err, rp) => (err ? rej(err) : res(rp)))
    )
    resolvedRoot = `${homeDir}/${relPath}`
  } catch {
    resolvedRoot = (server.claudePath || '~/.claude/projects').replace(
      /^~/,
      `/home/${server.user}`
    )
  }
  return { sftp, resolvedRoot }
}

export async function listRemoteSessions(serverId, projectId) {
  const { sftp, resolvedRoot } = await getRemoteRoot(serverId)
  const projectPath = `${resolvedRoot}/${projectId}`

  const files = await listRemoteDir(sftp, projectPath)
  const jsonlFiles = files.filter((f) => f.filename.endsWith('.jsonl'))

  const results = await Promise.all(
    jsonlFiles.map(async (f) => {
      const sessionId = f.filename.slice(0, -'.jsonl'.length)
      const filePath = `${projectPath}/${f.filename}`
      try {
        const mtime = f.attrs.mtime * 1000
        const size = f.attrs.size

        const text = await readRemoteFilePartial(sftp, filePath, 32768)
        const lines = text.split('\n').filter((l) => l.trim())
        if (lines.length > 1) lines.pop() // possibly truncated last line

        let startedAt = null
        let cwd = null
        let gitBranch = null
        let title = null
        let aiTitle = null
        let firstUserSnippet = null

        for (const line of lines.slice(0, 40)) {
          let rec
          try { rec = JSON.parse(line) } catch { continue }
          if (!startedAt && rec.timestamp) startedAt = rec.timestamp
          if (!cwd && rec.cwd) cwd = rec.cwd
          if (!gitBranch && rec.gitBranch) gitBranch = rec.gitBranch
          if (rec.type === 'summary' && rec.summary && !title) title = rec.summary
          if (rec.type === 'ai-title' && rec.aiTitle && !aiTitle) aiTitle = rec.aiTitle
          if (rec.type === 'user' && !firstUserSnippet && !rec.isMeta) {
            const raw = extractText(rec.message?.content)
            const cleaned = stripCommandTags(raw)
            if (cleaned) firstUserSnippet = cleaned.slice(0, 120)
          }
        }

        const displayTitle =
          title || aiTitle || (firstUserSnippet ? firstUserSnippet.slice(0, 80) : '(untitled session)')

        return {
          sessionId,
          title: displayTitle,
          firstUserSnippet: firstUserSnippet || '',
          startedAt: startedAt || new Date(mtime).toISOString(),
          lastActivityAt: new Date(mtime).toISOString(),
          fileSize: size,
          cwd,
          gitBranch,
        }
      } catch (err) {
        return {
          sessionId,
          title: '(error reading)',
          firstUserSnippet: String(err.message || err),
          startedAt: null,
          lastActivityAt: null,
          fileSize: 0,
          cwd: null,
          gitBranch: null,
        }
      }
    })
  )

  results.sort((a, b) => {
    const ta = a.lastActivityAt || ''
    const tb = b.lastActivityAt || ''
    return ta < tb ? 1 : -1
  })
  return results
}

export async function readRemoteSessionParsed(serverId, projectId, sessionId) {
  const { sftp, resolvedRoot } = await getRemoteRoot(serverId)
  const filePath = `${resolvedRoot}/${projectId}/${sessionId}.jsonl`

  const text = await readRemoteFile(sftp, filePath)
  const lines = text.split('\n').filter((l) => l.trim())
  const records = []
  const parseErrors = []
  for (let i = 0; i < lines.length; i++) {
    try {
      records.push(JSON.parse(lines[i]))
    } catch (err) {
      parseErrors.push({ line: i + 1, error: String(err.message || err) })
    }
  }

  const { nodes, meta } = parseMessages(records)
  return {
    meta: { sessionId, projectId, ...meta, parseErrors },
    messages: nodes,
  }
}
