// Vanilla JS renderer for exported memo HTML.
// Consumes window.__MEMOS__ and renders into #app.
(function () {
  const data = window.__MEMOS__
  if (!data) return
  const app = document.getElementById('app')
  if (!app) return

  const CAN_EDIT = !!data.editable
  let editMode = false
  const SESSION_ID = (data.sessionMeta && data.sessionMeta.sessionId) || ''

  function renderNoteMd(note) {
    if (!note) return ''
    let html = String(note)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#39;')
    html = html.replace(/```([\s\S]*?)```/g, function (_, code) {
      return '<pre><code>' + code + '</code></pre>'
    })
    html = html.replace(/`([^`]+)`/g, '<code>$1</code>')
    html = html.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
    return html.split(/\n{2,}/).map(function (p) {
      return p.indexOf('<pre>') === 0 ? p : '<p>' + p.replace(/\n/g, '<br/>') + '</p>'
    }).join('')
  }

  // Shared channel so the main app (opened in another tab) can refresh when
  // we save here. Falls back silently on browsers without BroadcastChannel.
  let broadcastCh = null
  try {
    if (typeof BroadcastChannel !== 'undefined') {
      broadcastCh = new BroadcastChannel('memo-updates')
    }
  } catch (e) {}
  function notifyUpdate() {
    if (!broadcastCh || !SESSION_ID) return
    try {
      broadcastCh.postMessage({ sessionId: SESSION_ID, at: Date.now() })
    } catch (e) {}
  }

  let toastTimer = null
  function showToast(msg, isError) {
    let t = document.getElementById('viewer-toast')
    if (!t) {
      t = document.createElement('div')
      t.id = 'viewer-toast'
      document.body.appendChild(t)
    }
    t.textContent = msg
    t.className = 'viewer-toast' + (isError ? ' error' : '') + ' show'
    clearTimeout(toastTimer)
    toastTimer = setTimeout(function () { t.className = 'viewer-toast' }, 1800)
  }

  function saveMemo(memoId, patch) {
    if (!SESSION_ID || !memoId) return Promise.resolve()
    return fetch('/api/sessions/' + encodeURIComponent(SESSION_ID) + '/memos/' + encodeURIComponent(memoId), {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(patch),
    }).then(function (res) {
      if (!res.ok) throw new Error('HTTP ' + res.status)
      showToast('Saved')
      notifyUpdate()
    }).catch(function (err) {
      showToast('Save failed: ' + err.message, true)
    })
  }

  function saveBoard(patch) {
    if (!SESSION_ID) return Promise.resolve()
    return fetch('/api/sessions/' + encodeURIComponent(SESSION_ID) + '/memos', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(patch),
    }).then(function (res) {
      if (!res.ok) throw new Error('HTTP ' + res.status)
      showToast('Saved')
      notifyUpdate()
    }).catch(function (err) {
      showToast('Save failed: ' + err.message, true)
    })
  }

  function deleteMemoCall(memoId) {
    if (!SESSION_ID || !memoId) return Promise.resolve()
    return fetch('/api/sessions/' + encodeURIComponent(SESSION_ID) + '/memos/' + encodeURIComponent(memoId), {
      method: 'DELETE',
    }).then(function (res) {
      if (!res.ok) throw new Error('HTTP ' + res.status)
      showToast('Removed')
      notifyUpdate()
    }).catch(function (err) {
      showToast('Remove failed: ' + err.message, true)
    })
  }

  // Persist new ordering with one atomic PATCH. Per-memo PATCHes raced
  // each other (concurrent read-modify-write) and dropped 404s on the
  // losing requests; the bulk endpoint serializes the write server-side.
  function persistOrder() {
    if (!SESSION_ID || !data.memos) return
    data.memos.forEach(function (m, i) { m.order = i })
    const orderedIds = data.memos.map(function (m) { return m.id })
    fetch('/api/sessions/' + encodeURIComponent(SESSION_ID) + '/memos/order', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ orderedIds: orderedIds }),
    }).then(function (res) {
      if (!res.ok) throw new Error('HTTP ' + res.status)
      showToast('Reordered')
      notifyUpdate()
    }).catch(function (err) {
      showToast('Reorder failed: ' + err.message, true)
    })
  }

  function moveMemoTo(fromIdx, toIdx) {
    if (fromIdx === toIdx) return
    const arr = data.memos.slice()
    const moved = arr.splice(fromIdx, 1)[0]
    arr.splice(toIdx, 0, moved)
    data.memos = arr
    persistOrder()
    renderMemos()
  }

  function moveMemoBy(memoId, delta) {
    const i = data.memos.findIndex(function (m) { return m.id === memoId })
    if (i < 0) return
    const j = i + delta
    if (j < 0 || j >= data.memos.length) return
    moveMemoTo(i, j)
  }

  // Drag state lives outside renderMemo so handlers across siblings share it.
  let draggingMemoId = null

  function esc(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;')
  }

  function el(tag, attrs, children) {
    const node = document.createElement(tag)
    if (attrs) {
      for (const k in attrs) {
        if (k === 'class') node.className = attrs[k]
        else if (k === 'html') node.innerHTML = attrs[k]
        else node.setAttribute(k, attrs[k])
      }
    }
    if (children) {
      for (const c of children) {
        if (c == null) continue
        node.appendChild(typeof c === 'string' ? document.createTextNode(c) : c)
      }
    }
    return node
  }

  function formatDate(iso) {
    if (!iso) return ''
    try {
      return new Date(iso).toLocaleString([], {
        year: 'numeric', month: 'short', day: 'numeric',
        hour: '2-digit', minute: '2-digit',
      })
    } catch { return iso }
  }

  function formatTime(iso) {
    if (!iso) return ''
    try {
      return new Date(iso).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
    } catch { return '' }
  }

  let headerContainer = null
  function paintHeader() {
    const meta = data.sessionMeta || {}
    if (!headerContainer) return
    headerContainer.innerHTML = ''
    const h1 = el('h1', { class: 'doc-title' })
    h1.textContent = meta.summary || 'Claude Code Memos'
    if (editMode) {
      h1.classList.add('editable')
      h1.setAttribute('contenteditable', 'plaintext-only')
      h1.setAttribute('spellcheck', 'false')
      h1.addEventListener('keydown', function (e) {
        if (e.key === 'Enter') { e.preventDefault(); h1.blur() }
      })
      h1.addEventListener('blur', function () {
        const v = h1.textContent.trim()
        if (v !== (meta.summary || '')) {
          meta.summary = v
          saveBoard({ title: v })
        }
      })
    }
    headerContainer.appendChild(h1)
    // Cross-session exports (from /editor) provide their own intro; fall
    // back to the single-session default otherwise.
    const ledeWrap = el('p', { class: 'lede' })
    if (meta.intro) {
      ledeWrap.innerHTML = renderNoteMd(meta.intro)
    } else {
      ledeWrap.textContent = 'A curated excerpt from a Claude Code session.'
    }
    headerContainer.appendChild(ledeWrap)

    const dl = el('dl', { class: 'meta' })
    const items = []
    // date: session's startedAt when available, else the export generation
    // time (cross-session docs have no single startedAt).
    const dateIso = meta.startedAt || data.generatedAt
    if (dateIso) items.push(['date', formatDate(dateIso)])
    if (meta.gitBranch && meta.gitBranch !== 'HEAD') items.push(['branch', meta.gitBranch])
    if (meta.model) items.push(['model', meta.model])
    items.forEach(function (kv) {
      const item = el('span', { class: 'm-item' })
      item.innerHTML = '<dt>' + esc(kv[0]) + '</dt>' + esc(kv[1])
      dl.appendChild(item)
    })
    headerContainer.appendChild(dl)
  }

  function renderBlock(b) {
    if (b.type === 'text') {
      // Text blocks are pre-rendered to HTML on the server (via `marked`)
      // so we can just drop the result into the DOM — full GFM markdown
      // support (headings, lists, blockquotes, tables, code, etc.).
      return el('div', { class: 'md-body', html: b.renderedHtml || esc(b.text || '') })
    }
    if (b.type === 'image') {
      const div = el('div', { class: 'image-block' })
      const img = el('img', { src: 'data:' + (b.media_type || 'image/png') + ';base64,' + b.data })
      div.appendChild(img)
      return div
    }
    return null
  }

  function summarizeOpItems(items) {
    const labels = items.map(function (i) {
      return i.type === 'thinking' ? 'thinking' : i.name
    })
    const unique = []
    labels.forEach(function (l) {
      if (unique.indexOf(l) < 0) unique.push(l)
    })
    if (items.length === unique.length) return unique.join(', ')
    return unique.join(', ') + ' · ' + items.length + ' ops'
  }

  function renderOpGroup(items) {
    const d = el('details', { class: 'tool-group' })
    const summary = el('summary')
    summary.textContent = summarizeOpItems(items)
    d.appendChild(summary)
    const body = el('div', { class: 'tool-group-body' })
    items.forEach(function (item) {
      body.appendChild(renderOpItem(item))
    })
    d.appendChild(body)
    return d
  }

  function renderOpItem(item) {
    if (item.type === 'thinking') {
      const row = el('div', { class: 'tool-item think-item' })
      const head = el('div', { class: 'tool-item-head' })
      head.innerHTML =
        '<span class="name think-name">thinking</span>' +
        '<span class="body think-body">' + esc(item.thinking || '') + '</span>'
      row.appendChild(head)
      return row
    }
    // tool_use — exportHtml.js pre-computed toolBody / toolDetail via the
    // shared formatToolUse helper so this matches the web UI exactly.
    const row = el('div', { class: 'tool-item' })
    const head = el('div', { class: 'tool-item-head' })
    const bodyText = item.toolBody || ''
    head.innerHTML =
      '<span class="name">' + esc(item.name) + '</span>' +
      '<span class="body">' + (bodyText ? esc(bodyText) : '<span class="dim">—</span>') + '</span>'
    row.appendChild(head)
    if (item.toolDetail) {
      const detail = el('pre', { class: 'tool-item-detail' })
      detail.textContent = item.toolDetail
      row.appendChild(detail)
    }
    if (item.inputJsonHtml) {
      // Only unknown tools fall back to a raw JSON dump.
      const wrap = el('div', { class: 'tool-item-detail', html: item.inputJsonHtml })
      row.appendChild(wrap)
    }
    if (item.result) {
      const tr = el('details', { class: 'tool-result' + (item.result.isError ? ' error' : '') })
      const trSummary = el('summary')
      const content =
        typeof item.result.content === 'string'
          ? item.result.content
          : JSON.stringify(item.result.content, null, 2)
      const lineCount = content.split('\n').length
      trSummary.textContent =
        (item.result.isError ? 'tool error' : 'tool result') +
        ' · ' + lineCount + ' line' + (lineCount !== 1 ? 's' : '')
      tr.appendChild(trSummary)
      const pre = el('pre')
      pre.textContent = content
      tr.appendChild(pre)
      row.appendChild(tr)
    }
    return row
  }

  function groupAssistantBlocks(blocks) {
    const out = []
    let buf = []
    function flush() {
      if (buf.length) {
        out.push({ __kind: 'op_group', items: buf })
        buf = []
      }
    }
    ;(blocks || []).forEach(function (b) {
      if (b.type === 'text' || b.type === 'image') {
        flush()
        out.push(b)
      } else {
        // thinking, tool_use
        buf.push(b)
      }
    })
    flush()
    return out
  }

  function makeCollapsible(innerNode, maxHeight) {
    const wrap = el('div', { class: 'collapsible' })
    const inner = el('div', { class: 'collapsible-inner' })
    inner.appendChild(innerNode)
    wrap.appendChild(inner)

    // The toggle button is added at most once. We keep re-measuring (on
    // raf + window load) because images/web fonts can change scrollHeight
    // after initial layout — but if the button is already there, we just
    // leave it alone.
    let btn = null
    function check() {
      if (btn) return
      if (inner.scrollHeight > maxHeight + 24) {
        wrap.classList.add('is-collapsed')
        inner.style.maxHeight = maxHeight + 'px'
        btn = el('button', { class: 'collapsible-toggle', type: 'button' })
        btn.textContent = '더 보기'
        btn.onclick = function (e) {
          e.stopPropagation()
          const collapsed = wrap.classList.toggle('is-collapsed')
          inner.style.maxHeight = collapsed ? maxHeight + 'px' : ''
          btn.textContent = collapsed ? '더 보기' : '접기'
        }
        wrap.appendChild(btn)
      }
    }
    requestAnimationFrame(check)
    if (document.readyState !== 'complete') {
      window.addEventListener('load', check, { once: true })
    }
    return wrap
  }

  function renderNode(node, continued) {
    if (node.kind === 'user') {
      const body = el('div', { class: 'msg-body' })
      ;(node.blocks || []).forEach(function (b) {
        const e = renderBlock(b)
        if (e) body.appendChild(e)
      })
      const bubble = el('div', { class: 'user-bubble' })
      bubble.appendChild(makeCollapsible(body, 260))
      const msg = el('div', { class: 'msg user' + (continued ? ' continuation' : '') })
      if (!continued) {
        const head = el('div', { class: 'msg-head' })
        head.innerHTML =
          (node.slashCommand ? '<span class="slash-badge">/' + esc(node.slashCommand.replace(/^\//, '')) + '</span>' : '') +
          (node.timestamp ? '<span class="ts">' + esc(formatTime(node.timestamp)) + '</span>' : '') +
          '<span class="role user">You</span>'
        msg.appendChild(head)
      }
      msg.appendChild(bubble)
      return msg
    }
    if (node.kind === 'assistant') {
      const body = el('div', { class: 'msg-body' })
      const groups = groupAssistantBlocks(node.blocks || [])
      groups.forEach(function (g) {
        if (g.__kind === 'op_group') {
          body.appendChild(renderOpGroup(g.items))
          return
        }
        const e = renderBlock(g)
        if (e) body.appendChild(e)
      })
      const msg = el('div', { class: 'msg assistant' + (continued ? ' continuation' : '') })
      if (!continued) {
        const head = el('div', { class: 'msg-head' })
        head.innerHTML =
          '<span class="role assistant">Claude</span>' +
          (node.model ? '<span class="model-tag">' + esc(node.model) + '</span>' : '') +
          (node.timestamp ? '<span class="ts">' + esc(formatTime(node.timestamp)) + '</span>' : '')
        msg.appendChild(head)
      }
      msg.appendChild(body)
      return msg
    }
    if (node.kind === 'tool_result') {
      const d = el('details', { class: 'tool-result' + (node.isError ? ' error' : '') })
      const summary = el('summary')
      const text = typeof node.content === 'string' ? node.content : JSON.stringify(node.content, null, 2)
      const lineCount = text.split('\n').length
      summary.textContent = (node.isError ? 'tool error' : 'tool result') + ' · ' + lineCount + ' line' + (lineCount !== 1 ? 's' : '')
      d.appendChild(summary)
      const pre = el('pre')
      pre.textContent = text
      d.appendChild(pre)
      const msg = el('div', { class: 'msg tool' })
      msg.appendChild(d)
      return msg
    }
    return null
  }

  function computeContinuations(nodes) {
    let prev = null
    return nodes.map(function (n) {
      let continued = false
      if (n.kind === 'user' || n.kind === 'assistant') {
        continued = prev === n.kind
        prev = n.kind
      } else if (n.kind !== 'tool_result') {
        prev = null
      }
      return { node: n, continued: continued }
    })
  }

  // Merge consecutive continuation assistant nodes into a single turn so
  // their thinking/tool_use blocks collapse into one shared group.
  // Invisible events (system, tool_result) between two mergeable assistants
  // don't break the chain — we track the last-assistant index in the output.
  function mergeAssistantTurns(nodes) {
    const out = []
    let prevSpeaker = null
    let lastAssistantIdx = -1
    nodes.forEach(function (n) {
      const isAssistant = n.kind === 'assistant'
      const continuesPrev = isAssistant && prevSpeaker === 'assistant' && lastAssistantIdx >= 0
      if (continuesPrev) {
        const prev = out[lastAssistantIdx]
        prev.blocks = (prev.blocks || []).concat(n.blocks || [])
      } else if (isAssistant) {
        out.push(Object.assign({}, n, { blocks: (n.blocks || []).slice() }))
        lastAssistantIdx = out.length - 1
      } else if (n.kind === 'system' || n.kind === 'tool_result') {
        // invisible events — push but don't break merge chain
        out.push(n)
      } else {
        // user, summary, sidechain_group — real break
        out.push(n)
        lastAssistantIdx = -1
      }
      if (n.kind === 'user' || n.kind === 'assistant') {
        prevSpeaker = n.kind
      } else if (n.kind !== 'tool_result' && n.kind !== 'system') {
        prevSpeaker = null
      }
    })
    return out
  }

  function makeEditableTitle(memo, num) {
    const h = el('h2')
    const indexSpan = el('span', { class: 'index' }, ['\u2116 ' + num])
    const titleSpan = el('span', { class: 'memo-title-text' })
    titleSpan.textContent = memo.title || 'untitled'
    if (editMode) {
      titleSpan.setAttribute('contenteditable', 'plaintext-only')
      titleSpan.setAttribute('spellcheck', 'false')
      titleSpan.classList.add('editable')
      titleSpan.addEventListener('keydown', function (e) {
        if (e.key === 'Enter') { e.preventDefault(); titleSpan.blur() }
      })
      titleSpan.addEventListener('blur', function () {
        const v = titleSpan.textContent.trim()
        if (v !== (memo.title || '')) {
          memo.title = v
          saveMemo(memo.id, { title: v })
        }
      })
    }
    h.appendChild(indexSpan)
    h.appendChild(titleSpan)
    return h
  }

  function makeNote(memo) {
    if (!editMode) {
      if (!memo.noteHtml) return null
      return el('div', { class: 'note', html: memo.noteHtml })
    }
    const wrap = el('div', { class: 'note-wrap' })
    const display = el('div', { class: 'note editable' })
    function paintDisplay() {
      if (memo.note) {
        display.innerHTML = renderNoteMd(memo.note)
        display.classList.remove('is-placeholder')
      } else {
        display.innerHTML = '<em>Click to add a note…</em>'
        display.classList.add('is-placeholder')
      }
    }
    paintDisplay()
    display.addEventListener('click', function () {
      const ta = el('textarea', { class: 'note-edit' })
      ta.value = memo.note || ''
      ta.rows = Math.max(3, (memo.note || '').split('\n').length + 1)
      wrap.replaceChild(ta, display)
      ta.focus()
      const end = ta.value.length
      try { ta.setSelectionRange(end, end) } catch (e) {}
      function commit() {
        const v = ta.value
        if (v !== (memo.note || '')) {
          memo.note = v
          saveMemo(memo.id, { note: v })
        }
        paintDisplay()
        if (ta.parentNode === wrap) wrap.replaceChild(display, ta)
      }
      ta.addEventListener('blur', commit, { once: true })
      ta.addEventListener('keydown', function (e) {
        if (e.key === 'Escape') { e.preventDefault(); ta.blur() }
      })
    })
    wrap.appendChild(display)
    return wrap
  }

  function renderMemo(memo, i) {
    const root = el('div', { class: 'memo' })
    const num = String(i + 1).padStart(2, '0')

    if (editMode) {
      root.appendChild(buildMemoToolbar(memo, i))
      // Whole-card drop target so users don't have to aim at the small handle.
      root.addEventListener('dragover', function (e) {
        if (!draggingMemoId || draggingMemoId === memo.id) return
        e.preventDefault()
        e.dataTransfer.dropEffect = 'move'
        root.classList.add('drag-over')
      })
      root.addEventListener('dragleave', function (e) {
        // Only clear when the cursor truly leaves the card (not on transit
        // between child elements).
        if (e.currentTarget.contains(e.relatedTarget)) return
        root.classList.remove('drag-over')
      })
      root.addEventListener('drop', function (e) {
        e.preventDefault()
        root.classList.remove('drag-over')
        const draggedId = draggingMemoId
        draggingMemoId = null
        if (!draggedId || draggedId === memo.id) return
        const fromIdx = data.memos.findIndex(function (m) { return m.id === draggedId })
        const toIdx = data.memos.findIndex(function (m) { return m.id === memo.id })
        if (fromIdx >= 0 && toIdx >= 0) moveMemoTo(fromIdx, toIdx)
      })
    }

    root.appendChild(makeEditableTitle(memo, num))
    const note = makeNote(memo)
    if (note) root.appendChild(note)
    const merged = mergeAssistantTurns(memo.nodes || [])
    const annotated = computeContinuations(merged)
    annotated.forEach(function (item) {
      const r = renderNode(item.node, item.continued)
      if (r) root.appendChild(r)
    })
    return root
  }

  // Always-visible reorder/delete cluster — same UX as the in-app /editor
  // page so the two surfaces feel identical.
  function buildMemoToolbar(memo, i) {
    const total = data.memos.length
    const toolbar = el('div', { class: 'memo-toolbar' })

    const handle = el('span', {
      class: 'memo-handle',
      draggable: 'true',
      'aria-label': 'Drag to reorder',
      title: '\ub04c\uc5b4\uc11c \uc21c\uc11c \uc774\ub3d9',
    }, ['\u22ee\u22ee'])
    handle.addEventListener('dragstart', function (e) {
      draggingMemoId = memo.id
      e.dataTransfer.effectAllowed = 'move'
      // Some browsers refuse to start a drag without setData.
      try { e.dataTransfer.setData('text/plain', memo.id) } catch (_) {}
    })
    handle.addEventListener('dragend', function () {
      draggingMemoId = null
      const stale = document.querySelectorAll('.memo.drag-over')
      Array.prototype.forEach.call(stale, function (n) { n.classList.remove('drag-over') })
    })

    const moveUp = el('button', {
      type: 'button',
      class: 'memo-move',
      'aria-label': 'Move up',
      title: '\uc704\ub85c \uc774\ub3d9',
    }, ['\u2191'])
    if (i === 0) moveUp.disabled = true
    moveUp.addEventListener('click', function () { moveMemoBy(memo.id, -1) })

    const moveDown = el('button', {
      type: 'button',
      class: 'memo-move',
      'aria-label': 'Move down',
      title: '\uc544\ub798\ub85c \uc774\ub3d9',
    }, ['\u2193'])
    if (i === total - 1) moveDown.disabled = true
    moveDown.addEventListener('click', function () { moveMemoBy(memo.id, +1) })

    const removeBtn = el('button', {
      type: 'button',
      class: 'memo-remove',
      'aria-label': 'Remove',
      title: '\uc81c\uac70',
    }, ['\u2715'])
    removeBtn.addEventListener('click', function () {
      if (!confirm('\uc774 \uba54\ubaa8\ub97c \uc0ad\uc81c\ud558\uc2dc\uaca0\uc2b5\ub2c8\uae4c?')) return
      const idx = data.memos.findIndex(function (m) { return m.id === memo.id })
      if (idx < 0) return
      data.memos.splice(idx, 1)
      deleteMemoCall(memo.id)
      renderMemos()
    })

    toolbar.appendChild(handle)
    toolbar.appendChild(moveUp)
    toolbar.appendChild(moveDown)
    toolbar.appendChild(removeBtn)
    return toolbar
  }

  let banner = null
  let bannerLabel = null
  let editBtn = null
  let previewBtn = null
  function paintBanner() {
    if (!banner || !bannerLabel || !editBtn || !previewBtn) return
    if (editMode) {
      banner.className = 'edit-banner'
      bannerLabel.innerHTML =
        '<span class="edit-banner-dot">●</span>' +
        '<strong>Edit mode</strong> — click any <em>memo title</em> or <em>note</em> to edit. ' +
        'Changes save automatically. Conversation messages are read-only.'
      editBtn.className = 'mode-switch-btn active'
      previewBtn.className = 'mode-switch-btn'
    } else {
      banner.className = 'edit-banner preview'
      bannerLabel.innerHTML =
        '<span class="edit-banner-dot preview">●</span>' +
        '<strong>Preview mode</strong> — read-only view of how the exported HTML will look.'
      editBtn.className = 'mode-switch-btn'
      previewBtn.className = 'mode-switch-btn active'
    }
  }

  let memosContainer = null
  function renderMemos() {
    if (!memosContainer) return
    memosContainer.innerHTML = ''
    if (!data.memos || data.memos.length === 0) {
      memosContainer.appendChild(el('p', { class: 'lede' }, ['(No memos in this session.)']))
    } else {
      data.memos.forEach(function (c, i) {
        memosContainer.appendChild(renderMemo(c, i))
      })
    }
  }

  if (CAN_EDIT) {
    function setMode(next) {
      if (next === editMode) return
      if (document.activeElement && document.activeElement.blur) {
        document.activeElement.blur()
      }
      editMode = next
      paintBanner()
      paintHeader()
      renderMemos()
    }
    banner = el('div', { class: 'edit-banner' })
    bannerLabel = el('span', { class: 'edit-banner-label' })
    const sw = el('div', { class: 'mode-switch', role: 'tablist' })
    editBtn = el('button', { class: 'mode-switch-btn', type: 'button' }, ['Edit'])
    previewBtn = el('button', { class: 'mode-switch-btn', type: 'button' }, ['Preview'])
    editBtn.addEventListener('click', function () { setMode(true) })
    previewBtn.addEventListener('click', function () { setMode(false) })
    sw.appendChild(editBtn)
    sw.appendChild(previewBtn)
    banner.appendChild(bannerLabel)
    banner.appendChild(sw)
    if (SESSION_ID) {
      const dl = el('a', {
        class: 'download-icon',
        href: '/api/sessions/' + encodeURIComponent(SESSION_ID) + '/memos/export',
        download: '',
        rel: 'noopener',
        title: 'Download HTML',
        'aria-label': 'Download HTML',
      })
      dl.innerHTML =
        '<svg viewBox="0 0 16 16" width="14" height="14" fill="none" ' +
        'stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round">' +
        '<path d="M8 2.5v7.5"/><path d="M4.5 7 8 10.5 11.5 7"/>' +
        '<path d="M3 12.5h10"/></svg>'
      banner.appendChild(dl)
    }
    app.appendChild(banner)
    paintBanner()
  }

  headerContainer = el('div', { class: 'doc-header' })
  app.appendChild(headerContainer)
  paintHeader()

  memosContainer = el('div', { class: 'memos' })
  app.appendChild(memosContainer)
  renderMemos()

  app.appendChild(
    el('footer', null, ['Downloaded ' + formatDate(data.generatedAt) + ' · History Viewer for Claude Code'])
  )
})()
