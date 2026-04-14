// Extracts lightweight metadata for the session list (title, first snippet, etc.)
// without parsing the entire JSONL file.
import fs from 'node:fs'
import fsp from 'node:fs/promises'
import readline from 'node:readline'
import path from 'node:path'
import { projectDir } from './projects.js'

const MAX_PEEK_LINES = 40

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

async function peekLines(filePath, maxLines) {
  const stream = fs.createReadStream(filePath, { encoding: 'utf-8' })
  const rl = readline.createInterface({ input: stream, crlfDelay: Infinity })
  const lines = []
  for await (const line of rl) {
    if (!line.trim()) continue
    lines.push(line)
    if (lines.length >= maxLines) break
  }
  rl.close()
  stream.destroy()
  return lines
}

export async function readSessionMeta(projectId, sessionId) {
  const filePath = path.join(projectDir(projectId), `${sessionId}.jsonl`)
  const stat = await fsp.stat(filePath)
  const lines = await peekLines(filePath, MAX_PEEK_LINES)

  let startedAt = null
  let cwd = null
  let gitBranch = null
  let title = null
  let firstUserSnippet = null
  let aiTitle = null

  for (const line of lines) {
    let rec
    try {
      rec = JSON.parse(line)
    } catch {
      continue
    }
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
    title ||
    aiTitle ||
    (firstUserSnippet ? firstUserSnippet.slice(0, 80) : '(untitled session)')

  return {
    sessionId,
    title: displayTitle,
    firstUserSnippet: firstUserSnippet || '',
    startedAt: startedAt || new Date(stat.birthtimeMs).toISOString(),
    lastActivityAt: new Date(stat.mtimeMs).toISOString(),
    fileSize: stat.size,
    cwd,
    gitBranch,
  }
}

export async function listSessionsForProject(projectId) {
  const dir = projectDir(projectId)
  const files = await fsp.readdir(dir)
  const jsonlFiles = files.filter((f) => f.endsWith('.jsonl'))
  const results = await Promise.all(
    jsonlFiles.map(async (f) => {
      const sessionId = f.slice(0, -'.jsonl'.length)
      try {
        return await readSessionMeta(projectId, sessionId)
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
