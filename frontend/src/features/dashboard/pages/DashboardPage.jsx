import { useState, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { useDashboard, useSalesTrend } from '../hooks/useDashboard'
import useAuthStore from '../../../store/authStore'
import { formatCurrency } from '../../../shared/utils/formatCurrency'
import { BentoCard, MetricCard } from '../../../shared/components'

function SvgIcon({ path, size = 18 }) {
  return (
    <svg width={size} height={size} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d={path} />
    </svg>
  )
}

const ICONS = {
  revenue: 'M13 7h8m0 0v8m0-8l-8 8-4-4-6 6',
  expenses: 'M17 9V7a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2m2 4h10a2 2 0 002-2v-6a2 2 0 00-2-2H9a2 2 0 00-2 2v6a2 2 0 002 2zm7-5a2 2 0 11-4 0 2 2 0 014 0z',
  invoices: 'M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z',
  customers: 'M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z',
  products: 'M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4',
  payments: 'M3 10h18M7 15h1m4 0h1m-7 4h12a3 3 0 003-3V8a3 3 0 00-3-3H6a3 3 0 00-3 3v8a3 3 0 003 3z',
  alerts: 'M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L4.082 16.5c-.77.833.192 2.5 1.732 2.5z',
}

// ── Sales Trend Chart ──────────────────────────────────────────────
function SalesTrendChart({ period, onPeriodChange }) {
  const { data: raw, isLoading, isError } = useSalesTrend(period)
  const points = Array.isArray(raw) ? raw : []

  const W = 600, H = 200, PAD_L = 56, PAD_R = 20, PAD_T = 30, PAD_B = 40
  const chartW = W - PAD_L - PAD_R
  const chartH = H - PAD_T - PAD_B

  const { maxVal, coords, yTicks } = useMemo(() => {
    const maxVal = Math.max(...points.map(p => p.value), 1)
    const coords = points.map((p, i) => ({
      x: PAD_L + (i / Math.max(points.length - 1, 1)) * chartW,
      y: PAD_T + chartH - (p.value / maxVal) * chartH,
      label: p.label, value: p.value,
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
    { key: 'weekly',  label: 'Weekly' },
    { key: 'monthly', label: 'Monthly' },
    { key: 'yearly',  label: 'Yearly' },
  ]

  return (
    <BentoCard colSpan={8} padding style={{ minHeight: 320 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16, flexWrap: 'wrap', gap: 12 }}>
        <div>
          <p style={{ fontSize: 14, fontWeight: 600, color: 'var(--text-primary)', marginBottom: 2 }}>Sales Trend</p>
          <p style={{ fontSize: 12, color: 'var(--text-muted)' }}>Invoices raised over time</p>
        </div>
        <div style={{ display: 'flex', gap: 4, background: 'var(--bg-subtle)', border: '1px solid var(--border)', borderRadius: 8, padding: 3 }}>
          {PERIODS.map(p => (
            <button
              key={p.key}
              onClick={() => onPeriodChange(p.key)}
              style={{
                padding: '4px 12px', borderRadius: 6, border: 'none', cursor: 'pointer',
                fontSize: 11.5, fontWeight: 600, fontFamily: 'inherit',
                background: period === p.key ? 'var(--bg-card)' : 'transparent',
                color: period === p.key ? 'var(--text-primary)' : 'var(--text-muted)',
                boxShadow: period === p.key ? 'var(--shadow-xs)' : 'none',
                transition: 'all 0.13s',
              }}
            >
              {p.label}
            </button>
          ))}
        </div>
      </div>

      {isError ? (
        <div style={{ height: H, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--danger-text)', fontSize: 13 }}>
          Failed to load trend data.
        </div>
      ) : isLoading ? (
        <div className="skeleton" style={{ width: '100%', height: H, borderRadius: 8 }} />
      ) : points.every(p => p.value === 0) ? (
        <div style={{ height: H, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text-muted)', fontSize: 13 }}>
          No sales data for this period.
        </div>
      ) : (
        <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="xMidYMid meet" style={{ width: '100%', height: 'auto', overflow: 'visible' }}>
          <defs>
            <linearGradient id="trendFill" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="var(--accent-500)" stopOpacity="0.15" />
              <stop offset="100%" stopColor="var(--accent-500)" stopOpacity="0.01" />
            </linearGradient>
          </defs>
          {yTicks.map((tick, i) => {
            const y = PAD_T + chartH - (tick / maxVal) * chartH
            return (
              <g key={i}>
                <line x1={PAD_L} y1={y} x2={W - PAD_R} y2={y} stroke="var(--border)" strokeWidth="1" strokeDasharray="4 4" />
                <text x={PAD_L - 8} y={y + 4} textAnchor="end" fontSize="10" fill="var(--text-muted)" fontFamily="var(--font-sans, 'Inter', sans-serif)">{String(Math.round(tick))}</text>
              </g>
            )
          })}
          <path d={areaPath(coords)} fill="url(#trendFill)" />
          <path d={smoothPath(coords)} fill="none" stroke="var(--accent-600)" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
          {coords.map((pt, i) => (
            <g key={i}>
              <circle cx={pt.x} cy={pt.y} r={3.5} fill="var(--accent-600)" stroke="var(--bg-card)" strokeWidth="2" />
              <text x={pt.x} y={PAD_T + chartH + 20} textAnchor="middle" fontSize="10" fill="var(--text-muted)" fontFamily="var(--font-sans, 'Inter', sans-serif)" fontWeight="500">{pt.label}</text>
            </g>
          ))}
        </svg>
      )}
    </BentoCard>
  )
}

// ── Payment Donut ──────────────────────────────────────────────────
function PaymentDonut({ paid = 0, partial = 0, unpaid = 0, loading }) {
  const rawTotal = paid + partial + unpaid
  const total = rawTotal || 1
  const segments = [
    { label: 'Paid',    value: paid,    color: 'var(--success)' },
    { label: 'Partial', value: partial, color: 'var(--warning)' },
    { label: 'Unpaid',  value: unpaid,  color: 'var(--danger)' },
  ]
  const cx = 80, cy = 80, r = 60, hole = 36
  let startAngle = -Math.PI / 2

  function polarToXY(angle, radius) {
    return { x: cx + radius * Math.cos(angle), y: cy + radius * Math.sin(angle) }
  }

  function arcPath(start, end, outerR, innerR) {
    const largeArc = end - start > Math.PI ? 1 : 0
    const o1 = polarToXY(start, outerR), o2 = polarToXY(end, outerR)
    const i1 = polarToXY(end, innerR), i2 = polarToXY(start, innerR)
    return `M ${o1.x} ${o1.y} A ${outerR} ${outerR} 0 ${largeArc} 1 ${o2.x} ${o2.y} L ${i1.x} ${i1.y} A ${innerR} ${innerR} 0 ${largeArc} 0 ${i2.x} ${i2.y} Z`
  }

  const arcs = segments.map(seg => {
    const sweep = (seg.value / total) * 2 * Math.PI
    const end = startAngle + sweep
    const path = sweep > 0.001 ? arcPath(startAngle, end, r, hole) : null
    startAngle = end
    return { ...seg, path }
  })

  return (
    <BentoCard colSpan={4} style={{ minHeight: 260 }}>
      <p style={{ fontSize: 14, fontWeight: 600, color: 'var(--text-primary)', marginBottom: 2 }}>Payment Status</p>
      <p style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 16 }}>Breakdown across all invoices</p>
      {loading ? (
        <div className="skeleton" style={{ width: 140, height: 140, borderRadius: '50%', margin: '0 auto' }} />
      ) : (
        <div style={{ display: 'flex', alignItems: 'center', gap: 20 }}>
          <svg viewBox="0 0 160 160" style={{ width: 130, height: 130, flexShrink: 0 }}>
            {arcs.map(arc => arc.path && <path key={arc.label} d={arc.path} fill={arc.color} opacity={0.92} />)}
            <text x={cx} y={cy - 6} textAnchor="middle" fontSize="18" fontWeight="800" fill="var(--text-primary)" fontFamily="Inter, sans-serif">{rawTotal}</text>
            <text x={cx} y={cy + 10} textAnchor="middle" fontSize="10" fill="var(--text-muted)" fontFamily="Inter, sans-serif">invoices</text>
          </svg>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {segments.map(seg => (
              <div key={seg.label} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <div style={{ width: 8, height: 8, borderRadius: '50%', background: seg.color, flexShrink: 0 }} />
                <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-primary)' }}>{seg.value}</span>
                <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>{seg.label} ({total > 0 ? Math.round(seg.value / total * 100) : 0}%)</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </BentoCard>
  )
}

// ── Revenue vs Expenses ────────────────────────────────────────────
function RevenueExpensesBar({ revenue, expenses, country, loading }) {
  if (!loading && (revenue == null || expenses == null)) return null
  const maxVal = Math.max(revenue || 0, expenses || 0, 1)
  const revenueW = ((revenue || 0) / maxVal) * 100
  const expensesW = ((expenses || 0) / maxVal) * 100
  const profit = (revenue || 0) - (expenses || 0)
  const profitPct = revenue > 0 ? Math.round((profit / revenue) * 100) : 0
  const isProfitable = profit >= 0

  return (
    <BentoCard colSpan={4} style={{ minHeight: 260 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 16 }}>
        <div>
          <p style={{ fontSize: 14, fontWeight: 600, color: 'var(--text-primary)', marginBottom: 2 }}>Revenue vs Expenses</p>
          <p style={{ fontSize: 12, color: 'var(--text-muted)' }}>All-time totals</p>
        </div>
        {!loading && (
          <div style={{
            padding: '3px 10px', borderRadius: 6, fontSize: 11.5, fontWeight: 600,
            background: isProfitable ? 'var(--success-bg)' : 'var(--danger-bg)',
            color: isProfitable ? 'var(--success-text)' : 'var(--danger-text)',
          }}>
            {Math.abs(profitPct)}% margin
          </div>
        )}
      </div>
      {loading ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <div className="skeleton" style={{ width: '80%', height: 18, borderRadius: 4 }} />
          <div className="skeleton" style={{ width: '60%', height: 18, borderRadius: 4 }} />
        </div>
      ) : (
        <>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            {[
              { label: 'Revenue',  value: revenue || 0, pct: revenueW,  color: 'var(--success)' },
              { label: 'Expenses', value: expenses || 0, pct: expensesW, color: 'var(--danger)' },
            ].map(bar => (
              <div key={bar.label}>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
                  <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-secondary)' }}>{bar.label}</span>
                  <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-primary)' }}>{formatCurrency(bar.value, country)}</span>
                </div>
                <div style={{ height: 8, background: 'var(--bg-subtle)', borderRadius: 99, overflow: 'hidden' }}>
                  <div style={{ height: '100%', width: `${bar.pct}%`, background: bar.color, borderRadius: 99, transition: 'width 0.6s ease' }} />
                </div>
              </div>
            ))}
          </div>
          <div style={{ marginTop: 12, paddingTop: 12, borderTop: '1px solid var(--border)', display: 'flex', justifyContent: 'space-between' }}>
            <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-secondary)' }}>Net Profit</span>
            <span style={{ fontSize: 14, fontWeight: 800, color: isProfitable ? 'var(--success-text)' : 'var(--danger-text)' }}>
              {formatCurrency(Math.abs(profit), country)}
              <span style={{ fontSize: 11, fontWeight: 500, marginLeft: 4, color: 'var(--text-muted)' }}>
                {isProfitable ? 'profit' : 'loss'}
              </span>
            </span>
          </div>
        </>
      )}
    </BentoCard>
  )
}

// ── Business Health ────────────────────────────────────────────────
function HealthScore({ data, loading }) {
  if (!loading && !data) return null

  const total = data?.total_invoices || 0
  const paid = data?.paid_count || 0
  const low = data?.low_stock_alerts || 0
  const rev = data?.total_revenue || 0
  const exp = data?.total_expenses || 0
  const hasAnyData = total > 0 || low > 0 || rev > 0

  const collectionRate = total > 0 ? paid / total : 0
  const collectionScore = Math.round(collectionRate * 50)
  const stockScore = Math.max(0, 30 - low * 5)
  let expenseScore = 10
  if (rev > 0 && exp != null) {
    const ratio = exp / rev
    expenseScore = ratio <= 0.5 ? 20 : ratio <= 0.8 ? 12 : 4
  }
  const score = Math.min(100, collectionScore + stockScore + expenseScore)
  const scoreColor = score >= 75 ? 'var(--success-text)' : score >= 50 ? 'var(--warning-text)' : 'var(--danger-text)'
  const scoreLabel = score >= 75 ? 'Healthy' : score >= 50 ? 'Moderate' : 'Needs Attention'

  const radius = 54, circ = 2 * Math.PI * radius
  const dash = (score / 100) * circ * 0.75
  const gap = circ - dash

  return (
    <BentoCard colSpan={4} style={{ minHeight: 260 }}>
      <p style={{ fontSize: 14, fontWeight: 600, color: 'var(--text-primary)', marginBottom: 2 }}>Business Health</p>
      <p style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 16 }}>Score based on payments, stock & expenses</p>
      {loading ? (
        <div className="skeleton" style={{ width: 120, height: 120, borderRadius: '50%', margin: '0 auto' }} />
      ) : !hasAnyData ? (
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '24px 0', gap: 8 }}>
          <p style={{ fontSize: 13, color: 'var(--text-muted)', textAlign: 'center', lineHeight: 1.6 }}>
            No data yet. Score will appear once invoices are raised.
          </p>
        </div>
      ) : (
        <div style={{ display: 'flex', alignItems: 'center', gap: 20 }}>
          <svg viewBox="0 0 130 130" style={{ width: 110, height: 110, flexShrink: 0, transform: 'rotate(135deg)' }}>
            <circle cx="65" cy="65" r={radius} fill="none" stroke="var(--bg-subtle)" strokeWidth="10"
              strokeDasharray={`${circ * 0.75} ${circ * 0.25}`} strokeLinecap="round" />
            <circle cx="65" cy="65" r={radius} fill="none" stroke={scoreColor} strokeWidth="10"
              strokeDasharray={`${dash} ${gap + circ * 0.25}`} strokeLinecap="round"
              style={{ transition: 'stroke-dasharray 0.8s ease' }} />
            <g transform="rotate(-135 65 65)">
              <text x="65" y="60" textAnchor="middle" fontSize="20" fontWeight="800" fill="var(--text-primary)" fontFamily="Inter, sans-serif">{score}</text>
              <text x="65" y="75" textAnchor="middle" fontSize="9" fill="var(--text-muted)" fontFamily="Inter, sans-serif">/ 100</text>
            </g>
          </svg>
          <div>
            <div style={{ padding: '3px 10px', borderRadius: 6, fontSize: 12, fontWeight: 600, background: score >= 75 ? 'var(--success-bg)' : score >= 50 ? 'var(--warning-bg)' : 'var(--danger-bg)', color: scoreColor, display: 'inline-block', marginBottom: 10 }}>{scoreLabel}</div>
            {[
              { label: 'Collection Rate', val: `${Math.round(collectionRate * 100)}%` },
              { label: 'Stock Alerts', val: low },
            ].map(m => (
              <div key={m.label} style={{ display: 'flex', justifyContent: 'space-between', gap: 16, marginBottom: 4 }}>
                <span style={{ fontSize: 11.5, color: 'var(--text-muted)' }}>{m.label}</span>
                <span style={{ fontSize: 11.5, fontWeight: 700, color: 'var(--text-primary)' }}>{m.val}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </BentoCard>
  )
}

// ── Quick Actions ──────────────────────────────────────────────────
function QuickActions({ navigate }) {
  const [hoveredIdx, setHoveredIdx] = useState(null)
  const actions = [
    { label: 'New Sale', path: '/sales/new', icon: 'M12 4v16m8-8H4', color: 'var(--accent-600)' },
    { label: 'New Product', path: '/products', icon: 'M12 4v16m8-8H4', color: 'var(--success)' },
    { label: 'New Customer', path: '/customers', icon: 'M18 9v3m0 0v3m0-3h3m-3 0h-3m-2-5a4 4 0 11-8 0 4 4 0 018 0zM3 20a6 6 0 0112 0v1H3v-1z', color: 'var(--info)' },
    { label: 'New Purchase', path: '/purchases/new', icon: 'M3 3h2l.4 2M7 13h10l4-8H5.4M7 13L5.4 5M7 13l-2.293 2.293c-.63.63-.184 1.707.707 1.707H17m0 0a2 2 0 100 4 2 2 0 000-4zm-8 2a2 2 0 11-4 0 2 2 0 014 0z', color: 'var(--warning)' },
  ]

  return (
    <BentoCard colSpan={4}>
      <p style={{ fontSize: 14, fontWeight: 600, color: 'var(--text-primary)', marginBottom: 12 }}>Quick Actions</p>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
        {actions.map((a, i) => {
          const isHovered = hoveredIdx === i
          return (
          <button
            key={a.label}
            onClick={() => navigate(a.path)}
            onMouseEnter={() => setHoveredIdx(i)}
            onMouseLeave={() => setHoveredIdx(null)}
            style={{
              display: 'flex', alignItems: 'center', gap: 10,
              padding: '12px', borderRadius: 8,
              background: isHovered ? 'var(--bg-hover)' : 'var(--bg-subtle)',
              border: `1px solid ${isHovered ? 'var(--border-hover)' : 'var(--border)'}`,
              cursor: 'pointer', fontFamily: 'inherit',
              transition: 'background 0.13s, border-color 0.13s',
            }}
          >
            <svg width="16" height="16" fill="none" viewBox="0 0 24 24" stroke={a.color} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d={a.icon} />
            </svg>
            <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-primary)' }}>{a.label}</span>
          </button>
          )
        })}
      </div>
    </BentoCard>
  )
}

// ── Main Page ──────────────────────────────────────────────────────
export default function DashboardPage() {
  const { data, isLoading, isError } = useDashboard()
  const business = useAuthStore(s => s.business)
  const country = business?.business_country_code || 'IN'
  const navigate = useNavigate()
  const [trendPeriod, setTrendPeriod] = useState('weekly')

  const metricCards = [
    data?.total_revenue != null ? {
      label: 'Revenue',
      value: formatCurrency(data.total_revenue, country),
      icon: <SvgIcon path={ICONS.revenue} size={18} />,
      onClick: () => navigate('/reports'),
      growth: data?.revenue_growth,
      subtitle: 'Gross from all invoices',
    } : null,
    {
      label: 'Invoices',
      value: data?.total_invoices ?? 0,
      icon: <SvgIcon path={ICONS.invoices} size={18} />,
      onClick: () => navigate('/sales'),
      subtitle: 'All invoices raised',
    },
    {
      label: 'Customers',
      value: data?.total_customers ?? 0,
      icon: <SvgIcon path={ICONS.customers} size={18} />,
      onClick: () => navigate('/customers'),
      subtitle: 'Active accounts',
    },
    {
      label: 'Products',
      value: data?.total_products ?? 0,
      icon: <SvgIcon path={ICONS.products} size={18} />,
      onClick: () => navigate('/products'),
      subtitle: 'Active products',
    },
    data?.total_expenses != null ? {
      label: 'Expenses',
      value: formatCurrency(data.total_expenses, country),
      icon: <SvgIcon path={ICONS.expenses} size={18} />,
      onClick: () => navigate('/expenses'),
      subtitle: 'All recorded expenses',
    } : null,
    {
      label: 'Pending Payments',
      value: data?.pending_payments ?? 0,
      icon: <SvgIcon path={ICONS.payments} size={18} />,
      onClick: () => navigate('/payments'),
      subtitle: 'Unpaid + partially paid',
    },
    {
      label: 'Stock Alerts',
      value: data?.low_stock_alerts ?? 0,
      icon: <SvgIcon path={ICONS.alerts} size={18} />,
      onClick: () => navigate('/stock'),
      subtitle: 'Unread alerts',
    },
  ].filter(Boolean)

  return (
    <div>
      <div style={{ marginBottom: 24 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div>
            <p style={{ fontSize: 28, fontWeight: 700, color: 'var(--text-primary)', letterSpacing: '-0.03em', marginBottom: 4 }}>
              Overview
            </p>
            <p style={{ fontSize: 13, color: 'var(--text-muted)' }}>
              {business?.business_name || 'Your business'} &middot; live summary
            </p>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '5px 10px', background: 'var(--bg-subtle)', border: '1px solid var(--border)', borderRadius: 8, fontSize: 11.5, color: 'var(--text-muted)', fontWeight: 500 }}>
            <span style={{ width: 5, height: 5, borderRadius: '50%', background: 'var(--success)' }} />
            Live
          </div>
        </div>
      </div>

      {isError && (
        <div style={{ background: 'var(--danger-bg)', border: '1px solid var(--danger-border)', borderRadius: 8, padding: '12px 16px', color: 'var(--danger-text)', fontSize: 13, marginBottom: 24, fontWeight: 500 }}>
          Could not load data. Make sure the backend is running, then refresh.
        </div>
      )}

      <div className="bento-grid bento-grid-12" style={{ marginBottom: 16 }}>
        {(isLoading ? Array(7).fill(null) : metricCards).map((card, i) => (
          card
            ? <MetricCard key={card.label} {...card} colSpan={3} loading={false} style={{ cursor: card.onClick ? 'pointer' : 'default' }} />
            : <MetricCard key={i} label="" value="" icon={<SvgIcon path={ICONS.invoices} />} colSpan={3} loading />
        ))}
      </div>

      <div className="bento-grid bento-grid-12" style={{ marginBottom: 16 }}>
        <SalesTrendChart period={trendPeriod} onPeriodChange={setTrendPeriod} />
        <QuickActions navigate={navigate} />
      </div>

      <div className="bento-grid bento-grid-12">
        <PaymentDonut
          paid={data?.paid_count}
          partial={data?.partial_count}
          unpaid={data?.pending_count}
          loading={isLoading}
        />
        <RevenueExpensesBar
          revenue={data?.total_revenue}
          expenses={data?.total_expenses}
          country={country}
          loading={isLoading}
        />
        <HealthScore data={data} loading={isLoading} />
      </div>
    </div>
  )
}
