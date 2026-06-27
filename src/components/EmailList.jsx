import { useState, useRef, useEffect, useCallback } from 'react'
import Avatar from './Avatar'
import { parseAddress } from '../utils/address'

// Row heights per density — must match the CSS .email-item heights below.
const ROW_HEIGHTS = { comfortable: 72, compact: 56 }
export const EMAIL_ROW_HEIGHT = ROW_HEIGHTS.comfortable

const BUFFER = 8

/**
 * EmailList — virtual-scrolling list that supports two modes:
 *
 * Browse mode  (searchEmails = null):
 *   Uses `emailMap` (sparse Map<index, email>) + `total` for scroll height.
 *   Calls `onNeedRange(start, end)` when visible rows aren't loaded yet.
 *
 * Search mode  (searchEmails = array):
 *   Renders the supplied array directly. `total` = array.length.
 */
export default function EmailList({
  total         = 0,
  emailMap,
  emailsVersion,
  searchEmails  = null,
  searchLoading = false,
  onNeedRange,
  selected,
  onSelect,
  density = 'comfortable',
  selectedIndices,
  onToggleSelect,
}) {
  const containerRef    = useRef(null)
  const [scrollTop, setScrollTop]           = useState(0)
  const [containerHeight, setContainerHeight] = useState(600)
  const rowHeight  = ROW_HEIGHTS[density] || ROW_HEIGHTS.comfortable
  const avatarSize = density === 'compact' ? 28 : 36

  useEffect(() => {
    const el = containerRef.current
    if (!el) return
    setContainerHeight(el.clientHeight)
    const ro = new ResizeObserver((entries) => setContainerHeight(entries[0].contentRect.height))
    ro.observe(el)
    return () => ro.disconnect()
  }, [])

  const handleScroll = useCallback((e) => setScrollTop(e.target.scrollTop), [])

  // NOTE: all hooks must run before any early return below — otherwise the
  // hook count changes between renders (e.g. when searchLoading toggles) and
  // React throws "Rendered fewer hooks than expected".
  const isSearch   = Array.isArray(searchEmails)
  const rowCount   = isSearch ? searchEmails.length : total
  const startIndex = Math.max(0, Math.floor(scrollTop / rowHeight) - BUFFER)
  const endIndex   = Math.min(rowCount, Math.ceil((scrollTop + containerHeight) / rowHeight) + BUFFER)

  useEffect(() => {
    if (!searchLoading && !isSearch && onNeedRange && rowCount > 0) {
      onNeedRange(startIndex, endIndex)
    }
  }, [startIndex, endIndex, isSearch, onNeedRange, rowCount, searchLoading]) // eslint-disable-line

  if (searchLoading) {
    return (
      <div className="email-list email-list--loading">
        <div className="email-list-empty">Searching mail…</div>
      </div>
    )
  }

  if (rowCount === 0) {
    return (
      <div className="email-list-empty">
        {isSearch ? 'No messages match your search.' : 'No messages loaded yet.'}
      </div>
    )
  }

  const totalHeight = rowCount * rowHeight

  const rows = []
  for (let idx = startIndex; idx < endIndex; idx++) {
    const email = isSearch ? searchEmails[idx] : (emailMap ? emailMap.get(idx) : null)
    rows.push({ idx, email })
  }

  return (
    <div
      ref={containerRef}
      className={`email-list email-list--${density}`}
      role="list"
    >
      <div style={{ height: totalHeight, position: 'relative' }}>
        {rows.map(({ idx, email }) => {
          const isSel = !!(selectedIndices && email && selectedIndices.has(idx))
          return (
          <div
            key={idx}
            role="listitem"
            className={`email-item${selected && email && selected === email ? ' active' : ''}${isSel ? ' email-item--selected' : ''}${email && isUnread(email) ? ' unread' : ''}`}
            onClick={() => email && onSelect(email)}
            style={{ position: 'absolute', top: idx * rowHeight, left: 0, right: 0 }}
          >
            {email ? (
              <>
                <div className="email-item-row">
                  {onToggleSelect && (
                    <span
                      className={`gmi email-item-check${isSel ? ' checked' : ''}`}
                      role="checkbox"
                      aria-checked={isSel}
                      tabIndex={0}
                      title={isSel ? 'Deselect' : 'Select'}
                      onClick={(e) => { e.stopPropagation(); onToggleSelect(idx) }}
                    >
                      {isSel ? 'check_box' : 'check_box_outline_blank'}
                    </span>
                  )}
                  <span className="gmi email-item-star" aria-hidden>
                    {isStarred(email) ? 'star' : 'star_outline'}
                  </span>
                  <Avatar
                    name={parseAddress(email.from).name}
                    email={parseAddress(email.from).email}
                    size={avatarSize}
                  />
                  <div className="email-item-body">
                    <div className="email-line-1">
                      <span className="email-from">{email.from || '(no sender)'}</span>
                      <span className="email-date">{formatDateGmail(email.date)}</span>
                    </div>
                    <div className="email-line-2 email-subject-line">
                      <span className="email-subject-part">{email.subject || '(no subject)'}</span>
                      {email.snippet ? (
                        <span className="email-snippet-part"> — {email.snippet}</span>
                      ) : null}
                    </div>
                  </div>
                </div>
                {email._labels && (() => {
                  const badges = email._labels.split(',')
                    .map(l => l.trim())
                    .filter(l => l && !['Unread','Opened','Read'].includes(l))
                    .slice(0, 3)
                  return badges.length > 0 ? (
                    <div className="email-labels">
                      {badges.map(l => (
                        <span key={l} className={`label-badge label-${l.toLowerCase().replace(/\s+/g, '-')}`}>{l}</span>
                      ))}
                    </div>
                  ) : null
                })()}
              </>
            ) : (
              <div className="email-loading">Loading…</div>
            )}
          </div>
          )
        })}
      </div>
    </div>
  )
}

function isUnread(email) {
  const raw = email._labels || ''
  return raw.split(',').map(s => s.trim()).includes('Unread')
}

function isStarred(email) {
  const raw = email._labels || ''
  return raw.split(',').map(s => s.trim()).includes('Starred')
}

/** Gmail-like short dates: time today, weekday if this week, else short date */
function formatDateGmail(dateStr) {
  if (!dateStr) return ''
  try {
    const d = new Date(dateStr)
    if (isNaN(d.getTime())) return dateStr

    const now = new Date()
    const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate())
    const startOfMsg = new Date(d.getFullYear(), d.getMonth(), d.getDate())
    const diffDays = Math.round((startOfToday - startOfMsg) / (24 * 60 * 60 * 1000))

    if (diffDays === 0) {
      return d.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })
    }
    if (diffDays === 1) return 'Yesterday'
    if (diffDays < 7 && diffDays > 0) {
      return d.toLocaleDateString(undefined, { weekday: 'short' })
    }
    if (d.getFullYear() === now.getFullYear()) {
      return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
    }
    return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })
  } catch {
    return dateStr
  }
}
