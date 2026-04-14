import { useEffect, useRef, useState } from 'react'

export default function SearchBar({ onSubmit, initialQuery = '' }) {
  const [q, setQ] = useState(initialQuery)
  const inputRef = useRef(null)

  useEffect(() => setQ(initialQuery), [initialQuery])

  useEffect(() => {
    function onKey(e) {
      if (e.key === '/' && document.activeElement?.tagName !== 'INPUT' && document.activeElement?.tagName !== 'TEXTAREA') {
        e.preventDefault()
        inputRef.current?.focus()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault()
        if (q.trim()) onSubmit(q.trim())
      }}
    >
      <input
        ref={inputRef}
        type="text"
        placeholder="Search all sessions... (press /)"
        value={q}
        onChange={(e) => setQ(e.target.value)}
      />
    </form>
  )
}
