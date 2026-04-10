export default function ParseProgress({ progress, total, label = 'Parsing…', onCancel }) {
  const pct = total > 0 ? Math.min(100, (progress / total) * 100) : 0
  const indeterminate = total === 0

  return (
    <div className="progress-overlay">
      <div className="progress-card">
        <div className="progress-label">{label}</div>
        {!indeterminate && (
          <div className="progress-count">
            {progress.toLocaleString()}
            <span style={{ fontSize: '1rem', color: 'var(--text-muted)' }}>
              {' '}/ {total.toLocaleString()}
            </span>
          </div>
        )}
        <div className="progress-bar-track">
          <div
            className={`progress-bar-fill${indeterminate ? ' indeterminate' : ''}`}
            style={indeterminate ? {} : { width: `${pct}%` }}
          />
        </div>
        {onCancel && (
          <button className="progress-cancel" onClick={onCancel}>Cancel</button>
        )}
      </div>
    </div>
  )
}
