// SSH2/SFTP connection pool for reading remote files.
import { Client } from 'ssh2'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { getServer } from './serverStore.js'
import { findSshHost, resolveJumpChain } from './sshConfig.js'
import { formatError } from './errors.js'

// Cache: serverId → { sftp, conn, hops, expiresAt }
const pool = new Map()
const TTL_MS = 60_000

function resolveKeyPath(identityFile) {
  if (!identityFile) return null
  return identityFile.replace(/^~/, os.homedir())
}

function defaultKeyPaths() {
  const home = os.homedir()
  return [
    path.join(home, '.ssh', 'id_ed25519'),
    path.join(home, '.ssh', 'id_rsa'),
    path.join(home, '.ssh', 'id_ecdsa'),
  ].filter((p) => {
    try { fs.accessSync(p); return true } catch { return false }
  })
}

function authOptionsFor(node) {
  const options = {
    host: node.hostname,
    port: node.port || 22,
    username: node.user || process.env.USER || os.userInfo().username,
    readyTimeout: 15_000,
  }

  // Always try to provide an explicit private key (ssh2 handles passphrase-less keys).
  // Also set the agent socket so ssh2 can try agent-held keys if key file fails.
  const keyPath = resolveKeyPath(node.identityFile) || defaultKeyPaths()[0]
  if (keyPath) {
    try {
      options.privateKey = fs.readFileSync(keyPath)
    } catch {}
  }
  if (process.env.SSH_AUTH_SOCK) {
    options.agent = process.env.SSH_AUTH_SOCK
  }
  return options
}

// Dials one node. `sock` — when given — is a tunnelled stream from the previous
// hop, which makes ssh2 speak SSH over it instead of opening its own TCP
// connection (this is what `ProxyJump` does).
function connectNode(node, sock) {
  return new Promise((resolve, reject) => {
    const conn = new Client()
    const options = authOptionsFor(node)
    if (sock) options.sock = sock

    let settled = false
    // Stays attached for the connection's whole life: an 'error' event with no
    // listener is an uncaught exception, and a hop can drop long after it went
    // ready. Post-handshake failures are handled by the pool's 'close' cleanup.
    conn.on('error', (err) => {
      if (settled) return
      settled = true
      try { conn.end() } catch {}
      reject(
        new Error(
          `SSH connect to ${node.label || node.hostname}:${node.port || 22} failed: ${formatError(err)}`
        )
      )
    })
    conn.once('ready', () => {
      settled = true
      resolve(conn)
    })
    conn.connect(options)
  })
}

// Opens a TCP tunnel through `conn` to dstHost:dstPort and hands back the stream.
function forwardOut(conn, dstHost, dstPort) {
  return new Promise((resolve, reject) => {
    conn.forwardOut('127.0.0.1', 0, dstHost, dstPort, (err, stream) => {
      if (err) {
        reject(new Error(`tunnel to ${dstHost}:${dstPort} failed: ${formatError(err)}`))
      } else {
        resolve(stream)
      }
    })
  })
}

// `HostName localhost` only means anything on the far side of a jump host, so a
// stored server whose ssh config entry has ProxyJump must be dialled through
// that chain. Older data/servers.json entries predate the proxyJump field —
// fall back to re-reading ~/.ssh/config by alias so they keep working.
async function jumpChainFor(server) {
  let proxyJump = server.proxyJump
  if (!proxyJump && server.sshAlias) {
    const cfg = await findSshHost(server.sshAlias)
    proxyJump = cfg?.proxyJump || null
  }
  return await resolveJumpChain(proxyJump)
}

async function openConnection(server) {
  const target = {
    label: server.label || server.sshAlias || server.hostname,
    hostname: server.hostname,
    user: server.user,
    port: server.port,
    identityFile: server.identityFile,
  }
  const nodes = [...(await jumpChainFor(server)), target]
  const hops = []

  try {
    let sock = null
    for (let i = 0; i < nodes.length; i++) {
      const conn = await connectNode(nodes[i], sock)
      if (i === nodes.length - 1) {
        const sftp = await new Promise((resolve, reject) => {
          conn.sftp((err, s) => (err ? reject(err) : resolve(s)))
        }).catch((err) => {
          try { conn.end() } catch {}
          throw err
        })
        return { conn, sftp, hops }
      }
      hops.push(conn)
      sock = await forwardOut(conn, nodes[i + 1].hostname, nodes[i + 1].port || 22)
    }
  } catch (err) {
    for (const hop of hops) {
      try { hop.end() } catch {}
    }
    throw err
  }
}

export async function getSftp(serverId) {
  const cached = pool.get(serverId)
  if (cached && cached.expiresAt > Date.now()) {
    return cached.sftp
  }
  // Close stale connection if any
  if (cached) {
    closeEntry(cached)
    pool.delete(serverId)
  }

  const server = await getServer(serverId)
  if (!server) throw new Error(`Unknown server: ${serverId}`)

  const { conn, sftp, hops } = await openConnection(server)
  const entry = { conn, sftp, hops, expiresAt: Date.now() + TTL_MS }
  pool.set(serverId, entry)

  // The jump-host connections only exist to carry this one — tear the whole
  // chain down together, or they leak until the process exits.
  const drop = () => {
    if (pool.get(serverId) === entry) pool.delete(serverId)
    for (const hop of hops) {
      try { hop.end() } catch {}
    }
  }
  conn.on('close', drop)
  conn.on('error', drop)

  return sftp
}

function closeEntry(entry) {
  try { entry.conn.end() } catch {}
  for (const hop of entry.hops || []) {
    try { hop.end() } catch {}
  }
}

export function listRemoteDir(sftp, remotePath) {
  return new Promise((resolve, reject) => {
    sftp.readdir(remotePath, (err, list) => {
      if (err) reject(err)
      else resolve(list) // [{ filename, longname, attrs }]
    })
  })
}

export function statRemote(sftp, remotePath) {
  return new Promise((resolve, reject) => {
    sftp.stat(remotePath, (err, stats) => {
      if (err) reject(err)
      else resolve(stats)
    })
  })
}

export function readRemoteFile(sftp, remotePath) {
  return new Promise((resolve, reject) => {
    const chunks = []
    const stream = sftp.createReadStream(remotePath)
    stream.on('data', (chunk) => chunks.push(chunk))
    stream.on('end', () => resolve(Buffer.concat(chunks).toString('utf-8')))
    stream.on('error', reject)
  })
}

export function readRemoteFilePartial(sftp, remotePath, byteLimit = 32768) {
  return new Promise((resolve, reject) => {
    const chunks = []
    let total = 0
    const stream = sftp.createReadStream(remotePath, { start: 0, end: byteLimit - 1 })
    stream.on('data', (chunk) => {
      chunks.push(chunk)
      total += chunk.length
    })
    stream.on('end', () => resolve(Buffer.concat(chunks).toString('utf-8')))
    stream.on('error', reject)
  })
}

// Run a shell command on the remote server and return stdout as a string.
export async function execRemote(serverId, command) {
  await getSftp(serverId) // ensure connection is pooled
  const { conn } = pool.get(serverId)
  return new Promise((resolve, reject) => {
    conn.exec(command, (err, stream) => {
      if (err) { reject(err); return }
      const out = []
      stream.on('data', (c) => out.push(c))
      stream.stderr.on('data', () => {}) // discard stderr
      stream.on('close', () => resolve(Buffer.concat(out).toString('utf-8')))
      stream.on('error', reject)
    })
  })
}
