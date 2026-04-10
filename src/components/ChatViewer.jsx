import { useState } from 'react'

export default function ChatViewer({ conversations }) {
  const [selected, setSelected] = useState(null)
  const [search, setSearch] = useState('')

  const filtered = conversations.filter(
    (c) =>
      !search ||
      c.title.toLowerCase().includes(search.toLowerCase()) ||
      c.messages.some((m) => m.text.toLowerCase().includes(search.toLowerCase()))
  )

  return (
    <div className="reader-layout inner">
      <aside className="sidebar">
        <div className="sidebar-header">
          <span className="sidebar-title">
            {conversations.length.toLocaleString()} conversations
          </span>
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
            <div className="email-list-empty">No conversations found.</div>
          )}
          {filtered.map((convo, i) => (
            <div
              key={i}
              className={`email-item${selected === convo ? ' active' : ''}`}
              onClick={() => setSelected(convo)}
            >
              <div className="email-from">{convo.source}</div>
              <div className="email-subject">{convo.title}</div>
              <div className="email-meta">
                <span className="email-snippet">
                  {convo.messages[convo.messages.length - 1]?.text?.slice(0, 100)}
                </span>
                <span className="email-date">{formatDate(convo.lastMessage)}</span>
              </div>
            </div>
          ))}
        </div>
      </aside>

      <main className="detail-pane">
        {selected ? (
          <div className="chat-thread">
            <div className="detail-header">
              <div className="detail-subject">{selected.title}</div>
              <div className="detail-fields">
                <div>
                  <strong>Source:</strong>{selected.source} ·{' '}
                  {selected.messages.length.toLocaleString()} messages
                </div>
                <div>
                  <strong>Participants:</strong>{selected.participants.join(', ')}
                </div>
              </div>
            </div>
            <div className="chat-messages">
              {selected.messages.map((msg, i) => (
                <div key={i} className="chat-message">
                  <div className="chat-sender">
                    {msg.sender}
                    {msg.email && msg.email !== msg.sender && (
                      <span style={{ color: 'var(--text-muted)', marginLeft: 6 }}>
                        ({msg.email})
                      </span>
                    )}
                  </div>
                  <div className="chat-text">{msg.text}</div>
                  <div className="chat-time">{formatDateTime(msg.timestamp)}</div>
                </div>
              ))}
            </div>
          </div>
        ) : (
          <div className="detail-empty">Select a conversation to read it</div>
        )}
      </main>
    </div>
  )
}

function formatDate(str) {
  if (!str) return ''
  try {
    return new Date(str).toLocaleDateString(undefined, {
      month: 'short', day: 'numeric', year: 'numeric',
    })
  } catch { return str }
}

function formatDateTime(str) {
  if (!str) return ''
  try { return new Date(str).toLocaleString() } catch { return str }
}
