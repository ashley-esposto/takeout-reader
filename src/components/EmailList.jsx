export default function EmailList({ emails, selected, onSelect }) {
  if (emails.length === 0) {
    return <div className="email-list-empty">No messages match your search.</div>
  }

  return (
    <div className="email-list">
      {emails.map((email, i) => (
        <div
          key={i}
          className={`email-item${selected === email ? ' active' : ''}`}
          onClick={() => onSelect(email)}
        >
          <div className="email-from">{email.from || '(no sender)'}</div>
          <div className="email-subject">{email.subject || '(no subject)'}</div>
          <div className="email-meta">
            <span className="email-snippet">{email.snippet}</span>
            <span className="email-date">{formatDate(email.date)}</span>
          </div>
        </div>
      ))}
    </div>
  )
}

function formatDate(dateStr) {
  if (!dateStr) return ''
  try {
    const d = new Date(dateStr)
    if (isNaN(d)) return dateStr
    return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })
  } catch {
    return dateStr
  }
}
