import { useState, useEffect } from 'react'
import Avatar from './Avatar'
import { parseAddress, splitAddresses } from '../utils/address'

/** Full, readable timestamp for the reading pane (e.g. "Mon, Jan 1, 2024, 9:30 AM"). */
function formatFullDate(dateStr) {
  if (!dateStr) return ''
  const d = new Date(dateStr)
  if (isNaN(d.getTime())) return dateStr
  return d.toLocaleString(undefined, {
    weekday: 'short', month: 'short', day: 'numeric', year: 'numeric',
    hour: 'numeric', minute: '2-digit',
  })
}

/** "to me", "to a@x.com", "to a@x.com, b@y.com" style summary for recipients. */
function recipientsSummary(toRaw) {
  const list = splitAddresses(toRaw)
  if (list.length === 0) return ''
  const label = (a) => a.name || a.email
  if (list.length === 1) return `to ${label(list[0])}`
  if (list.length === 2) return `to ${label(list[0])}, ${label(list[1])}`
  return `to ${label(list[0])}, ${label(list[1])} +${list.length - 2}`
}

/**
 * Content-Security-Policy enforced inside the iframe document.
 * Scripts are always denied (defense-in-depth alongside the missing
 * `allow-scripts` sandbox flag). When `blockRemote` is true, remote images,
 * media, and fonts are blocked so tracking pixels can't phone home; only inline
 * styles and `data:` resources are allowed. Loading remote content relaxes the
 * image/media/font sources to http(s) on explicit user request.
 */
function cspMeta(blockRemote) {
  const remote = blockRemote ? '' : ' https: http:'
  const policy = [
    "default-src 'none'",
    `img-src data:${remote}`,
    `media-src data:${remote}`,
    "style-src 'unsafe-inline'",
    `font-src data:${remote}`,
  ].join('; ')
  return `<meta http-equiv="Content-Security-Policy" content="${policy}">`
}

/** Wrap message HTML so typography and links are readable in the iframe. */
function wrapEmailHtmlFragment(html, { blockRemote = true } = {}) {
  return `<!DOCTYPE html><html><head><meta charset="utf-8">${cspMeta(blockRemote)}<base target="_blank" rel="noopener">
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

/** True if the HTML references remote resources (images, media, CSS urls). */
function hasRemoteContent(html) {
  if (!html) return false
  return /(?:src|srcset|background|poster)\s*=\s*["']?\s*(?:https?:)?\/\//i.test(html)
    || /url\(\s*["']?\s*(?:https?:)?\/\//i.test(html)
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
  // Remote images/trackers are blocked by default; user can opt in per message.
  const [loadRemote, setLoadRemote] = useState(false)
  // Gmail-style collapsed recipients ("to me ▾"), expandable to full headers.
  const [recipientsOpen, setRecipientsOpen] = useState(false)
  useEffect(() => { setRecipientsOpen(false) }, [email._emailIndex])

  // Re-evaluate whenever a new email is selected or its body loads
  useEffect(() => {
    setTab(bestTab(email))
    setLoadRemote(false)
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

  const remoteContentPresent = hasRemoteContent(effectiveHtmlBody)

  useEffect(() => {
    if (!effectiveHtmlBody || isLoading) {
      setHtmlBlobUrl(null)
      return undefined
    }
    const doc = wrapEmailHtmlFragment(effectiveHtmlBody, { blockRemote: !loadRemote })
    const url = URL.createObjectURL(new Blob([doc], { type: 'text/html;charset=utf-8' }))
    setHtmlBlobUrl(url)
    return () => {
      URL.revokeObjectURL(url)
    }
  }, [effectiveHtmlBody, isLoading, email._emailIndex, loadRemote])

  // ── Display labels (exclude status flags) ─────────────────────────────────
  const folderLabels = (email._labels || '')
    .split(',')
    .map(l => l.trim())
    .filter(l => l && !STATUS_LABELS.has(l))

  const fromAddr = parseAddress(email.from)

  return (
    <div className="detail-pane">
      <div className="detail-header">
        <div className="detail-subject-row">
          <h1 className="detail-subject">{email.subject || '(no subject)'}</h1>
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
        </div>

        <div className="detail-sender-row">
          <Avatar name={fromAddr.name} email={fromAddr.email} size={40} />
          <div className="detail-sender-main">
            <div className="detail-sender-line">
              <span className="detail-sender-name">{fromAddr.name || '(unknown sender)'}</span>
              {fromAddr.email && fromAddr.email !== fromAddr.name && (
                <span className="detail-sender-email">&lt;{fromAddr.email}&gt;</span>
              )}
              <span className="detail-date">{formatFullDate(email.date)}</span>
            </div>
            <button
              type="button"
              className="detail-recipients-toggle"
              onClick={() => setRecipientsOpen(o => !o)}
              aria-expanded={recipientsOpen}
            >
              <span>{recipientsSummary(email.to) || 'recipients hidden'}</span>
              <span className="gmi">{recipientsOpen ? 'arrow_drop_up' : 'arrow_drop_down'}</span>
            </button>
            {recipientsOpen && (
              <dl className="detail-recipients-full">
                <div><dt>From</dt><dd>{email.from || '—'}</dd></div>
                <div><dt>To</dt><dd>{email.to || '—'}</dd></div>
                <div><dt>Date</dt><dd>{email.date || '—'}</dd></div>
              </dl>
            )}
          </div>
          {email._bodyLoaded && (
            <div className="detail-header-actions">
              <button
                type="button"
                className="detail-icon-btn"
                onClick={copyPlainText}
                title={copyState === 'ok' ? 'Copied' : copyState === 'err' ? 'Copy failed' : 'Copy plain text'}
              >
                <span className="gmi">{copyState === 'ok' ? 'check' : 'content_copy'}</span>
              </button>
            </div>
          )}
        </div>
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
            <div className="body-html-wrap">
              {remoteContentPresent && !loadRemote && (
                <div className="remote-banner">
                  <span className="gmi" aria-hidden>visibility_off</span>
                  <span className="remote-banner-text">
                    Remote images are blocked to protect your privacy (they can notify the sender you opened this).
                  </span>
                  <button
                    type="button"
                    className="remote-banner-btn"
                    onClick={() => setLoadRemote(true)}
                  >
                    Load remote content
                  </button>
                </div>
              )}
              <iframe
                className="body-html"
                src={htmlBlobUrl}
                sandbox="allow-same-origin"
                title="Email HTML"
              />
            </div>
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
