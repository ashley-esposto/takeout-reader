import { useState, useMemo, useCallback, useRef, useEffect } from 'react'
import { parseActivityContent } from '../utils/activityParse'
import ExportMenu from './ExportMenu'
import VirtualList from './VirtualList'
import DataTable from './DataTable'

const ACTIVITY_COLUMNS = [
  { key: 'time', label: 'Time' },
  { key: 'header', label: 'Product' },
  { key: 'title', label: 'Title' },
  { key: 'subtitle', label: 'Detail' },
  { key: 'url', label: 'URL' },
]

const CATEGORY_LABELS = {
  activity: 'My Activity',
  location: 'Location History',
  chrome: 'Chrome',
  youtube: 'YouTube History',
  drive: 'Drive Activity',
}

function tryParseJson(text) {
  if (typeof text !== 'string') return text
  try { return JSON.parse(text) } catch { return text }
}

export default function ActivityViewer({ items, category }) {
  const [selectedFile, setSelectedFile] = useState(0)
  const [search, setSearch] = useState('')
  const [showRaw, setShowRaw] = useState(false)

  // Each file's content is fetched + parsed lazily when its tab is opened, so a
  // section with hundreds of files (e.g. Drive) costs nothing until clicked and
  // never holds them all in memory at once. Results are cached per index.
  const cache = useRef(new Map())
  const [loaded, setLoaded] = useState({ index: -1, parsed: null, rawText: '', loading: true, error: null })

  const catLabel = CATEGORY_LABELS[category] || category

  useEffect(() => {
    const idx = selectedFile
    const item = items[idx]
    if (!item) return

    if (cache.current.has(idx)) {
      setLoaded({ index: idx, ...cache.current.get(idx), loading: false, error: null })
      return
    }

    let cancelled = false
    setLoaded((s) => ({ ...s, index: idx, loading: true, error: null }))
    ;(async () => {
      try {
        // Support both lazy entries (getContent) and pre-parsed items (content).
        let rawText = null
        let contentForParse
        if (item.content != null) {
          contentForParse = item.content
          rawText = typeof item.content === 'string' ? item.content : item.raw ?? null
        } else if (typeof item.getContent === 'function') {
          rawText = await item.getContent('string')
          contentForParse = tryParseJson(rawText)
        } else {
          contentForParse = null
        }
        const parsed = parseActivityContent(contentForParse, { category, fileName: item.name || '' })
        const entry = { parsed, rawText: typeof rawText === 'string' ? rawText : safeStringify(contentForParse) }
        cache.current.set(idx, entry)
        if (!cancelled) setLoaded({ index: idx, ...entry, loading: false, error: null })
      } catch (e) {
        if (!cancelled) setLoaded({ index: idx, parsed: null, rawText: '', loading: false, error: e.message || 'Could not read this file' })
      }
    })()
    return () => { cancelled = true }
  }, [selectedFile, items, category])

  const isCurrent = loaded.index === selectedFile && !loaded.loading && !loaded.error
  const parsed = isCurrent ? loaded.parsed : null
  const records = parsed?.records || []
  const mode = parsed?.mode
  const overview = parsed?.overview
  const table = parsed?.table

  const currentFile = items[selectedFile]
  const fileLabel = currentFile?.name?.split('/').pop() || 'File'

  // Card-mode filtering.
  const filtered = useMemo(() => {
    if (!records.length) return records
    if (!search.trim()) return records
    const q = search.toLowerCase()
    return records.filter((r) => recordMatches(r, q))
  }, [records, search])

  // Table-mode filtering.
  const filteredRows = useMemo(() => {
    if (!table) return []
    if (!search.trim()) return table.rows
    const q = search.toLowerCase()
    return table.rows.filter((row) => row.some((cell) => String(cell ?? '').toLowerCase().includes(q)))
  }, [table, search])

  const rawPreview = useMemo(() => (loaded.rawText || '').slice(0, 120000), [loaded.rawText])

  const renderCard = useCallback((record) => (
    <div className="activity-card">
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
    </div>
  ), [mode])

  const recordKey = useCallback(
    (record, i) => record.id ?? `${i}-${record.title}-${record.time}`,
    []
  )

  if (items.length === 0) {
    return (
      <div className="detail-empty">
        No {catLabel} data found in this archive.
      </div>
    )
  }

  const countLabel = loaded.loading
    ? 'Loading…'
    : table
      ? `${filteredRows.length.toLocaleString()} of ${table.rows.length.toLocaleString()} rows`
      : records.length
        ? `${filtered.length.toLocaleString()} of ${records.length.toLocaleString()} entries`
        : overview
          ? 'Summary'
          : 'No structured entries parsed'

  const rawFooter = (
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
  )

  return (
    <div className="activity-layout activity-layout--friendly">
      {items.length > 1 && (
        <div className="activity-file-tabs" role="tablist">
          {items.map((item, i) => (
            <button
              key={(item.name || '') + i}
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
              {(item.name || 'File').split('/').pop()}
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
        {table ? (
          <ExportMenu
            stem={(fileLabel || category).replace(/\.csv$/i, '')}
            columns={table.columns.map((c, i) => ({ key: `c${i}`, label: c }))}
            getRows={() => filteredRows.map((row) => {
              const o = {}
              table.columns.forEach((_, i) => { o[`c${i}`] = row[i] ?? '' })
              return o
            })}
          />
        ) : records.length > 0 ? (
          <ExportMenu
            stem={category}
            columns={ACTIVITY_COLUMNS}
            getRows={() => filtered.map((r) => ({
              time: r.time || '',
              header: r.header || '',
              title: r.title || r.name || '',
              subtitle: r.subtitle || '',
              url: r.titleUrl || r.url || '',
            }))}
          />
        ) : null}
      </div>

      {loaded.loading ? (
        <div className="activity-body">
          <div className="detail-empty">Loading {fileLabel}…</div>
        </div>
      ) : loaded.error ? (
        <div className="activity-body">
          <div className="detail-empty">Could not read this file. {loaded.error}</div>
        </div>
      ) : table ? (
        <div className="activity-body activity-body--virtual">
          {filteredRows.length > 0 ? (
            <DataTable columns={table.columns} rows={filteredRows} />
          ) : (
            <p className="activity-empty-search">No rows match “{search}”.</p>
          )}
          {rawFooter}
        </div>
      ) : records.length > 0 ? (
        <div className="activity-body activity-body--virtual">
          {filtered.length > 0 ? (
            <VirtualList
              items={filtered}
              renderItem={renderCard}
              itemKey={recordKey}
              estimated={96}
              gap={8}
              padX={16}
              className="activity-card-vlist"
            />
          ) : (
            <p className="activity-empty-search">No entries match “{search}”.</p>
          )}
          {rawFooter}
        </div>
      ) : (
        <div className="activity-body">
          {overview && (
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
          {rawFooter}
        </div>
      )}
    </div>
  )
}

function safeStringify(content) {
  if (content == null) return ''
  if (typeof content === 'string') return content
  try { return JSON.stringify(content, null, 2) } catch { return String(content) }
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
  if (mode === 'youtube' || record.header === 'YouTube') return 'play_circle'
  if (mode === 'location') return 'location_on'
  if (record.header === 'Search') return 'search'
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
