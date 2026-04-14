import { useState, useRef, useCallback, useEffect } from 'react'
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
import { scanTakeout, scanTakeoutFiles } from './utils/fileLoader'
import { parseICS } from './utils/icsParser'
import { parseVCF } from './utils/vcfParser'
import { parseChat } from './utils/chatParser'

const PAGE_SIZE = 300

/** Material Symbols names for Gmail-style folder labels */
function getLabelMaterialIcon(name) {
  switch (name) {
    case 'Inbox':               return 'inbox'
    case 'Sent':                return 'send'
    case 'Trash':               return 'delete'
    case 'Spam':                return 'report'
    case 'Starred':             return 'star'
    case 'Important':           return 'label_important'
    case 'Category Promotions': return 'sell'
    case 'Category Social':     return 'group'
    case 'Category Updates':    return 'notifications'
    case 'Category Forums':     return 'forum'
    case 'Category Personal':   return 'person'
    default:                    return 'label'
  }
}

function folderTitle(activeLabel) {
  if (activeLabel === 'All') return 'All Mail'
  return activeLabel
}

function folderToolbarIcon(activeLabel, searching) {
  if (searching) return 'search'
  if (activeLabel === 'All') return 'inbox'
  return getLabelMaterialIcon(activeLabel)
}

function GmailTopBar({ center, simple }) {
  return (
    <header className={`gmail-top-bar${simple ? ' gmail-top-bar--simple' : ''}`}>
      <div className="gmail-top-left">
        {!simple && (
          <button type="button" className="gmail-menu-btn" aria-label="Main menu" title="Menu">
            <span className="gmi">menu</span>
          </button>
        )}
        <div className="gmail-brand celigo-brand-lockup">
          <span className="celigo-wordmark">celigo</span>
          <span className="celigo-brand-divider" aria-hidden />
          <div className="gmail-product-block">
            <span className="gmail-product-name">Takeout Reader</span>
            <span className="gmail-product-sub">Google Takeout archive viewer</span>
          </div>
        </div>
      </div>
      {center}
      <div className="gmail-top-right">
        <span className="gmail-privacy-hint">Runs locally in your browser</span>
      </div>
    </header>
  )
}

export default function App() {
  const [takeout, setTakeout]               = useState(null)
  const [scanError, setScanError]           = useState(null)
  const [activeCategory, setActiveCategory] = useState(null)
  const [categoryData, setCategoryData]     = useState({})
  const [loadingCategory, setLoadingCategory] = useState(null)

  const [labels, setLabels]         = useState([])
  const [activeLabel, setActiveLabel] = useState('All')

  const emailsMap     = useRef(new Map())
  const loadingPages  = useRef(new Set())
  const [emailsVersion, setEmailsVersion]   = useState(0)

  const [emailSearch, setEmailSearch]       = useState('')
  const [searchResults, setSearchResults]   = useState(null)
  const [searchTotal, setSearchTotal]       = useState(0)
  const [searchLoading, setSearchLoading]   = useState(false)
  const searchDebounce = useRef(null)

  const [selectedEmail, setSelectedEmail]   = useState(null)
  const [bodyLoading, setBodyLoading]       = useState(false)
  const loadedBodies  = useRef(new Map())
  const mailSearchInputRef = useRef(null)
  const pendingSelectIndexRef = useRef(null)
  const [keyboardHelpOpen, setKeyboardHelpOpen] = useState(false)

  const { totalEmails, parsing, progress, startParsing, loadPage, searchEmails, loadEmailBody, cancelParsing, getLabels } = useMboxWorker()

  useEffect(() => {
    if (totalEmails > 0 && activeCategory === 'mail') {
      fetchEmailRange(0, Math.min(PAGE_SIZE, totalEmails))
      getLabels().then(r => setLabels(r.labels)).catch(console.error)
    }
  }, [totalEmails]) // eslint-disable-line

  const fetchEmailRange = useCallback(async (start, count, labelFilter) => {
    const key = `${labelFilter || 'All'}:${start}`
    if (loadingPages.current.has(key)) return
    let allPresent = true
    for (let i = start; i < start + count; i++) {
      if (!emailsMap.current.has(i)) { allPresent = false; break }
    }
    if (allPresent) return

    loadingPages.current.add(key)
    try {
      const result = await loadPage(start, count, labelFilter)
      result.emails.forEach((email, i) => {
        emailsMap.current.set(start + i, email)
      })
      setEmailsVersion(v => v + 1)
    } catch (err) {
      console.error('Page load error:', err)
    } finally {
      loadingPages.current.delete(key)
    }
  }, [loadPage, totalEmails])

  const handleNeedRange = useCallback((start, end) => {
    const from = Math.floor(start / PAGE_SIZE) * PAGE_SIZE
    const to   = Math.ceil(end   / PAGE_SIZE) * PAGE_SIZE
    const lf   = activeLabel === 'All' ? null : activeLabel
    for (let s = from; s < to; s += PAGE_SIZE) {
      fetchEmailRange(s, PAGE_SIZE, lf)
    }
  }, [fetchEmailRange, activeLabel])

  const handleLabelSelect = useCallback((label) => {
    emailsMap.current.clear()
    loadingPages.current.clear()
    setEmailsVersion(v => v + 1)
    setActiveLabel(label)
    setEmailSearch('')
    setSearchResults(null)
    setSearchTotal(0)
    setSelectedEmail(null)
    const lf = label === 'All' ? null : label
    fetchEmailRange(0, PAGE_SIZE, lf)
  }, [fetchEmailRange])

  useEffect(() => {
    let cancelled = false
    clearTimeout(searchDebounce.current)
    if (!emailSearch.trim()) {
      setSearchResults(null)
      setSearchTotal(0)
      setSearchLoading(false)
      return () => { cancelled = true }
    }
    setSearchLoading(true)
    const q = emailSearch.trim()
    const lf = activeLabel === 'All' ? null : activeLabel
    searchDebounce.current = setTimeout(async () => {
      try {
        const result = await searchEmails(q, 0, 2000, lf)
        if (cancelled) return
        setSearchResults(result.emails ?? [])
        setSearchTotal(result.total ?? 0)
      } catch (err) {
        console.error('Search error:', err)
        if (!cancelled) {
          setSearchResults([])
          setSearchTotal(0)
        }
      } finally {
        if (!cancelled) setSearchLoading(false)
      }
    }, 350)
    return () => {
      cancelled = true
      clearTimeout(searchDebounce.current)
    }
  }, [emailSearch, searchEmails, activeLabel])

  const handleEmailSelect = useCallback(async (email) => {
    const emailIndex = email._emailIndex

    if (loadedBodies.current.has(emailIndex)) {
      setSelectedEmail(loadedBodies.current.get(emailIndex))
      return
    }

    setSelectedEmail(email)

    if (!email._bodyLoaded) {
      setBodyLoading(true)
      try {
        const result = await loadEmailBody(emailIndex)
        const merged = { ...email, ...result.email, _bodyLoaded: true }
        loadedBodies.current.set(emailIndex, merged)
        setSelectedEmail(merged)
      } catch (err) {
        console.error('Body load error:', err)
      } finally {
        setBodyLoading(false)
      }
    }
  }, [loadEmailBody])

  useEffect(() => {
    const p = pendingSelectIndexRef.current
    if (p == null) return
    const em = emailsMap.current.get(p)
    if (em) {
      pendingSelectIndexRef.current = null
      handleEmailSelect(em)
    }
  }, [emailsVersion, handleEmailSelect])

  const goAdjacentEmail = useCallback((delta) => {
    if (totalEmails <= 0) return
    const lf = activeLabel === 'All' ? null : activeLabel
    const haveSearchResults =
      Boolean(emailSearch.trim() && (searchLoading || searchResults !== null)) &&
      Array.isArray(searchResults) &&
      searchResults.length > 0

    if (haveSearchResults) {
      const list = searchResults
      let nextPos
      if (!selectedEmail) {
        nextPos = delta > 0 ? 0 : list.length - 1
      } else {
        const curIdx = list.findIndex((e) => e._emailIndex === selectedEmail._emailIndex)
        if (curIdx < 0) return
        nextPos = curIdx + delta
      }
      if (nextPos < 0 || nextPos >= list.length) return
      handleEmailSelect(list[nextPos])
      return
    }

    const count = activeLabel === 'All'
      ? totalEmails
      : (labels.find((l) => l.name === activeLabel)?.count ?? totalEmails)
    const maxIdx = Math.max(0, count - 1)

    let nextIdx
    if (selectedEmail == null) {
      nextIdx = delta > 0 ? 0 : maxIdx
    } else {
      nextIdx = selectedEmail._emailIndex + delta
    }
    if (nextIdx < 0 || nextIdx > maxIdx) return

    const em = emailsMap.current.get(nextIdx)
    if (em) {
      handleEmailSelect(em)
      return
    }
    pendingSelectIndexRef.current = nextIdx
    const pageStart = Math.floor(nextIdx / PAGE_SIZE) * PAGE_SIZE
    fetchEmailRange(pageStart, PAGE_SIZE, lf)
  }, [
    activeLabel,
    emailSearch,
    fetchEmailRange,
    handleEmailSelect,
    labels,
    searchLoading,
    searchResults,
    selectedEmail,
    totalEmails,
  ])

  useEffect(() => {
    if (activeCategory !== 'mail' || !takeout) return undefined

    const onKey = (e) => {
      const t = e.target
      const typing =
        t instanceof HTMLInputElement ||
        t instanceof HTMLTextAreaElement ||
        (t instanceof HTMLElement && t.isContentEditable)

      if (keyboardHelpOpen) {
        if (e.key === 'Escape') {
          e.preventDefault()
          setKeyboardHelpOpen(false)
        }
        return
      }

      if (!typing && e.key === '?') {
        e.preventDefault()
        setKeyboardHelpOpen(true)
        return
      }

      if (!typing) {
        if (e.key === '/' && !e.ctrlKey && !e.metaKey && !e.altKey) {
          e.preventDefault()
          mailSearchInputRef.current?.focus()
          return
        }
        if (e.key === 'j' || e.key === 'J') {
          if (!e.ctrlKey && !e.metaKey && !e.altKey) {
            e.preventDefault()
            goAdjacentEmail(1)
          }
          return
        }
        if (e.key === 'k' || e.key === 'K') {
          if (!e.ctrlKey && !e.metaKey && !e.altKey) {
            e.preventDefault()
            goAdjacentEmail(-1)
          }
          return
        }
      }

      if (e.key === 'Escape' && typing && t === mailSearchInputRef.current) {
        t.blur()
        if (emailSearch.trim()) setEmailSearch('')
      }
    }

    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [activeCategory, takeout, keyboardHelpOpen, goAdjacentEmail, emailSearch])

  async function handleFiles(fileList) {
    const files = Array.from(fileList || []).filter(Boolean)
    if (files.length === 0) return

    cancelParsing()
    setScanError(null)
    setTakeout(null)
    setCategoryData({})
    setActiveCategory(null)
    emailsMap.current.clear()
    loadingPages.current.clear()
    loadedBodies.current.clear()
    setEmailsVersion(0)
    setSearchResults(null)
    setSearchLoading(false)
    setEmailSearch('')
    setSelectedEmail(null)
    setLabels([])
    setActiveLabel('All')

    let result
    try {
      result = files.length === 1 ? await scanTakeout(files[0]) : await scanTakeoutFiles(files)
    } catch (err) {
      setScanError(err.message)
      return
    }

    setTakeout(result)
    const firstKey = Object.keys(result.categories)[0]
    if (firstKey) loadCategory(firstKey, result.categories[firstKey], { forceMailReload: true })
  }

  const loadCategory = useCallback(async (key, entries, options = {}) => {
    const forceMailReload = options.forceMailReload === true
    setActiveCategory(key)
    setSelectedEmail(null)
    setEmailSearch('')
    setSearchResults(null)

    if (key === 'mail' && totalEmails > 0 && !forceMailReload) return
    if (key !== 'mail' && categoryData[key] !== undefined) return

    setLoadingCategory(key)

    try {
      if (key === 'mail') {
        const fileHandles = entries.map((e) => e.file).filter(Boolean)
        if (fileHandles.length > 0) {
          startParsing(fileHandles.length === 1 ? fileHandles[0] : fileHandles)
        } else {
          const contents = await Promise.all(entries.map((e) => e.getContent('string')))
          startParsing(contents.join('\n\n'))
        }
        setLoadingCategory(null)
        return
      }

      if (key === 'chat') {
        const files = []
        for (const entry of entries) {
          try {
            const text = await entry.getContent('string')
            files.push({ name: entry.name, data: JSON.parse(text) })
          } catch { /* skip */ }
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
  }, [categoryData, totalEmails, startParsing]) // eslint-disable-line

  function handleCategorySelect(key) {
    if (!takeout) return
    loadCategory(key, takeout.categories[key] || [])
  }

  const inSearchMode   = Boolean(emailSearch.trim())
  const isSearching    = Boolean(inSearchMode && (searchLoading || searchResults !== null))
  const labelTotal     = activeLabel === 'All' ? totalEmails : (labels.find(l => l.name === activeLabel)?.count ?? totalEmails)
  const displayTotal   = isSearching ? searchTotal : labelTotal
  const displayEmails  = isSearching ? searchResults : null

  const exportSearchResults = useCallback(() => {
    if (!searchResults?.length) return
    const rows = searchResults.map((e) => ({
      index: e._emailIndex,
      from: e.from,
      to: e.to,
      subject: e.subject,
      date: e.date,
      snippet: e.snippet,
      labels: e._labels,
    }))
    const safe = emailSearch.trim().replace(/[^\w\-]+/g, '_').slice(0, 48) || 'query'
    const blob = new Blob([JSON.stringify(rows, null, 2)], { type: 'application/json' })
    const a = document.createElement('a')
    const url = URL.createObjectURL(blob)
    a.href = url
    a.download = `celigo-takeout-search-${safe}.json`
    a.click()
    URL.revokeObjectURL(url)
  }, [searchResults, emailSearch])

  const mailSearchBar = takeout && activeCategory === 'mail' ? (
    <div className="gmail-search-wrap">
      <label className="gmail-search-inner" htmlFor="mail-search-input">
        <span className="gmi" aria-hidden>search</span>
        <input
          ref={mailSearchInputRef}
          id="mail-search-input"
          className="gmail-search-input"
          type="search"
          placeholder="Search mail"
          autoComplete="off"
          value={emailSearch}
          onChange={(e) => setEmailSearch(e.target.value)}
        />
      </label>
    </div>
  ) : (
    <div className="gmail-search-wrap" aria-hidden />
  )

  if (!takeout) {
    return (
      <div className="gmail-app">
        <GmailTopBar simple />
        <div className="upload-screen">
          <h1 className="app-title">Open your <strong>Google Takeout</strong></h1>
          <p className="app-subtitle">
            Drop Takeout .zip archives and/or Gmail .mbox files — the same exports you get from Google.
            Everything stays on this computer.
          </p>
          <UploadZone onFiles={handleFiles} />
          {scanError && <p className="upload-error">{scanError}</p>}
        </div>
      </div>
    )
  }

  return (
    <div className="gmail-app">
      <GmailTopBar center={mailSearchBar} />

      {(parsing || loadingCategory) && (
        <ParseProgress
          progress={progress}
          total={0}
          label={
            loadingCategory === 'mail' || parsing
              ? `Scanning mailbox… ${progress.toLocaleString()} emails found`
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
          emailCount={totalEmails}
          categoryData={categoryData}
        />

        <div className="category-area">
          {activeCategory === 'mail' && (
            <div className="mail-split">
              <aside className="mail-sidebar" aria-label="Labels">
                <div className="label-nav">
                  <button
                    type="button"
                    className={`label-item${activeLabel === 'All' ? ' active' : ''}`}
                    onClick={() => handleLabelSelect('All')}
                  >
                    <span className="label-icon">
                      <span className="gmi">email</span>
                    </span>
                    <span className="label-name">All Mail</span>
                    <span className="label-count">{totalEmails.toLocaleString()}</span>
                  </button>
                  {labels.map(({ name, count }) => (
                    <button
                      type="button"
                      key={name}
                      className={`label-item${activeLabel === name ? ' active' : ''}`}
                      onClick={() => handleLabelSelect(name)}
                    >
                      <span className="label-icon">
                        <span className="gmi">{getLabelMaterialIcon(name)}</span>
                      </span>
                      <span className="label-name">{name}</span>
                      <span className="label-count">{count.toLocaleString()}</span>
                    </button>
                  ))}
                </div>
              </aside>

              <div className="mail-list-column">
                <div className="mail-folder-toolbar">
                  <div className="mail-folder-toolbar-main">
                    <span className="gmi">{folderToolbarIcon(activeLabel, inSearchMode)}</span>
                    <h2 className="mail-folder-title">
                      {inSearchMode ? 'Search results' : folderTitle(activeLabel)}
                    </h2>
                    <span className="mail-folder-meta">
                      {inSearchMode
                        ? (searchLoading ? 'Searching…' : `${searchTotal.toLocaleString()} found`)
                        : `${displayTotal.toLocaleString()} conversations`}
                    </span>
                  </div>
                  <div className="mail-folder-toolbar-actions">
                    {isSearching && !searchLoading && searchResults && searchResults.length > 0 && (
                      <button
                        type="button"
                        className="mail-toolbar-btn"
                        onClick={exportSearchResults}
                        title="Download the current result list as JSON"
                      >
                        <span className="gmi">download</span>
                        <span>Export</span>
                      </button>
                    )}
                    <span className="mail-toolbar-hint" title="Keyboard shortcuts">
                      / search · j/k · ? help
                    </span>
                  </div>
                </div>
                <EmailList
                  total={displayTotal}
                  emailMap={emailsMap.current}
                  emailsVersion={emailsVersion}
                  searchEmails={displayEmails}
                  searchLoading={searchLoading && inSearchMode}
                  onNeedRange={handleNeedRange}
                  selected={selectedEmail}
                  onSelect={handleEmailSelect}
                />
              </div>

              <main className="detail-pane">
                {selectedEmail ? (
                  <EmailDetail email={selectedEmail} bodyLoading={bodyLoading} />
                ) : (
                  <div className="detail-empty">
                    Select a message to read
                  </div>
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
            <ActivityViewer items={categoryData[activeCategory] || []} category={activeCategory} />
          )}
          {!activeCategory && (
            <div className="detail-empty">Choose a section from the left — same idea as switching apps in Google</div>
          )}
        </div>
      </div>

      {keyboardHelpOpen && (
        <div
          className="keyboard-help-overlay"
          role="dialog"
          aria-modal="true"
          aria-labelledby="keyboard-help-title"
          onClick={(e) => {
            if (e.target === e.currentTarget) setKeyboardHelpOpen(false)
          }}
        >
          <div className="keyboard-help-card" onClick={(e) => e.stopPropagation()}>
            <h2 id="keyboard-help-title">Mail shortcuts</h2>
            <ul className="keyboard-help-list">
              <li><kbd>/</kbd> Focus search</li>
              <li><kbd>j</kbd> Next message</li>
              <li><kbd>k</kbd> Previous message</li>
              <li><kbd>?</kbd> This help</li>
              <li><kbd>Esc</kbd> Close help or clear search</li>
            </ul>
            <button
              type="button"
              className="keyboard-help-close"
              onClick={() => setKeyboardHelpOpen(false)}
            >
              Close
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
