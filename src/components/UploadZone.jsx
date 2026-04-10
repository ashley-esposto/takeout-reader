import { useRef, useState } from 'react'
import { loadFile } from '../utils/fileLoader'

export default function UploadZone({ onFile }) {
  const inputRef = useRef(null)
  const [dragOver, setDragOver] = useState(false)

  async function handleFile(file) {
    const mboxText = await loadFile(file)
    onFile(mboxText)
  }

  function onDrop(e) {
    e.preventDefault()
    setDragOver(false)
    const file = e.dataTransfer.files[0]
    if (file) handleFile(file)
  }

  function onChange(e) {
    const file = e.target.files[0]
    if (file) handleFile(file)
  }

  return (
    <div
      className={`upload-zone${dragOver ? ' drag-over' : ''}`}
      onDragOver={(e) => { e.preventDefault(); setDragOver(true) }}
      onDragLeave={() => setDragOver(false)}
      onDrop={onDrop}
      onClick={() => inputRef.current.click()}
    >
      <input ref={inputRef} type="file" accept=".mbox,.zip" onChange={onChange} />
      <div className="upload-icon">📬</div>
      <p>Drop your Google Takeout file here</p>
      <span className="upload-label">Supports .zip (Takeout archive) or .mbox (extracted)</span>
      <button className="upload-btn" type="button">Choose file</button>
    </div>
  )
}
