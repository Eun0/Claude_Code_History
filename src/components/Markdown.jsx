import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import CodeBlock from './CodeBlock.jsx'

// Treat anything without a recognised protocol as a local file reference.
// Claude often writes things like `[EXPERIMENT_GUIDE.md](exps/foo/...md)`
// which point at files on the author's machine — those shouldn't render as
// broken links. Only real URLs (http, https, mailto, etc.) and in-page
// anchors (#foo) stay clickable.
function isLocalPath(href) {
  if (!href) return true
  const raw = String(href).trim()
  const lower = raw.toLowerCase()
  if (
    lower.startsWith('javascript:') ||
    lower.startsWith('data:') ||
    lower.startsWith('vbscript:')
  ) {
    return true // dangerous protocols: also render as non-clickable bold
  }
  if (/^[a-z][a-z0-9+.-]*:/i.test(raw)) return false // has a real protocol
  if (raw.startsWith('//')) return false // protocol-relative
  if (raw.startsWith('#')) return false // in-page anchor
  return true // plain relative/absolute file path
}

// react-markdown v10 removed the `inline` prop on the code renderer, so we
// detect block vs inline ourselves: a block has either a language class
// (```lang) or contains a newline. Everything else is treated as inline
// `code` and renders in place without forcing a new line.
const components = {
  code(props) {
    const { children, className, node, ...rest } = props
    const text = String(children ?? '')
    const hasLang = /language-/.test(className || '')
    const isBlock = hasLang || text.includes('\n')
    if (isBlock) {
      const match = /language-(\w+)/.exec(className || '')
      return (
        <CodeBlock language={match ? match[1] : ''}>
          {text.replace(/\n$/, '')}
        </CodeBlock>
      )
    }
    return (
      <code className={className} {...rest}>
        {children}
      </code>
    )
  },
  // CodeBlock renders its own <pre> (or Shiki <div>), so unwrap the default
  // <pre> that react-markdown would otherwise add — avoids nested <pre>.
  pre({ children }) {
    return <>{children}</>
  },
  a({ href, children, node, ...props }) {
    if (isLocalPath(href)) {
      return <strong>{children}</strong>
    }
    return (
      <a href={href} target="_blank" rel="noreferrer" {...props}>
        {children}
      </a>
    )
  },
}

export default function Markdown({ children }) {
  return (
    <ReactMarkdown remarkPlugins={[remarkGfm]} components={components}>
      {children || ''}
    </ReactMarkdown>
  )
}
