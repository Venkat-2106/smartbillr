import { useMemo } from 'react'

export default function DonutChart({ data = [], size = 140, loading, error, centerText }) {
  const segments = useMemo(() => {
    if (!Array.isArray(data) || data.length === 0) return []
    const total = data.reduce((s, d) => s + (d.value ?? 0), 0) || 1
    return data.map(d => ({ ...d, pct: ((d.value ?? 0) / total) * 100 }))
  }, [data])

  const cx = size / 2, cy = size / 2, r = size * 0.38, hole = size * 0.22

  const arcs = useMemo(() => {
    function polarToXY(angle, radius) {
      return { x: cx + radius * Math.cos(angle), y: cy + radius * Math.sin(angle) }
    }

    function arcPath(start, end) {
      const largeArc = end - start > Math.PI ? 1 : 0
      const o1 = polarToXY(start, r), o2 = polarToXY(end, r)
      const i1 = polarToXY(end, hole), i2 = polarToXY(start, hole)
      return `M ${o1.x} ${o1.y} A ${r} ${r} 0 ${largeArc} 1 ${o2.x} ${o2.y} L ${i1.x} ${i1.y} A ${hole} ${hole} 0 ${largeArc} 0 ${i2.x} ${i2.y} Z`
    }

    const defaultColors = ['var(--accent-600)', '#10B981', '#F59E0B', '#EF4444', '#8B5CF6', '#0EA5E9', '#F97316', '#06B6D4']
    const total = segments.reduce((s, d) => s + (d.value ?? 0), 0) || 1
    const cumulativeSweep = segments.reduce((acc, seg) => {
      const sweep = (seg.value ?? 0) / total * 2 * Math.PI
      acc.push(acc.length > 0 ? acc[acc.length - 1] + sweep : -Math.PI / 2 + sweep)
      return acc
    }, [])
    return segments.map((seg, i) => {
      const start = i === 0 ? -Math.PI / 2 : cumulativeSweep[i - 1]
      const end = cumulativeSweep[i]
      const sweep = end - start
      const path = sweep > 0.001 ? arcPath(start, end) : null
      const pct = total > 0 ? Math.round(((seg.value ?? 0) / total) * 100) : 0
      return { ...seg, path, color: seg.color || defaultColors[i % defaultColors.length], pct }
    })
  }, [segments, cx, cy, r, hole])

  if (error) {
    return <div style={{ padding: 40, textAlign: 'center', color: 'var(--danger-text)', fontSize: 13 }}>Failed to load.</div>
  }

  if (loading) {
    return <div style={{ display: 'flex', justifyContent: 'center', padding: 20 }}>
      <div style={{ width: size, height: size, borderRadius: '50%', background: 'var(--bg-hover)', animation: 'pulse-shimmer 1.5s ease-in-out infinite' }} />
    </div>
  }

  if (segments.length === 0) {
    return <div style={{ padding: 40, textAlign: 'center', color: 'var(--text-muted)', fontSize: 13 }}>No data.</div>
  }

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 16, flexWrap: 'wrap' }}>
      <svg viewBox={`0 0 ${size} ${size}`} style={{ width: size, height: size, flexShrink: 0 }}>
        {arcs.map(arc => arc.path && <path key={arc.label} d={arc.path} fill={arc.color} opacity={0.92} />)}
        {centerText && (
          <text x={cx} y={cy} textAnchor="middle" dominantBaseline="central"
            fontSize={size * 0.13} fontWeight="800" fill="var(--text-primary)"
            fontFamily="var(--font-sans,'Plus Jakarta Sans',sans-serif)">{centerText}</text>
        )}
      </svg>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
        {arcs.map(arc => (
          <div key={arc.label} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <div style={{ width: 10, height: 10, borderRadius: '50%', background: arc.color, flexShrink: 0 }} />
            <span style={{ fontSize: 13, color: 'var(--text-primary)', fontWeight: 600 }}>{arc.label}</span>
            <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>{arc.pct}%</span>
          </div>
        ))}
      </div>
    </div>
  )
}
