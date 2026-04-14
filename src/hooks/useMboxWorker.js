import { useState, useRef, useCallback } from 'react'

let _reqCounter = 0
const nextId = () => String(++_reqCounter)

export function useMboxWorker() {
  const [totalEmails, setTotalEmails] = useState(0)
  const [parsing, setParsing]         = useState(false)
  const [progress, setProgress]       = useState(0)
  const workerRef     = useRef(null)
  const pendingReqs   = useRef(new Map()) // requestId → { resolve, reject }

  const startParsing = useCallback((input) => {
    if (workerRef.current) workerRef.current.terminate()
    pendingReqs.current.clear()
    setTotalEmails(0)
    setProgress(0)
    setParsing(true)

    const worker = new Worker(
      new URL('../workers/mboxWorker.js', import.meta.url),
      { type: 'module' }
    )
    workerRef.current = worker

    worker.onmessage = (e) => {
      const { type, requestId } = e.data

      if (type === 'progress') {
        setProgress(e.data.progress)
      } else if (type === 'done') {
        setTotalEmails(e.data.total)
        setParsing(false)
      } else if (type === 'error') {
        console.error('Worker error:', e.data.message)
        setParsing(false)
      } else if (requestId) {
        // Request/response pair — resolve or reject the waiting Promise
        const cb = pendingReqs.current.get(requestId)
        if (cb) {
          pendingReqs.current.delete(requestId)
          if (type === 'bodyError') {
            cb.reject(new Error(e.data.message))
          } else {
            cb.resolve(e.data)
          }
        }
      }
    }

    worker.onerror = (err) => {
      console.error('Worker fatal error:', err)
      setParsing(false)
    }

    if (typeof input === 'string') {
      worker.postMessage({ mboxText: input })
    } else if (Array.isArray(input) && input.length > 0) {
      worker.postMessage({ mboxFiles: input })
    } else {
      worker.postMessage({ mboxFile: input })
    }
  }, [])

  // Generic request helper — sends a message and returns a Promise for the response
  const request = useCallback((msg) => {
    return new Promise((resolve, reject) => {
      if (!workerRef.current) { reject(new Error('Worker not available')); return }
      const id = nextId()
      pendingReqs.current.set(id, { resolve, reject })
      workerRef.current.postMessage({ ...msg, requestId: id })
    })
  }, [])

  /** Load a page of emails by file index. Returns { emails, start, total } */
  const loadPage = useCallback((start, count, labelFilter) =>
    request({ type: 'getPage', start, count, labelFilter }), [request])

  /** Search emails in the worker. Returns { emails, total, start } */
  const searchEmails = useCallback((query, start = 0, count = 1000, labelFilter) =>
    request({ type: 'search', query, start, count, labelFilter }), [request])

  /** Get all unique labels with counts. Returns { labels: [{name, count}] } */
  const getLabels = useCallback(() => request({ type: 'getLabels' }), [request])

  /** Load the full body for an email by its file index. Returns { email } */
  const loadEmailBody = useCallback((emailIndex) =>
    request({ type: 'loadBody', emailIndex }), [request])

  const cancelParsing = useCallback(() => {
    if (workerRef.current) { workerRef.current.terminate(); workerRef.current = null }
    pendingReqs.current.clear()
    setParsing(false)
    setProgress(0)
    setTotalEmails(0)
  }, [])

  return { totalEmails, parsing, progress, startParsing, loadPage, searchEmails, loadEmailBody, cancelParsing, getLabels }
}
