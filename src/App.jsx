import { useState, useCallback } from 'react'
import UploadZone from './components/UploadZone'
import ParseProgress from './components/ParseProgress'
import CategoryNav from './components/CategoryNav'
import EmailList from './components/EmailList'
import EmailDetail from './components/EmailDetail'
import ChatViewer from './components/ChatViewer'
import CalendarViewer from './components/CalendarViewer'
import ContactsViewer from './components/ContactsViewer'
import ActivityViewer from './components/ActivityViewer'
import { useMboxWorker } from './hooks/useMboxWorker'
import { scanTakeout } from './utils/fileLoader'
import { parseICS } from './utils/icsParser'
import { parseVCF } from './utils/vcfParser'
import { parseChat } from './utils/chatParser'

export default function App() {
  const [takeout, setTakeout] = useState(null)         // { type, categories }
  const [scanError, setScanError] = useState(null)
  const [activeCategory, setActiveCategory] = useState(null)
  const [categoryData, setCategoryData] = useState({}) // parsed data per category
  const [loadingCategory, setLoadingCategory] = useState(null)
  const [selectedEmail, setSelectedEmail] = useState(null)
  const [emailSearch, setEmailSearch] = useState('')

  const { emails, parsing, progress, total, startParsing, cancelParsing } = useMboxWorker()

  // ── File upload handler ──────────────────────────────────────────────────
  async function handleFile(file) {
    setScanError(null)
    setTakeout(null)
    setCategoryData({})
    setActiveCategory(null)

    let result
    try {
      result = await scanTakeout(file)
    } catch (err) {
      setScanError(err.message)
      return
    }

    setTakeout(result)
    // Auto-select the first category
    const firstKey = Object.keys(result.categories)[0]
    if (firstKey) {
      loadCategory(firstKey, result.categories[firstKey])
    }
  }

  // ── Category loader (lazy per-category parsing) ──────────────────────────
  const loadCategory = useCallback(async (key, entries) => {
    setActiveCategory(key)
    setSelectedEmail(null)
    setEmailSearch('')

    // Already loaded?
    if (key === 'mail' && emails.length > 0) return
    if (key !== 'mail' && categoryData[key] !== undefined) return

    setLoadingCategory(key)

    try {
      if (key === 'mail') {
        // Large — use Web Worker
        const contents = await Promise.all(entries.map((e) => e.getContent('string')))
        startParsing(contents.join('\n'))
        // Worker sets parsing=true; loadingCategory cleared below
        setLoadingCategory(null)
        return
      }

      if (key === 'chat') {
        const files = []
        for (const entry of entries) {
          try {
            const text = await entry.getContent('string')
            files.push({ name: entry.name, data: JSON.parse(text) })
          } catch { /* skip unparseable entries */ }
        }
        setCategoryData((prev) => ({ ...prev, chat: parseChat(files) }))

      } else if (key === 'calendar') {
        const events = []
        for (const entry of entries) {
          const text = await entry.getContent('string')
          events.push(...parseICS(text))
        }
        setCategoryData((prev) => ({ ...prev, calendar: events }))

      } else if (key === 'contacts') {
        const contacts = []
        for (const entry of entries) {
          const text = await entry.getContent('string')
          contacts.push(...parseVCF(text))
        }
        setCategoryData((prev) => ({ ...prev, contacts }))

      } else {
        // activity, location, chrome, youtube, drive — load up to 10 files as JSON/text
        const items = []
        for (const entry of entries.slice(0, 10)) {
          try {
            const text = await entry.getContent('string')
            let content
            try { content = JSON.parse(text) } catch { content = text }
            items.push({ name: entry.name, content, raw: text })
          } catch { /* skip */ }
        }
        setCategoryData((prev) => ({ ...prev, [key]: items }))
      }
    } catch (err) {
      console.error(`Error loading category "${key}":`, err)
      setCategoryData((prev) => ({ ...prev, [key]: [] }))
    } finally {
      setLoadingCategory(null)
    }
  }, [categoryData, emails.length, startParsing]) // eslint-disable-line

  // ── Category nav click ───────────────────────────────────────────────────
  function handleCategorySelect(key) {
    if (!takeout) return
    loadCategory(key, takeout.categories[key] || [])
  }

  // ── Filtered emails ──────────────────────────────────────────────────────
  const filteredEmails = emails.filter((e) => {
    if (!emailSearch) return true
    const q = emailSearch.toLowerCase()
    return (
      (e.from || '').toLowerCase().includes(q) ||
      (e.subject || '').toLowerCase().includes(q) ||
      (e.snippet || '').toLowerCase().includes(q)
    )
  })

  // ── Upload screen ────────────────────────────────────────────────────────
  if (!takeout) {
    return (
      <div className="app">
        <div className="upload-screen">
          <h1 className="app-title">Takeout Reader</h1>
          <p className="app-subtitle">
            Drop a Google Takeout .zip or a Gmail .mbox file to begin
          </p>
          <UploadZone onFile={handleFile} />
          {scanError && (
            <p className="upload-error">{scanError}</p>
          )}
        </div>
      </div>
    )
  }

  // ── Reader screen ────────────────────────────────────────────────────────
  return (
    <div className="app">
      {(parsing || loadingCategory) && (
        <ParseProgress
          progress={progress}
          total={total}
          label={
            loadingCategory === 'mail' || parsing
              ? 'Parsing mailbox…'
              : `Loading ${loadingCategory}…`
          }
          onCancel={parsing ? cancelParsing : null}
        />
      )}

      <div className="reader-layout">
        <CategoryNav
          categories={takeout.categories}
          active={activeCategory}
          onSelect={handleCategorySelect}
          emailCount={emails.length}
          categoryData={categoryData}
        />

        <div className="category-area">
          {activeCategory === 'mail' && (
            <div className="reader-layout inner">
              <aside className="sidebar">
                <div className="sidebar-header">
                  <span className="sidebar-title">
                    {emails.length.toLocaleString()} messages
                  </span>
                  <input
                    className="search-input"
                    type="text"
                    placeholder="Search…"
                    value={emailSearch}
                    onChange={(e) => setEmailSearch(e.target.value)}
                  />
                </div>
                <EmailList
                  emails={filteredEmails}
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

          {activeCategory === 'chat' && (
            <ChatViewer conversations={categoryData.chat || []} />
          )}

          {activeCategory === 'calendar' && (
            <CalendarViewer events={categoryData.calendar || []} />
          )}

          {activeCategory === 'contacts' && (
            <ContactsViewer contacts={categoryData.contacts || []} />
          )}

          {['activity', 'location', 'chrome', 'youtube', 'drive'].includes(activeCategory) && (
            <ActivityViewer
              items={categoryData[activeCategory] || []}
              category={activeCategory}
            />
          )}

          {!activeCategory && (
            <div className="detail-empty">Select a data category from the left</div>
          )}
        </div>
      </div>
    </div>
  )
}
