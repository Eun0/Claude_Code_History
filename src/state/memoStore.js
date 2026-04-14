// Lightweight store for per-session memo state.
// Uses useSyncExternalStore so no external dependency is required.
import { useSyncExternalStore } from 'react'
import { api } from '../api.js'

// Module-level state. A single instance covers the currently open session.
let state = {
  sessionId: null,
  boardTitle: '',            // persistent custom title for this session's memos
  memos: [],                 // [{id, title, note, messageUuids, order, createdAt}]
  selectedUuids: new Set(),  // uuids currently being selected for a new memo
  selectMode: false,         // true once user has explicitly entered selection
  lastSelectedUuid: null,    // for shift+click range selection
  showSystem: false,         // toggle hidden system events
  showThinking: true,
  showToolResults: true,
  orderedUuids: [],          // ordered list of rendered message uuids, used for range selection
  loading: false,
  drag: null,                // { anchorUuids, mode: 'add'|'remove', initialSelection: Set } while mouse-drag selecting
}

const listeners = new Set()

function emit() {
  state = { ...state, selectedUuids: new Set(state.selectedUuids) }
  listeners.forEach((l) => l())
}

function subscribe(l) {
  listeners.add(l)
  return () => listeners.delete(l)
}

function getSnapshot() {
  return state
}

function sortMemos(memos) {
  return [...memos].sort((a, b) => (a.order ?? 0) - (b.order ?? 0))
}

export const actions = {
  // Replace store state for a freshly-loaded session in one shot. The caller
  // is responsible for fetching the memos in parallel with the session data
  // and passing them in — that's what avoids the "messages render without
  // their yellow .in-memo class for one frame" flicker that happens if we
  // clear memos synchronously here and refetch them ourselves.
  loadForSession(sessionId, orderedUuids, memos, boardTitle) {
    state = {
      ...state,
      sessionId,
      boardTitle: boardTitle || '',
      memos: sortMemos(memos || []),
      selectedUuids: new Set(),
      selectMode: false,
      lastSelectedUuid: null,
      orderedUuids,
      loading: false,
    }
    emit()
  },

  // Refetch the board from the server and merge into state. Used when an
  // external tab (Preview & Edit) notifies us via BroadcastChannel that
  // something changed.
  async refreshBoard() {
    if (!state.sessionId) return
    try {
      const resp = await api.getMemos(state.sessionId)
      state = {
        ...state,
        boardTitle: resp?.title || '',
        memos: sortMemos(resp?.memos || []),
      }
      emit()
    } catch (err) {
      console.error('refresh board failed', err)
    }
  },

  async setBoardTitle(title) {
    if (!state.sessionId) return
    const t = title || ''
    if (t === state.boardTitle) return
    state = { ...state, boardTitle: t }
    emit()
    try {
      await api.updateBoardTitle(state.sessionId, t)
    } catch (err) {
      console.error('save board title failed', err)
    }
  },

  // Update just the ordered uuid list after a live refresh without
  // disturbing in-progress selection, memos, or drag state.
  updateOrderedUuids(orderedUuids) {
    state = { ...state, orderedUuids }
    emit()
  },

  toggleSelect(uuid) {
    const next = new Set(state.selectedUuids)
    if (next.has(uuid)) next.delete(uuid)
    else next.add(uuid)
    state = {
      ...state,
      selectedUuids: next,
      selectMode: next.size > 0,
      lastSelectedUuid: uuid,
    }
    emit()
  },

  addSelection(uuids) {
    if (!uuids || uuids.length === 0) return
    const next = new Set(state.selectedUuids)
    for (const u of uuids) next.add(u)
    state = {
      ...state,
      selectedUuids: next,
      selectMode: next.size > 0,
      lastSelectedUuid: uuids[uuids.length - 1],
    }
    emit()
  },

  removeSelection(uuids) {
    if (!uuids || uuids.length === 0) return
    const next = new Set(state.selectedUuids)
    for (const u of uuids) next.delete(u)
    state = {
      ...state,
      selectedUuids: next,
      selectMode: next.size > 0,
    }
    emit()
  },

  // --- Drag selection (mousedown on row → drag across rows) ---

  beginDrag(rowUuids) {
    if (!rowUuids || rowUuids.length === 0) return
    const anySelected = rowUuids.some((u) => state.selectedUuids.has(u))
    const mode = anySelected ? 'remove' : 'add'
    const initialSelection = new Set(state.selectedUuids)
    const next = new Set(state.selectedUuids)
    for (const u of rowUuids) {
      if (mode === 'add') next.add(u)
      else next.delete(u)
    }
    state = {
      ...state,
      selectedUuids: next,
      selectMode: next.size > 0,
      lastSelectedUuid: rowUuids[rowUuids.length - 1],
      drag: { anchorUuids: rowUuids.slice(), mode, initialSelection },
    }
    emit()
  },

  dragExtend(rowUuids) {
    if (!state.drag || !rowUuids || rowUuids.length === 0) return
    const order = state.orderedUuids
    const { anchorUuids, mode, initialSelection } = state.drag

    const indexOf = (u) => order.indexOf(u)
    const anchorIdxs = anchorUuids.map(indexOf).filter((i) => i >= 0)
    const currIdxs = rowUuids.map(indexOf).filter((i) => i >= 0)
    if (anchorIdxs.length === 0 || currIdxs.length === 0) return

    const rangeStart = Math.min(Math.min(...anchorIdxs), Math.min(...currIdxs))
    const rangeEnd = Math.max(Math.max(...anchorIdxs), Math.max(...currIdxs))
    const rangeUuids = order.slice(rangeStart, rangeEnd + 1)

    const next = new Set(initialSelection)
    for (const u of rangeUuids) {
      if (mode === 'add') next.add(u)
      else next.delete(u)
    }
    state = {
      ...state,
      selectedUuids: next,
      selectMode: next.size > 0,
      lastSelectedUuid: rowUuids[rowUuids.length - 1],
    }
    emit()
  },

  endDrag() {
    if (!state.drag) return
    state = { ...state, drag: null }
    emit()
  },

  selectRange(fromUuid, toUuid) {
    const list = state.orderedUuids
    const a = list.indexOf(fromUuid)
    const b = list.indexOf(toUuid)
    if (a < 0 || b < 0) return actions.toggleSelect(toUuid)
    const [lo, hi] = a <= b ? [a, b] : [b, a]
    const next = new Set(state.selectedUuids)
    for (let i = lo; i <= hi; i++) next.add(list[i])
    state = { ...state, selectedUuids: next, selectMode: true, lastSelectedUuid: toUuid }
    emit()
  },

  clearSelection() {
    state = { ...state, selectedUuids: new Set(), selectMode: false, lastSelectedUuid: null }
    emit()
  },

  async createMemoFromSelection({ title, note }) {
    if (!state.sessionId || state.selectedUuids.size === 0) return null
    const order = state.orderedUuids
    const pos = new Map(order.map((u, i) => [u, i]))
    const messageUuids = [...state.selectedUuids].sort(
      (a, b) => (pos.get(a) ?? 0) - (pos.get(b) ?? 0)
    )
    const memo = await api.createMemo(state.sessionId, { title, note, messageUuids })
    state = {
      ...state,
      memos: sortMemos([...state.memos, memo]),
      selectedUuids: new Set(),
      selectMode: false,
      lastSelectedUuid: null,
    }
    emit()
    return memo
  },

  async updateMemo(memoId, patch) {
    if (!state.sessionId) return
    const updated = await api.updateMemo(state.sessionId, memoId, patch)
    state = {
      ...state,
      memos: sortMemos(state.memos.map((m) => (m.id === memoId ? updated : m))),
    }
    emit()
  },

  async reorderMemos(newOrderIds) {
    if (!state.sessionId) return
    const optimistic = newOrderIds
      .map((id, i) => {
        const memo = state.memos.find((m) => m.id === id)
        return memo ? { ...memo, order: i } : null
      })
      .filter(Boolean)
    state = { ...state, memos: optimistic }
    emit()
    try {
      await Promise.all(
        optimistic.map((m) => api.updateMemo(state.sessionId, m.id, { order: m.order }))
      )
    } catch (err) {
      console.error('reorder failed', err)
    }
  },

  async deleteMemo(memoId) {
    if (!state.sessionId) return
    await api.deleteMemo(state.sessionId, memoId)
    state = { ...state, memos: state.memos.filter((m) => m.id !== memoId) }
    emit()
  },

  toggleShowSystem() {
    state = { ...state, showSystem: !state.showSystem }
    emit()
  },
  toggleShowThinking() {
    state = { ...state, showThinking: !state.showThinking }
    emit()
  },
  toggleShowToolResults() {
    state = { ...state, showToolResults: !state.showToolResults }
    emit()
  },
}

export function useMemos() {
  const snap = useSyncExternalStore(subscribe, getSnapshot, getSnapshot)
  return { state: snap, actions }
}
