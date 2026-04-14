import { useEffect, useLayoutEffect, useRef, useState } from 'react'

// Collapses its children to a maximum height, fading the bottom out and
// showing a "더 보기" button when the content exceeds the threshold.
// Uses a ResizeObserver so it reacts to async content (Shiki highlighting,
// image loads, etc.).
export default function Collapsible({ children, maxHeight = 260 }) {
  const ref = useRef(null)
  const [needsCollapse, setNeedsCollapse] = useState(false)
  const [expanded, setExpanded] = useState(false)

  useLayoutEffect(() => {
    if (!ref.current) return
    const measure = () => {
      if (!ref.current) return
      const h = ref.current.scrollHeight
      setNeedsCollapse(h > maxHeight + 24)
    }
    measure()
    const ro = new ResizeObserver(measure)
    ro.observe(ref.current)
    return () => ro.disconnect()
  }, [maxHeight])

  // Re-measure whenever children change (in case content shrinks/grows)
  useEffect(() => {
    if (!ref.current) return
    const h = ref.current.scrollHeight
    setNeedsCollapse(h > maxHeight + 24)
  }, [children, maxHeight])

  const collapsed = needsCollapse && !expanded

  return (
    <div className={'collapsible' + (collapsed ? ' is-collapsed' : '')}>
      <div
        ref={ref}
        className="collapsible-inner"
        style={collapsed ? { maxHeight: maxHeight + 'px' } : undefined}
      >
        {children}
      </div>
      {needsCollapse && (
        <button
          type="button"
          className="collapsible-toggle"
          onClick={(e) => {
            e.stopPropagation()
            setExpanded((v) => !v)
          }}
        >
          {expanded ? '접기' : '더 보기'}
        </button>
      )}
    </div>
  )
}
