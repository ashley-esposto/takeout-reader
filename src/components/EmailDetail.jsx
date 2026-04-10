import { useState } from 'react'

const TABS = ['Plain Text', 'HTML', 'Raw Headers']

export default function EmailDetail({ email }) {
  const [tab, setTab] = useState('Plain Text')

  return (
    <div className="detail-pane">
      <div className="detail-header">
        <div className="detail-subject">{email.subject || '(no subject)'}</div>
        <div className="detail-fields">
          <div><strong>From:</strong>{email.from || '—'}</div>
          <div><strong>To:</strong>{email.to || '—'}</div>
          <div><strong>Date:</strong>{email.date || '—'}</div>
        </div>
      </div>

      <div className="detail-tabs">
        {TABS.map((t) => (
          <button
            key={t}
            className={`detail-tab${tab === t ? ' active' : ''}`}
            onClick={() => setTab(t)}
          >
            {t}
          </button>
        ))}
      </div>

      <div className="detail-body">
        {tab === 'Plain Text' && (
          <pre className="body-plain">{email.textBody || '(no plain text body)'}</pre>
        )}
        {tab === 'HTML' && (
          email.htmlBody
            ? <iframe
                className="body-html"
                srcDoc={email.htmlBody}
                sandbox="allow-same-origin"
                title="Email HTML"
              />
            : <pre className="body-plain">(no HTML body — showing plain text){'\n\n'}{email.textBody}</pre>
        )}
        {tab === 'Raw Headers' && (
          <pre className="body-raw">{email.rawHeaders || '(no headers)'}</pre>
        )}
      </div>
    </div>
  )
}
