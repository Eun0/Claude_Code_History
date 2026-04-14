// Bundles export-template/viewer.js into dist/viewer.min.js for inlining in exports.
import esbuild from 'esbuild'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import fs from 'node:fs/promises'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const root = path.resolve(__dirname, '..')

await fs.mkdir(path.join(root, 'dist'), { recursive: true })

await esbuild.build({
  entryPoints: [path.join(root, 'export-template', 'viewer.js')],
  bundle: true,
  minify: true,
  format: 'iife',
  outfile: path.join(root, 'dist', 'viewer.min.js'),
  target: 'es2020',
})

console.log('✓ built dist/viewer.min.js')
