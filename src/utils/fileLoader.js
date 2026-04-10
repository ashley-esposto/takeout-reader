import JSZip from 'jszip'

/**
 * Category detection rules — ordered by priority.
 * key: internal category name
 * test: function(lowercasePath) => boolean
 */
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
 * @param {File} file - .zip or .mbox File object
 * @returns {{ type: string, categories: Record<string, Array<{name, getContent}>> }}
 */
export async function scanTakeout(file) {
  const nameLower = file.name.toLowerCase()

  // Direct .mbox upload — just mail category
  if (nameLower.endsWith('.mbox')) {
    const content = await readFileAsText(file)
    return {
      type: 'direct-mbox',
      categories: {
        mail: [{ name: file.name, getContent: async () => content }],
      },
    }
  }

  if (!nameLower.endsWith('.zip')) {
    throw new Error(
      `Unsupported file type "${file.name}". Please upload a Google Takeout .zip archive or a Gmail .mbox file.`
    )
  }

  let zip
  try {
    zip = await JSZip.loadAsync(file)
  } catch (err) {
    throw new Error(
      `Could not open the zip file. Make sure it is a valid, complete Google Takeout archive. (${err.message})`
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

function readFileAsText(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = (e) => resolve(e.target.result)
    reader.onerror = () =>
      reject(new Error('Could not read the file. Try again or check the file is not corrupted.'))
    reader.readAsText(file)
  })
}
