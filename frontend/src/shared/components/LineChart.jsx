import { useMemo } from 'react'

const W = 600, H = 180, PAD_L = 56, PAD_R = 20, PAD_T = 20, PAD_B = 40
const chartW = W - PAD_L - PAD_R
const chartH = H - PAD_T - PAD_B

export default function LineChart({ data = [], accentColor, areaColor, loading, error }) {
  const points = Array.isArray(data) ? data : []

  const { maxVal, coords, yTicks } = useMemo(() => {
    const maxVal = Math.max(...points.map(p => p.value ?? 0), 1)
    const coords = points.map((p, i) => ({
      x: PAD_L + (i / Math.max(points.length - 1, 1)) * chartW,
      y: PAD_T + chartH - ((p.value ?? 0) / maxVal) * chartH,
      label: p.label,
      value: p.value ?? 0,
    }))
    const yTicks = [...new Set([0, Math.ceil(maxVal / 2), maxVal])]
    return { maxVal, coords, yTicks }
  }, [points])

  const accent = accentColor || 'var(--accent-600)'
  const fillId = `lineFill_${Math.random().toString(36).slice(2)}`

  function smoothPath(pts) {
    if (pts.length < 2) return ''
    let d = `M ${pts[0].x} ${pts[0].y}`
    for (let i = 1; i < pts.length; i++) {
      const prev = pts[i - 1], curr = pts[i]
      const cpx = (prev.x + curr.x) / 2
      d += ` C ${cpx} ${prev.y} ${cpx} ${curr.y} ${curr.x} ${curr.y}`
    }
    return d
  }

  function areaPath(pts) {
    if (pts.length < 2) return ''
    const baseline = PAD_T + chartH
    return smoothPath(pts) + ` L ${pts[pts.length - 1].x} ${baseline} L ${pts[0].x} ${baseline} Z`
  }

  if (error) {
    return <div style={{ height: H, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--danger-text)', fontSize: 13 }}>Failed to load chart data.</div>
  }

  if (loading) {
    return <div style={{ height: H, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <div style={{ height: H - 60, width: '80%', background: 'var(--bg-hover)', borderRadius: 6, animation: 'pulse-shimmer 1.5s ease-in-out infinite' }} />
    </div>
  }

  if (points.every(p => p.value === 0)) {
    return <div style={{ height: H, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text-muted)', fontSize: 13 }}>No data for this period.</div>
  }

  return (
    <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="xMidYMid meet"
      style={{ width: '100%', height: 'auto', overflow: 'visible' }}>
      <defs>
        <linearGradient id={fillId} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={accent} stopOpacity="0.18" />
          <stop offset="100%" stopColor={accent} stopOpacity="0.01" />
        </linearGradient>
        <filter id={`glow_${fillId}`} x="-20%" y="-20%" width="140%" height="140%">
          <feGaussianBlur stdDeviation="3" result="coloredBlur" />
          <feMerge><feMergeNode in="coloredBlur" /><feMergeNode in="SourceGraphic" /></feMerge>
        </filter>
      </defs>
      {yTicks.map((tick, i) => {
        const y = PAD_T + chartH - (tick / maxVal) * chartH
        return (
          <g key={i}>
            <line x1={PAD_L} y1={y} x2={W - PAD_R} y2={y} stroke="var(--border)" strokeWidth="1" strokeDasharray="4 4" />
            <text x={PAD_L - 8} y={y + 4} textAnchor="end" fontSize="10" fill="var(--text-muted)">{String(Math.round(tick))}</text>
          </g>
        )
      })}
      <path d={areaPath(coords)} fill={`url(#${fillId})`} />
      <path d={smoothPath(coords)} fill="none" stroke={accent} strokeWidth="2.5"
        strokeLinecap="round" strokeLinejoin="round" filter={`url(#glow_${fillId})`} />
      {coords.map((pt, i) => (
        <g key={i}>
          <circle cx={pt.x} cy={pt.y} r={4} fill={accent} stroke="var(--bg-card)" strokeWidth="2" />
          <text x={pt.x} y={PAD_T + chartH + 20} textAnchor="middle" fontSize="10.5"
            fill="var(--text-muted)" fontWeight="500">{pt.label}</text>
        </g>
      ))}
    </svg>
  )
}
