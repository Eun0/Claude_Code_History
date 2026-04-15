import { fetchSession } from '../state/sessionCache.js'
import { renderMemoSection } from './memoMarkdown.js'

// Goes through the SAME `renderMemoSection` the server uses for
// /api/sessions/:sid/memos/markdown, so the Editor's copied output matches
// the memo side panel's preview markdown byte-for-byte when the underlying
// content is the same.
export async function buildMarkdown({ docTitle, intro, blocks }) {
  const title = (docTitle || '').trim() || 'Claude Code Memos'
  const out = [`# ${title}`, '']

  const introText = (intro || '').trim()
  if (introText) {
    out.push(introText)
    out.push('')
  }

  if (!blocks.length) {
    out.push('_(No memos yet.)_')
    return out.join('\n') + '\n'
  }

  for (let i = 0; i < blocks.length; i++) {
    const b = blocks[i]
    const nodes = await fetchBlockNodes(b)
    out.push(
      renderMemoSection({
        title: b.title,
        note: b.note,
        index: i,
        nodes,
      })
    )
    out.push('')
  }
  return out.join('\n').trimEnd() + '\n'
}

async function fetchBlockNodes(block) {
  const { sourceProjectId, sourceSessionId, messageUuids } = block
  if (!sourceProjectId || !sourceSessionId) return []
  if (!Array.isArray(messageUuids) || messageUuids.length === 0) return []
  let data
  try {
    data = await fetchSession(sourceProjectId, sourceSessionId)
  } catch {
    return []
  }
  const wanted = new Set(messageUuids)
  // Preserve the source session's natural ordering.
  return (data.messages || []).filter((m) => m.uuid && wanted.has(m.uuid))
}

// Download HTML path lives in the server (POST /api/editor/export) — it
// reuses the same shiki/formatTools/viewer.js pipeline the memo side
// panel's Download button uses. See server/exportHtml.js
// `buildCrossSessionExport`. No HTML is built client-side.

export function downloadBlob(filename, mimeType, content) {
  const blob = new Blob([content], { type: mimeType })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.rel = 'noopener'
  document.body.appendChild(a)
  a.click()
  a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}

export function suggestFilename(docTitle, ext) {
  const base = (docTitle || '').trim() || 'memo-collection'
  const safe = base.replace(/[\\/:*?"<>|\s]+/g, '-').replace(/-+/g, '-').replace(/^-|-$/g, '')
  return `${safe || 'memo-collection'}.${ext}`
}
