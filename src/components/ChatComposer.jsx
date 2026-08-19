// Bottom composer bar for continuing a session as a live chat. Enter sends,
// Shift+Enter inserts a newline. Shows a "working" indicator with an interrupt
// button while Claude is mid-turn.
import { useRef, useState } from 'react'

export default function ChatComposer({ status, onSend, onInterrupt, disabled }) {
  const [text, setText] = useState('')
  const taRef = useRef(null)
  const working = status === 'working'

  const send = () => {
    const t = text.trim()
    if (!t || disabled) return
    onSend(t)
    setText('')
    // Reset textarea height after clearing.
    if (taRef.current) taRef.current.style.height = 'auto'
  }

  const onKeyDown = (e) => {
    if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) {
      e.preventDefault()
      send()
    }
  }

  const autoGrow = (e) => {
    setText(e.target.value)
    const el = e.target
    el.style.height = 'auto'
    el.style.height = Math.min(el.scrollHeight, 200) + 'px'
  }

  return (
    <div className="chat-composer">
      {working ? (
        <div className="chat-status">
          <span className="chat-spinner" aria-hidden="true" />
          <span>Claude가 작업 중…</span>
          <button className="chat-interrupt" onClick={onInterrupt}>중단</button>
        </div>
      ) : null}
      <div className="chat-input-row">
        <textarea
          ref={taRef}
          className="chat-textarea"
          rows={1}
          placeholder={disabled ? '이 세션은 채팅을 사용할 수 없습니다' : '메시지를 입력해 이 세션을 이어가세요… (Enter 전송, Shift+Enter 줄바꿈)'}
          value={text}
          onChange={autoGrow}
          onKeyDown={onKeyDown}
          disabled={disabled}
        />
        <button
          className="chat-send"
          onClick={send}
          disabled={disabled || !text.trim()}
          title="전송"
        >
          전송
        </button>
      </div>
    </div>
  )
}
