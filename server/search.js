// Naive global search across all JSONL sessions.
// Not optimized, but fast enough for a few hundred MB on modern hardware.
import fs from 'node:fs'
import fsp from 'node:fs/promises'
import path from 'node:path'
import readline from 'node:readline'
import { PROJECTS_ROOT } from './projects.js'

const MAX_RESULTS = 100
const SNIPPET_RADIUS = 60

function extractSearchableText(rec) {
  // Returns { text: string, matchedIn: string }
  const msg = rec.message
  if (!msg) return null
  const content = msg.content
  if (typeof content === 'string') {
    return { text: content, matchedIn: rec.type || 'unknown' }
  }
  if (Array.isArray(content)) {
    const parts = []
    let kind = rec.type || 'unknown'
    for (const b of content) {
      if (!b || typeof b !== 'object') continue
      if (b.type === 'text') parts.push(b.text || '')
      else if (b.type === 'thinking') parts.push(b.thinking || '')
      else if (b.type === 'tool_use') {
        parts.push(b.name || '')
        parts.push(JSON.stringify(b.input || {}))
        kind = 'tool_use'
      } else if (b.type === 'tool_result') {
        if (typeof b.content === 'string') parts.push(b.content)
        else if (Array.isArray(b.content)) {
          for (const c of b.content) {
            if (c?.type === 'text') parts.push(c.text || '')
          }
        }
        kind = 'tool_result'
      }
    }
    return { text: parts.join('\n'), matchedIn: kind }
  }
  return null
}

function toolNameOf(rec) {
  if (rec.type !== 'assistant') return null
  const blocks = rec.message?.content
  if (!Array.isArray(blocks)) return null
  for (const b of blocks) {
    if (b?.type === 'tool_use') return b.name
  }
  return null
}

function makeSnippet(text, matchStart, matchLen) {
  const start = Math.max(0, matchStart - SNIPPET_RADIUS)
  const end = Math.min(text.length, matchStart + matchLen + SNIPPET_RADIUS)
  let snippet = text.slice(start, end)
  if (start > 0) snippet = '…' + snippet
  if (end < text.length) snippet = snippet + '…'
  return snippet.replace(/\s+/g, ' ')
}

export async function searchAll({ q, tool, from, to }) {
  if (!q || q.length < 2) return []
  const qLower = q.toLowerCase()
  const fromTs = from ? Date.parse(from) : null
  const toTs = to ? Date.parse(to) : null

  const results = []

  let projectEntries
  try {
    projectEntries = await fsp.readdir(PROJECTS_ROOT, { withFileTypes: true })
  } catch {
    return []
  }

  outer: for (const pe of projectEntries) {
    if (!pe.isDirectory()) continue
    const projectId = pe.name
    const projectDir = path.join(PROJECTS_ROOT, projectId)
    let files
    try {
      files = (await fsp.readdir(projectDir)).filter((f) => f.endsWith('.jsonl'))
    } catch {
      continue
    }

    for (const f of files) {
      const sessionId = f.slice(0, -'.jsonl'.length)
      const filePath = path.join(projectDir, f)

      const stream = fs.createReadStream(filePath, { encoding: 'utf-8' })
      const rl = readline.createInterface({ input: stream, crlfDelay: Infinity })

      try {
        for await (const line of rl) {
          if (!line.trim()) continue
          let rec
          try {
            rec = JSON.parse(line)
          } catch {
            continue
          }
          if (rec.type !== 'user' && rec.type !== 'assistant') continue
          if (rec.isMeta) continue

          if (fromTs && rec.timestamp && Date.parse(rec.timestamp) < fromTs) continue
          if (toTs && rec.timestamp && Date.parse(rec.timestamp) > toTs) continue

          if (tool) {
            const tn = toolNameOf(rec)
            if (tn !== tool) continue
          }

          const extracted = extractSearchableText(rec)
          if (!extracted?.text) continue
          const lowered = extracted.text.toLowerCase()
          const idx = lowered.indexOf(qLower)
          if (idx < 0) continue

          results.push({
            projectId,
            sessionId,
            messageUuid: rec.uuid,
            timestamp: rec.timestamp || null,
            matchedIn: extracted.matchedIn,
            snippet: makeSnippet(extracted.text, idx, q.length),
          })

          if (results.length >= MAX_RESULTS) {
            rl.close()
            stream.destroy()
            break outer
          }
        }
      } finally {
        rl.close()
        stream.destroy()
      }
    }
  }

  results.sort((a, b) => {
    const ta = a.timestamp || ''
    const tb = b.timestamp || ''
    return ta < tb ? 1 : -1
  })
  return results
}
