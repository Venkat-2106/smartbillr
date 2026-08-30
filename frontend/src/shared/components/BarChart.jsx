import { useMemo } from 'react'

export default function BarChart({ data = [], bars = 8, loading, error, valueLabel = '' }) {
  const items = useMemo(() => {
    if (!Array.isArray(data) || data.length === 0) return []
    const sorted = [...data].sort((a, b) => (b.value ?? 0) - (a.value ?? 0))
    return sorted.slice(0, bars)
  }, [data, bars])

  if (error) {
    return <div style={{ padding: 40, textAlign: 'center', color: 'var(--danger-text)', fontSize: 13 }}>Failed to load.</div>
  }

  if (loading) {
    const SKELETON_WIDTHS = [82, 65, 91, 74, 88]
    return <div style={{ padding: 20, display: 'flex', flexDirection: 'column', gap: 12 }}>
      {SKELETON_WIDTHS.map((w, i) => (
        <div key={i} style={{ height: 24, width: `${w}%`, background: 'var(--bg-hover)', borderRadius: 6, animation: 'pulse-shimmer 1.5s ease-in-out infinite' }} />
      ))}
    </div>
  }

  if (items.length === 0) {
    return <div style={{ padding: 40, textAlign: 'center', color: 'var(--text-muted)', fontSize: 13 }}>No data available.</div>
  }

  const maxVal = Math.max(...items.map(i => Math.abs(i.value ?? 0)), 1)

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      {items.map((item, i) => {
        const pct = (Math.abs(item.value ?? 0) / maxVal) * 100
        const colors = ['var(--accent-600)', 'var(--accent-500)', 'var(--accent-400)',
          '#4F46E5', '#7C3AED', '#0EA5E9', '#10B981', '#F59E0B']
        const barColor = item.value < 0 ? 'var(--danger)' : colors[i % colors.length]
        return (
          <div key={item.label || i}>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
              <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-primary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flex: 1 }}>
                {item.label}
              </span>
              <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-secondary)', marginLeft: 8, flexShrink: 0 }}>
                {item.formatted ?? item.value} {valueLabel}
              </span>
            </div>
            <div style={{ height: 8, background: 'var(--bg-subtle)', borderRadius: 999, overflow: 'hidden' }}>
              <div style={{
                height: '100%', width: `${pct}%`,
                background: barColor,
                borderRadius: 999,
                transition: 'width 0.5s ease',
              }} />
            </div>
          </div>
        )
      })}
    </div>
  )
}
