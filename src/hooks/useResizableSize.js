import { useState, useEffect, useCallback } from 'react'

/**
 * A pane size (px) that persists to localStorage and can be nudged by a
 * resizer delta or reset to its default.
 *
 * @returns {[number, (deltaPx:number)=>void, ()=>void]} [size, onDelta, reset]
 */
export function useResizableSize(storageKey, defaultPx, minPx, maxPx) {
  const [size, setSize] = useState(() => {
    try {
      const v = parseInt(localStorage.getItem(storageKey), 10)
      return Number.isFinite(v) ? v : defaultPx
    } catch { return defaultPx }
  })

  useEffect(() => {
    try { localStorage.setItem(storageKey, size) } catch { /* ignore */ }
  }, [storageKey, size])

  const onDelta = useCallback(
    (d) => setSize((prev) => Math.max(minPx, Math.min(maxPx, prev + d))),
    [minPx, maxPx]
  )
  const reset = useCallback(() => setSize(defaultPx), [defaultPx])

  return [size, onDelta, reset]
}
