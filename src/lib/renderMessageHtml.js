// Shared pure-function HTML renderer for conversation messages.
//
// This module is the SINGLE SOURCE OF TRUTH for how user/assistant/tool
// messages render to HTML. It's consumed by:
//   - React components (UserMessage, AssistantMessage) via dangerouslySetInnerHTML
//   - Server export (exportHtml.js buildMemoExport) for static download HTML
//   - viewer.js (esbuild bundles this in) for /preview edit mode
//
// Zero React / DOM dependencies — only string concatenation + `marked`.

import { marked } from 'marked'
import { formatToolUse } from './formatTools.js'

// ─── Utilities ──────────────────────────────────────────────

export function escapeHtml(s) {
  return String(s == null ? '' : s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

// Strip Claude Code CLI wrappers from user text. Duplicated in 3 files
// before this module existed — now the single copy.
export function cleanUserText(s) {
  if (!s) return ''
  return s
    .replace(/<command-name>[\s\S]*?<\/command-name>/g, '')
    .replace(/<command-message>[\s\S]*?<\/command-message>/g, '')
    .replace(/<command-args>([\s\S]*?)<\/command-args>/g, (_, inner) => inner.trim())
    .replace(
      /<local-command-stdout>([\s\S]*?)<\/local-command-stdout>/g,
      (_, inner) => '```\n' + inner.trim() + '\n```'
    )
    .replace(/<local-command-caveat>[\s\S]*?<\/local-command-caveat>/g, '')
    .replace(/<system-reminder>[\s\S]*?<\/system-reminder>/g, '')
    .trim()
}

function isLocalPath(href) {
  if (!href) return true
  const raw = String(href).trim()
  const lower = raw.toLowerCase()
  if (
    lower.startsWith('javascript:') ||
    lower.startsWith('data:') ||
    lower.startsWith('vbscript:')
  )
    return true
  if (/^[a-z][a-z0-9+.-]*:/i.test(raw)) return false
  if (raw.startsWith('//')) return false
  if (raw.startsWith('#')) return false
  return true
}

// Render markdown text to HTML via `marked` (GFM), then post-process links:
// local file paths → <strong>, external → target="_blank".
export function renderMarkdown(text) {
  if (!text) return ''
  const rawHtml = marked.parse(text, { gfm: true, breaks: false })
  return rawHtml.replace(
    /<a\s+([^>]*?)href="([^"]*)"([^>]*)>([\s\S]*?)<\/a>/gi,
    (match, pre, href, post, inner) => {
      if (isLocalPath(href)) {
        return `<strong>${inner}</strong>`
      }
      if (!/\btarget=/.test(pre + post)) {
        return `<a ${pre}href="${href}"${post} target="_blank" rel="noreferrer">${inner}</a>`
      }
      return match
    }
  )
}

// ─── Block renderers ────────────────────────────────────────

export function renderTextBlock(block, parentKind) {
  // Server-prepared blocks carry `renderedHtml` (marked + shiki via
  // exportHtml.js prepareBlock). Client-side blocks only have raw `text`.
  if (block.renderedHtml) {
    return `<div class="md-body">${block.renderedHtml}</div>`
  }
  const raw = block.text || ''
  const cleaned = parentKind === 'user' ? cleanUserText(raw) : raw
  if (!cleaned) return ''
  return `<div class="md-body">${renderMarkdown(cleaned)}</div>`
}

export function renderImageBlock(block) {
  const src = 'data:' + (block.media_type || 'image/png') + ';base64,' + (block.data || '')
  return `<div class="image-block"><img src="${src}" /></div>`
}

export function renderThinkingItem(item) {
  return (
    '<div class="tool-item think-item"><div class="tool-item-head">' +
    '<span class="name think-name">thinking</span>' +
    '<span class="body think-body">' + escapeHtml(item.thinking || '') + '</span>' +
    '</div></div>'
  )
}

export function renderToolItem(item) {
  const f = formatToolUse(item)
  let body = f.summary || ''
  if (body.startsWith(item.name)) body = body.slice(item.name.length).trim()

  let html =
    '<div class="tool-item"><div class="tool-item-head">' +
    '<span class="name">' + escapeHtml(item.name) + '</span>' +
    '<span class="body">' + (body ? escapeHtml(body) : '<span class="dim">\u2014</span>') + '</span>' +
    '</div>'

  if (f.detail) {
    html += '<pre class="tool-item-detail">' + escapeHtml(f.detail) + '</pre>'
  }
  if (f.bodyJson) {
    html += '<pre class="tool-item-detail">' + escapeHtml(JSON.stringify(f.bodyJson, null, 2)) + '</pre>'
  }
  // Server-prepared blocks may carry inputJsonHtml (shiki-highlighted JSON)
  if (item.inputJsonHtml) {
    html += '<div class="tool-item-detail">' + item.inputJsonHtml + '</div>'
  }

  if (item.result) {
    html += renderToolResult(item.result.content, item.result.isError)
  }
  html += '</div>'
  return html
}

export function renderToolResult(content, isError) {
  const text =
    typeof content === 'string' ? content : JSON.stringify(content, null, 2)
  const lines = text.split('\n')
  const label = (isError ? 'tool error' : 'tool result') +
    ' \u00b7 ' + lines.length + ' line' + (lines.length !== 1 ? 's' : '')
  return (
    '<details class="tool-result' + (isError ? ' error' : '') + '">' +
    '<summary>' + escapeHtml(label) + '</summary>' +
    '<pre>' + escapeHtml(text) + '</pre>' +
    '</details>'
  )
}

function summarizeItems(items) {
  const labels = items.map((i) => (i.type === 'thinking' ? 'thinking' : i.name))
  const unique = []
  for (const l of labels) if (!unique.includes(l)) unique.push(l)
  if (items.length === unique.length) return unique.join(', ')
  return unique.join(', ') + ' \u00b7 ' + items.length + ' ops'
}

export function renderToolGroup(items) {
  let inner = ''
  for (const item of items) {
    if (item.type === 'thinking') inner += renderThinkingItem(item)
    else inner += renderToolItem(item)
  }
  return (
    '<details class="tool-group"><summary>' +
    escapeHtml(summarizeItems(items)) +
    '</summary><div class="tool-group-body">' +
    inner +
    '</div></details>'
  )
}

// ─── Message body renderers ─────────────────────────────────

export function groupBlocks(blocks) {
  const out = []
  let buf = []
  const flush = () => {
    if (buf.length) {
      out.push({ __kind: 'op_group', items: buf })
      buf = []
    }
  }
  for (const b of blocks || []) {
    if (b.type === 'text' || b.type === 'image') {
      flush()
      out.push(b)
    } else {
      buf.push(b)
    }
  }
  flush()
  return out
}

export function renderUserBody(blocks, slashCommand) {
  let html = ''
  if (slashCommand) {
    const cmd = slashCommand.replace(/^\//, '')
    html += '<p><code class="slash-command">/' + escapeHtml(cmd) + '</code></p>'
  }
  for (const b of blocks || []) {
    if (b.type === 'text') {
      html += renderTextBlock(b, 'user')
    } else if (b.type === 'image') {
      html += renderImageBlock(b)
    }
  }
  return html
}

export function renderAssistantBody(blocks) {
  const groups = groupBlocks(blocks)
  let html = ''
  for (const g of groups) {
    if (g.__kind === 'op_group') {
      html += renderToolGroup(g.items)
    } else if (g.type === 'text') {
      html += renderTextBlock(g, 'assistant')
    } else if (g.type === 'image') {
      html += renderImageBlock(g)
    }
  }
  return html
}

// ─── Full message wrappers ──────────────────────────────────

function formatShortTime(iso) {
  if (!iso) return ''
  try {
    return new Date(iso).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
  } catch {
    return ''
  }
}

function formatTokens(n) {
  if (!n) return '0'
  if (n < 1000) return String(n)
  if (n < 1_000_000) return (n / 1000).toFixed(1) + 'k'
  return (n / 1_000_000).toFixed(1) + 'M'
}

// Wrapper class names match the React app's structure (MessageRow +
// UserMessage / AssistantMessage) so the SAME CSS rules in styles.css /
// template.html apply across all surfaces (app, preview, download).
export function renderUserMessage(node, continued) {
  const rowCls = 'message-row kind-user' + (continued ? ' continuation' : '')
  let html = '<div class="' + rowCls + '">'
  html += '<div class="message-content user">'
  if (!continued) {
    html +=
      '<div class="message-header">' +
      (node.timestamp
        ? '<span class="ts">' + escapeHtml(formatShortTime(node.timestamp)) + '</span>'
        : '') +
      '<span class="role user">You</span>' +
      '</div>'
  }
  html +=
    '<div class="user-bubble"><div class="message-body">' +
    renderUserBody(node.blocks, node.slashCommand) +
    '</div></div>'
  html += '</div></div>'
  return html
}

export function renderAssistantMessage(node, continued) {
  const rowCls = 'message-row kind-assistant' + (continued ? ' continuation' : '')
  let html = '<div class="' + rowCls + '">'
  html += '<div class="message-content assistant">'
  if (!continued) {
    html +=
      '<div class="message-header">' +
      '<span class="role assistant">Claude</span>' +
      (node.model ? '<span class="model-tag">' + escapeHtml(node.model) + '</span>' : '') +
      (node.usage
        ? '<span class="token-tag">' +
          formatTokens(node.usage.input_tokens) + ' in \u00b7 ' +
          formatTokens(node.usage.output_tokens) + ' out</span>'
        : '') +
      (node.timestamp
        ? '<span class="ts">' + escapeHtml(formatShortTime(node.timestamp)) + '</span>'
        : '') +
      '</div>'
  }
  html +=
    '<div class="message-body">' +
    renderAssistantBody(node.blocks) +
    '</div>'
  html += '</div></div>'
  return html
}

export function renderToolResultMessage(node) {
  return '<div class="message-row kind-tool_result"><div class="message-content tool">' +
    renderToolResult(node.content, node.isError) +
    '</div></div>'
}

// ─── Document assembly ──────────────────────────────────────

export function mergeAssistantTurns(nodes) {
  const out = []
  let prevSpeaker = null
  let lastAssistantIdx = -1
  for (const n of nodes) {
    const isAssistant = n.kind === 'assistant'
    const continuesPrev =
      isAssistant && prevSpeaker === 'assistant' && lastAssistantIdx >= 0
    if (continuesPrev) {
      const prev = out[lastAssistantIdx]
      prev.blocks = (prev.blocks || []).concat(n.blocks || [])
    } else if (isAssistant) {
      out.push({ ...n, blocks: (n.blocks || []).slice() })
      lastAssistantIdx = out.length - 1
    } else if (n.kind === 'system' || n.kind === 'tool_result') {
      // invisible events — don't break the assistant merge chain
    } else {
      out.push(n)
      lastAssistantIdx = -1
    }
    if (n.kind === 'user' || n.kind === 'assistant') {
      prevSpeaker = n.kind
    } else if (n.kind !== 'tool_result' && n.kind !== 'system') {
      prevSpeaker = null
    }
  }
  return out
}

export function computeContinuations(nodes) {
  let prev = null
  return nodes.map(function (n) {
    let continued = false
    if (n.kind === 'user' || n.kind === 'assistant') {
      continued = prev === n.kind
      prev = n.kind
    } else if (n.kind !== 'tool_result') {
      prev = null
    }
    return { node: n, continued }
  })
}

export function renderNodes(nodes) {
  const merged = mergeAssistantTurns(nodes)
  const annotated = computeContinuations(merged)
  let html = ''
  for (const { node, continued } of annotated) {
    if (node.kind === 'user') {
      html += renderUserMessage(node, continued)
    } else if (node.kind === 'assistant') {
      html += renderAssistantMessage(node, continued)
    } else if (node.kind === 'tool_result') {
      html += renderToolResultMessage(node)
    } else if (node.kind === 'summary') {
      html += '<div class="summary-node">' + escapeHtml(node.text || '') + '</div>'
    }
  }
  return html
}

// Renders one memo section: h2 title + note + conversation messages.
export function renderMemoSectionHtml(memo, index) {
  const num = String(index + 1).padStart(2, '0')
  const title = (memo.title || '').trim() || 'untitled'

  let html = '<div class="memo">'
  html += '<h2><span class="index">\u2116 ' + num + '</span>' + escapeHtml(title) + '</h2>'

  if (memo.noteHtml) {
    html += '<div class="note">' + memo.noteHtml + '</div>'
  }

  if (memo.nodes && memo.nodes.length) {
    html += renderNodes(memo.nodes)
  }

  html += '</div>'
  return html
}

function formatDateLong(iso) {
  if (!iso) return ''
  try {
    return new Date(iso).toLocaleString([], {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    })
  } catch {
    return iso
  }
}

// Renders the full document body (header + memos + footer) for static
// download HTML. The server calls this instead of embedding JSON +
// viewer.js, producing a self-contained HTML file with no JavaScript.
export function renderDocBody(payload) {
  const meta = payload.sessionMeta || {}
  const title = meta.summary || 'Claude Code Memos'
  const intro = meta.intro || ''

  let html = ''

  // Header
  html += '<h1>' + escapeHtml(title) + '</h1>'
  if (intro) {
    html += '<div class="lede">' + renderMarkdown(intro) + '</div>'
  } else {
    html += '<p class="lede">A curated excerpt from a Claude Code session.</p>'
  }

  // Meta dl
  const dateIso = meta.startedAt || payload.generatedAt
  const metaItems = []
  if (dateIso) metaItems.push(['date', formatDateLong(dateIso)])
  if (meta.gitBranch && meta.gitBranch !== 'HEAD') metaItems.push(['branch', meta.gitBranch])
  if (meta.model) metaItems.push(['model', meta.model])
  html += '<dl class="meta">'
  for (const [k, v] of metaItems) {
    html += '<span class="m-item"><dt>' + escapeHtml(k) + '</dt>' + escapeHtml(v) + '</span>'
  }
  html += '</dl>'

  // Memos
  if (!payload.memos || payload.memos.length === 0) {
    html += '<p class="lede">(No memos in this session yet.)</p>'
  } else {
    for (let i = 0; i < payload.memos.length; i++) {
      html += renderMemoSectionHtml(payload.memos[i], i)
    }
  }

  // Footer
  html +=
    '<footer>Downloaded ' + escapeHtml(formatDateLong(payload.generatedAt || '')) +
    '</footer>'

  // Tiny inline script that adds "더 보기 / 접기" collapsible behaviour to
  // long user bubbles, mirroring the React app's <Collapsible maxHeight={260}>.
  // Runs once after the browser lays out the pre-rendered content.
  html += `
<script>
(function(){
  var MAX=260,TOL=24;
  document.querySelectorAll('.user-bubble .message-body').forEach(function(el){
    if(el.scrollHeight<=MAX+TOL)return;
    var wrap=document.createElement('div');wrap.className='collapsible is-collapsed';
    var inner=document.createElement('div');inner.className='collapsible-inner';inner.style.maxHeight=MAX+'px';
    el.parentNode.insertBefore(wrap,el);wrap.appendChild(inner);inner.appendChild(el);
    var btn=document.createElement('button');btn.className='collapsible-toggle';btn.type='button';btn.textContent='\\uB354 \\uBCF4\\uAE30';
    btn.onclick=function(){var c=wrap.classList.toggle('is-collapsed');inner.style.maxHeight=c?MAX+'px':'';btn.textContent=c?'\\uB354 \\uBCF4\\uAE30':'\\uC811\\uAE30';};
    wrap.appendChild(btn);
  });
})();
<\/script>`

  return html
}
