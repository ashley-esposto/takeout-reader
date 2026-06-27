// Generated initials avatar (no external/proprietary imagery) — a Gmail-like
// visual cue built entirely from the sender's name/email.

const AVATAR_COLORS = [
  '#1a73e8', '#d93025', '#188038', '#e8710a', '#9334e6',
  '#129eaf', '#ad1457', '#00897b', '#3949ab', '#5f6368',
]

function hashStr(s) {
  let h = 0
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0
  return Math.abs(h)
}

function initialsFrom(name, email) {
  const base = (name || email || '').trim()
  if (!base) return '?'
  // Bare email (no real name): use the first letter.
  if (!name && /@/.test(base)) return base[0].toUpperCase()
  const parts = base.split(/\s+/).filter(Boolean)
  if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase()
  return base.slice(0, 1).toUpperCase()
}

export default function Avatar({ name, email, size = 36 }) {
  const key = (email || name || '').toLowerCase()
  const color = AVATAR_COLORS[hashStr(key) % AVATAR_COLORS.length]
  return (
    <span
      className="avatar"
      style={{ width: size, height: size, background: color, fontSize: Math.round(size * 0.4) }}
      aria-hidden="true"
    >
      {initialsFrom(name, email)}
    </span>
  )
}
