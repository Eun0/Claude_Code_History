import { useEffect, useState } from 'react'
import { codeToHtml } from 'shiki'

const cache = new Map()

export default function CodeBlock({ language, children }) {
  const [html, setHtml] = useState(() => cache.get(cacheKey(language, children)) || null)

  useEffect(() => {
    const key = cacheKey(language, children)
    if (cache.has(key)) {
      setHtml(cache.get(key))
      return
    }
    let cancelled = false
    codeToHtml(children, {
      lang: language || 'text',
      theme: 'github-light',
    })
      .then((out) => {
        cache.set(key, out)
        if (!cancelled) setHtml(out)
      })
      .catch(() => {
        if (!cancelled) setHtml(null)
      })
    return () => {
      cancelled = true
    }
  }, [language, children])

  if (html) {
    return <div className="code-block" dangerouslySetInnerHTML={{ __html: html }} />
  }
  return (
    <pre className="code-block">
      <code>{children}</code>
    </pre>
  )
}

function cacheKey(lang, content) {
  return `${lang || ''}::${content}`
}
