export const CATEGORY_META = {
  mail:     { label: 'Mail',             icon: 'mail',          description: 'Emails from your Gmail export' },
  chat:     { label: 'Chat',             icon: 'chat',          description: 'Google Chat & Hangouts conversations' },
  calendar: { label: 'Calendar',         icon: 'calendar_month', description: 'Events and meetings' },
  contacts: { label: 'Contacts',         icon: 'contacts',      description: 'Saved contacts and details' },
  activity: { label: 'My Activity',      icon: 'history',       description: 'Your Google activity timeline' },
  location: { label: 'Location',         icon: 'location_on',   description: 'Location history' },
  chrome:   { label: 'Chrome',           icon: 'language',      description: 'Browsing history and data' },
  youtube:  { label: 'YouTube',          icon: 'play_circle',   description: 'Watch and search history' },
  drive:    { label: 'Drive',            icon: 'folder',        description: 'Drive file activity' },
  other:    { label: 'Other files',      icon: 'draft',         description: 'Everything else in the archive' },
}

export default function CategoryNav({ categories, active, onSelect, onOverview, emailCount, categoryData }) {
  const available = Object.keys(categories)

  function getCount(key) {
    if (key === 'mail') return emailCount > 0 ? emailCount : null
    const data = categoryData[key]
    if (!data || data.length === 0) return null
    return data.length
  }

  return (
    <nav className="category-nav" aria-label="Takeout data">
      <div className="category-nav-header">Google Takeout</div>
      <button
        type="button"
        className={`category-item${active == null ? ' active' : ''}`}
        onClick={onOverview}
      >
        <span className="category-icon">
          <span className="gmi" aria-hidden>grid_view</span>
        </span>
        <span className="category-label">Overview</span>
      </button>
      {available.map((key) => {
        const meta = CATEGORY_META[key] || { label: key, icon: 'draft' }
        const count = getCount(key)
        return (
          <button
            key={key}
            type="button"
            className={`category-item${active === key ? ' active' : ''}`}
            onClick={() => onSelect(key)}
          >
            <span className="category-icon">
              <span className="gmi" aria-hidden>{meta.icon}</span>
            </span>
            <span className="category-label">{meta.label}</span>
            {count != null && (
              <span className="category-count">{count.toLocaleString()}</span>
            )}
          </button>
        )
      })}
    </nav>
  )
}
