import { useState, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { useReportSummary, useReportTrend } from '../hooks/useReports'
import { formatCurrency } from '../../../shared/utils/formatCurrency'
import { Spinner, PageHeader } from '../../../shared/components'

const GRADIENTS = {
  revenue:  'linear-gradient(135deg, #4F46E5, #7C3AED)',
  expenses: 'linear-gradient(135deg, #EF4444, #DC2626)',
  invoices: 'linear-gradient(135deg, #3B82F6, #2563EB)',
  profit:   'linear-gradient(135deg, #10B981, #059669)',
}

const ICONS = {
  revenue:  '₹',
  expenses: '📊',
  invoices: '📋',
  profit:   '📈',
}

function Skeleton({ w = '60%', h = 28 }) {
  return (
    <div style={{
      height: h, width: w,
      background: 'var(--bg-hover)',
      borderRadius: 6,
      animation: 'pulse-shimmer 1.5s ease-in-out infinite',
    }} />
  )
}

function StatCard({ label, value, sub, gradient, icon, loading }) {
  return (
    <div style={{
      background: 'var(--bg-card)',
      border: '1px solid var(--border)',
      borderRadius: 18,
      padding: '24px 22px 22px',
      display: 'flex',
      flexDirection: 'column',
      gap: 18,
      boxShadow: 'var(--shadow-card)',
      minWidth: 0,
      overflow: 'hidden',
      position: 'relative',
    }}>
      <div style={{
        position: 'absolute', top: 0, left: 0, right: 0, height: 3.5,
        background: gradient,
        borderRadius: '18px 18px 0 0',
      }} />
      <div style={{
        width: 46, height: 46, borderRadius: 14,
        background: gradient,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        fontSize: 22, flexShrink: 0,
        boxShadow: '0 4px 12px rgba(0,0,0,0.10)',
      }}>
        {icon}
      </div>
      {loading ? (
        <Skeleton w="70%" h={28} />
      ) : (
        <div style={{
          fontSize: 'clamp(18px, 2.4vw, 28px)',
          fontWeight: 800,
          color: 'var(--text-primary)',
          letterSpacing: '-0.6px',
          lineHeight: 1.1,
          overflow: 'hidden',
          textOverflow: 'ellipsis',
          whiteSpace: 'nowrap',
        }}>
          {value}
        </div>
      )}
      <div>
        <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-primary)', marginBottom: 3 }}>
          {label}
        </div>
        <div style={{ fontSize: 12, color: 'var(--text-muted)', fontWeight: 400 }}>
          {sub}
        </div>
      </div>
    </div>
  )
}

function TrendChart({ period, onPeriodChange }) {
  const { data: raw, isLoading, isError } = useReportTrend(period)
  const points = Array.isArray(raw) ? raw : []

  const W = 600, H = 180
  const PAD_L = 56, PAD_R = 20, PAD_T = 20, PAD_B = 40
  const chartW = W - PAD_L - PAD_R
  const chartH = H - PAD_T - PAD_B

  const { maxVal, coords, yTicks } = useMemo(() => {
    const maxVal = Math.max(...points.map(p => p.value), 1)
    const coords = points.map((p, i) => ({
      x: PAD_L + (i / Math.max(points.length - 1, 1)) * chartW,
      y: PAD_T + chartH - (p.value / maxVal) * chartH,
      label: p.label,
      value: p.value,
    }))
    const yTicks = [...new Set([0, Math.ceil(maxVal / 2), maxVal])]
    return { maxVal, coords, yTicks }
  }, [points])

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

  const PERIODS = [
    { key: 'weekly', label: 'Weekly' },
    { key: 'monthly', label: 'Monthly' },
    { key: 'yearly', label: 'Yearly' },
  ]

  return (
    <div style={{
      background: 'var(--bg-card)',
      border: '1px solid var(--border)',
      borderRadius: 18,
      boxShadow: 'var(--shadow-card)',
      padding: '24px 24px 20px',
    }}>
      <div style={{
        display: 'flex', alignItems: 'center',
        justifyContent: 'space-between',
        marginBottom: 20, flexWrap: 'wrap', gap: 12,
      }}>
        <div>
          <h2 style={{ fontSize: 15, fontWeight: 700, color: 'var(--text-primary)', margin: '0 0 4px' }}>
            Invoice Trend
          </h2>
          <p style={{ fontSize: 12, color: 'var(--text-muted)', margin: 0 }}>
            Invoices raised over time
          </p>
        </div>
        <div style={{
          display: 'flex', gap: 6,
          background: 'var(--bg-subtle)',
          border: '1px solid var(--border)',
          borderRadius: 10, padding: 4,
        }}>
          {PERIODS.map(p => (
            <button
              key={p.key}
              onClick={() => onPeriodChange(p.key)}
              style={{
                padding: '5px 14px', borderRadius: 7, border: 'none', cursor: 'pointer',
                fontSize: 12, fontWeight: 600, transition: 'all 0.15s',
                background: period === p.key
                  ? 'linear-gradient(135deg, var(--accent-600), var(--accent-500))'
                  : 'transparent',
                color: period === p.key ? '#fff' : 'var(--text-secondary)',
                boxShadow: period === p.key ? '0 2px 8px var(--accent-glow)' : 'none',
              }}
            >
              {p.label}
            </button>
          ))}
        </div>
      </div>

      {isError ? (
        <div style={{ height: H, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--danger-text)', fontSize: 13.5 }}>
          Failed to load trend data.
        </div>
      ) : isLoading ? (
        <div style={{ height: H, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <Skeleton w="80%" h={H - 60} />
        </div>
      ) : points.every(p => p.value === 0) ? (
        <div style={{ height: H, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text-muted)', fontSize: 13.5 }}>
          No sales data for this period.
        </div>
      ) : (
        <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="xMidYMid meet"
          style={{ width: '100%', height: 'auto', overflow: 'visible' }}>
          <defs>
            <linearGradient id="trendFill" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="var(--accent-500)" stopOpacity="0.18" />
              <stop offset="100%" stopColor="var(--accent-500)" stopOpacity="0.01" />
            </linearGradient>
            <filter id="glow" x="-20%" y="-20%" width="140%" height="140%">
              <feGaussianBlur stdDeviation="3" result="coloredBlur" />
              <feMerge><feMergeNode in="coloredBlur" /><feMergeNode in="SourceGraphic" /></feMerge>
            </filter>
          </defs>
          {yTicks.map((tick, i) => {
            const y = PAD_T + chartH - (tick / maxVal) * chartH
            return (
              <g key={i}>
                <line x1={PAD_L} y1={y} x2={W - PAD_R} y2={y} stroke="var(--border)" strokeWidth="1" strokeDasharray="4 4" />
                <text x={PAD_L - 8} y={y + 4} textAnchor="end" fontSize="10" fill="var(--text-muted)">
                  {String(Math.round(tick))}
                </text>
              </g>
            )
          })}
          <path d={areaPath(coords)} fill="url(#trendFill)" />
          <path d={smoothPath(coords)} fill="none" stroke="var(--accent-600)" strokeWidth="2.5"
            strokeLinecap="round" strokeLinejoin="round" filter="url(#glow)" />
          {coords.map((pt, i) => (
            <g key={i}>
              <circle cx={pt.x} cy={pt.y} r={4} fill="var(--accent-600)" stroke="var(--bg-card)" strokeWidth="2" />
              <text x={pt.x} y={PAD_T + chartH + 20} textAnchor="middle" fontSize="10.5"
                fill="var(--text-muted)" fontWeight="500">
                {pt.label}
              </text>
            </g>
          ))}
        </svg>
      )}
    </div>
  )
}

export default function ReportsPage() {
  const navigate = useNavigate()
  const { data: summary, isLoading, isError } = useReportSummary()
  const [period, setPeriod] = useState('monthly')

  const s = summary?.data ?? summary

  const reportData = useMemo(() => [
    {
      key: 'revenue',
      label: 'Total Revenue',
      value: s?.total_revenue != null ? formatCurrency(s.total_revenue) : '—',
      sub: `${s?.total_invoices ?? 0} invoices`,
      gradient: GRADIENTS.revenue,
      icon: ICONS.revenue,
    },
    {
      key: 'expenses',
      label: 'Total Expenses',
      value: s?.total_expenses != null ? formatCurrency(s.total_expenses) : '—',
      sub: 'Operating costs',
      gradient: GRADIENTS.expenses,
      icon: ICONS.expenses,
    },
    {
      key: 'profit',
      label: 'Net Profit',
      value: (s?.total_revenue != null && s?.total_expenses != null)
        ? formatCurrency(s.total_revenue - s.total_expenses)
        : '—',
      sub: s?.total_revenue != null ? `${((s.total_revenue - (s.total_expenses ?? 0)) / s.total_revenue * 100).toFixed(1)}% margin` : '—',
      gradient: GRADIENTS.profit,
      icon: ICONS.profit,
    },
    {
      key: 'invoices',
      label: 'Invoices',
      value: String(s?.total_invoices ?? 0),
      sub: `${s?.paid_count ?? 0} paid · ${s?.partial_count ?? 0} partial · ${s?.pending_count ?? 0} unpaid`,
      gradient: GRADIENTS.invoices,
      icon: ICONS.invoices,
    },
  ], [s])

  return (
    <>
      <PageHeader
        title="Reports"
        subtitle="Business performance and financial overview"
        back
        onBack={() => navigate('/dashboard')}
      />

      {isError ? (
        <div style={{
          padding: '18px 16px',
          background: 'var(--danger-bg)', border: '1px solid var(--danger-border)',
          borderRadius: 12, fontSize: 13.5,
          color: 'var(--danger-text)', fontWeight: 500, marginBottom: 24,
        }}>
          Could not load report data. Check that the backend is running and refresh.
        </div>
      ) : null}

      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
        gap: 16,
        marginBottom: 28,
      }}>
        {reportData.map(card => (
          <StatCard key={card.key} {...card} loading={isLoading} />
        ))}
      </div>

      <TrendChart period={period} onPeriodChange={setPeriod} />
    </>
  )
}
