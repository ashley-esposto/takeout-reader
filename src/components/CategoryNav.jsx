const CATEGORY_META = {
  mail:     { label: 'Gmail',            icon: '✉️' },
  chat:     { label: 'Chat & Hangouts',  icon: '💬' },
  calendar: { label: 'Calendar',         icon: '📅' },
  contacts: { label: 'Contacts',         icon: '👤' },
  activity: { label: 'My Activity',      icon: '🔍' },
  location: { label: 'Location History', icon: '📍' },
  chrome:   { label: 'Chrome',           icon: '🌐' },
  youtube:  { label: 'YouTube',          icon: '▶️' },
  drive:    { label: 'Drive',            icon: '📁' },
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
    <nav className="category-nav">
      <div className="category-nav-header">Takeout Data</div>
      {available.map((key) => {
        const meta = CATEGORY_META[key] || { label: key, icon: '📄' }
        const count = getCount(key)
        return (
          <button
            key={key}
            className={`category-item${active === key ? ' active' : ''}`}
            onClick={() => onSelect(key)}
          >
            <span className="category-icon">{meta.icon}</span>
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
