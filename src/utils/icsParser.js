/**
 * Parse one or more .ics calendar files into an array of event objects.
 */
export function parseICS(icsText) {
  const events = []
  // Split on VEVENT blocks
  const blocks = icsText.split(/BEGIN:VEVENT/i).slice(1)

  for (const block of blocks) {
    const endIdx = block.search(/END:VEVENT/i)
    const body = endIdx > -1 ? block.slice(0, endIdx) : block

    // Unfold multi-line values (RFC 5545 §3.1)
    const unfolded = body.replace(/\r?\n[ \t]/g, '')
    const lines = unfolded.split(/\r?\n/)

    const props = {}
    const attendeeLines = []

    for (const line of lines) {
      const sep = line.indexOf(':')
      if (sep < 0) continue
      // Key may have parameters: DTSTART;TZID=America/New_York:...
      const keyFull = line.slice(0, sep)
      const key = keyFull.split(';')[0].toUpperCase()
      const value = line.slice(sep + 1).trim()
      if (key === 'ATTENDEE') {
        attendeeLines.push(line)
      } else if (!props[key]) {
        props[key] = value
      }
    }

    if (!props.SUMMARY && !props.UID) continue

    events.push({
      summary: props.SUMMARY || '(untitled event)',
      start: parseICSDate(props.DTSTART),
      end: parseICSDate(props.DTEND),
      location: props.LOCATION || '',
      description: (props.DESCRIPTION || '').replace(/\\n/g, '\n').replace(/\\,/g, ',').replace(/\\;/g, ';'),
      organizer: (props.ORGANIZER || '').replace(/^.*?mailto:/i, ''),
      attendees: parseAttendees(attendeeLines),
      uid: props.UID || '',
      status: props.STATUS || '',
    })
  }

  return events
}

function parseICSDate(str) {
  if (!str) return null
  try {
    // Strip TZID parameter if present: "TZID=...:20230101T100000"
    const clean = str.includes(':') ? str.split(':').pop() : str
    if (clean.length === 8) {
      // DATE-only: 20230101
      return new Date(`${clean.slice(0, 4)}-${clean.slice(4, 6)}-${clean.slice(6, 8)}`).toISOString()
    }
    // DATETIME: 20230101T100000Z or 20230101T100000
    const y = clean.slice(0, 4), mo = clean.slice(4, 6), d = clean.slice(6, 8)
    const h = clean.slice(9, 11), m = clean.slice(11, 13), s = clean.slice(13, 15)
    const z = clean.endsWith('Z') ? 'Z' : ''
    return new Date(`${y}-${mo}-${d}T${h}:${m}:${s}${z}`).toISOString()
  } catch {
    return str
  }
}

function parseAttendees(lines) {
  return lines.map((line) => {
    const emailMatch = line.match(/mailto:(.+?)(?:;|$)/i)
    const cnMatch = line.match(/CN=([^;:]+)/i)
    return {
      email: emailMatch ? emailMatch[1].trim() : '',
      name: cnMatch ? cnMatch[1].replace(/^["']|["']$/g, '').trim() : (emailMatch ? emailMatch[1].trim() : 'Unknown'),
    }
  }).filter((a) => a.email)
}
