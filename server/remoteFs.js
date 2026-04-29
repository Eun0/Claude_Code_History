// SSH2/SFTP connection pool for reading remote files.
import { Client } from 'ssh2'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { getServer } from './serverStore.js'

// Cache: serverId → { sftp, conn, expiresAt }
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

async function openConnection(server) {
  return new Promise((resolve, reject) => {
    const conn = new Client()

    const authOptions = {
      host: server.hostname,
      port: server.port || 22,
      username: server.user || process.env.USER || os.userInfo().username,
      readyTimeout: 15_000,
    }

    // Always try to provide an explicit private key (ssh2 handles passphrase-less keys).
    // Also set the agent socket so ssh2 can try agent-held keys if key file fails.
    const keyPath = resolveKeyPath(server.identityFile) || defaultKeyPaths()[0]
    if (keyPath) {
      try {
        authOptions.privateKey = fs.readFileSync(keyPath)
      } catch {}
    }
    if (process.env.SSH_AUTH_SOCK) {
      authOptions.agent = process.env.SSH_AUTH_SOCK
    }

    conn.on('ready', () => {
      conn.sftp((err, sftp) => {
        if (err) { conn.end(); reject(err); return }
        resolve({ conn, sftp })
      })
    })
    conn.on('error', reject)
    conn.connect(authOptions)
  })
}

export async function getSftp(serverId) {
  const cached = pool.get(serverId)
  if (cached && cached.expiresAt > Date.now()) {
    return cached.sftp
  }
  // Close stale connection if any
  if (cached) {
    try { cached.conn.end() } catch {}
    pool.delete(serverId)
  }

  const server = await getServer(serverId)
  if (!server) throw new Error(`Unknown server: ${serverId}`)

  const { conn, sftp } = await openConnection(server)
  pool.set(serverId, { conn, sftp, expiresAt: Date.now() + TTL_MS })

  conn.on('close', () => pool.delete(serverId))
  conn.on('error', () => pool.delete(serverId))

  return sftp
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
