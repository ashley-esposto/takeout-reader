import { useRef } from 'react'

/**
 * Draggable divider between two panels.
 *
 * @param {'vertical'|'horizontal'} orientation - 'vertical' is a vertical bar
 *   dragged left/right (resizes width); 'horizontal' is a bar dragged up/down
 *   (resizes height).
 * @param {(deltaPx: number) => void} onDelta - called with the incremental
 *   movement (px) along the resize axis on each pointer move.
 */
export default function PaneResizer({ orientation = 'vertical', onDelta }) {
  const last = useRef(null)

  function onPointerDown(e) {
    e.preventDefault()
    try { e.currentTarget.setPointerCapture(e.pointerId) } catch { /* noop */ }
    last.current = orientation === 'vertical' ? e.clientX : e.clientY
    // Suppress text selection and keep the email iframe from swallowing the drag.
    document.body.classList.add(orientation === 'vertical' ? 'resizing-x' : 'resizing-y')
  }

  function onPointerMove(e) {
    if (last.current == null) return
    const cur = orientation === 'vertical' ? e.clientX : e.clientY
    const d = cur - last.current
    if (d !== 0) {
      last.current = cur
      onDelta(d)
    }
  }

  function end(e) {
    last.current = null
    try { e.currentTarget.releasePointerCapture(e.pointerId) } catch { /* noop */ }
    document.body.classList.remove('resizing-x', 'resizing-y')
  }

  return (
    <div
      className={`pane-resizer pane-resizer--${orientation}`}
      role="separator"
      aria-orientation={orientation === 'vertical' ? 'vertical' : 'horizontal'}
      tabIndex={-1}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={end}
      onPointerCancel={end}
    />
  )
}
