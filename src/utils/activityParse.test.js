import { describe, it, expect } from 'vitest'
import { parseActivityContent, extractMyActivityHtml } from './activityParse'

const MYACTIVITY_HTML = `<html><head><title>My Activity History</title></head>
<body><div class="mdl-grid">
<div class="outer-cell mdl-cell mdl-cell--12-col mdl-shadow--2dp"><div class="mdl-grid">
<div class="header-cell mdl-cell mdl-cell--12-col"><p class="mdl-typography--title">YouTube<br></p></div>
<div class="content-cell mdl-cell mdl-cell--6-col mdl-typography--body-1">Watched <a href="https://www.youtube.com/watch?v=abc">Cool Video Title</a><br><a href="https://www.youtube.com/channel/x">Some Channel</a><br>Mar 3, 2026, 6:25:05 AM PDT<br></div>
<div class="content-cell mdl-cell mdl-cell--6-col mdl-typography--body-1 mdl-typography--text-right"></div>
<div class="content-cell mdl-cell mdl-cell--12-col mdl-typography--caption"><b>Products:</b><br>&emsp;YouTube<br></div>
</div></div>
<div class="outer-cell mdl-cell mdl-cell--12-col mdl-shadow--2dp"><div class="mdl-grid">
<div class="header-cell mdl-cell mdl-cell--12-col"><p class="mdl-typography--title">Search<br></p></div>
<div class="content-cell mdl-cell mdl-cell--6-col mdl-typography--body-1">Searched for cats &amp; dogs<br>Jul 23, 2025, 5:00:49 PM PDT<br></div>
</div></div>
</div></body></html>`

describe('extractMyActivityHtml', () => {
  it('extracts one record per outer-cell with product, title, link, and time', () => {
    const rows = extractMyActivityHtml(MYACTIVITY_HTML)
    expect(rows).toHaveLength(2)

    expect(rows[0].header).toBe('YouTube')
    expect(rows[0].title).toBe('Watched Cool Video Title')
    expect(rows[0].titleUrl).toBe('https://www.youtube.com/watch?v=abc')
    expect(rows[0].subtitle).toBe('Some Channel')
    // 6:25:05 AM PDT (UTC-7) === 13:25:05Z
    expect(rows[0].time).toBe('2026-03-03T13:25:05.000Z')

    expect(rows[1].header).toBe('Search')
    expect(rows[1].title).toBe('Searched for cats & dogs') // entity decoded
    // 5:00:49 PM PDT (UTC-7) === 00:00:49Z the next day
    expect(rows[1].time).toBe('2025-07-24T00:00:49.000Z')
  })

  it('returns [] for non-activity HTML', () => {
    expect(extractMyActivityHtml('<html><body>nope</body></html>')).toEqual([])
  })
})

describe('parseActivityContent routing', () => {
  it('routes My Activity HTML to myactivity mode', () => {
    const r = parseActivityContent(MYACTIVITY_HTML, { category: 'activity', fileName: 'MyActivity.html' })
    expect(r.mode).toBe('myactivity')
    expect(r.records.length).toBe(2)
  })

  it('routes CSV to table mode with columns + rows', () => {
    const csv = 'Owner,Account,ACV\nMatt,"Decked, LLC",17331\nJane,Acme,500'
    const r = parseActivityContent(csv, { category: 'drive', fileName: 'Owner_Change.csv' })
    expect(r.mode).toBe('table')
    expect(r.table.columns).toEqual(['Owner', 'Account', 'ACV'])
    expect(r.table.rows).toHaveLength(2)
    expect(r.table.rows[0]).toEqual(['Matt', 'Decked, LLC', '17331'])
  })

  it('still parses Chrome JSON history', () => {
    const json = { 'Browser History': [
      { url: 'https://example.com', title: 'Example', time_usec: 1700000000000000 },
    ] }
    const r = parseActivityContent(json, { category: 'chrome', fileName: 'History.json' })
    expect(r.mode).toBe('chrome')
    expect(r.records[0].titleUrl).toBe('https://example.com')
  })
})
