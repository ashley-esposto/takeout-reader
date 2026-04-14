import { useState, useRef, useEffect, useCallback } from 'react'

export const EMAIL_ROW_HEIGHT = 72   // must match CSS .email-item height

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
}) {
  const containerRef    = useRef(null)
  const [scrollTop, setScrollTop]           = useState(0)
  const [containerHeight, setContainerHeight] = useState(600)

  useEffect(() => {
    const el = containerRef.current
    if (!el) return
    setContainerHeight(el.clientHeight)
    const ro = new ResizeObserver((entries) => setContainerHeight(entries[0].contentRect.height))
    ro.observe(el)
    return () => ro.disconnect()
  }, [])

  const handleScroll = useCallback((e) => setScrollTop(e.target.scrollTop), [])

  if (searchLoading) {
    return (
      <div className="email-list email-list--loading">
        <div className="email-list-empty">Searching mail…</div>
      </div>
    )
  }

  const isSearch   = Array.isArray(searchEmails)
  const rowCount   = isSearch ? searchEmails.length : total
  const startIndex = Math.max(0, Math.floor(scrollTop / EMAIL_ROW_HEIGHT) - BUFFER)
  const endIndex   = Math.min(rowCount, Math.ceil((scrollTop + containerHeight) / EMAIL_ROW_HEIGHT) + BUFFER)

  useEffect(() => {
    if (!isSearch && onNeedRange && rowCount > 0) {
      onNeedRange(startIndex, endIndex)
    }
  }, [startIndex, endIndex, isSearch, onNeedRange, rowCount]) // eslint-disable-line

  if (rowCount === 0) {
    return (
      <div className="email-list-empty">
        {isSearch ? 'No messages match your search.' : 'No messages loaded yet.'}
      </div>
    )
  }

  const totalHeight = rowCount * EMAIL_ROW_HEIGHT

  const rows = []
  for (let idx = startIndex; idx < endIndex; idx++) {
    const email = isSearch ? searchEmails[idx] : (emailMap ? emailMap.get(idx) : null)
    rows.push({ idx, email })
  }

  return (
    <div
      ref={containerRef}
      className="email-list"
      role="list"
    >
      <div style={{ height: totalHeight, position: 'relative' }}>
        {rows.map(({ idx, email }) => (
          <div
            key={idx}
            role="listitem"
            className={`email-item${selected && email && selected === email ? ' active' : ''}${email && isUnread(email) ? ' unread' : ''}`}
            onClick={() => email && onSelect(email)}
            style={{ position: 'absolute', top: idx * EMAIL_ROW_HEIGHT, left: 0, right: 0 }}
          >
            {email ? (
              <>
                <div className="email-item-row">
                  <span className="gmi email-item-star" aria-hidden>
                    {isStarred(email) ? 'star' : 'star_outline'}
                  </span>
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
        ))}
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
