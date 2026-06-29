import { useRef, useState, useEffect, useCallback } from 'react'

const ROW_H = 40
const COL_W = 180
const BUFFER = 8

/**
 * DataTable — windowed table for CSV / tabular Takeout data.
 *
 * Both axes scroll in a single container: a sticky header pins to the top while
 * scrolling horizontally in sync with the body, and only the visible rows are
 * rendered (manual windowing, same approach as EmailList) so a CSV with tens of
 * thousands of rows stays light.
 */
export default function DataTable({ columns = [], rows = [] }) {
  const containerRef = useRef(null)
  const [scrollTop, setScrollTop] = useState(0)
  const [height, setHeight] = useState(480)

  useEffect(() => {
    const el = containerRef.current
    if (!el) return
    setHeight(el.clientHeight)
    const ro = new ResizeObserver((entries) => setHeight(entries[0].contentRect.height))
    ro.observe(el)
    return () => ro.disconnect()
  }, [])

  const onScroll = useCallback((e) => setScrollTop(e.target.scrollTop), [])

  const trackWidth = Math.max(columns.length * COL_W, 0)
  const start = Math.max(0, Math.floor(scrollTop / ROW_H) - BUFFER)
  const end = Math.min(rows.length, Math.ceil((scrollTop + height) / ROW_H) + BUFFER)

  const visible = []
  for (let i = start; i < end; i++) visible.push(i)

  return (
    <div className="data-table-scroll" ref={containerRef} onScroll={onScroll}>
      <div className="data-table-track" style={{ width: trackWidth || '100%' }}>
        <div className="data-table-header" role="row">
          {columns.map((c, i) => (
            <div key={i} className="data-table-cell data-table-th" role="columnheader" title={c}>
              {c}
            </div>
          ))}
        </div>
        <div className="data-table-body" style={{ height: rows.length * ROW_H }}>
          {visible.map((i) => (
            <div
              key={i}
              role="row"
              className="data-table-row"
              style={{ position: 'absolute', top: i * ROW_H, left: 0, height: ROW_H }}
            >
              {columns.map((_, ci) => {
                const v = rows[i][ci] ?? ''
                return (
                  <div key={ci} className="data-table-cell" role="cell" title={v}>
                    {v}
                  </div>
                )
              })}
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
