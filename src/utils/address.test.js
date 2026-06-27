import { describe, it, expect } from 'vitest'
import { parseAddress, splitAddresses } from './address'

describe('parseAddress', () => {
  it('parses name + email', () => {
    expect(parseAddress('Alice Smith <alice@x.com>')).toEqual({ name: 'Alice Smith', email: 'alice@x.com' })
  })
  it('strips quotes around the display name', () => {
    expect(parseAddress('"Smith, Alice" <a@x.com>')).toEqual({ name: 'Smith, Alice', email: 'a@x.com' })
  })
  it('handles a bare email', () => {
    expect(parseAddress('bob@x.com')).toEqual({ name: 'bob@x.com', email: 'bob@x.com' })
  })
  it('falls back to email when no display name', () => {
    expect(parseAddress('<c@x.com>')).toEqual({ name: 'c@x.com', email: 'c@x.com' })
  })
  it('is empty-safe', () => {
    expect(parseAddress('')).toEqual({ name: '', email: '' })
    expect(parseAddress(null)).toEqual({ name: '', email: '' })
  })
})

describe('splitAddresses', () => {
  it('splits a recipient list', () => {
    const r = splitAddresses('Alice <a@x.com>, bob@y.com')
    expect(r.map((a) => a.email)).toEqual(['a@x.com', 'bob@y.com'])
  })
  it('does not split on commas inside a quoted name', () => {
    const r = splitAddresses('"Doe, John" <j@x.com>, Jane <jane@y.com>')
    expect(r.map((a) => a.name)).toEqual(['Doe, John', 'Jane'])
  })
})
