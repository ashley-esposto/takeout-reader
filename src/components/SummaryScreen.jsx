import { CATEGORY_META } from './CategoryNav'

/**
 * Post-upload overview. Lists every data type found in the archive with a
 * friendly label, description, and file count, so a non-technical reviewer can
 * see what's in the export and pick where to start. Nothing is parsed until a
 * card is opened, which keeps the landing fast even for huge mailboxes.
 */
export default function SummaryScreen({ categories, emailCount, categoryData, onOpen }) {
  const keys = Object.keys(categories || {})

  function detailFor(key) {
    const fileCount = categories[key]?.length || 0
    if (key === 'mail') {
      if (emailCount > 0) return `${emailCount.toLocaleString()} emails`
      return fileCount === 1 ? '1 mailbox' : `${fileCount} mailboxes`
    }
    const parsed = categoryData?.[key]?.length
    if (parsed) return `${parsed.toLocaleString()} items`
    return fileCount === 1 ? '1 file' : `${fileCount} files`
  }

  return (
    <div className="summary-screen">
      <div className="summary-head">
        <h1 className="summary-title">Your Google Takeout</h1>
        <p className="summary-sub">
          {keys.length} data {keys.length === 1 ? 'type' : 'types'} found. Pick a section to explore —
          everything stays on this computer.
        </p>
      </div>
      <div className="summary-grid">
        {keys.map((key) => {
          const meta = CATEGORY_META[key] || { label: key, icon: 'draft', description: 'Takeout data' }
          return (
            <button
              key={key}
              type="button"
              className="summary-card"
              onClick={() => onOpen(key)}
            >
              <span className="summary-card-icon">
                <span className="gmi" aria-hidden>{meta.icon}</span>
              </span>
              <span className="summary-card-body">
                <span className="summary-card-label">{meta.label}</span>
                <span className="summary-card-desc">{meta.description}</span>
                <span className="summary-card-count">{detailFor(key)}</span>
              </span>
              <span className="gmi summary-card-arrow" aria-hidden>chevron_right</span>
            </button>
          )
        })}
      </div>
    </div>
  )
}
