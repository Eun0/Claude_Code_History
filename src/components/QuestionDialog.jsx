// Modal shown when the resumed Claude session calls the AskUserQuestion tool to
// present multiple-choice questions. Renders radio (single) or checkbox
// (multiSelect) options per question, plus an optional free-text answer, and
// sends the selections back so Claude can continue.
import { useState } from 'react'

export default function QuestionDialog({ request, onSubmit, busy }) {
  const questions = request?.questions || []
  // selections[i] = { selected: Set<string label>, custom: string }
  const [selections, setSelections] = useState(() =>
    questions.map(() => ({ selected: new Set(), custom: '' }))
  )

  if (!request) return null

  const setSel = (i, next) =>
    setSelections((cur) => cur.map((s, idx) => (idx === i ? next : s)))

  const toggle = (i, label, multi) => {
    const s = selections[i]
    const sel = new Set(s.selected)
    if (multi) {
      sel.has(label) ? sel.delete(label) : sel.add(label)
    } else {
      sel.clear()
      sel.add(label)
    }
    setSel(i, { ...s, selected: sel })
  }

  const submit = () => {
    const answers = selections.map((s) => ({
      selected: Array.from(s.selected),
      custom: s.custom || '',
    }))
    onSubmit(answers)
  }

  // Require at least one selection or custom text per question.
  const ready = selections.every(
    (s) => s.selected.size > 0 || (s.custom || '').trim()
  )

  return (
    <div className="perm-overlay" role="dialog" aria-modal="true">
      <div className="perm-dialog q-dialog">
        <div className="perm-head">
          <span className="perm-tool">AskUserQuestion</span>
          <h3 className="perm-title">Claude가 선택을 요청합니다</h3>
        </div>

        <div className="q-body">
          {questions.map((q, i) => {
            const multi = q.multiSelect === true
            const sel = selections[i] || { selected: new Set(), custom: '' }
            return (
              <div className="q-block" key={i}>
                <div className="q-question">{q.question}</div>
                {q.header ? <div className="q-header">{q.header}</div> : null}
                <div className="q-options">
                  {(q.options || []).map((opt, j) => {
                    const checked = sel.selected.has(opt.label)
                    return (
                      <label className={`q-option${checked ? ' selected' : ''}`} key={j}>
                        <input
                          type={multi ? 'checkbox' : 'radio'}
                          name={`q-${i}`}
                          checked={checked}
                          onChange={() => toggle(i, opt.label, multi)}
                        />
                        <span className="q-opt-text">
                          <span className="q-opt-label">{opt.label}</span>
                          {opt.description ? (
                            <span className="q-opt-desc">{opt.description}</span>
                          ) : null}
                        </span>
                      </label>
                    )
                  })}
                </div>
                <input
                  className="q-custom"
                  type="text"
                  placeholder="기타 (직접 입력)"
                  value={sel.custom}
                  onChange={(e) => setSel(i, { ...sel, custom: e.target.value })}
                />
              </div>
            )
          })}
        </div>

        <div className="perm-actions">
          <button
            className="perm-btn perm-allow"
            disabled={busy || !ready}
            onClick={submit}
          >
            답변 전송
          </button>
        </div>
      </div>
    </div>
  )
}
