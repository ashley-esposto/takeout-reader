/**
 * Parse an mbox string into an array of email objects.
 * Called from the Web Worker so it can run off the main thread.
 */
export function parseMbox(mboxText, onProgress) {
  const emails = []

  // Normalise line endings so the regex works regardless of OS
  const text = mboxText.replace(/\r\n/g, '\n')

  // mbox separator: a line starting with "From " (with a space).
  // Some exporters (including Google Takeout) use "From " followed by
  // an email address or just a date — be as permissive as possible.
  // We also handle files where the very first line IS the separator.
  const messageChunks = text.split(/^From [^\n]*/m).filter((c) => c.trim().length > 0)

  // Diagnostic: if nothing found, post a warning back to the UI
  if (messageChunks.length === 0) {
    // File may be empty or use an unrecognised format
    onProgress && onProgress(0, 0)
    return []
  }

  const total = messageChunks.length

  let lastProgressTime = 0

  for (let i = 0; i < messageChunks.length; i++) {
    const raw = messageChunks[i]
    const email = parseMessage(raw)
    emails.push(email)

    // Throttled progress: every 200 emails AND max once per 50ms
    if (onProgress && (i + 1) % 200 === 0) {
      const now = Date.now()
      if (now - lastProgressTime >= 50) {
        onProgress(i + 1, total)
        lastProgressTime = now
      }
    }
  }

  // Final progress
  if (onProgress) onProgress(total, total)

  return emails
}

/**
 * Parse only the headers + a plain-text snippet.
 * Used during large-file scans to keep memory low.
 * Does NOT decode the body.
 */
export function parseHeadersOnly(raw) {
  // Normalize line endings so header/body split and folding behave consistently (CRLF mbox)
  const norm = String(raw).replace(/^\uFEFF/, '').replace(/\r\n/g, '\n').replace(/\r/g, '\n')
  const newline = '\n'
  const sep = norm.indexOf('\n\n')
  const rawHeadersSlice = sep > -1 ? norm.slice(0, sep) : norm
  const bodyPreview = sep > -1 ? norm.slice(sep + 2, sep + 2 + 600) : ''

  const headers = parseHeaders(rawHeadersSlice)
  const fromSubj = pickFromSubject(headers)
  // Build snippet as a fresh string (breaks reference to the chunk buffer)
  const snippet = bodyPreview.replace(/\s+/g, ' ').trim().slice(0, 200)

  // IMPORTANT: Do NOT store rawHeaders here. Storing a substring slice keeps
  // the entire 32 MB chunk buffer alive in V8 and causes catastrophic memory
  // growth on large mailboxes. rawHeaders is loaded on-demand with the body.
  return {
    // Use String() to ensure each value is a fresh copy, not a slice of raw
    from:    String(fromSubj.from),
    to:      String(headers['to']      || ''),
    subject: String(fromSubj.subject),
    date:    String(headers['date']    || ''),
    rawHeaders: '',   // populated on-demand when body is loaded
    textBody:  null,
    htmlBody:  null,
    snippet,          // already a fresh string via replace+trim+slice
    _bodyLoaded: false,
  }
}

export function parseMessage(raw) {
  const norm = String(raw).replace(/^\uFEFF/, '').replace(/\r\n/g, '\n').replace(/\r/g, '\n')
  const headerBodySep = norm.indexOf('\n\n')
  const rawHeaders = headerBodySep > -1 ? norm.slice(0, headerBodySep) : norm
  const rawBody    = headerBodySep > -1 ? norm.slice(headerBodySep + 2) : ''

  const headers     = parseHeaders(rawHeaders)
  const fromSubj    = pickFromSubject(headers)
  const contentType = headers['content-type'] || ''
  const encoding    = (headers['content-transfer-encoding'] || '').toLowerCase().trim()

  let textBody = ''
  let htmlBody = ''

  if (contentType.toLowerCase().includes('multipart')) {
    // Recursively extract text/html from any depth of nesting
    ;({ textBody, htmlBody } = extractFromMultipart(rawBody, contentType))
  } else {
    const charset = extractCharset(contentType)
    const decoded = decodeBody(rawBody, encoding, charset)
    if (contentType.toLowerCase().includes('text/html')) {
      htmlBody = decoded
    } else {
      textBody = decoded
    }
  }

  const snippet = (textBody || '').trim().slice(0, 200).replace(/\s+/g, ' ')

  return {
    from:       fromSubj.from,
    to:         headers['to']      || '',
    subject:    fromSubj.subject,
    date:       headers['date']    || '',
    rawHeaders,
    textBody,
    htmlBody,
    snippet,
  }
}

/**
 * Recursively walk a multipart body, collecting the first text/plain and
 * text/html parts found at any depth.
 * Handles: multipart/mixed → multipart/alternative → text/plain + text/html
 *          multipart/related → multipart/alternative → …
 *          and any other nesting Gmail produces.
 */
function extractFromMultipart(body, contentType, depth = 0) {
  let textBody = ''
  let htmlBody = ''
  if (depth > 8) return { textBody, htmlBody } // guard against malformed infinite nesting

  const boundary = extractBoundary(contentType)
  if (!boundary) return { textBody, htmlBody }

  const parts = splitMultipart(body, boundary)

  for (const part of parts) {
    if (!part.trim()) continue
    const { headers: ph, body: pb } = parsePartHeaders(part)
    const pct  = (ph['content-type'] || '').toLowerCase()
    const penc = (ph['content-transfer-encoding'] || '').toLowerCase().trim()

    if (pct.includes('multipart')) {
      // Recurse into nested multipart (e.g. multipart/alternative inside multipart/mixed)
      const nested = extractFromMultipart(pb, ph['content-type'] || '', depth + 1)
      if (!textBody && nested.textBody) textBody = nested.textBody
      if (!htmlBody && nested.htmlBody) htmlBody = nested.htmlBody
    } else if (pct.includes('text/plain') && !textBody) {
      const charset = extractCharset(ph['content-type'] || '')
      textBody = decodeBody(pb, penc, charset)
    } else if (pct.includes('text/html') && !htmlBody) {
      const charset = extractCharset(ph['content-type'] || '')
      htmlBody = decodeBody(pb, penc, charset)
    }

    if (textBody && htmlBody) break // got both — no need to keep scanning
  }

  return { textBody, htmlBody }
}

function parseHeaders(headerBlock) {
  // Unfold multi-line headers
  const unfolded = headerBlock.replace(/\r?\n[ \t]+/g, ' ')
  const lines = unfolded.split(/\r?\n/)
  const headers = {}
  for (const line of lines) {
    const idx = line.indexOf(':')
    if (idx < 0) continue
    const key = line.slice(0, idx).toLowerCase().trim()
    const val = line.slice(idx + 1).trim()
    // Append with comma for repeated headers (Received, etc.); first wins for most keys
    if (!headers[key]) headers[key] = val
    else if (key === 'received' || key === 'dkim-signature' || key === 'authentication-results') {
      headers[key] = `${headers[key]}, ${val}`
    }
  }
  return headers
}

/** Best-effort From / Subject when primary headers are missing or list-style. */
function pickFromSubject(headers) {
  const rawFrom =
    firstNonEmpty(
      headers['from'],
      headers['resent-from'],
      headers['sender'],
      headers['reply-to'],
      headers['return-path'] ? stripRouteBrackets(headers['return-path']) : '',
      headers['x-original-from'],
      headers['x-sender'],
    )
  const rawSubject = firstNonEmpty(
    headers['subject'],
    headers['resent-subject'],
    headers['thread-topic'],
    headers['x-original-subject'],
    headers['x-subject'],
  )
  return {
    from: decodeHeader(rawFrom).trim(),
    subject: decodeHeader(rawSubject).trim(),
  }
}

function firstNonEmpty(...vals) {
  for (const v of vals) {
    if (v != null && String(v).trim() !== '') return String(v)
  }
  return ''
}

/** Return-path often looks like <user@host>; keep a readable fragment for display. */
function stripRouteBrackets(s) {
  const m = String(s).match(/<([^>]+)>/)
  return m ? m[1].trim() : String(s).trim()
}

function parsePartHeaders(partRaw) {
  const newline = partRaw.includes('\r\n') ? '\r\n' : '\n'
  const sep = partRaw.indexOf(newline + newline)
  const headerBlock = sep > -1 ? partRaw.slice(0, sep) : partRaw
  const body = sep > -1 ? partRaw.slice(sep + newline.length * 2) : ''
  return { headers: parseHeaders(headerBlock), body }
}

function extractBoundary(contentType) {
  const match = contentType.match(/boundary=["']?([^"';\s]+)["']?/i)
  return match ? match[1] : null
}

function splitMultipart(body, boundary) {
  const delimiter = '--' + boundary
  const parts = body.split(new RegExp('--' + escapeRegex(boundary) + '(?:--)?'))
  return parts.slice(1).filter((p) => p.trim() && !p.trim().startsWith('--'))
}

function escapeRegex(s) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

/** Extract charset from a Content-Type value, defaulting to utf-8. */
function extractCharset(contentType) {
  const m = (contentType || '').match(/charset=["']?([^"';\s]+)["']?/i)
  const cs = m ? m[1].toLowerCase() : 'utf-8'
  // Normalise common aliases
  if (cs === 'utf8') return 'utf-8'
  if (cs === 'latin-1' || cs === 'latin1') return 'iso-8859-1'
  return cs
}

function decodeBody(body, encoding, charset = 'utf-8') {
  if (encoding === 'quoted-printable') return decodeQP(body, charset)
  if (encoding === 'base64') {
    try {
      const clean = body.replace(/\s/g, '')
      // Use TextDecoder for proper charset support (handles emoji, CJK, etc.)
      const bytes = Uint8Array.from(atob(clean), c => c.charCodeAt(0))
      return new TextDecoder(charset, { fatal: false }).decode(bytes)
    } catch {
      try {
        return atob(body.replace(/\s/g, ''))
      } catch {
        return body
      }
    }
  }
  return body
}

/**
 * Decode quoted-printable, respecting the charset so multi-byte UTF-8
 * sequences (emoji, accented chars, CJK, smart quotes, etc.) render correctly.
 */
function decodeQP(str, charset = 'utf-8') {
  // Remove soft line breaks first
  const flat = str.replace(/=\r?\n/g, '')

  // Collect raw bytes, then decode with TextDecoder
  const bytes = []
  let i = 0
  while (i < flat.length) {
    if (flat[i] === '=' && i + 2 < flat.length) {
      const hex = flat.slice(i + 1, i + 3)
      if (/^[0-9A-Fa-f]{2}$/.test(hex)) {
        bytes.push(parseInt(hex, 16))
        i += 3
        continue
      }
    }
    // Regular character — push its code point (safe for ASCII & latin-1 literals)
    const code = flat.charCodeAt(i)
    if (code < 128) {
      bytes.push(code)
    } else {
      // Non-ASCII literal in QP body — encode to UTF-8 bytes
      const encoded = new TextEncoder().encode(flat[i])
      for (const b of encoded) bytes.push(b)
    }
    i++
  }

  try {
    return new TextDecoder(charset, { fatal: false }).decode(new Uint8Array(bytes))
  } catch {
    // Unknown charset — fall back to latin-1
    return new TextDecoder('iso-8859-1', { fatal: false }).decode(new Uint8Array(bytes))
  }
}

/**
 * Decode RFC 2047 encoded-word headers, e.g.:
 * =?UTF-8?B?base64here?= or =?UTF-8?Q?quoted_printable?=
 * Runs until stable and removes linear whitespace between adjacent encoded words (RFC 2047).
 */
function decodeHeader(str) {
  if (str == null || str === '') return ''
  let s = String(str)
  // Collapse whitespace between adjacent encoded words (must be ignored when decoding)
  let prev
  do {
    prev = s
    s = s.replace(/\?=\s+(?==\?)/g, '?=')
  } while (s !== prev)

  do {
    prev = s
    s = s.replace(/=\?([^?]+)\?([BbQq])\?([^?]*)\?=/g, (_, charset, encoding, text) => {
      try {
        const cs = extractCharset(`charset=${charset}`)
        if (encoding.toUpperCase() === 'B') {
          const pad = (4 - (text.length % 4)) % 4
          const b64 = text.replace(/\s/g, '') + '='.repeat(pad)
          const bytes = Uint8Array.from(atob(b64), c => c.charCodeAt(0))
          return new TextDecoder(cs, { fatal: false }).decode(bytes)
        }
        // QP-encoded header: underscores represent spaces (RFC 2047 §4.2)
        const qp = text.replace(/_/g, ' ')
        return decodeQP(qp, cs)
      } catch {
        return text
      }
    })
  } while (s !== prev)

  return s
}
