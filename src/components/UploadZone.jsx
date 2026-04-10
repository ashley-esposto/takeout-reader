import { useState } from 'react'

export default function UploadZone({ onFile }) {
  const [dragOver, setDragOver] = useState(false)

  function onDrop(e) {
    e.preventDefault()
    setDragOver(false)
    const file = e.dataTransfer.files[0]
    if (file) onFile(file)
  }

  function onChange(e) {
    const file = e.target.files[0]
    if (file) onFile(file)
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
      <p>Drop your Google Takeout file here</p>
      <span className="upload-label">Supports .zip (full Takeout archive) or .mbox (Gmail export)</span>
      <span className="upload-btn">Choose file</span>
    </div>
  )
}
