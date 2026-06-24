import { describe, it, expect } from 'vitest'
import { toCSV, toJSON, safeStem } from './exporters'

const COLS = [
  { key: 'from', label: 'From' },
  { key: 'subject', label: 'Subject' },
  { key: 'date', label: 'Date' },
]

describe('toCSV', () => {
  it('writes a header row from column labels', () => {
    expect(toCSV([], COLS)).toBe('From,Subject,Date')
  })

  it('quotes fields containing commas, quotes, or newlines', () => {
    const rows = [{ from: 'a@x.com', subject: 'Hello, "world"', date: 'line1\nline2' }]
    const csv = toCSV(rows, COLS)
    expect(csv.split('\r\n')[1]).toBe('a@x.com,"Hello, ""world""","line1\nline2"')
  })

  it('guards against CSV formula injection', () => {
    const rows = [{ from: '=SUM(A1:A2)', subject: '+cmd', date: '@evil' }]
    const csv = toCSV(rows, COLS).split('\r\n')[1]
    // Each dangerous cell is prefixed with a single quote.
    expect(csv).toBe("'=SUM(A1:A2),'+cmd,'@evil")
  })

  it('renders null/undefined cells as empty', () => {
    const rows = [{ from: null, subject: undefined, date: '' }]
    expect(toCSV(rows, COLS).split('\r\n')[1]).toBe(',,')
  })
})

describe('toJSON', () => {
  it('pretty-prints rows', () => {
    expect(toJSON([{ a: 1 }])).toBe('[\n  {\n    "a": 1\n  }\n]')
  })
})

describe('safeStem', () => {
  it('sanitizes labels and falls back', () => {
    expect(safeStem('Inbox / 2024!')).toBe('Inbox_2024_')
    expect(safeStem('')).toBe('export')
    expect(safeStem('   ', 'query')).toBe('query')
  })
})
