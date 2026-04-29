// Parses ~/.ssh/config and returns a list of host entries.
import fs from 'node:fs/promises'
import path from 'node:path'
import os from 'node:os'

const SSH_CONFIG_PATH = path.join(os.homedir(), '.ssh', 'config')

export async function parseSshConfig() {
  let text
  try {
    text = await fs.readFile(SSH_CONFIG_PATH, 'utf-8')
  } catch {
    return []
  }

  const hosts = []
  let current = null

  for (const rawLine of text.split('\n')) {
    const line = rawLine.trim()
    if (!line || line.startsWith('#')) continue

    const spaceIdx = line.indexOf(' ')
    if (spaceIdx === -1) continue
    const key = line.slice(0, spaceIdx).toLowerCase()
    const value = line.slice(spaceIdx + 1).trim()

    if (key === 'host') {
      if (current) hosts.push(current)
      // Skip wildcard patterns
      if (value.includes('*') || value.includes('?')) {
        current = null
      } else {
        current = {
          alias: value,
          hostname: value,
          user: process.env.USER || os.userInfo().username,
          port: 22,
          identityFile: null,
        }
      }
    } else if (current) {
      if (key === 'hostname') current.hostname = value
      else if (key === 'user') current.user = value
      else if (key === 'port') current.port = parseInt(value, 10) || 22
      else if (key === 'identityfile')
        current.identityFile = value.replace(/^~/, os.homedir())
    }
  }
  if (current) hosts.push(current)

  return hosts
}
