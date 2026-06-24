import { describe, it, expect } from 'vitest'
import { isMboxFromLine, parseMessage, parseHeadersOnly } from './mboxParser'

describe('isMboxFromLine', () => {
  it('accepts genuine Gmail Takeout envelope lines', () => {
    expect(isMboxFromLine('From 1736792400000000000 Sat Jan 13 12:00:00 +0000 2024')).toBe(true)
  })

  it('accepts classic Unix asctime envelope lines', () => {
    expect(isMboxFromLine('From sender@example.com Mon Jan  1 00:00:00 2024')).toBe(true)
  })

  it('accepts RFC-style date envelope lines', () => {
    expect(isMboxFromLine('From user@host Thu, 01 Jan 2024 09:30:00 -0800')).toBe(true)
  })

  it('rejects body lines that merely start with "From "', () => {
    expect(isMboxFromLine('From the desk of the CEO')).toBe(false)
    expect(isMboxFromLine('From now on, please reply promptly')).toBe(false)
    expect(isMboxFromLine('From our team to yours')).toBe(false)
  })

  it('rejects a "From " line carrying a year but no weekday or month', () => {
    expect(isMboxFromLine('From now until 2025 we keep growing')).toBe(false)
  })

  it('rejects lines that do not start with "From "', () => {
    expect(isMboxFromLine('Subject: From Jan, Mon, 2024')).toBe(false)
    expect(isMboxFromLine('>From escaped body line Mon Jan 2024')).toBe(false)
    expect(isMboxFromLine('')).toBe(false)
  })

  it('is null/undefined safe', () => {
    expect(isMboxFromLine(null)).toBe(false)
    expect(isMboxFromLine(undefined)).toBe(false)
  })
})

describe('parseMessage', () => {
  it('parses a simple plain-text message', () => {
    const raw = [
      'From: Alice <alice@example.com>',
      'To: bob@example.com',
      'Subject: Hello',
      'Date: Mon, 01 Jan 2024 09:00:00 +0000',
      '',
      'This is the body.',
    ].join('\n')
    const m = parseMessage(raw)
    expect(m.from).toBe('Alice <alice@example.com>')
    expect(m.subject).toBe('Hello')
    expect(m.textBody.trim()).toBe('This is the body.')
  })

  it('decodes RFC 2047 encoded-word subjects (base64 + quoted)', () => {
    const b64 = parseMessage('Subject: =?UTF-8?B?SGVsbG8g8J+Ygg==?=\n\nbody')
    expect(b64.subject).toBe('Hello \u{1F602}')
    const qp = parseMessage('Subject: =?UTF-8?Q?Caf=C3=A9_time?=\n\nbody')
    expect(qp.subject).toBe('Café time')
  })

  it('decodes a quoted-printable UTF-8 body', () => {
    const raw = [
      'Subject: QP',
      'Content-Type: text/plain; charset=UTF-8',
      'Content-Transfer-Encoding: quoted-printable',
      '',
      'Caf=C3=A9 =E2=80=94 na=C3=AFve',
    ].join('\n')
    expect(parseMessage(raw).textBody.trim()).toBe('Café — naïve')
  })

  it('decodes a base64 body with charset', () => {
    const raw = [
      'Subject: B64',
      'Content-Type: text/plain; charset=UTF-8',
      'Content-Transfer-Encoding: base64',
      '',
      Buffer.from('Héllo 🌍', 'utf-8').toString('base64'),
    ].join('\n')
    expect(parseMessage(raw).textBody.trim()).toBe('Héllo 🌍')
  })

  it('extracts text and html from multipart/alternative', () => {
    const raw = [
      'Subject: Multi',
      'Content-Type: multipart/alternative; boundary="BOUND"',
      '',
      '--BOUND',
      'Content-Type: text/plain; charset=UTF-8',
      '',
      'plain version',
      '--BOUND',
      'Content-Type: text/html; charset=UTF-8',
      '',
      '<p>html version</p>',
      '--BOUND--',
    ].join('\n')
    const m = parseMessage(raw)
    expect(m.textBody).toContain('plain version')
    expect(m.htmlBody).toContain('<p>html version</p>')
  })

  it('recurses into nested multipart (mixed → alternative)', () => {
    const raw = [
      'Subject: Nested',
      'Content-Type: multipart/mixed; boundary="OUT"',
      '',
      '--OUT',
      'Content-Type: multipart/alternative; boundary="IN"',
      '',
      '--IN',
      'Content-Type: text/plain',
      '',
      'inner plain',
      '--IN',
      'Content-Type: text/html',
      '',
      '<b>inner html</b>',
      '--IN--',
      '--OUT--',
    ].join('\n')
    const m = parseMessage(raw)
    expect(m.textBody).toContain('inner plain')
    expect(m.htmlBody).toContain('<b>inner html</b>')
  })

  it('falls back through alternate From headers when From: is absent', () => {
    const m = parseMessage('Sender: fallback@example.com\nSubject: S\n\nbody')
    expect(m.from).toBe('fallback@example.com')
  })
})

describe('parseHeadersOnly', () => {
  it('returns metadata and a trimmed snippet without loading the full body shape', () => {
    const raw = [
      'From: Carol <carol@example.com>',
      'Subject: Snippet test',
      '',
      'First line of body.\nSecond line of body.',
    ].join('\n')
    const meta = parseHeadersOnly(raw)
    expect(meta.from).toBe('Carol <carol@example.com>')
    expect(meta.subject).toBe('Snippet test')
    expect(meta.snippet).toBe('First line of body. Second line of body.')
    expect(meta._bodyLoaded).toBe(false)
    expect(meta.rawHeaders).toBe('')
  })
})
