import { useState } from 'react'

export default function ContactsViewer({ contacts }) {
  const [selected, setSelected] = useState(null)
  const [search, setSearch] = useState('')

  const filtered = contacts.filter(
    (c) =>
      !search ||
      (c.name || '').toLowerCase().includes(search.toLowerCase()) ||
      c.emails.some((e) => e.value.toLowerCase().includes(search.toLowerCase())) ||
      (c.org || '').toLowerCase().includes(search.toLowerCase())
  )

  return (
    <div className="reader-layout inner">
      <aside className="sidebar">
        <div className="sidebar-header">
          <span className="sidebar-title">{contacts.length.toLocaleString()} contacts</span>
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
            <div className="email-list-empty">No contacts found.</div>
          )}
          {filtered.map((contact, i) => (
            <div
              key={i}
              className={`email-item${selected === contact ? ' active' : ''}`}
              onClick={() => setSelected(contact)}
            >
              <div className="email-subject">{contact.name || '(no name)'}</div>
              <div className="email-snippet" style={{ fontSize: 11, color: 'var(--text-muted)' }}>
                {contact.emails[0]?.value || contact.org || ''}
              </div>
            </div>
          ))}
        </div>
      </aside>

      <main className="detail-pane">
        {selected ? (
          <div>
            <div className="detail-header">
              <div className="detail-subject">{selected.name || '(no name)'}</div>
              <div className="detail-fields">
                {selected.org && <div><strong>Company:</strong>{selected.org}</div>}
                {selected.title && <div><strong>Title:</strong>{selected.title}</div>}
              </div>
            </div>

            <div className="detail-body">
              {selected.emails.length > 0 && (
                <div className="contact-section">
                  <div className="section-label">Email addresses</div>
                  {selected.emails.map((e, i) => (
                    <div key={i} className="contact-row">
                      <span style={{ color: 'var(--accent2)' }}>{e.value}</span>
                      {e.type && <span className="contact-type">{e.type}</span>}
                    </div>
                  ))}
                </div>
              )}

              {selected.phones.length > 0 && (
                <div className="contact-section">
                  <div className="section-label">Phone numbers</div>
                  {selected.phones.map((p, i) => (
                    <div key={i} className="contact-row">
                      <span>{p.value}</span>
                      {p.type && <span className="contact-type">{p.type}</span>}
                    </div>
                  ))}
                </div>
              )}

              {selected.addresses.length > 0 && (
                <div className="contact-section">
                  <div className="section-label">Addresses</div>
                  {selected.addresses.map((a, i) => (
                    <div key={i} className="contact-row">
                      <span>{a.value}</span>
                      {a.type && <span className="contact-type">{a.type}</span>}
                    </div>
                  ))}
                </div>
              )}

              {selected.url && (
                <div className="contact-section">
                  <div className="section-label">Website</div>
                  <div className="contact-row" style={{ color: 'var(--accent2)' }}>{selected.url}</div>
                </div>
              )}

              {selected.note && (
                <div className="contact-section">
                  <div className="section-label">Notes</div>
                  <pre className="body-plain" style={{ marginTop: 4 }}>{selected.note}</pre>
                </div>
              )}
            </div>
          </div>
        ) : (
          <div className="detail-empty">Select a contact to view details</div>
        )}
      </main>
    </div>
  )
}
