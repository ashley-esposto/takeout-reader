import { useState, useRef, useCallback } from 'react'

export function useMboxWorker() {
  const [emails, setEmails] = useState([])
  const [parsing, setParsing] = useState(false)
  const [progress, setProgress] = useState(0)
  const [total, setTotal] = useState(0)
  const workerRef = useRef(null)

  const startParsing = useCallback((mboxText) => {
    // Terminate any existing worker
    if (workerRef.current) workerRef.current.terminate()

    setEmails([])
    setProgress(0)
    setTotal(0)
    setParsing(true)

    const worker = new Worker(
      new URL('../workers/mboxWorker.js', import.meta.url),
      { type: 'module' }
    )
    workerRef.current = worker

    worker.onmessage = (e) => {
      const { type } = e.data
      if (type === 'progress') {
        setProgress(e.data.progress)
        setTotal(e.data.total)
      } else if (type === 'done') {
        setEmails(e.data.emails)
        setParsing(false)
        worker.terminate()
        workerRef.current = null
      } else if (type === 'error') {
        console.error('Worker parse error:', e.data.message)
        setParsing(false)
        worker.terminate()
        workerRef.current = null
      }
    }

    worker.onerror = (err) => {
      console.error('Worker error:', err)
      setParsing(false)
      workerRef.current = null
    }

    worker.postMessage({ mboxText })
  }, [])

  const cancelParsing = useCallback(() => {
    if (workerRef.current) {
      workerRef.current.terminate()
      workerRef.current = null
    }
    setParsing(false)
    setProgress(0)
    setTotal(0)
  }, [])

  return { emails, parsing, progress, total, startParsing, cancelParsing }
}
