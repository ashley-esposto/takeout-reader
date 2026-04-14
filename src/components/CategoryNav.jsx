const CATEGORY_META = {
  mail:     { label: 'Mail',             icon: 'mail' },
  chat:     { label: 'Chat',             icon: 'chat' },
  calendar: { label: 'Calendar',         icon: 'calendar_month' },
  contacts: { label: 'Contacts',         icon: 'contacts' },
  activity: { label: 'My Activity',      icon: 'history' },
  location: { label: 'Location',         icon: 'location_on' },
  chrome:   { label: 'Chrome',           icon: 'language' },
  youtube:  { label: 'YouTube',          icon: 'play_circle' },
  drive:    { label: 'Drive',            icon: 'folder' },
}

export default function CategoryNav({ categories, active, onSelect, emailCount, categoryData }) {
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
