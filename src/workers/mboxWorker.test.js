import { describe, it, expect, beforeAll } from 'vitest'

/**
 * Integration test for the mbox worker's streaming (Blob/file) scan path —
 * the same path the app uses for zip-extracted mailboxes after the perf change.
 * We mock `self` so the worker module can register its message handler in Node.
 */

const posted = []
let handler

beforeAll(async () => {
  globalThis.self = {
    postMessage: (m) => posted.push(m),
    set onmessage(fn) { handler = fn },
    get onmessage() { return handler },
  }
  await import('./mboxWorker.js')
})

function send(data) {
  posted.length = 0
  return handler({ data })
}

// Two real messages. The first body contains a line beginning with "From "
// that must NOT be treated as a message boundary.
const MBOX = [
  'From 1700000000 Mon Jan 01 00:00:00 +0000 2024',
  'From: alice@example.com',
  'Subject: First message',
  'Date: Mon, 01 Jan 2024 00:00:00 +0000',
  '',
  'Hello there.',
  'From now on we will proceed carefully.',
  'Regards.',
  'From 1700000001 Tue Jan 02 00:00:00 +0000 2024',
  'From: bob@example.com',
  'Subject: Second message',
  'Date: Tue, 02 Jan 2024 00:00:00 +0000',
  '',
  'Second body.',
  '',
].join('\n')

describe('mboxWorker streaming scan (Blob input)', () => {
  it('scans a Blob and counts only genuine message boundaries', async () => {
    await send({ mboxFile: new Blob([MBOX]) })
    const done = posted.find((m) => m.type === 'done')
    expect(done).toBeTruthy()
    // 2 messages — the body "From now on…" line must not split message one.
    expect(done.total).toBe(2)
  })

  it('returns parsed headers for a page', async () => {
    await send({ type: 'getPage', start: 0, count: 10, requestId: 'p1' })
    const page = posted.find((m) => m.type === 'page')
    expect(page.emails).toHaveLength(2)
    expect(page.emails[0].subject).toBe('First message')
    expect(page.emails[0].from).toBe('alice@example.com')
    expect(page.emails[1].subject).toBe('Second message')
    expect(page.emails[1].from).toBe('bob@example.com')
  })

  it('loads a full message body by index', async () => {
    await send({ type: 'loadBody', emailIndex: 0, requestId: 'b1' })
    const body = posted.find((m) => m.type === 'emailBody')
    expect(body.email.textBody).toContain('Hello there.')
    expect(body.email.textBody).toContain('From now on we will proceed carefully.')
  })

  it('finds matches in a full-text search', async () => {
    await send({ type: 'search', query: 'second body', start: 0, count: 10, requestId: 's1' })
    const res = posted.find((m) => m.type === 'searchResults')
    expect(res.total).toBe(1)
    expect(res.emails[0].subject).toBe('Second message')
  })
})
