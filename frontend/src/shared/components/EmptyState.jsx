export default function EmptyState({
  icon,
  title,
  description,
  action,
  compact,
}) {
  return (
    <div
      className="empty-state-responsive"
      style={{
        display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
        padding: compact ? '40px 20px' : '64px 24px',
        textAlign: 'center',
        maxWidth: 420, margin: '0 auto',
      }}
    >
      {icon && (
        <div style={{
          width: 48, height: 48, borderRadius: 12,
          background: 'var(--bg-subtle)',
          border: '1px solid var(--border)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          color: 'var(--text-muted)',
          marginBottom: 20,
        }}>
          {icon}
        </div>
      )}
      {title && (
        <p style={{ fontSize: 15, fontWeight: 600, color: 'var(--text-primary)', marginBottom: 6 }}>
          {title}
        </p>
      )}
      {description && (
        <p style={{ fontSize: 13, color: 'var(--text-secondary)', lineHeight: 1.6, marginBottom: 20 }}>
          {description}
        </p>
      )}
      {action && <div>{action}</div>}
    </div>
  )
}
