import Fastify from 'fastify'
import fastifyStatic from '@fastify/static'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { registerRoutes } from './routes.js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const projectRoot = path.resolve(__dirname, '..')

const PORT = Number(process.env.PORT || 5174)
const isProd = process.env.NODE_ENV === 'production'

const app = Fastify({ logger: true })

app.log.info(`starting claude-code-history server (prod=${isProd})`)

await registerRoutes(app)

if (isProd) {
  const distDir = path.join(projectRoot, 'dist')
  await app.register(fastifyStatic, { root: distDir, prefix: '/' })
  app.setNotFoundHandler((req, reply) => {
    if (req.url.startsWith('/api')) {
      reply.code(404).send({ error: 'not found' })
      return
    }
    reply.sendFile('index.html')
  })
}

try {
  await app.listen({ port: PORT, host: '127.0.0.1' })
  app.log.info(`listening on http://127.0.0.1:${PORT}`)
} catch (err) {
  app.log.error(err)
  process.exit(1)
}
