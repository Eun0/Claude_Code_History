// Full JSONL read for a single session.
import fsp from 'node:fs/promises'
import path from 'node:path'
import { projectDir } from './projects.js'
import { parseMessages } from '../src/lib/parseMessages.js'

export async function readSessionRaw(projectId, sessionId) {
  const filePath = path.join(projectDir(projectId), `${sessionId}.jsonl`)
  const text = await fsp.readFile(filePath, 'utf-8')
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
  return { records, parseErrors }
}

export async function readSessionParsed(projectId, sessionId) {
  const { records, parseErrors } = await readSessionRaw(projectId, sessionId)
  const { nodes, meta } = parseMessages(records)
  return {
    meta: {
      sessionId,
      projectId,
      ...meta,
      parseErrors,
    },
    messages: nodes,
  }
}
