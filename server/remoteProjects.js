// Lists Claude Code projects on a remote server via SFTP.
import os from 'node:os'
import { getSftp, listRemoteDir, statRemote, readRemoteFilePartial } from './remoteFs.js'
import { getServer } from './serverStore.js'

function decodeProjectName(encoded) {
  return '/' + encoded.replace(/^-/, '').replace(/-/g, '/')
}

async function readRemoteSessionCwd(sftp, projectPath, sessionFiles) {
  for (const f of sessionFiles.slice(0, 3)) {
    try {
      const text = await readRemoteFilePartial(sftp, `${projectPath}/${f}`, 32768)
      const lines = text.split('\n')
      if (lines.length > 1) lines.pop()
      for (const line of lines) {
        if (!line || !line.includes('"cwd"')) continue
        try {
          const rec = JSON.parse(line)
          if (rec && typeof rec.cwd === 'string' && rec.cwd) return rec.cwd
        } catch {}
      }
    } catch {}
  }
  return null
}

export async function listRemoteProjects(serverId) {
  const server = await getServer(serverId)
  if (!server) throw new Error(`Unknown server: ${serverId}`)

  const sftp = await getSftp(serverId)

  const fallbackRoot = (server.claudePath || '~/.claude/projects').replace(
    /^~/,
    `/home/${server.user}`
  )
  let resolvedRoot = fallbackRoot
  try {
    const relPath = (server.claudePath || '~/.claude/projects').replace(/^~\//, '')
    // sftp.realpath('.') resolves to the SSH user's home directory
    const homeDir = await new Promise((res, rej) =>
      sftp.realpath('.', (err, rp) => (err ? rej(err) : res(rp)))
    )
    resolvedRoot = `${homeDir}/${relPath}`
  } catch {
    // fallback to /home/<user>/.claude/projects
  }

  let entries
  try {
    entries = await listRemoteDir(sftp, resolvedRoot)
  } catch (err) {
    if (err.code === 2 /* ENOENT */) return []
    throw err
  }

  const projects = []
  for (const entry of entries) {
    if (!(entry.attrs.mode & 0o040000)) continue // skip non-directories
    const projectPath = `${resolvedRoot}/${entry.filename}`

    let sessionFiles
    try {
      const files = await listRemoteDir(sftp, projectPath)
      sessionFiles = files.filter((f) => f.filename.endsWith('.jsonl')).map((f) => f.filename)
    } catch {
      continue
    }
    if (sessionFiles.length === 0) continue

    // lastModified = max mtime across session files
    let lastModified = 0
    for (const f of sessionFiles) {
      try {
        const st = await statRemote(sftp, `${projectPath}/${f}`)
        const mtime = st.mtime * 1000
        if (mtime > lastModified) lastModified = mtime
      } catch {}
    }

    const realCwd = await readRemoteSessionCwd(sftp, projectPath, sessionFiles)
    projects.push({
      id: entry.filename,
      encodedName: entry.filename,
      decodedPath: realCwd || decodeProjectName(entry.filename),
      sessionCount: sessionFiles.length,
      lastModified: new Date(lastModified || Date.now()).toISOString(),
    })
  }

  projects.sort((a, b) => (a.lastModified < b.lastModified ? 1 : -1))
  return projects
}
