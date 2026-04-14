import { useState } from 'react'

const LINE_LIMIT = 300
const CHAR_LIMIT = 5000

export default function ToolResultBlock({ content, isError }) {
  const text = typeof content === 'string' ? content : JSON.stringify(content, null, 2)
  const lines = text.split('\n')
  const tooLong = lines.length > LINE_LIMIT || text.length > CHAR_LIMIT
  const [expanded, setExpanded] = useState(!tooLong)
  const shown = expanded ? text : lines.slice(0, 30).join('\n')
  const hiddenLines = lines.length - 30

  return (
    <details className={'tool-result' + (isError ? ' error' : '')}>
      <summary>
        {isError ? 'tool error' : 'tool result'} · {lines.length} line{lines.length !== 1 ? 's' : ''}
      </summary>
      <pre>{shown}</pre>
      {tooLong && (
        <button
          onClick={(e) => {
            e.preventDefault()
            setExpanded(!expanded)
          }}
        >
          {expanded ? 'Collapse' : `Show ${hiddenLines} more lines`}
        </button>
      )}
    </details>
  )
}
