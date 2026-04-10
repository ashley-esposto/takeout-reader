import { parseMbox } from '../utils/mboxParser'

self.onmessage = function (e) {
  const { mboxText } = e.data

  try {
    const emails = parseMbox(mboxText, (progress, total) => {
      self.postMessage({ type: 'progress', progress, total })
    })

    self.postMessage({ type: 'done', emails })
  } catch (err) {
    self.postMessage({ type: 'error', message: err.message })
  }
}
