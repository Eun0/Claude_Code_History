// Per-session memo persistence: ./data/memos/<sessionId>.json
import fs from 'node:fs/promises'
import path from 'node:path'
import crypto from 'node:crypto'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const MEMOS_DIR = path.resolve(__dirname, '..', 'data', 'memos')

async function ensureDir() {
  await fs.mkdir(MEMOS_DIR, { recursive: true })
}

function memoFilePath(sessionId) {
  if (!/^[a-zA-Z0-9_\-.]+$/.test(sessionId)) {
    throw new Error('invalid sessionId')
  }
  return path.join(MEMOS_DIR, `${sessionId}.json`)
}

function normalize(data, sessionId) {
  return {
    sessionId: data.sessionId || sessionId,
    projectId: data.projectId || null,
    title: typeof data.title === 'string' ? data.title : '',
    updatedAt: data.updatedAt || null,
    memos: Array.isArray(data.memos) ? data.memos : [],
  }
}

export async function readMemos(sessionId) {
  await ensureDir()
  try {
    const text = await fs.readFile(memoFilePath(sessionId), 'utf-8')
    const data = JSON.parse(text)
    return normalize(data, sessionId)
  } catch (err) {
    if (err.code === 'ENOENT') return { sessionId, projectId: null, memos: [] }
    throw err
  }
}

async function writeMemos(data) {
  await ensureDir()
  const filePath = memoFilePath(data.sessionId)
  const tmp = filePath + '.tmp'
  const serialized = JSON.stringify(
    { ...data, updatedAt: new Date().toISOString() },
    null,
    2
  )
  await fs.writeFile(tmp, serialized, 'utf-8')
  await fs.rename(tmp, filePath)
}

function newMemoId() {
  return 'memo_' + crypto.randomBytes(4).toString('hex')
}

export async function setBoardTitle(sessionId, title) {
  const board = await readMemos(sessionId)
  board.title = typeof title === 'string' ? title : ''
  await writeMemos(board)
  return board
}

export async function createMemo(sessionId, { title, note, messageUuids, projectId }) {
  const board = await readMemos(sessionId)
  if (projectId && !board.projectId) board.projectId = projectId
  const memo = {
    id: newMemoId(),
    title: title || '',
    note: note || '',
    messageUuids: Array.isArray(messageUuids) ? messageUuids : [],
    order: board.memos.length,
    createdAt: new Date().toISOString(),
  }
  board.memos.push(memo)
  await writeMemos(board)
  return memo
}

export async function updateMemo(sessionId, memoId, patch) {
  const board = await readMemos(sessionId)
  const idx = board.memos.findIndex((m) => m.id === memoId)
  if (idx === -1) {
    const err = new Error('memo not found')
    err.code = 'ENOENT'
    throw err
  }
  const updated = { ...board.memos[idx] }
  if (patch.title != null) updated.title = patch.title
  if (patch.note != null) updated.note = patch.note
  if (Array.isArray(patch.messageUuids)) updated.messageUuids = patch.messageUuids
  if (patch.order != null) updated.order = patch.order
  board.memos[idx] = updated
  board.memos.sort((a, b) => (a.order ?? 0) - (b.order ?? 0))
  await writeMemos(board)
  return updated
}

// Apply a complete reordering atomically. `orderedIds` is the desired
// memoId sequence; their `order` fields get rewritten to match. Any memo
// not present in the list keeps its original position appended after.
// One read + one write avoids the lost-update race that hit N concurrent
// per-memo PATCHes.
export async function reorderMemos(sessionId, orderedIds) {
  if (!Array.isArray(orderedIds)) {
    throw new Error('orderedIds must be an array')
  }
  const board = await readMemos(sessionId)
  const byId = new Map(board.memos.map((m) => [m.id, m]))
  const seen = new Set()
  const next = []
  for (const id of orderedIds) {
    if (seen.has(id)) continue
    const m = byId.get(id)
    if (!m) continue
    seen.add(id)
    next.push({ ...m, order: next.length })
  }
  // Anything missing from the request keeps relative order, appended.
  for (const m of board.memos) {
    if (seen.has(m.id)) continue
    next.push({ ...m, order: next.length })
  }
  board.memos = next
  await writeMemos(board)
  return board
}

export async function deleteMemo(sessionId, memoId) {
  const board = await readMemos(sessionId)
  const before = board.memos.length
  board.memos = board.memos.filter((m) => m.id !== memoId)
  if (board.memos.length === before) {
    const err = new Error('memo not found')
    err.code = 'ENOENT'
    throw err
  }
  await writeMemos(board)
}

export async function countMemosForSession(sessionId) {
  try {
    const board = await readMemos(sessionId)
    return board.memos.length
  } catch {
    return 0
  }
}

// Scan data/memos/ and return a flat list of every memo across all sessions,
// sorted by createdAt descending. Each entry carries the owning session/project
// so the UI can link back to the source.
export async function listAllMemos() {
  await ensureDir()
  let files
  try {
    files = await fs.readdir(MEMOS_DIR)
  } catch {
    return []
  }
  const out = []
  for (const f of files) {
    if (!f.endsWith('.json')) continue
    const sessionId = f.slice(0, -5)
    try {
      const board = await readMemos(sessionId)
      for (const m of board.memos) {
        out.push({
          id: m.id,
          title: m.title || '',
          note: m.note || '',
          messageUuids: m.messageUuids || [],
          order: m.order ?? 0,
          createdAt: m.createdAt || null,
          sessionId,
          projectId: board.projectId || null,
          updatedAt: board.updatedAt || null,
        })
      }
    } catch {
      // skip unreadable memo files
    }
  }
  out.sort((a, b) => {
    const ta = a.createdAt || ''
    const tb = b.createdAt || ''
    if (ta === tb) return 0
    return ta < tb ? 1 : -1
  })
  return out
}
