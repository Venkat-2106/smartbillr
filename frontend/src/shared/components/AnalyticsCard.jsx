export default function AnalyticsCard({
  title,
  subtitle,
  action,
  children,
  colSpan,
  height,
  loading,
  style,
}) {
  if (loading) {
    return (
      <div className="card" style={{
        gridColumn: colSpan ? `span ${colSpan}` : undefined,
        padding: 20, ...style,
      }}>
        <div className="skeleton" style={{ width: '40%', height: 14, borderRadius: 6, marginBottom: 4 }} />
        <div className="skeleton" style={{ width: '25%', height: 10, borderRadius: 6, marginBottom: 20 }} />
        <div className="skeleton" style={{ width: '100%', height: height || 200, borderRadius: 8 }} />
      </div>
    )
  }

  return (
    <div
      className="card"
      style={{
        gridColumn: colSpan ? `span ${colSpan}` : undefined,
        padding: 20,
        height: height ? `${height}px` : undefined,
        display: 'flex', flexDirection: 'column',
        ...style,
      }}
    >
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 16 }}>
        <div>
          {title && (
            <p style={{ fontSize: 14, fontWeight: 600, color: 'var(--text-primary)', marginBottom: 2 }}>
              {title}
            </p>
          )}
          {subtitle && (
            <p style={{ fontSize: 12, color: 'var(--text-muted)' }}>
              {subtitle}
            </p>
          )}
        </div>
        {action && <div>{action}</div>}
      </div>
      <div style={{ flex: 1, minHeight: 0 }}>
        {children}
      </div>
    </div>
  )
}
