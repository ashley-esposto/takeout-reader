/**
 * Export helpers — turn result rows into downloadable CSV / JSON.
 *
 * CSV is the primary format for non-technical reviewers (opens in Excel/Sheets).
 * We defend against CSV formula injection: a cell beginning with = + - @ (or a
 * tab/CR) can execute as a formula when opened in a spreadsheet, so such values
 * are prefixed with a single quote. https://owasp.org/www-community/attacks/CSV_Injection
 */

const FORMULA_TRIGGER = /^[=+\-@\t\r]/

function sanitizeCell(value) {
  const s = value == null ? '' : String(value)
  return FORMULA_TRIGGER.test(s) ? `'${s}` : s
}

function csvEscape(value) {
  const s = sanitizeCell(value)
  // Quote when the value contains a comma, quote, or newline; double embedded quotes.
  if (/[",\r\n]/.test(s)) return `"${s.replace(/"/g, '""')}"`
  return s
}

/**
 * Serialize rows to a CSV string.
 * @param {Array<Object>} rows
 * @param {Array<{key: string, label?: string}>} columns - column order + headers
 */
export function toCSV(rows, columns) {
  const header = columns.map((c) => csvEscape(c.label ?? c.key)).join(',')
  const lines = rows.map((row) =>
    columns.map((c) => csvEscape(row[c.key])).join(',')
  )
  // CRLF line endings — most compatible with Excel.
  return [header, ...lines].join('\r\n')
}

/** Serialize rows to pretty-printed JSON. */
export function toJSON(rows) {
  return JSON.stringify(rows, null, 2)
}

/** Trigger a browser download of text content. */
export function downloadText(filename, content, mimeType) {
  const blob = new Blob([content], { type: `${mimeType};charset=utf-8` })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.click()
  URL.revokeObjectURL(url)
}

/** Build a filesystem-safe filename stem from a label. */
export function safeStem(label, fallback = 'export') {
  return String(label || '').trim().replace(/[^\w\-]+/g, '_').slice(0, 48) || fallback
}
