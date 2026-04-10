export default function ParseProgress({ progress, total, onCancel }) {
  const pct = total > 0 ? Math.min(100, (progress / total) * 100) : 0

  return (
    <div className="progress-overlay">
      <div className="progress-card">
        <div className="progress-label">Parsing mailbox…</div>
        <div className="progress-count">
          {progress.toLocaleString()}
          {total > 0 && <span style={{ fontSize: '1rem', color: 'var(--text-muted)' }}> / {total.toLocaleString()}</span>}
        </div>
        <div className="progress-bar-track">
          <div className="progress-bar-fill" style={{ width: `${pct}%` }} />
        </div>
        <button className="progress-cancel" onClick={onCancel}>Cancel</button>
      </div>
    </div>
  )
}
