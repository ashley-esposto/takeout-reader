/**
 * Parse a single address header value into a display name + email.
 * e.g. `"Alice Smith" <alice@x.com>` → { name: 'Alice Smith', email: 'alice@x.com' }
 *      `bob@x.com`                   → { name: 'bob@x.com',   email: 'bob@x.com' }
 */
export function parseAddress(raw) {
  const s = (raw || '').trim()
  if (!s) return { name: '', email: '' }
  const m = s.match(/^\s*"?([^"<]*?)"?\s*<([^>]+)>\s*$/)
  if (m) {
    const email = m[2].trim()
    return { name: (m[1].trim() || email), email }
  }
  if (/@/.test(s)) return { name: s, email: s }
  return { name: s, email: '' }
}

/**
 * Split a recipient header (comma-separated) into individual addresses,
 * respecting quotes and angle brackets so `"Doe, John" <j@x>` stays intact.
 */
export function splitAddresses(raw) {
  const out = []
  let cur = '', depth = 0, quoted = false
  for (const ch of raw || '') {
    if (ch === '"') quoted = !quoted
    else if (ch === '<') depth++
    else if (ch === '>') depth = Math.max(0, depth - 1)
    if (ch === ',' && !quoted && depth === 0) { out.push(cur); cur = ''; continue }
    cur += ch
  }
  if (cur.trim()) out.push(cur)
  return out.map(parseAddress).filter((a) => a.name || a.email)
}
