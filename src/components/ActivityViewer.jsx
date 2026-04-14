import { useState, useMemo } from 'react'
import { parseActivityContent } from '../utils/activityParse'

const CATEGORY_LABELS = {
  activity: 'My Activity',
  location: 'Location History',
  chrome: 'Chrome',
  youtube: 'YouTube History',
  drive: 'Drive Activity',
}

export default function ActivityViewer({ items, category }) {
  const [selectedFile, setSelectedFile] = useState(0)
  const [search, setSearch] = useState('')
  const [showRaw, setShowRaw] = useState(false)

  const catLabel = CATEGORY_LABELS[category] || category

  if (items.length === 0) {
    return (
      <div className="detail-empty">
        No {catLabel} data found in this archive.
      </div>
    )
  }

  const currentFile = items[selectedFile]
  const fileLabel = currentFile?.name?.split('/').pop() || 'File'

  const parsed = useMemo(
    () =>
      parseActivityContent(currentFile?.content, {
        category,
        fileName: currentFile?.name || '',
      }),
    [currentFile?.content, currentFile?.name, category]
  )

  const { records, mode, overview } = parsed

  const filtered = useMemo(() => {
    if (!search.trim()) return records
    const q = search.toLowerCase()
    return records.filter((r) => recordMatches(r, q))
  }, [records, search])

  const rawPreview = useMemo(() => {
    const c = currentFile?.content
    if (c == null) return ''
    if (typeof c === 'string') return c.slice(0, 120000)
    try {
      return JSON.stringify(c, null, 2).slice(0, 120000)
    } catch {
      return String(c)
    }
  }, [currentFile?.content])

  const countLabel = records.length
    ? `${filtered.length.toLocaleString()} of ${records.length.toLocaleString()} entries`
    : overview
      ? 'Summary'
      : 'No structured entries parsed'

  return (
    <div className="activity-layout activity-layout--friendly">
      {items.length > 1 && (
        <div className="activity-file-tabs" role="tablist">
          {items.map((item, i) => (
            <button
              key={item.name + i}
              type="button"
              role="tab"
              aria-selected={selectedFile === i}
              className={`activity-file-tab${selectedFile === i ? ' active' : ''}`}
              onClick={() => {
                setSelectedFile(i)
                setSearch('')
                setShowRaw(false)
              }}
            >
              {item.name.split('/').pop()}
            </button>
          ))}
        </div>
      )}

      <div className="activity-toolbar">
        <div className="activity-toolbar-text">
          <span className="activity-file-badge">{fileLabel}</span>
          <span className="activity-toolbar-meta">{countLabel}</span>
        </div>
        <label className="activity-search-wrap">
          <span className="gmi activity-search-icon" aria-hidden>search</span>
          <input
            className="activity-search-input"
            type="search"
            placeholder="Search this file…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            autoComplete="off"
          />
        </label>
      </div>

      <div className="activity-body">
        {records.length === 0 && overview && (
          <section className="activity-overview" aria-label="Overview">
            <h2 className="activity-overview-title">{overview.title}</h2>
            <p className="activity-overview-lead">{overview.summaryLine}</p>
            {overview.rows?.length > 0 && (
              <dl className="activity-dl">
                {overview.rows.map((row, i) => (
                  <div key={i} className="activity-dl-row">
                    <dt>{row.label}</dt>
                    <dd>{row.value}</dd>
                  </div>
                ))}
              </dl>
            )}
            <p className="activity-hint">
              This file uses a format we don’t fully expand yet. Use <strong>Technical details</strong> below only if you need the raw export.
            </p>
          </section>
        )}

        {records.length > 0 && (
          <ul className="activity-card-list">
            {filtered.slice(0, 1500).map((record, i) => (
              <li key={record.id ?? `${i}-${record.title}-${record.time}`} className="activity-card">
                <div className="activity-card-icon" aria-hidden>
                  <span className="gmi">{iconForRecord(record, mode)}</span>
                </div>
                <div className="activity-card-main">
                  {record.header && (
                    <div className="activity-card-kicker">{record.header}</div>
                  )}
                  <div className="activity-card-title">
                    {record.title || record.name || 'Entry'}
                  </div>
                  {record.subtitle && (
                    <div className="activity-card-subtitle">{record.subtitle}</div>
                  )}
                  {(record.titleUrl || record.url) && (
                    <a
                      className="activity-card-link"
                      href={record.titleUrl || record.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      onClick={(e) => e.stopPropagation()}
                    >
                      {truncateMiddle(record.titleUrl || record.url, 72)}
                    </a>
                  )}
                  {record.time && (
                    <time className="activity-card-time" dateTime={record.time}>
                      {formatFriendlyTime(record.time)}
                    </time>
                  )}
                  {record.details?.length > 0 && (
                    <dl className="activity-dl activity-dl--compact">
                      {record.details.map((row, j) => (
                        <div key={j} className="activity-dl-row">
                          <dt>{row.label}</dt>
                          <dd>{row.value}</dd>
                        </div>
                      ))}
                    </dl>
                  )}
                </div>
              </li>
            ))}
          </ul>
        )}

        {filtered.length > 1500 && (
          <p className="activity-limit-note">
            Showing the first 1,500 matching entries. Narrow your search to see more.
          </p>
        )}

        {records.length > 0 && filtered.length === 0 && (
          <p className="activity-empty-search">No entries match “{search}”.</p>
        )}

        <footer className="activity-raw-footer">
          <button
            type="button"
            className="activity-raw-toggle"
            onClick={() => setShowRaw((v) => !v)}
            aria-expanded={showRaw}
          >
            <span className="gmi">{showRaw ? 'expand_less' : 'code'}</span>
            {showRaw ? 'Hide technical details' : 'Technical details (raw data)'}
          </button>
          {showRaw && (
            <pre className="activity-raw-pre" tabIndex={0}>
              {rawPreview}
            </pre>
          )}
        </footer>
      </div>
    </div>
  )
}

function recordMatches(r, q) {
  const parts = [
    r.title,
    r.name,
    r.subtitle,
    r.header,
    r.titleUrl,
    r.url,
    r.time,
    ...(r.details || []).flatMap((d) => [d?.label, d?.value]),
  ]
  const blob = parts.map((x) => (x == null ? '' : String(x))).join(' ').toLowerCase()
  return blob.includes(q)
}

function iconForRecord(record, mode) {
  if (record.header?.includes('Place')) return 'place'
  if (record.header?.includes('Trip') || record.header === 'Location') return 'route'
  if (record.header?.includes('device') || record.header?.includes('Device')) return 'smartphone'
  if (mode === 'chrome' || record.header === 'Chrome') return 'public'
  if (mode === 'youtube') return 'play_circle'
  if (mode === 'location') return 'location_on'
  return 'description'
}

function formatFriendlyTime(str) {
  if (!str) return ''
  try {
    const d = new Date(str)
    if (Number.isNaN(d.getTime())) return str
    return d.toLocaleString(undefined, {
      weekday: 'short',
      month: 'short',
      day: 'numeric',
      year: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
    })
  } catch {
    return str
  }
}

function truncateMiddle(s, max) {
  if (!s || s.length <= max) return s
  const half = Math.floor((max - 3) / 2)
  return `${s.slice(0, half)}…${s.slice(-half)}`
}
