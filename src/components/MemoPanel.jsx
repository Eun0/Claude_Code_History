import { useEffect, useState } from 'react'
import { useMemos } from '../state/memoStore.js'
import DraggableMemoList from './DraggableMemoList.jsx'
import MemoExportBar from './MemoExportBar.jsx'

export default function MemoPanel({ sessionMeta, projectId, sessionId }) {
  const { state, actions } = useMemos()
  const [collapsed, setCollapsed] = useState(false)
  const [localTitle, setLocalTitle] = useState(state.boardTitle || '')

  useEffect(() => {
    setLocalTitle(state.boardTitle || '')
  }, [state.sessionId, state.boardTitle])

  if (collapsed) {
    return (
      <div className="memo-panel collapsed">
        <div
          style={{ padding: 14, cursor: 'pointer', color: 'var(--text-3)', fontFamily: 'var(--mono)', fontSize: 12 }}
          onClick={() => setCollapsed(false)}
          title="Expand memos"
        >
          ◀
        </div>
      </div>
    )
  }

  const commitTitle = () => {
    const trimmed = (localTitle || '').trim()
    if (trimmed !== (state.boardTitle || '')) {
      actions.setBoardTitle(trimmed)
    }
  }

  const count = state.memos.length
  return (
    <div className="memo-panel">
      <div className="panel-header">
        <div className="board-title-block">
          <input
            className="board-title-input"
            type="text"
            placeholder="Claude Memos"
            value={localTitle}
            onChange={(e) => setLocalTitle(e.target.value)}
            onBlur={commitTitle}
            onKeyDown={(e) => { if (e.key === 'Enter') e.currentTarget.blur() }}
            spellCheck={false}
          />
          <div className="board-subtitle">
            {count} memo{count === 1 ? '' : 's'}
          </div>
        </div>
        <span className="collapse-btn" onClick={() => setCollapsed(true)} title="Collapse">
          ▶
        </span>
      </div>
      <div className="memo-list">
        <DraggableMemoList />
      </div>
      <MemoExportBar sessionMeta={sessionMeta} projectId={projectId} sessionId={sessionId} />
    </div>
  )
}
