import { useState } from 'react'
import UploadZone from './components/UploadZone'
import EmailList from './components/EmailList'
import EmailDetail from './components/EmailDetail'
import ParseProgress from './components/ParseProgress'
import { useMboxWorker } from './hooks/useMboxWorker'

export default function App() {
  const [selectedEmail, setSelectedEmail] = useState(null)
  const [search, setSearch] = useState('')

  const { emails, parsing, progress, total, startParsing, cancelParsing } = useMboxWorker()

  const filtered = emails.filter((e) => {
    if (!search) return true
    const q = search.toLowerCase()
    return (
      (e.from || '').toLowerCase().includes(q) ||
      (e.subject || '').toLowerCase().includes(q) ||
      (e.snippet || '').toLowerCase().includes(q)
    )
  })

  return (
    <div className="app">
      {parsing && (
        <ParseProgress
          progress={progress}
          total={total}
          onCancel={cancelParsing}
        />
      )}

      {emails.length === 0 && !parsing ? (
        <div className="upload-screen">
          <h1 className="app-title">Takeout Reader</h1>
          <p className="app-subtitle">Drop a Google Takeout .zip or .mbox file to begin</p>
          <UploadZone onFile={startParsing} />
        </div>
      ) : (
        <div className="reader-layout">
          <aside className="sidebar">
            <div className="sidebar-header">
              <span className="sidebar-title">
                {emails.length.toLocaleString()} messages
              </span>
              <input
                className="search-input"
                type="text"
                placeholder="Search…"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
            </div>
            <EmailList
              emails={filtered}
              selected={selectedEmail}
              onSelect={setSelectedEmail}
            />
          </aside>
          <main className="detail-pane">
            {selectedEmail ? (
              <EmailDetail email={selectedEmail} />
            ) : (
              <div className="detail-empty">Select an email to read it</div>
            )}
          </main>
        </div>
      )}
    </div>
  )
}
