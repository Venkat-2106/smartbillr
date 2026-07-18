export function SkeletonCard({ colSpan }) {
  return (
    <div className="card" style={{
      gridColumn: colSpan ? `span ${colSpan}` : undefined,
      padding: 20,
    }}>
      <div className="skeleton" style={{ width: 32, height: 32, borderRadius: 8, marginBottom: 16 }} />
      <div className="skeleton" style={{ width: '50%', height: 12, borderRadius: 6, marginBottom: 8 }} />
      <div className="skeleton" style={{ width: '75%', height: 28, borderRadius: 8, marginBottom: 6 }} />
      <div className="skeleton" style={{ width: '35%', height: 10, borderRadius: 6 }} />
    </div>
  )
}

export function SkeletonTable({ rows = 5, cols = 4 }) {
  return (
    <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
      <div style={{ padding: '12px 16px', borderBottom: '1px solid var(--border)' }}>
        <div className="skeleton" style={{ width: '30%', height: 12, borderRadius: 6 }} />
      </div>
      {Array.from({ length: rows }).map((_, i) => (
        <div
          key={i}
          style={{
            display: 'grid',
            gridTemplateColumns: `repeat(${cols}, 1fr)`,
            gap: 16,
            padding: '14px 16px',
            borderBottom: i < rows - 1 ? '1px solid var(--border)' : 'none',
          }}
        >
          {Array.from({ length: cols }).map((_, j) => (
            <div key={j} className="skeleton" style={{ width: '100%', height: 12, borderRadius: 6 }} />
          ))}
        </div>
      ))}
    </div>
  )
}

export function SkeletonChart({ height = 200, colSpan }) {
  return (
    <div className="card" style={{
      gridColumn: colSpan ? `span ${colSpan}` : undefined,
      padding: 20,
    }}>
      <div className="skeleton" style={{ width: '35%', height: 14, borderRadius: 6, marginBottom: 4 }} />
      <div className="skeleton" style={{ width: '20%', height: 10, borderRadius: 6, marginBottom: 20 }} />
      <div className="skeleton" style={{ width: '100%', height, borderRadius: 8 }} />
    </div>
  )
}
