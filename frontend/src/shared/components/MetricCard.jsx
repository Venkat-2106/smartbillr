import { memo } from 'react'
import { useNavigate } from 'react-router-dom'

function MetricCard({
  icon,
  label,
  value,
  growth,
  subtitle,
  loading,
  colSpan,
  style,
  locked = false,
  lockedMessage = 'Included in paid plans',
}) {
  const navigate = useNavigate()

  if (loading) {
    return (
      <div className="card" style={{
        gridColumn: colSpan ? `span ${colSpan}` : undefined,
        padding: 20, ...style,
      }}>
        <div className="skeleton" style={{ width: 32, height: 32, borderRadius: 8, marginBottom: 16 }} />
        <div className="skeleton" style={{ width: '60%', height: 12, borderRadius: 6, marginBottom: 8 }} />
        <div className="skeleton" style={{ width: '80%', height: 28, borderRadius: 8, marginBottom: 6 }} />
        <div className="skeleton" style={{ width: '40%', height: 10, borderRadius: 6 }} />
      </div>
    )
  }

  if (locked) {
    return (
      <div
        className="card"
        role="button"
        tabIndex={0}
        onClick={() => navigate('/subscription')}
        onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); navigate('/subscription') } }}
        style={{
          gridColumn: colSpan ? `span ${colSpan}` : undefined,
          padding: 20,
          cursor: 'pointer',
          transition: 'box-shadow var(--duration-fast) var(--ease-out)',
          ...style,
        }}
        onMouseEnter={(e) => { e.currentTarget.style.boxShadow = 'var(--shadow-hover, 0 4px 12px rgba(0,0,0,0.08))' }}
        onMouseLeave={(e) => { e.currentTarget.style.boxShadow = '' }}
      >
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
          <div style={{
            width: 36, height: 36, borderRadius: 'var(--r-md)',
            background: 'var(--bg-hover)',
            border: '1px solid var(--border)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            color: 'var(--text-muted)',
          }}>
            {icon}
          </div>
          <div style={{
            display: 'inline-flex', alignItems: 'center', gap: 3,
            fontSize: 12, fontWeight: 600, color: 'var(--text-muted)',
            background: 'var(--bg-hover)',
            padding: '2px 8px', borderRadius: 99,
            border: '1px solid var(--border)',
          }}>
            <svg width="12" height="12" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
              <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
              <path d="M7 11V7a5 5 0 0110 0v4" />
            </svg>
            Upgrade
          </div>
        </div>
        <p style={{ fontSize: 12, fontWeight: 500, color: 'var(--text-secondary)', marginBottom: 4 }}>
          {label}
        </p>
        <p style={{ fontSize: 28, fontWeight: 700, color: 'var(--text-muted)', letterSpacing: '-0.03em', lineHeight: 1.2, marginBottom: subtitle ? 4 : 0 }}>
          —
        </p>
        <p style={{ fontSize: 12, color: 'var(--text-muted)' }}>
          {subtitle || lockedMessage}
        </p>
      </div>
    )
  }

  const isPositive = growth && growth >= 0
  const growthColor = growth !== undefined
    ? (isPositive ? 'var(--success)' : 'var(--danger)')
    : 'var(--text-muted)'
  const growthIcon = growth !== undefined
    ? (isPositive
        ? 'M13 7h8m0 0v8m0-8l-8 8-4-4-6 6'
        : 'M13 17h8m0 0v-8m0 8l-8-8-4 4-6-6')
    : undefined

  return (
    <div
      className="card card-hover"
      style={{
        gridColumn: colSpan ? `span ${colSpan}` : undefined,
        padding: 20,
        ...style,
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
        <div style={{
          width: 36, height: 36, borderRadius: 'var(--r-md)',
          background: 'var(--accent-50)',
          border: '1px solid var(--accent-100)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          color: 'var(--accent-600)',
        }}>
          {icon}
        </div>
        {growth !== undefined && (
          <div style={{
            display: 'inline-flex', alignItems: 'center', gap: 3,
            fontSize: 12, fontWeight: 600, color: growthColor,
            background: isPositive ? 'var(--success-bg)' : 'var(--danger-bg)',
            padding: '2px 8px', borderRadius: 99,
            border: `1px solid ${isPositive ? 'var(--success-border)' : 'var(--danger-border)'}`,
          }}>
            <svg width="12" height="12" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round">
              <path d={growthIcon} />
            </svg>
            {Math.abs(growth)}%
          </div>
        )}
      </div>
      <p style={{ fontSize: 12, fontWeight: 500, color: 'var(--text-secondary)', marginBottom: 4 }}>
        {label}
      </p>
      <p style={{ fontSize: 28, fontWeight: 700, color: 'var(--text-primary)', letterSpacing: '-0.03em', lineHeight: 1.2, marginBottom: subtitle ? 4 : 0 }}>
        {value}
      </p>
      {subtitle && (
        <p style={{ fontSize: 12, color: 'var(--text-muted)' }}>
          {subtitle}
        </p>
      )}
    </div>
  )
}

export default memo(MetricCard)
