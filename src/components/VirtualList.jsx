import { useRef, useEffect, useState, useCallback, useLayoutEffect } from 'react'
import { VariableSizeList } from 'react-window'

/**
 * VirtualList — dynamic (measured) height windowed list.
 *
 * Renders only the rows in (and just around) the viewport, so a list of tens
 * of thousands of variable-height items stays at a few dozen DOM nodes. Wraps
 * react-window's VariableSizeList and measures each row as it mounts, so the
 * caller doesn't have to know row heights up front.
 *
 *   items        array of data items
 *   renderItem   (item, index) => ReactNode
 *   itemKey      (item, index) => stable key  (optional; defaults to index)
 *   estimated    starting height guess for unmeasured rows (px)
 *   gap          vertical space between rows (px) — folded into measured height
 *   padX         horizontal inset applied to each row (px)
 *   overscan     extra rows rendered above/below the viewport
 *   className    extra class on the outer scroll element
 */
export default function VirtualList({
  items,
  renderItem,
  itemKey,
  estimated = 88,
  gap = 8,
  padX = 16,
  overscan = 6,
  className = '',
}) {
  const containerRef = useRef(null)
  const listRef = useRef(null)
  const sizes = useRef([])               // index -> measured height (incl. gap)
  const [height, setHeight] = useState(0)

  // Auto-size to the parent: VariableSizeList needs an explicit pixel height.
  useLayoutEffect(() => {
    const el = containerRef.current
    if (!el) return
    setHeight(el.clientHeight)
    const ro = new ResizeObserver((entries) => setHeight(entries[0].contentRect.height))
    ro.observe(el)
    return () => ro.disconnect()
  }, [])

  // When the data set changes (e.g. a new search filter), drop stale
  // measurements and re-flow from the top.
  useEffect(() => {
    sizes.current = []
    if (listRef.current) listRef.current.resetAfterIndex(0)
  }, [items])

  const getSize = useCallback((i) => sizes.current[i] || estimated, [estimated])

  const setSize = useCallback((i, h) => {
    if (sizes.current[i] === h) return
    sizes.current[i] = h
    // Heights below this row don't change, so only re-measure from here down.
    if (listRef.current) listRef.current.resetAfterIndex(i)
  }, [])

  const Row = useCallback(({ index, style }) => {
    const ref = useRef(null)
    useLayoutEffect(() => {
      const node = ref.current
      if (!node) return
      const measure = () => setSize(index, node.offsetHeight)
      measure()
      const ro = new ResizeObserver(measure)
      ro.observe(node)
      return () => ro.disconnect()
    }, [index])
    return (
      <div style={style}>
        <div ref={ref} style={{ paddingLeft: padX, paddingRight: padX, paddingBottom: gap }}>
          {renderItem(items[index], index)}
        </div>
      </div>
    )
  }, [items, renderItem, setSize, padX, gap])

  const keyFn = useCallback(
    (index) => (itemKey ? itemKey(items[index], index) : index),
    [items, itemKey]
  )

  return (
    <div ref={containerRef} className={`virtual-list ${className}`}>
      {height > 0 && (
        <VariableSizeList
          ref={listRef}
          height={height}
          width="100%"
          itemCount={items.length}
          itemSize={getSize}
          estimatedItemSize={estimated}
          itemKey={keyFn}
          overscanCount={overscan}
          style={{ paddingTop: 8 }}
        >
          {Row}
        </VariableSizeList>
      )}
    </div>
  )
}
