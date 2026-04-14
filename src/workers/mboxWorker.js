/**
 * mboxWorker.js
 *
 * Memory-safe architecture for arbitrarily large .mbox files:
 *
 *  SCAN PHASE  — reads file in 32 MB chunks, records only byte offsets
 *                (_starts[], _ends[]).  Two plain number arrays use ~16 bytes
 *                per email regardless of content, so 1M emails ≈ 16 MB.
 *                No email text is kept in worker memory after the scan.
 *
 *  PAGE PHASE  — main thread requests a page: worker reads the corresponding
 *                file slice (~300 emails worth), parses headers, returns.
 *                The slice is a local variable and is GC'd immediately after.
 *
 *  SEARCH      — worker re-scans the file in chunks, filtering on the fly.
 *                Streams partial results every 5 000 matches so the UI
 *                stays responsive during long searches.
 *
 *  BODY LOAD   — same file-slice approach as before.
 */

import { parseHeadersOnly, parseMessage } from '../utils/mboxParser'

const CHUNK_SIZE   = 32 * 1024 * 1024  // 32 MB read chunks during scan
const PAGE_READ_SAFETY = 1024           // byte padding when reading a page range

/** Byte sequence for "\nFrom " — works for CRLF mbox too (LF is matched inside \r\n). */
const NEEDLE_NL_FROM = new Uint8Array([0x0a, 0x46, 0x72, 0x6f, 0x6d, 0x20])

function concatBytes (a, b) {
  if (!a.length) return b
  if (!b.length) return a
  const o = new Uint8Array(a.length + b.length)
  o.set(a, 0)
  o.set(b, a.length)
  return o
}

function indexOfBytes (haystack, needle, start = 0) {
  const n = haystack.length
  const m = needle.length
  if (m === 0) return 0
  outer: for (let i = start; i + m <= n; i++) {
    for (let j = 0; j < m; j++) {
      if (haystack[i + j] !== needle[j]) continue outer
    }
    return i
  }
  return -1
}

function startsWithFromSpace (bytes, pos) {
  return (
    pos + 5 <= bytes.length &&
    bytes[pos] === 0x46 &&
    bytes[pos + 1] === 0x72 &&
    bytes[pos + 2] === 0x6f &&
    bytes[pos + 3] === 0x6d &&
    bytes[pos + 4] === 0x20
  )
}

/**
 * Indices in `bytes` where an mbox envelope line begins (the `F` of `From `).
 * Uses raw bytes so offsets stay aligned with file positions under UTF-8.
 */
function findMessageStartIndices (bytes) {
  const starts = []
  if (bytes.length >= 5 && startsWithFromSpace(bytes, 0)) starts.push(0)
  let p = 0
  while (p + 6 <= bytes.length) {
    const hit = indexOfBytes(bytes, NEEDLE_NL_FROM, p)
    if (hit === -1) break
    starts.push(hit + 1)
    p = hit + 1
  }
  return starts
}

function decodeUtf8 (bytes) {
  return new TextDecoder('utf-8', { fatal: false }).decode(bytes)
}

function extractGmailLabelsFromPrefix (bytes) {
  const cap = Math.min(bytes.length, 32768)
  const sample = decodeUtf8(bytes.subarray(0, cap))
  const lm = sample.match(/^X-Gmail-Labels:\s*(.+)$/im)
  return lm ? lm[1].split(',').map(s => s.trim()).filter(Boolean).join(',') : ''
}

// ── Per-scan state ────────────────────────────────────────────────────────────
let _files      = []     // one or more browser File objects (mbox sources)
let _fileIndex  = []     // per message: index into _files (file mode only)
let _textSource = null   // full mbox string when loaded from a zip

// These parallel arrays are the ENTIRE in-memory index.
// For 1 000 000 emails they use ≈ 16 MB combined.
let _starts = []  // approximate byte / char start of each email (per-file offset)
let _ends   = []  // approximate byte / char end   of each email
let _labels = []  // comma-separated Gmail labels string for each email
let _labelLists = new Map()  // label → filtered index array (cache)

// ── Message router ────────────────────────────────────────────────────────────
self.onmessage = async function (e) {
  const msg = e.data
  if (!msg) return
  switch (msg.type) {
    case 'loadBody':   await handleLoadBody(msg);  return
    case 'getPage':    await handleGetPage(msg);   return
    case 'search':     await handleSearch(msg);    return
    case 'getLabels':  handleGetLabels(msg);       return
    default:
      // ── New scan ──
      _files = []; _fileIndex = []; _textSource = null; _starts = []; _ends = []; _labels = []; _labelLists = new Map()
      if (msg.mboxFiles && msg.mboxFiles.length > 0) {
        for (const f of msg.mboxFiles) {
          if (f) await scanSingleFile(f)
        }
        self.postMessage({ type: 'done', total: _starts.length })
      } else if (msg.mboxFile) {
        await scanSingleFile(msg.mboxFile)
        self.postMessage({ type: 'done', total: _starts.length })
      } else if (msg.mboxText) {
        scanText(msg.mboxText)
      }
  }
}

// ─────────────────────────────────────────────────────────────────────────────
//  SCAN  —  file mode (streaming)
// ─────────────────────────────────────────────────────────────────────────────
async function scanSingleFile (file) {
  const fileIdx = _files.length
  _files.push(file)

  let leftover = new Uint8Array(0)
  let baseOffset = 0
  let lastProgressTime = 0

  for (let chunkStart = 0; chunkStart < file.size; chunkStart += CHUNK_SIZE) {
    const chunkEnd = Math.min(chunkStart + CHUNK_SIZE, file.size)
    const chunk = new Uint8Array(await file.slice(chunkStart, chunkEnd).arrayBuffer())
    const combined = concatBytes(leftover, chunk)
    const isLast = chunkEnd >= file.size

    const starts = findMessageStartIndices(combined)
    const n = starts.length
    const emitCount = isLast ? n : Math.max(0, n - 1)

    for (let i = 0; i < emitCount; i++) {
      const relEnd = i + 1 < n ? starts[i + 1] : combined.length
      const slice = combined.subarray(starts[i], relEnd)
      const startByte = baseOffset + starts[i]
      const endByte = baseOffset + relEnd

      _starts.push(startByte)
      _ends.push(endByte)
      _fileIndex.push(fileIdx)
      _labels.push(extractGmailLabelsFromPrefix(slice))
    }

    const now = Date.now()
    if (now - lastProgressTime > 300) {
      self.postMessage({ type: 'progress', progress: _starts.length, total: 0 })
      lastProgressTime = now
    }

    if (!isLast) {
      if (n === 0) {
        leftover = combined
      } else {
        const keep = starts[n - 1]
        leftover = combined.subarray(keep)
        baseOffset += keep
      }
    } else {
      leftover = new Uint8Array(0)
    }
  }
}

// ─────────────────────────────────────────────────────────────────────────────
//  SCAN  —  text mode (zip-extracted string)
// ─────────────────────────────────────────────────────────────────────────────
function scanText (text) {
  _textSource = text.replace(/\r\n/g, '\n')

  // Collect positions of every "From " envelope line
  const fromLinePositions = []
  if (_textSource.startsWith('From ')) fromLinePositions.push(0)
  let pos = 0
  while (true) {
    const idx = _textSource.indexOf('\nFrom ', pos)
    if (idx === -1) break
    fromLinePositions.push(idx + 1)
    pos = idx + 1
  }

  for (let i = 0; i < fromLinePositions.length; i++) {
    const fromStart    = fromLinePositions[i]
    const contentStart = _textSource.indexOf('\n', fromStart) + 1  // skip envelope line
    const contentEnd   = i + 1 < fromLinePositions.length
      ? fromLinePositions[i + 1]
      : _textSource.length

    if (contentStart > 0) {
      _starts.push(contentStart)
      _ends.push(contentEnd)
      // Extract labels from the text slice
      const emailRaw = _textSource.slice(contentStart, contentEnd)
      const lm = emailRaw.match(/^X-Gmail-Labels:\s*(.+)$/im)
      const lbl = lm ? lm[1].split(',').map(s => s.trim()).filter(Boolean).join(',') : ''
      _labels.push(lbl)
    }
    if ((i + 1) % 500 === 0) {
      self.postMessage({ type: 'progress', progress: i + 1, total: fromLinePositions.length })
    }
  }

  self.postMessage({ type: 'done', total: _starts.length })
}

// ─────────────────────────────────────────────────────────────────────────────
//  LABELS
// ─────────────────────────────────────────────────────────────────────────────

/** Build (and cache) an array of email indices that have the given label. */
function getFilteredList(label) {
  if (_labelLists.has(label)) return _labelLists.get(label)
  const list = []
  for (let i = 0; i < _labels.length; i++) {
    if ((_labels[i] || '').split(',').some(l => l.trim() === label)) list.push(i)
  }
  _labelLists.set(label, list)
  return list
}

function handleGetLabels({ requestId }) {
  const counts = new Map()
  for (const lstr of _labels) {
    if (!lstr) continue
    for (const l of lstr.split(',')) {
      const t = l.trim()
      if (t) counts.set(t, (counts.get(t) || 0) + 1)
    }
  }
  const ORDER = ['Inbox','Sent','Starred','Important','Trash','Spam',
                 'Category Promotions','Category Social','Category Updates',
                 'Category Forums','Category Personal']
  const sorted = [...counts.entries()].sort(([a],[b]) => {
    const ai = ORDER.indexOf(a), bi = ORDER.indexOf(b)
    if (ai === -1 && bi === -1) return a.localeCompare(b)
    if (ai === -1) return 1
    if (bi === -1) return -1
    return ai - bi
  })
  self.postMessage({ type: 'labels', labels: sorted.map(([name,count]) => ({name,count})), requestId })
}

// ─────────────────────────────────────────────────────────────────────────────
//  GET PAGE  —  parse headers for a slice of the index, on demand
// ─────────────────────────────────────────────────────────────────────────────
async function handleGetPage ({ start, count, labelFilter, requestId }) {
  const filteredList = (labelFilter && labelFilter !== 'All') ? getFilteredList(labelFilter) : null
  const total = filteredList ? filteredList.length : _starts.length

  const end = Math.min(start + count, total)
  if (start >= total) {
    self.postMessage({ type: 'page', emails: [], start, total, requestId })
    return
  }

  // Get the actual email indices to load
  const indices = filteredList
    ? filteredList.slice(start, end)
    : Array.from({ length: end - start }, (_, i) => start + i)

  const emails = _textSource
    ? parseIndicesFromText(indices)
    : await parseIndicesFromFile(indices)

  self.postMessage({ type: 'page', emails, start, total, requestId })
}

// ─────────────────────────────────────────────────────────────────────────────
//  SEARCH
// ─────────────────────────────────────────────────────────────────────────────
async function handleSearch ({ query, labelFilter, start = 0, count = 1000, requestId }) {
  const q = (query || '').toLowerCase().trim()
  const labeledIndices = (labelFilter && labelFilter !== 'All') ? getFilteredList(labelFilter) : null

  if (!q) {
    // Just a label filter with no text query — build inline
    const src = labeledIndices || Array.from({ length: _starts.length }, (_, i) => i)
    const total = src.length
    const emails = _textSource
      ? parseIndicesFromText(src.slice(start, start + count))
      : await parseIndicesFromFile(src.slice(start, start + count))
    self.postMessage({ type: 'searchResults', emails, total, start, requestId })
    return
  }

  // Text search, optionally within label filter
  let matches
  if (_textSource) {
    const pool = labeledIndices || Array.from({ length: _starts.length }, (_, i) => i)
    matches = []
    for (const idx of pool) {
      const raw = _textSource.slice(_starts[idx], _ends[idx])
      // Search full message text (snippet alone misses body matches)
      if (!raw.toLowerCase().includes(q)) continue
      const meta = parseHeadersOnly(raw)
      meta._emailIndex = idx
      meta._labels = _labels[idx] || ''
      matches.push(meta)
    }
  } else {
    const allowedSet = labeledIndices ? new Set(labeledIndices) : null
    matches = await searchInFile(q, allowedSet)
  }

  self.postMessage({ type: 'searchResults', emails: matches.slice(start, start + count), total: matches.length, start, requestId })
}

// ─────────────────────────────────────────────────────────────────────────────
//  BODY LOAD
// ─────────────────────────────────────────────────────────────────────────────
async function handleLoadBody ({ emailIndex, requestId }) {
  try {
    if (emailIndex < 0 || emailIndex >= _starts.length) {
      throw new Error(`Email index ${emailIndex} out of range`)
    }

    let emailRaw

    if (_textSource) {
      // Text mode: slice from the in-memory string
      emailRaw = _textSource.slice(_starts[emailIndex], _ends[emailIndex])
    } else if (_files.length > 0) {
      const file = _files[_fileIndex[emailIndex]]
      const byteStart = _starts[emailIndex]
      const byteEnd   = _ends[emailIndex]
      const buffer = await file.slice(byteStart, byteEnd).arrayBuffer()
      emailRaw = new TextDecoder('utf-8', { fatal: false }).decode(buffer)
    } else {
      throw new Error('No data source available')
    }

    const full = parseMessage(emailRaw)
    self.postMessage({ type: 'emailBody', emailIndex, email: full, requestId })
  } catch (err) {
    self.postMessage({ type: 'bodyError', emailIndex, message: err.message, requestId })
  }
}

// ─────────────────────────────────────────────────────────────────────────────
//  Helpers — index-based parsing
// ─────────────────────────────────────────────────────────────────────────────

/** Parse headers for an array of email indices from the in-memory text string. */
function parseIndicesFromText(indices) {
  return indices.map((idx) => {
    const raw  = _textSource.slice(_starts[idx], _ends[idx])
    const meta = parseHeadersOnly(raw)
    meta._emailIndex = idx
    meta._labels = _labels[idx] || ''
    return meta
  })
}

/**
 * Parse headers for an array of email indices from one or more files.
 * Indices that share a file are batched; byte offsets are only comparable within a file.
 */
async function parseIndicesFromFile(indices) {
  if (!indices.length) return []

  const slot = new Map(indices.map((idx, pos) => [idx, pos]))
  const byFile = new Map()
  for (const idx of indices) {
    const fi = _fileIndex[idx]
    if (!byFile.has(fi)) byFile.set(fi, [])
    byFile.get(fi).push(idx)
  }

  const results = new Array(indices.length)
  for (const idxs of byFile.values()) {
    const part = await parseIndicesFromFileSameFile(idxs)
    for (const meta of part) {
      results[slot.get(meta._emailIndex)] = meta
    }
  }
  return results
}

/**
 * Parse headers for indices that all belong to the same underlying mbox file.
 * Each message is read by exact [start,end) byte range (no string re-splitting).
 */
async function parseIndicesFromFileSameFile (indices) {
  if (!indices.length) return []

  const file = _files[_fileIndex[indices[0]]]
  const decoder = new TextDecoder('utf-8', { fatal: false })

  const results = new Array(indices.length)
  const batch = await Promise.all(
    indices.map(async (idx, slot) => {
      const bs = _starts[idx]
      const be = _ends[idx]
      const buf = await file.slice(bs, be).arrayBuffer()
      const text = decoder.decode(buf)
      const meta = parseHeadersOnly(text)
      meta._emailIndex = idx
      meta._byteStart = bs
      meta._byteEnd = be
      meta._labels = _labels[idx] || ''
      return { slot, meta }
    })
  )
  for (const { slot, meta } of batch) {
    results[slot] = meta
  }
  return results
}

// ─────────────────────────────────────────────────────────────────────────────
//  Helpers — range-based parsing (legacy, kept for compatibility)
// ─────────────────────────────────────────────────────────────────────────────

/** Parse headers for index range [start, end) from the in-memory text string. */
function parseRangeFromText (start, end) {
  const emails = []
  for (let i = start; i < end; i++) {
    const raw  = _textSource.slice(_starts[i], _ends[i])
    const meta = parseHeadersOnly(raw)
    meta._emailIndex = i
    meta._labels = _labels[i] || ''
    emails.push(meta)
  }
  return emails
}

/**
 * Parse headers for index range [start, end) from the file.
 * Reads ONE file slice covering the whole range (efficient).
 */
async function parseRangeFromFile (start, end) {
  if (!_files.length) return []
  const file = _files[_fileIndex[start]]
  const rangeByteStart = Math.max(0, _starts[start] - PAGE_READ_SAFETY)
  const rangeByteEnd   = Math.min(file.size, _ends[end - 1] + PAGE_READ_SAFETY)

  const buffer  = await file.slice(rangeByteStart, rangeByteEnd).arrayBuffer()
  const decoder = new TextDecoder('utf-8', { fatal: false })
  const text    = decoder.decode(buffer)

  // Re-find "From " boundaries within this slice
  const boundaries = []
  if (text.startsWith('From ')) boundaries.push(0)
  let sp = 0
  while (true) {
    const idx = text.indexOf('\nFrom ', sp)
    if (idx === -1) break
    boundaries.push(idx + 1)
    sp = idx + 1
  }

  const emails = []
  const take   = Math.min(end - start, boundaries.length)

  for (let i = 0; i < take; i++) {
    const bStart = boundaries[i]
    const bEnd   = i + 1 < boundaries.length ? boundaries[i + 1] - 1 : text.length

    const msgText = text.slice(bStart, bEnd)
    const firstNL = msgText.indexOf('\n')
    const emailRaw = firstNL > -1 ? msgText.substring(firstNL + 1) : msgText

    const meta = parseHeadersOnly(emailRaw)
    meta._emailIndex = start + i
    meta._byteStart  = _starts[start + i]
    meta._byteEnd    = _ends[start + i]
    meta._labels = _labels[start + i] || ''
    emails.push(meta)
  }

  // buffer, text, and boundaries are local — GC'd here
  return emails
}

/** Full-text-mode search (all in memory, synchronous). Unused — kept for reference. */
function searchInText (q) {
  const results = []
  for (let i = 0; i < _starts.length; i++) {
    const raw = _textSource.slice(_starts[i], _ends[i])
    if (!raw.toLowerCase().includes(q)) continue
    const meta = parseHeadersOnly(raw)
    meta._emailIndex = i
    meta._labels = _labels[i] || ''
    results.push(meta)
  }
  return results
}

/**
 * File-mode search — re-scans in 32 MB chunks.
 * Async so the worker event loop can still handle other messages between chunks.
 * @param {string} q - lowercase search query
 * @param {Set|null} allowedIndices - if set, only include emails in this set
 */
async function searchInFile (q, allowedIndices = null) {
  const results = []
  const startMap = new Map()
  for (let i = 0; i < _starts.length; i++) {
    startMap.set(`${_fileIndex[i]}:${_starts[i]}`, i)
  }

  for (let fi = 0; fi < _files.length; fi++) {
    const file = _files[fi]
    let leftover = new Uint8Array(0)
    let baseOffset = 0

    for (let chunkStart = 0; chunkStart < file.size; chunkStart += CHUNK_SIZE) {
      const chunkEnd = Math.min(chunkStart + CHUNK_SIZE, file.size)
      const chunk = new Uint8Array(await file.slice(chunkStart, chunkEnd).arrayBuffer())
      const combined = concatBytes(leftover, chunk)
      const isLast = chunkEnd >= file.size

      const starts = findMessageStartIndices(combined)
      const n = starts.length
      const emitCount = isLast ? n : Math.max(0, n - 1)

      for (let i = 0; i < emitCount; i++) {
        const relEnd = i + 1 < n ? starts[i + 1] : combined.length
        const slice = combined.subarray(starts[i], relEnd)
        const absStart = baseOffset + starts[i]
        const emailIdx = startMap.get(`${fi}:${absStart}`) ?? -1
        if (emailIdx < 0) continue
        if (allowedIndices && !allowedIndices.has(emailIdx)) continue

        const rawStr = decodeUtf8(slice)
        if (!rawStr.toLowerCase().includes(q)) continue

        const meta = parseHeadersOnly(rawStr)
        meta._emailIndex = emailIdx
        meta._byteStart = absStart
        meta._labels = _labels[emailIdx] || ''
        results.push(meta)
      }

      if (!isLast) {
        if (n === 0) {
          leftover = combined
        } else {
          const keep = starts[n - 1]
          leftover = combined.subarray(keep)
          baseOffset += keep
        }
      } else {
        leftover = new Uint8Array(0)
      }
    }
  }

  return results
}
