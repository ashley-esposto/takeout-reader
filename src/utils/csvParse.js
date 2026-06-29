/**
 * Minimal, dependency-free CSV parser for Drive exports and other tabular
 * Takeout files. Handles quoted fields, embedded commas/newlines, and escaped
 * double-quotes ("" inside a quoted field), per RFC 4180.
 *
 * Returns { columns, rows } where columns is the header row (string[]) and rows
 * is an array of string[] aligned to the columns. If the file has no clear
 * header it still returns every parsed row with synthetic "Column N" headers.
 */
export function parseCSV(text, { maxRows = 100000 } = {}) {
  if (typeof text !== 'string' || text.trim() === '') {
    return { columns: [], rows: [] }
  }

  const records = parseRecords(text, maxRows + 1)
  if (records.length === 0) return { columns: [], rows: [] }

  const header = records[0]
  const body = records.slice(1)

  // Treat the first row as a header when it looks like labels (no purely
  // numeric-only header is unusual but allowed). Normalize ragged rows to the
  // header width so the table renders cleanly.
  const width = header.length
  const columns = header.map((h, i) => (h && h.trim()) || `Column ${i + 1}`)
  const rows = body.map((r) => {
    if (r.length === width) return r
    const out = r.slice(0, width)
    while (out.length < width) out.push('')
    return out
  })

  return { columns, rows }
}

/** Parse CSV text into an array of records (each an array of field strings). */
function parseRecords(text, maxRecords = Infinity) {
  const records = []
  let field = ''
  let row = []
  let inQuotes = false
  let i = 0
  const n = text.length

  const pushField = () => { row.push(field); field = '' }
  const pushRow = () => { pushField(); records.push(row); row = [] }

  while (i < n) {
    const c = text[i]

    if (inQuotes) {
      if (c === '"') {
        if (text[i + 1] === '"') { field += '"'; i += 2; continue }
        inQuotes = false; i++; continue
      }
      field += c; i++; continue
    }

    if (c === '"') { inQuotes = true; i++; continue }
    if (c === ',') { pushField(); i++; continue }
    if (c === '\r') { i++; continue } // normalize CRLF — \n handles the break
    if (c === '\n') {
      pushRow()
      if (records.length >= maxRecords) return records
      i++
      continue
    }
    field += c; i++
  }

  // Flush trailing field/row (file may not end with a newline). Skip a final
  // empty row produced by a trailing newline.
  if (field !== '' || row.length > 0) pushRow()
  return records
}

/** Quick heuristic: does this text look like CSV (vs HTML/JSON/plain prose)? */
export function looksLikeCSV(text, fileName = '') {
  if ((fileName || '').toLowerCase().endsWith('.csv')) return true
  if (typeof text !== 'string') return false
  const head = text.slice(0, 2000)
  if (/^\s*[[{]/.test(head)) return false       // JSON
  if (/<html|<!doctype|<table/i.test(head)) return false // HTML
  const firstLine = head.split(/\r?\n/)[0] || ''
  return firstLine.includes(',') && /\r?\n/.test(head)
}
