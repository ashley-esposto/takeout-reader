import JSZip from 'jszip'

/**
 * Load a File object as an mbox string.
 * Handles both .zip (Google Takeout archive) and .mbox directly.
 */
export async function loadFile(file) {
  if (file.name.endsWith('.zip')) {
    return extractMboxFromZip(file)
  }
  return readAsText(file)
}

async function extractMboxFromZip(file) {
  const zip = await JSZip.loadAsync(file)
  const mboxFiles = Object.values(zip.files).filter(
    (f) => !f.dir && f.name.endsWith('.mbox')
  )

  if (mboxFiles.length === 0) {
    throw new Error(
      'No .mbox file found in the zip. Make sure you selected a Google Takeout Mail archive.'
    )
  }

  // If there are multiple, concatenate them (multiple labels/inboxes)
  const texts = await Promise.all(mboxFiles.map((f) => f.async('string')))
  return texts.join('\n')
}

function readAsText(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = (e) => resolve(e.target.result)
    reader.onerror = () => reject(new Error('Failed to read file'))
    reader.readAsText(file)
  })
}
