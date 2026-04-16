// Vanilla JS renderer for exported memo HTML — /preview edit mode.
//
// Message rendering (user/assistant/tool bodies) is delegated to the shared
// renderMessageHtml.js module so changes there propagate to the React app,
// download HTML, AND this preview page without triple-editing.
//
// Edit-mode interactive features (contenteditable, save, drag-reorder,
// toolbar) remain here — they need live DOM, which the pure-string shared
// renderer intentionally avoids.

import {
  escapeHtml,
  renderNodes,
  renderMarkdown,
} from '../src/lib/renderMessageHtml.js'

;(function () {
  const data = window.__MEMOS__
  if (!data) return
  const app = document.getElementById('app')
  if (!app) return

  const CAN_EDIT = !!data.editable
  let editMode = false
  const SESSION_ID = (data.sessionMeta && data.sessionMeta.sessionId) || ''

  // ─── Broadcast / toast / API helpers ────────────────────────

  let broadcastCh = null
  try {
    if (typeof BroadcastChannel !== 'undefined') {
      broadcastCh = new BroadcastChannel('memo-updates')
    }
  } catch (e) {}
  function notifyUpdate() {
    if (!broadcastCh || !SESSION_ID) return
    try { broadcastCh.postMessage({ sessionId: SESSION_ID, at: Date.now() }) } catch (e) {}
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

  function persistOrder() {
    if (!SESSION_ID || !data.memos) return
    data.memos.forEach(function (m, i) { m.order = i })
    var orderedIds = data.memos.map(function (m) { return m.id })
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
    var arr = data.memos.slice()
    var moved = arr.splice(fromIdx, 1)[0]
    arr.splice(toIdx, 0, moved)
    data.memos = arr
    persistOrder()
    renderMemos()
  }

  function moveMemoBy(memoId, delta) {
    var i = data.memos.findIndex(function (m) { return m.id === memoId })
    if (i < 0) return
    var j = i + delta
    if (j < 0 || j >= data.memos.length) return
    moveMemoTo(i, j)
  }

  var draggingMemoId = null

  // ─── DOM helpers ────────────────────────────────────────────

  function el(tag, attrs, children) {
    var node = document.createElement(tag)
    if (attrs) {
      for (var k in attrs) {
        if (k === 'class') node.className = attrs[k]
        else if (k === 'html') node.innerHTML = attrs[k]
        else node.setAttribute(k, attrs[k])
      }
    }
    if (children) {
      for (var ci = 0; ci < children.length; ci++) {
        var c = children[ci]
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
    } catch (_) { return iso }
  }

  // ─── Header ─────────────────────────────────────────────────

  var headerContainer = null
  function paintHeader() {
    var meta = data.sessionMeta || {}
    if (!headerContainer) return
    headerContainer.innerHTML = ''
    var h1 = el('h1', { class: 'doc-title' })
    h1.textContent = meta.summary || 'Claude Code Memos'
    if (editMode) {
      h1.classList.add('editable')
      h1.setAttribute('contenteditable', 'plaintext-only')
      h1.setAttribute('spellcheck', 'false')
      h1.addEventListener('keydown', function (e) {
        if (e.key === 'Enter') { e.preventDefault(); h1.blur() }
      })
      h1.addEventListener('blur', function () {
        var v = h1.textContent.trim()
        if (v !== (meta.summary || '')) {
          meta.summary = v
          saveBoard({ title: v })
        }
      })
    }
    headerContainer.appendChild(h1)

    var ledeWrap = el('p', { class: 'lede' })
    if (meta.intro) {
      ledeWrap.innerHTML = renderMarkdown(meta.intro)
    } else {
      ledeWrap.textContent = 'A curated excerpt from a Claude Code session.'
    }
    headerContainer.appendChild(ledeWrap)

    var dl = el('dl', { class: 'meta' })
    var dateIso = meta.startedAt || data.generatedAt
    var items = []
    if (dateIso) items.push(['date', formatDate(dateIso)])
    if (meta.gitBranch && meta.gitBranch !== 'HEAD') items.push(['branch', meta.gitBranch])
    if (meta.model) items.push(['model', meta.model])
    items.forEach(function (kv) {
      var item = el('span', { class: 'm-item' })
      item.innerHTML = '<dt>' + escapeHtml(kv[0]) + '</dt>' + escapeHtml(kv[1])
      dl.appendChild(item)
    })
    headerContainer.appendChild(dl)
  }

  // ─── Memo edit-mode widgets ─────────────────────────────────

  function makeEditableTitle(memo, num) {
    var h = el('h2')
    var indexSpan = el('span', { class: 'index' }, ['\u2116 ' + num])
    var titleSpan = el('span', { class: 'memo-title-text' })
    titleSpan.textContent = memo.title || 'untitled'
    if (editMode) {
      titleSpan.setAttribute('contenteditable', 'plaintext-only')
      titleSpan.setAttribute('spellcheck', 'false')
      titleSpan.classList.add('editable')
      titleSpan.addEventListener('keydown', function (e) {
        if (e.key === 'Enter') { e.preventDefault(); titleSpan.blur() }
      })
      titleSpan.addEventListener('blur', function () {
        var v = titleSpan.textContent.trim()
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
    var wrap = el('div', { class: 'note-wrap' })
    var display = el('div', { class: 'note editable' })
    function paintDisplay() {
      if (memo.note) {
        // Use the shared markdown renderer for consistency with the React app.
        display.innerHTML = renderMarkdown(memo.note)
        display.classList.remove('is-placeholder')
      } else {
        display.innerHTML = '<em>Click to add a note\u2026</em>'
        display.classList.add('is-placeholder')
      }
    }
    paintDisplay()
    display.addEventListener('click', function () {
      var ta = el('textarea', { class: 'note-edit' })
      ta.value = memo.note || ''
      ta.rows = Math.max(3, (memo.note || '').split('\n').length + 1)
      wrap.replaceChild(ta, display)
      ta.focus()
      var end = ta.value.length
      try { ta.setSelectionRange(end, end) } catch (e) {}
      function commit() {
        var v = ta.value
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

  // ─── Memo section composer ──────────────────────────────────

  function renderMemo(memo, i) {
    var root = el('div', { class: 'memo' })
    var num = String(i + 1).padStart(2, '0')

    if (editMode) {
      root.appendChild(buildMemoToolbar(memo, i))
      root.addEventListener('dragover', function (e) {
        if (!draggingMemoId || draggingMemoId === memo.id) return
        e.preventDefault()
        e.dataTransfer.dropEffect = 'move'
        root.classList.add('drag-over')
      })
      root.addEventListener('dragleave', function (e) {
        if (e.currentTarget.contains(e.relatedTarget)) return
        root.classList.remove('drag-over')
      })
      root.addEventListener('drop', function (e) {
        e.preventDefault()
        root.classList.remove('drag-over')
        var draggedId = draggingMemoId
        draggingMemoId = null
        if (!draggedId || draggedId === memo.id) return
        var fromIdx = data.memos.findIndex(function (m) { return m.id === draggedId })
        var toIdx = data.memos.findIndex(function (m) { return m.id === memo.id })
        if (fromIdx >= 0 && toIdx >= 0) moveMemoTo(fromIdx, toIdx)
      })
    }

    root.appendChild(makeEditableTitle(memo, num))
    var note = makeNote(memo)
    if (note) root.appendChild(note)

    // Conversation messages — rendered by the shared renderNodes() so
    // changes to message rendering automatically apply here too.
    var nodesHtml = renderNodes(memo.nodes || [])
    if (nodesHtml) {
      var msgsDiv = document.createElement('div')
      msgsDiv.innerHTML = nodesHtml
      while (msgsDiv.firstChild) root.appendChild(msgsDiv.firstChild)
    }

    return root
  }

  function buildMemoToolbar(memo, i) {
    var total = data.memos.length
    var toolbar = el('div', { class: 'memo-toolbar' })

    var handle = el('span', {
      class: 'memo-handle',
      draggable: 'true',
      'aria-label': 'Drag to reorder',
      title: '\ub04c\uc5b4\uc11c \uc21c\uc11c \uc774\ub3d9',
    }, ['\u22ee\u22ee'])
    handle.addEventListener('dragstart', function (e) {
      draggingMemoId = memo.id
      e.dataTransfer.effectAllowed = 'move'
      try { e.dataTransfer.setData('text/plain', memo.id) } catch (_) {}
    })
    handle.addEventListener('dragend', function () {
      draggingMemoId = null
      var stale = document.querySelectorAll('.memo.drag-over')
      Array.prototype.forEach.call(stale, function (n) { n.classList.remove('drag-over') })
    })

    var moveUp = el('button', {
      type: 'button', class: 'memo-move',
      'aria-label': 'Move up', title: '\uc704\ub85c \uc774\ub3d9',
    }, ['\u2191'])
    if (i === 0) moveUp.disabled = true
    moveUp.addEventListener('click', function () { moveMemoBy(memo.id, -1) })

    var moveDown = el('button', {
      type: 'button', class: 'memo-move',
      'aria-label': 'Move down', title: '\uc544\ub798\ub85c \uc774\ub3d9',
    }, ['\u2193'])
    if (i === total - 1) moveDown.disabled = true
    moveDown.addEventListener('click', function () { moveMemoBy(memo.id, +1) })

    var removeBtn = el('button', {
      type: 'button', class: 'memo-remove',
      'aria-label': 'Remove', title: '\uc81c\uac70',
    }, ['\u2715'])
    removeBtn.addEventListener('click', function () {
      if (!confirm('\uc774 \uba54\ubaa8\ub97c \uc0ad\uc81c\ud558\uc2dc\uaca0\uc2b5\ub2c8\uae4c?')) return
      var idx = data.memos.findIndex(function (m) { return m.id === memo.id })
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

  // ─── Banner + page assembly ─────────────────────────────────

  var banner = null
  var bannerLabel = null
  var editBtn = null
  var previewBtn = null
  function paintBanner() {
    if (!banner || !bannerLabel || !editBtn || !previewBtn) return
    if (editMode) {
      banner.className = 'edit-banner'
      bannerLabel.innerHTML =
        '<span class="edit-banner-dot">\u25cf</span>' +
        '<strong>Edit mode</strong> \u2014 click any <em>memo title</em> or <em>note</em> to edit. ' +
        'Changes save automatically. Conversation messages are read-only.'
      editBtn.className = 'mode-switch-btn active'
      previewBtn.className = 'mode-switch-btn'
    } else {
      banner.className = 'edit-banner preview'
      bannerLabel.innerHTML =
        '<span class="edit-banner-dot preview">\u25cf</span>' +
        '<strong>Preview mode</strong> \u2014 read-only view of how the exported HTML will look.'
      editBtn.className = 'mode-switch-btn'
      previewBtn.className = 'mode-switch-btn active'
    }
  }

  var memosContainer = null
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
    var setMode = function (next) {
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
    var sw = el('div', { class: 'mode-switch', role: 'tablist' })
    editBtn = el('button', { class: 'mode-switch-btn', type: 'button' }, ['Edit'])
    previewBtn = el('button', { class: 'mode-switch-btn', type: 'button' }, ['Preview'])
    editBtn.addEventListener('click', function () { setMode(true) })
    previewBtn.addEventListener('click', function () { setMode(false) })
    sw.appendChild(editBtn)
    sw.appendChild(previewBtn)
    banner.appendChild(bannerLabel)
    banner.appendChild(sw)
    if (SESSION_ID) {
      var dl = el('a', {
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
    el('footer', null, ['Downloaded ' + formatDate(data.generatedAt) + ' \u00b7 History Viewer for Claude Code'])
  )
})()
