import { marked } from 'marked'

function escapeHtml(s) {
  return String(s || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

export function buildMarkdown({ docTitle, intro, blocks }) {
  const parts = []
  const title = (docTitle || '').trim()
  if (title) parts.push(`# ${title}`)
  const introText = (intro || '').trim()
  if (introText) parts.push(introText)

  for (const b of blocks) {
    const bTitle = (b.title || '').trim() || 'untitled'
    parts.push(`## ${bTitle}`)
    const note = (b.note || '').trim()
    if (note) parts.push(note)
    const srcBits = [b.sourceProjectId, b.sourceSessionId?.slice(0, 8)].filter(Boolean)
    if (srcBits.length) parts.push(`_from ${srcBits.join(' · ')}_`)
  }
  return parts.join('\n\n') + '\n'
}

// Self-contained HTML — visual form mirrors export-template/template.html
// (the preview/edit page). The editor UI renders the same class names
// (.wrap, .doc-title, .lede, .memo > h2 .index/.memo-title-text, .note),
// so downloading and previewing produce a read-only version of what you
// see while composing.
export function buildHtml({ docTitle, intro, blocks }) {
  const title = (docTitle || '').trim() || 'Claude Code Memos'
  const ledeText = (intro || '').trim() || 'A curated excerpt from a Claude Code session.'
  const introHtml = marked.parse(ledeText, { gfm: true, breaks: false })
  const memosHtml = (blocks || []).map((b, i) => renderMemoSection(b, i)).join('\n')
  const dateStr = escapeHtml(
    (() => {
      try {
        return new Date().toLocaleString([], {
          year: 'numeric',
          month: 'short',
          day: 'numeric',
          hour: '2-digit',
          minute: '2-digit',
        })
      } catch {
        return new Date().toISOString()
      }
    })()
  )
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<title>${escapeHtml(title)}</title>
<meta name="viewport" content="width=device-width,initial-scale=1">
<style>
:root {
  --bg: #fbfaf6;
  --bg-panel: #f4f1e8;
  --bg-code: #ebeae6;
  --border: #e3dec9;
  --border-hair: #ece8d7;
  --border-code: #d7d6d1;
  --text: #18181a;
  --text-2: #55524b;
  --text-3: #8b8679;
  --text-4: #b8b3a2;
  --accent: #2f3f6f;
  --serif: 'Iowan Old Style','Palatino Linotype','Book Antiqua',Palatino,Georgia,serif;
  --sans: -apple-system,'Inter','SF Pro Text',system-ui,'Segoe UI',Roboto,sans-serif;
  --mono: 'JetBrains Mono',ui-monospace,'SF Mono',Menlo,Monaco,Consolas,monospace;
}
* { box-sizing: border-box; }
html, body {
  margin: 0; padding: 0; background: var(--bg); color: var(--text);
  font-family: var(--sans); font-size: 15px; line-height: 1.58;
  -webkit-font-smoothing: antialiased;
}
.wrap { max-width: 880px; margin: 0 auto; padding: 72px 36px 120px 36px; }
h1 {
  font-family: var(--serif); font-weight: 500; font-size: 32px;
  letter-spacing: -0.015em; line-height: 1.2; margin: 0 0 6px 0;
}
.lede {
  color: var(--text-3); font-size: 13px; font-style: italic;
  margin: 0 0 6px 0; font-family: var(--serif); line-height: 1.55;
}
.lede p { margin: 6px 0; }
.lede p:first-child { margin-top: 0; }
.lede p:last-child { margin-bottom: 0; }
.meta {
  color: var(--text-3); font-size: 11px; font-family: var(--mono);
  display: flex; gap: 18px; flex-wrap: wrap; margin: 18px 0 0 0;
  padding-bottom: 36px; border-bottom: 1px solid var(--border-hair);
  font-variant-numeric: tabular-nums;
}
.meta dt {
  display: inline; color: var(--text-4); font-size: 9.5px;
  text-transform: uppercase; letter-spacing: 0.08em; margin-right: 5px;
}
.meta .m-item { white-space: nowrap; }
.memo {
  padding: 44px 0 36px 0;
  border-bottom: 1px solid var(--border-hair);
}
.memo:last-of-type { border-bottom: none; }
.memo h2 {
  font-family: var(--serif); font-weight: 500; font-size: 22px;
  letter-spacing: -0.01em; margin: 0 0 4px 0; color: var(--text);
  line-height: 1.3;
}
.memo .index {
  font-family: var(--mono); font-size: 11px; font-weight: 400;
  color: var(--text-4); margin-right: 10px; font-style: normal;
  letter-spacing: 0.05em; vertical-align: 0.15em;
}
.memo .note {
  font-family: var(--serif); font-size: 16px; font-style: italic;
  color: var(--text-2); line-height: 1.55; margin: 18px 0 10px 0;
  padding-left: 16px; border-left: 2px solid var(--accent);
}
.memo .note p { margin: 6px 0; }
.memo .note p:first-child { margin-top: 0; }
.memo .note p:last-child { margin-bottom: 0; }
.memo .note code {
  background: var(--bg-code); padding: 1px 5px; border-radius: 2px;
  font-family: var(--mono); font-style: normal; font-size: 13px;
}
.memo .note pre {
  background: var(--bg-code); border: 1px solid var(--border-hair);
  padding: 10px 12px; border-radius: 2px; overflow-x: auto;
  font-style: normal; margin: 10px 0;
}
.memo .note ul, .memo .note ol { margin: 8px 0; padding-left: 24px; }
.memo .note li { margin: 3px 0; }
.memo .note blockquote {
  margin: 10px 0; padding: 2px 14px;
  border-left: 2px solid var(--border); color: var(--text-3);
}
.memo .note a {
  color: var(--accent); text-decoration: none;
  border-bottom: 1px solid transparent;
}
.memo .note a:hover { border-bottom-color: var(--accent); }
.memo-source {
  font-family: var(--serif); font-style: italic;
  font-size: 12.5px; color: var(--text-3); margin: 0;
}
footer {
  margin-top: 80px; padding-top: 24px; border-top: 1px solid var(--border-hair);
  color: var(--text-4); font-size: 11px; font-family: var(--mono);
  text-align: center; letter-spacing: 0.02em;
}
.memo-source {
  font-family: var(--serif); font-style: italic;
  font-size: 12.5px; color: var(--text-3); margin: 6px 0 0 0;
}
</style>
</head>
<body>
<div class="wrap">
<h1>${escapeHtml(title)}</h1>
<div class="lede">${introHtml}</div>
<dl class="meta"><span class="m-item"><dt>date</dt>${dateStr}</span></dl>
${memosHtml}
<footer>Downloaded ${dateStr} · History Viewer for Claude Code</footer>
</div>
</body>
</html>
`
}

function renderMemoSection(b, i) {
  const num = String(i + 1).padStart(2, '0')
  const title = (b.title || '').trim() || 'untitled'
  const note = (b.note || '').trim()
  const noteHtml = note ? marked.parse(note, { gfm: true, breaks: false }) : ''
  const srcBits = [b.sourceProjectId, (b.sourceSessionId || '').slice(0, 8)].filter(Boolean)
  const source = srcBits.length ? `from ${srcBits.join(' · ')}` : ''
  return `<section class="memo">
  <h2><span class="index">№ ${num}</span>${escapeHtml(title)}</h2>
  ${noteHtml ? `<div class="note">${noteHtml}</div>` : ''}
  ${source ? `<div class="memo-source">${escapeHtml(source)}</div>` : ''}
</section>`
}

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
