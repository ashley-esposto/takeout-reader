import JSZip from 'jszip'

const CHUNK_SIZE = 32 * 1024 * 1024 // 32 MiB — avoids some Chrome/Windows failures on one-shot reads

function readViaFileReader(file) {
  return new Promise((resolve, reject) => {
    const fr = new FileReader()
    fr.onload = () => resolve(fr.result)
    fr.onerror = () => reject(fr.error || new Error('FileReader could not read this file'))
    fr.readAsArrayBuffer(file)
  })
}

/** Read via slice() + arrayBuffer per chunk — works when a single full-file read fails. */
async function readViaSliceChunks(file) {
  const size = file.size
  const out = new Uint8Array(size)
  let offset = 0
  while (offset < size) {
    const end = Math.min(offset + CHUNK_SIZE, size)
    const blob = file.slice(offset, end)
    const buf = await blob.arrayBuffer()
    out.set(new Uint8Array(buf), offset)
    offset = end
  }
  return out.buffer
}

/** Read via File.stream() — another path the browser may implement differently. */
async function readViaStream(file) {
  if (typeof file.stream !== 'function') {
    throw new Error('ReadableStream not supported for this file')
  }
  const reader = file.stream().getReader()
  const chunks = []
  let total = 0
  while (true) {
    const { done, value } = await reader.read()
    if (done) break
    chunks.push(value)
    total += value.byteLength
  }
  const out = new Uint8Array(total)
  let pos = 0
  for (const c of chunks) {
    out.set(c, pos)
    pos += c.byteLength
  }
  return out.buffer
}

/**
 * Read a user-selected File into an ArrayBuffer using several strategies.
 * Chrome on Windows sometimes throws NotReadableError on file.arrayBuffer() even for
 * ordinary local Downloads; chunk / stream reads often still work.
 */
async function readFileAsArrayBuffer(file) {
  const hints =
    'Try: copy the .zip to another folder (e.g. Desktop), use “Choose file” instead of drag-and-drop, ' +
    'pause antivirus for this file momentarily, or use Firefox/Edge. ' +
    'Exports over ~2 GB may exceed what this browser tab can load in memory.'

  // Large files: chunked read first — one-shot arrayBuffer() often fails on multi‑GB zips in Chrome
  if (file.size > 200 * 1024 * 1024) {
    try {
      return await readViaSliceChunks(file)
    } catch {
      /* fall through to chain */
    }
  }

  try {
    return await file.arrayBuffer()
  } catch (e1) {
    try {
      return await readViaFileReader(file)
    } catch (e2) {
      try {
        return await readViaSliceChunks(file)
      } catch (e3) {
        try {
          return await readViaStream(file)
        } catch (e4) {
          const detail =
            e4?.message || e3?.message || e2?.message || e1?.message || 'Read failed'
          throw new Error(`${detail} ${hints}`)
        }
      }
    }
  }
}

const CATEGORY_RULES = [
  { key: 'mail',     test: (p) => p.endsWith('.mbox') },
  { key: 'chat',     test: (p) => (p.includes('google chat') || p.includes('hangouts')) && p.endsWith('.json') },
  { key: 'calendar', test: (p) => p.endsWith('.ics') },
  { key: 'contacts', test: (p) => p.endsWith('.vcf') },
  { key: 'activity', test: (p) => p.includes('my activity') && (p.endsWith('.json') || p.endsWith('.html')) },
  { key: 'location', test: (p) => (p.includes('location history') || p.includes('location_history')) && (p.endsWith('.json') || p.endsWith('.kml')) },
  { key: 'chrome',   test: (p) => p.includes('/chrome/') && (p.endsWith('.json') || p.endsWith('.html')) },
  { key: 'youtube',  test: (p) => (p.includes('youtube') || p.includes('youtube and youtube music')) && (p.endsWith('.json') || p.endsWith('.html')) },
  { key: 'drive',    test: (p) => p.includes('/drive/') && (p.endsWith('.json') || p.endsWith('.csv')) },
]

/**
 * Scan a Google Takeout file and return all found categories.
 * @param {File} file - Raw File object from the browser input
 */
export async function scanTakeout(file) {
  const nameLower = file.name.toLowerCase()

  // Direct .mbox — store the File object; worker will stream-read it in chunks
  if (nameLower.endsWith('.mbox')) {
    return {
      type: 'direct-mbox',
      categories: {
        mail: [{ name: file.name, file }],
      },
    }
  }

  if (!nameLower.endsWith('.zip')) {
    throw new Error(
      `Unsupported file type "${file.name}". Please upload a Google Takeout .zip archive or a Gmail .mbox file.`
    )
  }

  // Read the zip in one go — zip files are typically much smaller than raw mbox
  let buffer
  try {
    buffer = await readFileAsArrayBuffer(file)
  } catch (err) {
    throw new Error(`Could not read the zip from your device. ${err.message}`)
  }

  let zip
  try {
    zip = await JSZip.loadAsync(buffer)
  } catch (err) {
    throw new Error(
      `Could not open the zip file. It may be corrupt or incomplete. (${err.message})`
    )
  }

  const categories = {}
  const allEntries = Object.values(zip.files).filter((f) => !f.dir)

  for (const entry of allEntries) {
    const pathLower = entry.name.toLowerCase()
    const rule = CATEGORY_RULES.find((r) => r.test(pathLower))
    const key = rule ? rule.key : null
    if (!key) continue

    if (!categories[key]) categories[key] = []
    categories[key].push({
      name: entry.name,
      getContent: (format = 'string') => entry.async(format),
    })
  }

  if (Object.keys(categories).length === 0) {
    throw new Error(
      'No recognizable Google Takeout data found in this zip. ' +
      'Make sure you are uploading a Google Takeout export (from takeout.google.com).'
    )
  }

  return { type: 'takeout-zip', categories }
}

/**
 * Scan several Takeout zips and/or .mbox files and merge categories (e.g. multiple exports or accounts).
 */
export async function scanTakeoutFiles(fileList) {
  const files = Array.from(fileList || []).filter(Boolean)
  if (files.length === 0) {
    throw new Error('No files selected.')
  }
  if (files.length === 1) {
    return scanTakeout(files[0])
  }

  const merged = { type: 'merged-takeout', categories: {} }
  for (const file of files) {
    const one = await scanTakeout(file)
    for (const [key, arr] of Object.entries(one.categories)) {
      if (!merged.categories[key]) merged.categories[key] = []
      merged.categories[key].push(...(arr || []))
    }
  }

  if (Object.keys(merged.categories).length === 0) {
    throw new Error(
      'No recognizable Google Takeout data in the selected files. ' +
      'Upload .zip archives from takeout.google.com and/or Gmail .mbox files.'
    )
  }

  return merged
}
