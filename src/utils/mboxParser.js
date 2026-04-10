/**
 * Parse an mbox string into an array of email objects.
 * Called from the Web Worker so it can run off the main thread.
 */
export function parseMbox(mboxText, onProgress) {
  const emails = []
  // Split on mbox "From " separator lines
  const messageChunks = mboxText.split(/^From .+/m).filter((c) => c.trim().length > 0)
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

function parseMessage(raw) {
  const newline = raw.includes('\r\n') ? '\r\n' : '\n'
  const headerBodySep = raw.indexOf(newline + newline)
  const rawHeaders = headerBodySep > -1 ? raw.slice(0, headerBodySep) : raw
  const rawBody = headerBodySep > -1 ? raw.slice(headerBodySep + newline.length * 2) : ''

  const headers = parseHeaders(rawHeaders)

  const contentType = headers['content-type'] || ''
  const encoding = (headers['content-transfer-encoding'] || '').toLowerCase().trim()

  let textBody = ''
  let htmlBody = ''

  if (contentType.toLowerCase().includes('multipart')) {
    const boundary = extractBoundary(contentType)
    if (boundary) {
      const parts = splitMultipart(rawBody, boundary)
      for (const part of parts) {
        const { headers: ph, body: pb } = parsePartHeaders(part)
        const pct = (ph['content-type'] || '').toLowerCase()
        const penc = (ph['content-transfer-encoding'] || '').toLowerCase().trim()
        const decoded = decodeBody(pb, penc)
        if (pct.includes('text/plain') && !textBody) textBody = decoded
        else if (pct.includes('text/html') && !htmlBody) htmlBody = decoded
      }
    }
  } else {
    const decoded = decodeBody(rawBody, encoding)
    if (contentType.toLowerCase().includes('text/html')) {
      htmlBody = decoded
    } else {
      textBody = decoded
    }
  }

  const snippet = textBody.trim().slice(0, 200).replace(/\s+/g, ' ')

  return {
    from: headers['from'] || '',
    to: headers['to'] || '',
    subject: decodeHeader(headers['subject'] || ''),
    date: headers['date'] || '',
    rawHeaders,
    textBody,
    htmlBody,
    snippet,
  }
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
    if (!headers[key]) headers[key] = val
  }
  return headers
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

function decodeBody(body, encoding) {
  if (encoding === 'quoted-printable') return decodeQP(body)
  if (encoding === 'base64') {
    try {
      // Remove whitespace before atob
      const clean = body.replace(/\s/g, '')
      return decodeURIComponent(
        escape(atob(clean))
      )
    } catch {
      return body
    }
  }
  return body
}

function decodeQP(str) {
  return str
    .replace(/=\r?\n/g, '') // soft line breaks
    .replace(/=([0-9A-Fa-f]{2})/g, (_, hex) => String.fromCharCode(parseInt(hex, 16)))
}

/**
 * Decode RFC 2047 encoded-word headers, e.g.:
 * =?UTF-8?B?base64here?= or =?UTF-8?Q?quoted_printable?=
 */
function decodeHeader(str) {
  return str.replace(/=\?([^?]+)\?([BbQq])\?([^?]*)\?=/g, (_, charset, encoding, text) => {
    try {
      if (encoding.toUpperCase() === 'B') {
        const bytes = atob(text)
        return decodeURIComponent(escape(bytes))
      } else {
        const qp = text.replace(/_/g, ' ')
        return decodeQP(qp)
      }
    } catch {
      return text
    }
  })
}
