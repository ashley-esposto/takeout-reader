import { useState } from 'react'

export default function CalendarViewer({ events }) {
  const [selected, setSelected] = useState(null)
  const [search, setSearch] = useState('')

  const sorted = [...events].sort((a, b) => {
    if (!a.start) return 1
    if (!b.start) return -1
    return new Date(b.start) - new Date(a.start)
  })

  const filtered = sorted.filter(
    (e) =>
      !search ||
      (e.summary || '').toLowerCase().includes(search.toLowerCase()) ||
      (e.description || '').toLowerCase().includes(search.toLowerCase()) ||
      (e.location || '').toLowerCase().includes(search.toLowerCase())
  )

  return (
    <div className="reader-layout inner">
      <aside className="sidebar">
        <div className="sidebar-header">
          <span className="sidebar-title">{events.length.toLocaleString()} events</span>
          <input
            className="search-input"
            type="text"
            placeholder="Search…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        <div className="email-list">
          {filtered.length === 0 && (
            <div className="email-list-empty">No events found.</div>
          )}
          {filtered.map((event, i) => (
            <div
              key={i}
              className={`email-item${selected === event ? ' active' : ''}`}
              onClick={() => setSelected(event)}
            >
              <div className="email-from">{formatDate(event.start)}</div>
              <div className="email-subject">{event.summary}</div>
              {event.location && (
                <div className="email-snippet" style={{ fontSize: 11, color: 'var(--text-muted)' }}>
                  📍 {event.location}
                </div>
              )}
            </div>
          ))}
        </div>
      </aside>

      <main className="detail-pane">
        {selected ? (
          <div>
            <div className="detail-header">
              <div className="detail-subject">{selected.summary}</div>
              <div className="detail-fields">
                <div><strong>Start:</strong>{formatDateTime(selected.start)}</div>
                <div><strong>End:</strong>{formatDateTime(selected.end)}</div>
                {selected.location && <div><strong>Location:</strong>{selected.location}</div>}
                {selected.organizer && <div><strong>Organizer:</strong>{selected.organizer}</div>}
                {selected.status && <div><strong>Status:</strong>{selected.status}</div>}
              </div>
            </div>

            {selected.attendees?.length > 0 && (
              <div className="event-attendees">
                <div className="section-label">
                  Attendees ({selected.attendees.length})
                </div>
                {selected.attendees.map((a, i) => (
                  <div key={i} className="attendee-row">
                    <span>{a.name}</span>
                    {a.email !== a.name && (
                      <span style={{ color: 'var(--text-muted)', marginLeft: 8 }}>
                        {a.email}
                      </span>
                    )}
                  </div>
                ))}
              </div>
            )}

            {selected.description && (
              <div className="detail-body">
                <div className="section-label" style={{ marginBottom: 8 }}>Description</div>
                <pre className="body-plain">{selected.description}</pre>
              </div>
            )}
          </div>
        ) : (
          <div className="detail-empty">Select an event to view details</div>
        )}
      </main>
    </div>
  )
}

function formatDate(str) {
  if (!str) return ''
  try {
    return new Date(str).toLocaleDateString(undefined, {
      weekday: 'short', month: 'short', day: 'numeric', year: 'numeric',
    })
  } catch { return str }
}

function formatDateTime(str) {
  if (!str) return ''
  try { return new Date(str).toLocaleString() } catch { return str }
}
