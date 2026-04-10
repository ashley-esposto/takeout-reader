import { useState } from 'react'

const CATEGORY_LABELS = {
  activity: 'My Activity',
  location: 'Location History',
  chrome:   'Chrome History',
  youtube:  'YouTube History',
  drive:    'Drive Activity',
}

export default function ActivityViewer({ items, category }) {
  const [selectedFile, setSelectedFile] = useState(0)
  const [search, setSearch] = useState('')

  if (items.length === 0) {
    return (
      <div className="detail-empty">
        No {CATEGORY_LABELS[category] || category} data found.
      </div>
    )
  }

  const currentFile = items[selectedFile]
  const records = normalizeRecords(currentFile?.content)

  const filtered = records.filter((r) => {
    if (!search) return true
    const q = search.toLowerCase()
    return (
      (r.title || '').toLowerCase().includes(q) ||
      (r.titleUrl || r.url || '').toLowerCase().includes(q) ||
      (r.header || '').toLowerCase().includes(q)
    )
  })

  return (
    <div className="activity-layout">
      {/* File tabs (if multiple files in this category) */}
      {items.length > 1 && (
        <div className="detail-tabs" style={{ flexShrink: 0 }}>
          {items.map((item, i) => (
            <button
              key={i}
              className={`detail-tab${selectedFile === i ? ' active' : ''}`}
              onClick={() => { setSelectedFile(i); setSearch('') }}
            >
              {item.name.split('/').pop()}
            </button>
          ))}
        </div>
      )}

      {/* Search + count */}
      <div className="sidebar-header" style={{ flexShrink: 0 }}>
        <span className="sidebar-title">
          {records.length.toLocaleString()} records
          {filtered.length !== records.length && ` · ${filtered.length.toLocaleString()} matching`}
        </span>
        <input
          className="search-input"
          type="text"
          placeholder="Search…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
      </div>

      {/* Records list */}
      <div className="activity-records">
        {records.length === 0 ? (
          /* Fallback: show raw content */
          <pre className="body-raw">
            {typeof currentFile?.content === 'string'
              ? currentFile.content.slice(0, 100000)
              : JSON.stringify(currentFile?.content, null, 2)?.slice(0, 100000)}
          </pre>
        ) : (
          <>
            {filtered.slice(0, 1000).map((record, i) => (
              <div key={i} className="activity-record">
                {record.header && (
                  <div className="activity-record-source">{record.header}</div>
                )}
                <div className="activity-record-title">
                  {record.title || record.name || JSON.stringify(record).slice(0, 120)}
                </div>
                {(record.titleUrl || record.url) && (
                  <div className="activity-record-url">
                    {record.titleUrl || record.url}
                  </div>
                )}
                {record.time && (
                  <div className="activity-record-time">{formatDateTime(record.time)}</div>
                )}
              </div>
            ))}
            {filtered.length > 1000 && (
              <div style={{ padding: '16px', color: 'var(--text-muted)', fontSize: 12, textAlign: 'center' }}>
                Showing first 1,000 of {filtered.length.toLocaleString()} records
              </div>
            )}
          </>
        )}
      </div>
    </div>
  )
}

/**
 * Normalize various Google Takeout JSON formats into a flat array of records.
 */
function normalizeRecords(content) {
  if (!content) return []
  // MyActivity JSON: top-level array of activity objects
  if (Array.isArray(content)) return content
  // Chrome BrowserHistory.json: { Browser: { ... }, browser_history: [...] }
  if (content.browser_history) {
    return content.browser_history.map((h) => ({
      title: h.title,
      titleUrl: h.url,
      time: h.time_usec
        ? new Date(Math.floor(parseInt(h.time_usec) / 1000)).toISOString()
        : null,
    }))
  }
  // Location history Records.json: { locations: [...] }
  if (content.locations) {
    return content.locations.slice(0, 50000).map((l) => ({
      title: `${(l.latitudeE7 / 1e7).toFixed(5)}, ${(l.longitudeE7 / 1e7).toFixed(5)}`,
      time: l.timestamp || (l.timestampMs
        ? new Date(parseInt(l.timestampMs)).toISOString()
        : null),
      header: l.accuracy != null ? `Accuracy: ${l.accuracy}m` : '',
    }))
  }
  // Semantic Location History: { timelineObjects: [...] }
  if (content.timelineObjects) {
    return content.timelineObjects.map((obj) => {
      const place = obj.placeVisit?.location
      const activity = obj.activitySegment
      if (place) {
        return {
          title: place.name || place.address || 'Place visit',
          time: obj.placeVisit?.duration?.startTimestamp,
          header: 'Place Visit',
        }
      }
      if (activity) {
        return {
          title: `Activity: ${activity.activityType || 'Unknown'}`,
          time: activity.duration?.startTimestamp,
          header: 'Activity Segment',
        }
      }
      return { title: JSON.stringify(obj).slice(0, 80) }
    })
  }
  return []
}

function formatDateTime(str) {
  if (!str) return ''
  try { return new Date(str).toLocaleString() } catch { return str }
}
