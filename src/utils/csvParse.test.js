import { describe, it, expect } from 'vitest'
import { parseCSV, looksLikeCSV } from './csvParse'

describe('parseCSV', () => {
  it('parses a simple header + rows', () => {
    const { columns, rows } = parseCSV('a,b,c\n1,2,3\n4,5,6')
    expect(columns).toEqual(['a', 'b', 'c'])
    expect(rows).toEqual([['1', '2', '3'], ['4', '5', '6']])
  })

  it('handles quoted fields with embedded commas', () => {
    const { columns, rows } = parseCSV('name,city\n"Smith, John","New York, NY"')
    expect(columns).toEqual(['name', 'city'])
    expect(rows[0]).toEqual(['Smith, John', 'New York, NY'])
  })

  it('handles escaped double-quotes', () => {
    const { rows } = parseCSV('q\n"She said ""hi"""')
    expect(rows[0]).toEqual(['She said "hi"'])
  })

  it('handles newlines inside quoted fields', () => {
    const { rows } = parseCSV('a,b\n"line1\nline2",x')
    expect(rows).toHaveLength(1)
    expect(rows[0]).toEqual(['line1\nline2', 'x'])
  })

  it('normalizes CRLF and ragged rows to header width', () => {
    const { columns, rows } = parseCSV('a,b,c\r\n1,2\r\n3,4,5,6')
    expect(columns).toHaveLength(3)
    expect(rows[0]).toEqual(['1', '2', ''])   // padded
    expect(rows[1]).toEqual(['3', '4', '5'])  // truncated
  })

  it('returns empty for blank input', () => {
    expect(parseCSV('')).toEqual({ columns: [], rows: [] })
    expect(parseCSV('   ')).toEqual({ columns: [], rows: [] })
  })

  it('ignores a trailing newline (no phantom empty row)', () => {
    const { rows } = parseCSV('a,b\n1,2\n')
    expect(rows).toHaveLength(1)
  })
})

describe('looksLikeCSV', () => {
  it('detects by .csv filename', () => {
    expect(looksLikeCSV('anything', 'Report.csv')).toBe(true)
  })
  it('detects comma-delimited multiline text', () => {
    expect(looksLikeCSV('a,b,c\n1,2,3')).toBe(true)
  })
  it('rejects JSON and HTML', () => {
    expect(looksLikeCSV('{"a":1}')).toBe(false)
    expect(looksLikeCSV('<html><body>x</body></html>')).toBe(false)
  })
})
