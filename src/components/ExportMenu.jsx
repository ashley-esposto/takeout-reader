import { toCSV, toJSON, downloadText, safeStem } from '../utils/exporters'

/**
 * Reusable CSV / JSON export control.
 *
 * @param {() => Array<Object>} getRows - returns the rows to export (computed
 *   lazily on click so it always reflects the current filtered view)
 * @param {Array<{key:string,label?:string}>} columns - column order + headers
 * @param {string} stem - filename stem (sanitized)
 */
export default function ExportMenu({ getRows, columns, stem }) {
  const run = (format) => {
    const rows = getRows() || []
    if (rows.length === 0) return
    const base = `celigo-takeout-${safeStem(stem, 'export')}`
    if (format === 'csv') {
      downloadText(`${base}.csv`, toCSV(rows, columns), 'text/csv')
    } else {
      downloadText(`${base}.json`, toJSON(rows), 'application/json')
    }
  }

  return (
    <div className="mail-export-group" role="group" aria-label="Export data">
      <button
        type="button"
        className="mail-toolbar-btn"
        onClick={() => run('csv')}
        title="Download this list as a CSV spreadsheet (opens in Excel)"
      >
        <span className="gmi">download</span>
        <span>Export CSV</span>
      </button>
      <button
        type="button"
        className="mail-toolbar-btn mail-toolbar-btn--secondary"
        onClick={() => run('json')}
        title="Download this list as JSON"
      >
        JSON
      </button>
    </div>
  )
}
