/**
 * Parse Google Takeout JSON/HTML exports into rows the Activity viewer can render.
 * Handles multiple Chrome & Location export shapes and falls back to human summaries.
 */

const MAX_CHROME_ROWS = 8000
const MAX_LOCATION_POINTS = 50000
const MAX_GENERIC_ROWS = 500

/**
 * @returns {{ records: object[], mode: string, overview?: object }}
 */
export function parseActivityContent(content, { category, fileName = '' } = {}) {
  const name = (fileName || '').toLowerCase()

  // ── Chrome: many file names / JSON shapes ─────────────────────────────────
  if (category === 'chrome' || name.includes('chrome') || name.includes('history')) {
    const chrome = extractChromeRecords(content)
    if (chrome.length) {
      return { records: chrome, mode: 'chrome' }
    }
  }

  // ── Location ─────────────────────────────────────────────────────────────
  if (category === 'location' || name.includes('location') || name.includes('semantic')) {
    const loc = extractLocationRecords(content)
    if (loc.length) {
      return { records: loc, mode: 'location' }
    }
  }

  // ── My Activity style (array of activities) ──────────────────────────────
  if (Array.isArray(content) && content.length && typeof content[0] === 'object') {
    const rows = content.slice(0, MAX_GENERIC_ROWS).map((item, i) => mapMyActivityItem(item, i))
    if (rows.some((r) => r.title)) {
      return { records: rows, mode: 'myactivity' }
    }
  }

  // ── YouTube / Drive / generic object ───────────────────────────────────────
  const generic = extractGenericFriendlyRecords(content, category)
  if (generic.records.length) {
    return { records: generic.records, mode: generic.mode, overview: generic.overview }
  }

  return { records: [], mode: 'unknown', overview: buildOverview(content) }
}

function mapMyActivityItem(item, i) {
  return {
    id: i,
    header: item.header || item.subtitle || 'Activity',
    title: item.title || item.name || item.description || '',
    titleUrl: item.titleUrl || item.url,
    time: item.time || item.timestamp,
  }
}

// ── Chrome ───────────────────────────────────────────────────────────────────

function extractChromeRecords(content) {
  if (!content) return []
  const out = []
  const seen = new Set()

  if (typeof content === 'string') {
    try {
      content = JSON.parse(content)
    } catch {
      return []
    }
  }

  if (Array.isArray(content)) {
    for (const row of content) {
      pushChromeRow(row, out, seen)
      if (out.length >= MAX_CHROME_ROWS) break
    }
    return finalizeChrome(out)
  }

  if (typeof content !== 'object') return []

  const directKeys = [
    'browser_history',
    'BrowserHistory',
    'Browser History',
    'history',
    'History',
    'urls',
  ]
  for (const k of directKeys) {
    if (Array.isArray(content[k])) {
      for (const row of content[k]) {
        pushChromeRow(row, out, seen)
        if (out.length >= MAX_CHROME_ROWS) return finalizeChrome(out)
      }
      if (out.length) return finalizeChrome(out)
    }
  }

  walkChromeNodes(content, out, seen, 0, 10)
  return finalizeChrome(out)
}

function walkChromeNodes(node, out, seen, depth, maxDepth) {
  if (depth > maxDepth || out.length >= MAX_CHROME_ROWS) return
  if (!node || typeof node !== 'object') return

  if (Array.isArray(node)) {
    for (const item of node) {
      walkChromeNodes(item, out, seen, depth + 1, maxDepth)
      if (out.length >= MAX_CHROME_ROWS) return
    }
    return
  }

  pushChromeRow(node, out, seen)

  for (const v of Object.values(node)) {
    if (v && typeof v === 'object') {
      walkChromeNodes(v, out, seen, depth + 1, maxDepth)
      if (out.length >= MAX_CHROME_ROWS) return
    }
  }
}

function pushChromeRow(obj, out, seen) {
  if (!obj || typeof obj !== 'object') return
  const url = firstString(obj, ['url', 'virtual_url', 'titleUrl', 'target_url'])
  if (!url || typeof url !== 'string') return
  if (!/^https?:\/\//i.test(url) && !url.startsWith('chrome://')) return

  const title = firstString(obj, ['title', 'name', 'page_title', 'Page Title']) || 'Visited page'
  const timeRaw = firstDefined(obj, [
    'time_usec',
    'timestamp_msec',
    'last_visit_time',
    'last_visit_time_usec',
  ])
  const time = normalizeChromeTime(timeRaw)
  const key = `${url}\t${time || ''}`
  if (seen.has(key)) return
  seen.add(key)

  out.push({
    header: 'Chrome',
    title,
    titleUrl: url,
    time,
  })
}

function firstString(obj, keys) {
  for (const k of keys) {
    if (typeof obj[k] === 'string' && obj[k].trim()) return obj[k].trim()
  }
  return ''
}

function firstDefined(obj, keys) {
  for (const k of keys) {
    if (obj[k] != null && obj[k] !== '') return obj[k]
  }
  return null
}

function normalizeChromeTime(raw) {
  if (raw == null || raw === '') return null
  const n = typeof raw === 'string' ? parseFloat(raw) : Number(raw)
  if (!Number.isFinite(n)) {
    try {
      const d = new Date(raw)
      return Number.isNaN(d.getTime()) ? null : d.toISOString()
    } catch {
      return null
    }
  }
  // microseconds
  if (n > 1e15) return new Date(Math.floor(n / 1000)).toISOString()
  // milliseconds
  if (n > 1e12) return new Date(Math.floor(n)).toISOString()
  // seconds
  if (n > 1e9) return new Date(Math.floor(n * 1000)).toISOString()
  return new Date(n).toISOString()
}

function finalizeChrome(rows) {
  rows.sort((a, b) => {
    const ta = a.time ? Date.parse(a.time) : 0
    const tb = b.time ? Date.parse(b.time) : 0
    return tb - ta
  })
  return rows
}

// ── Location ───────────────────────────────────────────────────────────────

function extractLocationRecords(content) {
  if (!content || typeof content !== 'object') return []
  const out = []

  if (Array.isArray(content)) return []

  if (Array.isArray(content.locations)) {
    for (const l of content.locations.slice(0, MAX_LOCATION_POINTS)) {
      const lat = l.latitudeE7 != null ? l.latitudeE7 / 1e7 : l.latitude
      const lng = l.longitudeE7 != null ? l.longitudeE7 / 1e7 : l.longitude
      let title = 'Location point'
      if (typeof lat === 'number' && typeof lng === 'number') {
        title = `${lat.toFixed(5)}, ${lng.toFixed(5)}`
      }
      const time =
        l.timestamp ||
        (l.timestampMs ? new Date(parseInt(l.timestampMs, 10)).toISOString() : null) ||
        l.startTime ||
        null
      const acc = l.accuracy != null ? `About ±${Math.round(l.accuracy)} m accuracy` : ''
      out.push({
        header: 'Location',
        title,
        subtitle: acc,
        time,
      })
    }
    return out
  }

  if (Array.isArray(content.timelineObjects)) {
    for (const obj of content.timelineObjects) {
      const place = obj.placeVisit?.location
      const visit = obj.placeVisit
      if (place) {
        out.push({
          header: 'Place',
          title: place.name || place.address || 'Place visit',
          subtitle: place.address && place.name !== place.address ? place.address : '',
          time: visit?.duration?.startTimestamp || visit?.duration?.endTimestamp,
        })
        continue
      }
      const seg = obj.activitySegment
      if (seg) {
        out.push({
          header: 'Trip',
          title: humanActivityType(seg.activityType),
          subtitle: seg.distance != null ? `${formatKm(seg.distance)} · ${formatDuration(seg)}` : '',
          time: seg.duration?.startTimestamp,
        })
      }
    }
    return out
  }

  // Device / settings JSON (no GPS points) — still friendly
  if (
    content.devicePrettyName ||
    content.platformType ||
    content.manufacturer ||
    content.model
  ) {
    const title = content.devicePrettyName || `${content.manufacturer || ''} ${content.model || ''}`.trim() || 'Device'
    const subtitle = [content.platformType, content.model && content.devicePrettyName ? content.model : null]
      .filter(Boolean)
      .join(' · ')
    const rows = summarizeFlatObject(content, [
      'createdTime',
      'lastReportTime',
      'reportingEnabled',
      'locationEnabled',
      'batteryCharging',
    ])
    out.push({
      header: 'Location & device settings',
      title,
      subtitle,
      time: content.createdTime || content.lastReportTime,
      details: rows,
    })
  }

  return out
}

function humanActivityType(t) {
  if (!t || typeof t !== 'string') return 'Activity'
  return t
    .replace(/_/g, ' ')
    .toLowerCase()
    .replace(/\b\w/g, (c) => c.toUpperCase())
}

function formatKm(meters) {
  if (meters == null || !Number.isFinite(meters)) return ''
  if (meters >= 1000) return `${(meters / 1000).toFixed(1)} km`
  return `${Math.round(meters)} m`
}

function formatDuration(seg) {
  const s = seg.duration?.startTimestamp
  const e = seg.duration?.endTimestamp
  if (!s || !e) return ''
  try {
    const ms = new Date(e) - new Date(s)
    if (ms < 60000) return `${Math.round(ms / 1000)} sec`
    if (ms < 3600000) return `${Math.round(ms / 60000)} min`
    return `${(ms / 3600000).toFixed(1)} hr`
  } catch {
    return ''
  }
}

// ── Generic / fallback ─────────────────────────────────────────────────────

function extractGenericFriendlyRecords(content, category) {
  if (!content || typeof content !== 'object') {
    return { records: [], mode: 'empty', overview: null }
  }
  if (Array.isArray(content)) {
    return { records: [], mode: 'array', overview: buildOverview(content) }
  }

  const records = []
  const label = CATEGORY_HEADER[category] || 'Archive'

  for (const [key, val] of Object.entries(content)) {
    if (val == null) continue
    if (Array.isArray(val) && val.length && typeof val[0] === 'object') {
      for (const item of val.slice(0, 200)) {
        const title =
          firstString(item, ['title', 'name', 'summary', 'fileName', 'url', 'virtual_url']) ||
          `${key.slice(0, 40)}…`
        const url = firstString(item, ['url', 'uri', 'link', 'virtual_url'])
        const time = firstDefined(item, ['time', 'timestamp', 'created', 'modified', 'date'])
        records.push({
          header: humanizeKey(key),
          title: String(title).slice(0, 200),
          titleUrl: url || undefined,
          time: typeof time === 'string' ? time : null,
        })
        if (records.length >= MAX_GENERIC_ROWS) break
      }
    }
    if (records.length >= MAX_GENERIC_ROWS) break
  }

  if (records.length) {
    return { records, mode: 'nested-array', overview: null }
  }

  const overview = buildOverview(content)
  if (overview.rows?.length) {
    records.push({
      header: label,
      title: overview.title || 'Data in this file',
      subtitle: overview.summaryLine,
      details: overview.rows,
    })
  }

  return { records, mode: records.length ? 'overview' : 'empty', overview }
}

const CATEGORY_HEADER = {
  youtube: 'YouTube',
  drive: 'Drive',
  activity: 'My Activity',
  chrome: 'Chrome',
  location: 'Location',
}

function buildOverview(content) {
  if (content == null) return { title: 'Empty file', rows: [], summaryLine: '' }
  if (Array.isArray(content)) {
    return {
      title: 'List data',
      summaryLine: `${content.length.toLocaleString()} entries in this list`,
      rows: [
        { label: 'Type', value: 'Array' },
        { label: 'Length', value: String(content.length) },
      ],
    }
  }
  if (typeof content !== 'object') {
    return {
      title: 'Value',
      summaryLine: String(content).slice(0, 200),
      rows: [],
    }
  }

  const keys = Object.keys(content)
  const rows = keys.slice(0, 24).map((k) => ({
    label: humanizeKey(k),
    value: previewValue(content[k]),
  }))
  return {
    title: 'What’s in this file',
    summaryLine: `${keys.length} top-level section${keys.length === 1 ? '' : 's'} · ${guessFormat(keys)}`,
    rows,
  }
}

function guessFormat(keys) {
  const j = keys.join(' ').toLowerCase()
  if (j.includes('browser') || j.includes('history')) return 'Looks like browser data'
  if (j.includes('location') || j.includes('semantic')) return 'Looks like location data'
  return 'Structured export from Google'
}

function summarizeFlatObject(obj, preferredKeys) {
  const rows = []
  for (const k of preferredKeys) {
    if (obj[k] !== undefined) {
      rows.push({ label: humanizeKey(k), value: formatPrimitive(obj[k]) })
    }
  }
  if (rows.length < 4) {
    for (const [k, v] of Object.entries(obj)) {
      if (rows.length >= 12) break
      if (preferredKeys.includes(k)) continue
      if (typeof v === 'object' && v !== null) continue
      rows.push({ label: humanizeKey(k), value: formatPrimitive(v) })
    }
  }
  return rows
}

function humanizeKey(k) {
  return String(k)
    .replace(/([A-Z])/g, ' $1')
    .replace(/[_-]+/g, ' ')
    .replace(/^\s+/, '')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/\b\w/g, (c) => c.toUpperCase())
}

function formatPrimitive(v) {
  if (v === null || v === undefined) return '—'
  if (typeof v === 'boolean') return v ? 'Yes' : 'No'
  if (typeof v === 'number') return String(v)
  if (typeof v === 'string') {
    if (/^\d{4}-\d{2}-\d{2}T/.test(v)) {
      try {
        return new Date(v).toLocaleString()
      } catch {
        /* fallthrough */
      }
    }
    return v.length > 120 ? `${v.slice(0, 117)}…` : v
  }
  return previewValue(v)
}

function previewValue(val) {
  if (val == null) return '—'
  if (Array.isArray(val)) return `List (${val.length} items)`
  if (typeof val === 'object') return `Group (${Object.keys(val).length} fields)`
  if (typeof val === 'boolean') return val ? 'Yes' : 'No'
  const s = String(val)
  return s.length > 100 ? `${s.slice(0, 97)}…` : s
}
