// CRUD for enabled remote servers stored in data/servers.json
import fs from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { parseSshConfig } from './sshConfig.js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const STORE_PATH = path.join(__dirname, '..', 'data', 'servers.json')

async function readStore() {
  try {
    const text = await fs.readFile(STORE_PATH, 'utf-8')
    return JSON.parse(text)
  } catch {
    return { servers: [] }
  }
}

async function writeStore(data) {
  await fs.mkdir(path.dirname(STORE_PATH), { recursive: true })
  await fs.writeFile(STORE_PATH, JSON.stringify(data, null, 2), 'utf-8')
}

export async function listServers() {
  const { servers } = await readStore()
  return servers
}

export async function addServer(sshAlias) {
  const hosts = await parseSshConfig()
  const host = hosts.find((h) => h.alias === sshAlias)
  if (!host) throw new Error(`SSH alias "${sshAlias}" not found in ~/.ssh/config`)

  const store = await readStore()
  if (store.servers.find((s) => s.sshAlias === sshAlias)) {
    throw new Error(`Server "${sshAlias}" already added`)
  }

  const id = 'srv_' + Math.random().toString(36).slice(2, 10)
  const server = {
    id,
    sshAlias,
    label: sshAlias,
    hostname: host.hostname,
    user: host.user,
    port: host.port,
    identityFile: host.identityFile,
    claudePath: '~/.claude/projects',
    addedAt: new Date().toISOString(),
  }
  store.servers.push(server)
  await writeStore(store)
  return server
}

export async function removeServer(id) {
  const store = await readStore()
  const idx = store.servers.findIndex((s) => s.id === id)
  if (idx === -1) throw new Error(`Server "${id}" not found`)
  store.servers.splice(idx, 1)
  await writeStore(store)
}

export async function getServer(id) {
  const { servers } = await readStore()
  return servers.find((s) => s.id === id) || null
}
