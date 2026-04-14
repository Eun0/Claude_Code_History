// Scans ~/.claude/projects/ and returns project metadata.
import fs from 'node:fs/promises'
import path from 'node:path'
import os from 'node:os'

export const PROJECTS_ROOT = path.join(os.homedir(), '.claude', 'projects')

// Encoded names look like "-Users-alice-projects-myapp" (dashes replace slashes).
// Decode by replacing leading dash with "/" and subsequent dashes with "/".
// Note: this is lossy — Claude Code encodes `/`, `_`, and `.` all as `-`, so
// `art.ad_banner` and `art/ad/banner` both encode to the same string. Use
// `readSessionCwd()` below to recover the true path from a session file.
export function decodeProjectName(encoded) {
  return '/' + encoded.replace(/^-/, '').replace(/-/g, '/')
}

// Claude Code writes each JSONL record with a `cwd` field containing the
// actual absolute path. Reading the first record of any session file gives
// us a lossless decode. We only read the leading chunk to avoid loading
// huge session files into memory.
async function readSessionCwd(dir, sessionFiles) {
  for (const f of sessionFiles.slice(0, 3)) {
    let handle
    try {
      handle = await fs.open(path.join(dir, f), 'r')
      const buf = Buffer.alloc(32768)
      const { bytesRead } = await handle.read(buf, 0, 32768, 0)
      const text = buf.subarray(0, bytesRead).toString('utf-8')
      // The first record is often a `queue-operation` without `cwd`. Scan
      // complete lines until we find one that does.
      const lines = text.split('\n')
      // Drop the last element — it may be a partial line truncated by the
      // read buffer.
      if (lines.length > 1) lines.pop()
      for (const line of lines) {
        if (!line || line.indexOf('"cwd"') === -1) continue
        try {
          const rec = JSON.parse(line)
          if (rec && typeof rec.cwd === 'string' && rec.cwd) return rec.cwd
        } catch {}
      }
    } catch {
      // ignore and try next file
    } finally {
      if (handle) await handle.close().catch(() => {})
    }
  }
  return null
}

export async function listProjects() {
  let entries
  try {
    entries = await fs.readdir(PROJECTS_ROOT, { withFileTypes: true })
  } catch (err) {
    if (err.code === 'ENOENT') return []
    throw err
  }

  const projects = []
  for (const entry of entries) {
    if (!entry.isDirectory()) continue
    const dir = path.join(PROJECTS_ROOT, entry.name)
    let sessionFiles
    try {
      const files = await fs.readdir(dir)
      sessionFiles = files.filter((f) => f.endsWith('.jsonl'))
    } catch {
      continue
    }
    if (sessionFiles.length === 0) continue

    // lastModified = max mtime across session files
    let lastModified = 0
    for (const f of sessionFiles) {
      try {
        const st = await fs.stat(path.join(dir, f))
        if (st.mtimeMs > lastModified) lastModified = st.mtimeMs
      } catch {}
    }

    const realCwd = await readSessionCwd(dir, sessionFiles)
    projects.push({
      id: entry.name,
      encodedName: entry.name,
      decodedPath: realCwd || decodeProjectName(entry.name),
      sessionCount: sessionFiles.length,
      lastModified: new Date(lastModified).toISOString(),
    })
  }

  projects.sort((a, b) => (a.lastModified < b.lastModified ? 1 : -1))
  return projects
}

export function projectDir(projectId) {
  return path.join(PROJECTS_ROOT, projectId)
}
