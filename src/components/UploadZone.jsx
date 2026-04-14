import { useState } from 'react'

export default function UploadZone({ onFiles }) {
  const [dragOver, setDragOver] = useState(false)

  // Pass raw File objects — do NOT read contents here.
  // Reading whole mbox in the main thread OOMs; the worker streams in chunks.
  function handleFileList(list) {
    const files = Array.from(list || []).filter(Boolean)
    if (files.length) onFiles(files)
  }

  function onDrop(e) {
    e.preventDefault()
    setDragOver(false)
    handleFileList(e.dataTransfer.files)
  }

  function onChange(e) {
    handleFileList(e.target.files)
  }

  return (
    <div
      className={`upload-zone${dragOver ? ' drag-over' : ''}`}
      onDragOver={(e) => { e.preventDefault(); setDragOver(true) }}
      onDragLeave={() => setDragOver(false)}
      onDrop={onDrop}
    >
      <input
        type="file"
        accept=".zip,.mbox"
        multiple
        onChange={onChange}
        style={{
          position: 'absolute',
          inset: 0,
          width: '100%',
          height: '100%',
          opacity: 0,
          cursor: 'pointer',
        }}
      />
      <div className="upload-icon">📬</div>
      <p>Drop Google Takeout file(s) here</p>
      <span className="upload-label">.zip (Takeout) and/or .mbox (Gmail) — you can add several at once</span>
      <span className="upload-btn">Choose file</span>
    </div>
  )
}
