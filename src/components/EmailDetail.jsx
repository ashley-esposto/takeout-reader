import { useState, useEffect } from 'react'

/** Wrap message HTML so typography and links are readable in the iframe. */
function wrapEmailHtmlFragment(html) {
  return `<!DOCTYPE html><html><head><meta charset="utf-8"><base target="_blank" rel="noopener">
<style>
  html, body { margin: 0; padding: 0; background: #fff; color: #1a1a1a; }
  body {
    font-family: system-ui, -apple-system, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif;
    font-size: 15px;
    line-height: 1.55;
    word-wrap: break-word;
    overflow-wrap: anywhere;
    padding: 16px 20px;
    box-sizing: border-box;
  }
  a { color: #1a73e8; }
  img, table { max-width: 100% !important; height: auto !important; }
  pre { white-space: pre-wrap; word-break: break-word; }
  blockquote { border-left: 3px solid #ddd; margin: 0.5em 0; padding-left: 12px; color: #444; }
</style></head><body>${html || ''}</body></html>`
}

const TABS = ['HTML', 'Plain Text', 'Raw Headers']

// Labels that are status flags, not folder names — skip them in the detail badge row
const STATUS_LABELS = new Set(['Unread', 'Opened', 'Read'])

/**
 * Strip HTML to clean readable plain text:
 * - Converts <a href> links to just their anchor text (no raw URLs)
 * - Preserves paragraph / line breaks
 * - Decodes common HTML entities
 */
function htmlToPlainText(html) {
  return html
    .replace(/<style[\s\S]*?<\/style>/gi, '')
    .replace(/<script[\s\S]*?<\/script>/gi, '')
    // Links → just the visible text, drop the URL
    .replace(/<a[^>]*>([\s\S]*?)<\/a>/gi, '$1')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/p>/gi, '\n\n')
    .replace(/<\/div>/gi, '\n')
    .replace(/<\/tr>/gi, '\n')
    .replace(/<\/li>/gi, '\n')
    .replace(/<li[^>]*>/gi, '  • ')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&amp;/gi, '&')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")
    .replace(/&#(\d+);/g, (_, n) => {
      const c = parseInt(n, 10)
      return Number.isFinite(c) ? String.fromCodePoint(c) : ''
    })
    .replace(/&#x([0-9a-fA-F]+);/g, (_, h) => {
      const c = parseInt(h, 16)
      return Number.isFinite(c) ? String.fromCodePoint(c) : ''
    })
    // Collapse excessive blank lines
    .replace(/\r?\n{3,}/g, '\n\n')
    .trim()
}

function looksLikeHtml(text) {
  return /<[a-z][^>]*>/i.test((text || '').slice(0, 1000))
}

/** Decide the best default tab for a loaded email. */
function bestTab(em) {
  if (!em._bodyLoaded) return 'HTML'
  // Always prefer rendered HTML when available — matches how Gmail/Outlook work
  const hasHtml = !!(em.htmlBody || (em.textBody && looksLikeHtml(em.textBody)))
  return hasHtml ? 'HTML' : 'Plain Text'
}

export default function EmailDetail({ email, bodyLoading = false }) {
  const [tab, setTab] = useState(() => bestTab(email))
  const [htmlBlobUrl, setHtmlBlobUrl] = useState(null)
  const [copyState, setCopyState] = useState('idle')

  // Re-evaluate whenever a new email is selected or its body loads
  useEffect(() => {
    setTab(bestTab(email))
  }, [email._emailIndex, email._bodyLoaded, email.htmlBody, email.textBody]) // eslint-disable-line

  // ── Resolve content ────────────────────────────────────────────────────────
  // If textBody looks like HTML, treat it as the HTML body (parser mis-bucketed it)
  const effectiveHtmlBody = email.htmlBody
    || (email.textBody && looksLikeHtml(email.textBody) ? email.textBody : null)

  const effectiveTextBody = (email.textBody && looksLikeHtml(email.textBody))
    ? null
    : email.textBody

  // Plain text fallback: real textBody → strip HTML → empty message
  const plainText = effectiveTextBody
    || (effectiveHtmlBody ? htmlToPlainText(effectiveHtmlBody) : '')

  const isLoading = bodyLoading && !email._bodyLoaded

  async function copyPlainText() {
    const text = plainText || ''
    try {
      await navigator.clipboard.writeText(text)
      setCopyState('ok')
      setTimeout(() => setCopyState('idle'), 2000)
    } catch {
      setCopyState('err')
      setTimeout(() => setCopyState('idle'), 2500)
    }
  }

  useEffect(() => {
    if (!effectiveHtmlBody || isLoading) {
      setHtmlBlobUrl(null)
      return undefined
    }
    const doc = wrapEmailHtmlFragment(effectiveHtmlBody)
    const url = URL.createObjectURL(new Blob([doc], { type: 'text/html;charset=utf-8' }))
    setHtmlBlobUrl(url)
    return () => {
      URL.revokeObjectURL(url)
    }
  }, [effectiveHtmlBody, isLoading, email._emailIndex])

  // ── Display labels (exclude status flags) ─────────────────────────────────
  const folderLabels = (email._labels || '')
    .split(',')
    .map(l => l.trim())
    .filter(l => l && !STATUS_LABELS.has(l))

  return (
    <div className="detail-pane">
      <div className="detail-header">
        <div className="detail-subject">{email.subject || '(no subject)'}</div>
        <div className="detail-fields">
          <div><strong>From:</strong> {email.from || '—'}</div>
          <div><strong>To:</strong>   {email.to   || '—'}</div>
          <div><strong>Date:</strong> {email.date || '—'}</div>
        </div>
        {folderLabels.length > 0 && (
          <div className="detail-label-row">
            {folderLabels.map(l => (
              <span
                key={l}
                className={`label-badge label-${l.toLowerCase().replace(/\s+/g, '-')}`}
              >
                {l}
              </span>
            ))}
          </div>
        )}
        {email._bodyLoaded && (
          <div className="detail-actions">
            <button
              type="button"
              className="detail-action-btn"
              onClick={copyPlainText}
              title="Copy plain text to clipboard"
            >
              <span className="gmi">content_copy</span>
              {copyState === 'ok' ? 'Copied' : copyState === 'err' ? 'Copy failed' : 'Copy plain text'}
            </button>
          </div>
        )}
      </div>

      <div className="detail-tabs">
        {TABS.map(t => (
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
        {/* ── HTML tab ── */}
        {tab === 'HTML' && (
          isLoading ? (
            <p className="detail-loading">⏳ Loading…</p>
          ) : effectiveHtmlBody && htmlBlobUrl ? (
            <iframe
              className="body-html"
              src={htmlBlobUrl}
              sandbox="allow-same-origin"
              title="Email HTML"
            />
          ) : effectiveHtmlBody ? (
            <p className="detail-loading">Preparing preview…</p>
          ) : (
            <pre className="body-plain">{plainText || '(no content)'}</pre>
          )
        )}

        {/* ── Plain Text tab ── */}
        {tab === 'Plain Text' && (
          <pre className="body-plain">
            {isLoading
              ? '⏳ Loading…'
              : (plainText || '(no plain text content)')}
          </pre>
        )}

        {/* ── Raw Headers tab ── */}
        {tab === 'Raw Headers' && (
          <pre className="body-raw">
            {isLoading
              ? '⏳ Loading…'
              : (email.rawHeaders || '(raw headers load when you click the email)')}
          </pre>
        )}
      </div>
    </div>
  )
}
