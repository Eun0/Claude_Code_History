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
          user: defaultUser(),
          port: 22,
          identityFile: null,
          proxyJump: null,
        }
      }
    } else if (current) {
      if (key === 'hostname') current.hostname = value
      else if (key === 'user') current.user = value
      else if (key === 'port') current.port = parseInt(value, 10) || 22
      else if (key === 'identityfile')
        current.identityFile = value.replace(/^~/, os.homedir())
      else if (key === 'proxyjump') current.proxyJump = value
    }
  }
  if (current) hosts.push(current)

  return hosts
}

function defaultUser() {
  return process.env.USER || os.userInfo().username
}

export async function findSshHost(alias) {
  const hosts = await parseSshConfig()
  return hosts.find((h) => h.alias === alias) || null
}

// A ProxyJump token is `[user@]host[:port]`, where `host` may be another
// alias defined in ~/.ssh/config.
function parseJumpToken(token) {
  let host = token
  let user = null
  let port = null

  const at = host.lastIndexOf('@')
  if (at !== -1) {
    user = host.slice(0, at)
    host = host.slice(at + 1)
  }
  const colon = host.lastIndexOf(':')
  if (colon !== -1) {
    port = parseInt(host.slice(colon + 1), 10) || null
    host = host.slice(0, colon)
  }
  return { user, host, port }
}

// Expands a ProxyJump value into an ordered list of hops, nearest-first
// (i.e. the host we dial directly comes first). Jump hosts that themselves
// declare a ProxyJump are expanded recursively, so `ssh -J a,b` and nested
// aliases both resolve to a flat chain.
export async function resolveJumpChain(proxyJump, hosts = null, depth = 0) {
  if (!proxyJump || depth > 5) return []
  const list = hosts || (await parseSshConfig())
  const chain = []

  for (const token of String(proxyJump).split(',').map((t) => t.trim()).filter(Boolean)) {
    const { user, host, port } = parseJumpToken(token)
    const cfg = list.find((h) => h.alias === host)
    // The jump host's own jump host has to be reached before the jump host.
    if (cfg?.proxyJump) {
      chain.push(...(await resolveJumpChain(cfg.proxyJump, list, depth + 1)))
    }
    chain.push({
      label: host,
      hostname: cfg?.hostname || host,
      user: user || cfg?.user || defaultUser(),
      port: port || cfg?.port || 22,
      identityFile: cfg?.identityFile || null,
    })
  }

  return chain
}
