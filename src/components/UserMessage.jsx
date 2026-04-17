import { useState } from 'react'
import { cleanUserText, renderUserBody } from '../lib/renderMessageHtml.js'
import Collapsible from './Collapsible.jsx'

function buildUserCopyText(node) {
  const parts = []
  if (node.slashCommand) {
    parts.push('/' + node.slashCommand.replace(/^\//, ''))
  }
  for (const b of node.blocks || []) {
    if (b.type === 'text') {
      const cleaned = cleanUserText(b.text || '')
      if (cleaned) parts.push(cleaned)
    } else if (b.type === 'image') {
      parts.push('(image)')
    }
  }
  return parts.join('\n\n')
}

export default function UserMessage({ node }) {
  const bodyHtml = renderUserBody(node.blocks, node.slashCommand)
  const [copied, setCopied] = useState(false)

  const onCopy = async (e) => {
    e.stopPropagation()
    const text = buildUserCopyText(node)
    if (!text) return
    try {
      await navigator.clipboard.writeText(text)
      setCopied(true)
      setTimeout(() => setCopied(false), 1400)
    } catch {
      // Silently ignore — older browsers without clipboard API.
    }
  }

  return (
    <div className="message-content user">
      <div className="message-header">
        {node.timestamp && (
          <span className="ts" title={node.timestamp}>
            {formatShortTime(node.timestamp)}
          </span>
        )}
        <span className="role user">You</span>
      </div>
      <div className="user-bubble-wrap">
        <button
          type="button"
          className={'user-copy-btn' + (copied ? ' copied' : '')}
          onClick={onCopy}
          title={copied ? 'Copied' : 'Copy'}
          aria-label="Copy message"
          data-no-select
        >
          {copied ? <CheckIcon /> : <ClipboardIcon />}
        </button>
        <div className="user-bubble">
          <Collapsible maxHeight={260}>
            <div
              className="message-body"
              dangerouslySetInnerHTML={{ __html: bodyHtml }}
            />
          </Collapsible>
        </div>
      </div>
    </div>
  )
}

function formatShortTime(iso) {
  try {
    return new Date(iso).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
  } catch {
    return ''
  }
}

function ClipboardIcon() {
  return (
    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <rect x="9" y="9" width="11" height="12" rx="2" />
      <path d="M5 15H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h8a2 2 0 0 1 2 2v1" />
    </svg>
  )
}

function CheckIcon() {
  return (
    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <polyline points="20 6 9 17 4 12" />
    </svg>
  )
}
