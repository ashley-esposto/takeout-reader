import { useState } from 'react'
import ExportMenu from './ExportMenu'
import { downloadBlob } from '../utils/exporters'

// Extensions we can usefully render as text in the browser.
const TEXT_EXTS = new Set([
  'json', 'csv', 'txt', 'html', 'htm', 'xml', 'vcf', 'ics',
  'md', 'log', 'tsv', 'js', 'css', 'srt', 'vtt', 'eml',
])

function extOf(name) {
  const m = /\.([a-z0-9]+)$/i.exec(name || '')
  return m ? m[1].toLowerCase() : ''
}

function baseName(name) {
  return (name || '').split('/').pop() || 'file'
}

/**
 * Universal fallback viewer for files the app doesn't have a dedicated reader
 * for. Lists every such file, previews text/JSON inline, and lets you download
 * the original or export the file inventory — so nothing in a Takeout archive
 * is hidden from a reviewer.
 */
export default function FilesViewer({ files }) {
  const [search, setSearch] = useState('')
  const [selected, setSelected] = useState(null)
  const [content, setContent] = useState('')
  const [status, setStatus] = useState('idle') // idle | loading | text | binary | error

  const filtered = files.filter(
    (f) => !search || f.name.toLowerCase().includes(search.toLowerCase())
  )

  async function openFile(file) {
    setSelected(file)
    const ext = extOf(file.name)
    if (!TEXT_EXTS.has(ext)) {
      setStatus('binary')
      setContent('')
      return
    }
    setStatus('loading')
    try {
      const raw = await file.getContent('string')
      let text = raw
      if (ext === 'json') {
        try { text = JSON.stringify(JSON.parse(raw), null, 2) } catch { /* keep raw */ }
      }
      setContent(text.slice(0, 200000))
      setStatus('text')
    } catch {
      setStatus('error')
      setContent('')
    }
  }

  async function downloadOriginal(file) {
    try {
      const blob = await file.getContent('blob')
      downloadBlob(baseName(file.name), blob)
    } catch { /* ignore */ }
  }

  return (
    <div className="reader-layout inner">
      <aside className="sidebar">
        <div className="sidebar-header">
          <span className="sidebar-title">{files.length.toLocaleString()} files</span>
          <input
            className="search-input"
            type="text"
            placeholder="Search file names…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
          <ExportMenu
            stem="file-list"
            columns={[{ key: 'name', label: 'File path' }]}
            getRows={() => filtered.map((f) => ({ name: f.name }))}
          />
        </div>
        <div className="email-list">
          {filtered.length === 0 && (
            <div className="email-list-empty">No files found.</div>
          )}
          {filtered.map((file, i) => (
            <div
              key={file.name + i}
              className={`email-item${selected === file ? ' active' : ''}`}
              onClick={() => openFile(file)}
            >
              <div className="email-subject">{baseName(file.name)}</div>
              <div className="email-snippet" style={{ fontSize: 11, color: 'var(--gm-text-sec)' }}>
                {file.name}
              </div>
            </div>
          ))}
        </div>
      </aside>

      <main className="detail-pane">
        {selected ? (
          <>
            <div className="detail-header">
              <div className="detail-subject">{baseName(selected.name)}</div>
              <div className="detail-fields">
                <div><strong>Path:</strong> {selected.name}</div>
              </div>
              <div className="detail-actions">
                <button
                  type="button"
                  className="detail-action-btn"
                  onClick={() => downloadOriginal(selected)}
                  title="Download the original file"
                >
                  <span className="gmi">download</span>
                  Download original
                </button>
              </div>
            </div>
            <div className="detail-body">
              {status === 'loading' && <p className="detail-loading">⏳ Loading…</p>}
              {status === 'text' && <pre className="body-plain" style={{ padding: '16px 24px' }}>{content}</pre>}
              {status === 'binary' && (
                <p className="detail-loading">
                  This file isn’t text. Use <strong>Download original</strong> to save it.
                </p>
              )}
              {status === 'error' && <p className="detail-loading">Could not read this file.</p>}
            </div>
          </>
        ) : (
          <div className="detail-empty">Select a file to preview it</div>
        )}
      </main>
    </div>
  )
}
