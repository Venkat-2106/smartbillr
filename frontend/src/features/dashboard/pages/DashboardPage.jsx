import { useState, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { useDashboard, useSalesTrend } from '../hooks/useDashboard'
import useAuthStore from '../../../store/authStore'
import { formatCurrency } from '../../../shared/utils/formatCurrency'

// ─── Skeleton ─────────────────────────────────────────────────────────────────
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

// ─── Stat Card (Premium Colored) ──────────────────────────────────────────────
function StatCard({ label, value, sub, icon, gradient, loading, onClick }) {
  const isClickable = typeof onClick === 'function'
  // FIX: hover was handled via direct DOM mutation (onMouseEnter set
  // e.currentTarget.style.transform / boxShadow directly). React wipes those
  // inline styles whenever the component re-renders (e.g. when dashboard data
  // loads), causing the hover effect to snap off while the mouse is still hovering.
  // Fix: one boolean state drives all three style values declaratively.
  const [hovered, setHovered] = useState(false)

  return (
    <div
      onClick={onClick}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        background: 'var(--bg-card)',
        border: `1px solid ${hovered
          ? (isClickable ? 'var(--accent-600)' : 'var(--border-hover)')
          : 'var(--border)'}`,
        borderRadius: 18,
        padding: '22px 20px 20px',
        display: 'flex',
        flexDirection: 'column',
        gap: 16,
        boxShadow: hovered ? 'var(--shadow-elevated)' : 'var(--shadow-card)',
        transform: hovered ? 'translateY(-3px)' : 'translateY(0)',
        transition: 'transform 0.18s var(--ease-out), box-shadow 0.18s var(--ease-out), border-color 0.18s',
        minWidth: 0,
        overflow: 'hidden',
        position: 'relative',
        cursor: isClickable ? 'pointer' : 'default',
      }}
    >
      {/* Subtle top gradient stripe */}
      <div style={{
        position: 'absolute', top: 0, left: 0, right: 0, height: 3,
        background: gradient,
        borderRadius: '18px 18px 0 0',
      }} />

      {/* Icon pill */}
      <div style={{
        width: 44, height: 44, borderRadius: 14,
        background: gradient,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        fontSize: 20,
        flexShrink: 0,
        boxShadow: '0 4px 12px rgba(0,0,0,0.10)',
      }}>
        {icon}
      </div>

      {/* Value */}
      {loading
        ? <Skeleton w="70%" h={28} />
        : (
          <div style={{
            fontSize: 'clamp(17px, 2.2vw, 26px)',
            fontWeight: 800,
            color: 'var(--text-primary)',
            letterSpacing: '-0.5px',
            lineHeight: 1.1,
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
          }}>
            {value}
          </div>
        )
      }

      {/* Label + sub */}
      <div>
        <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-primary)', marginBottom: 2 }}>
          {label}
          {isClickable && (
            <span style={{ marginLeft: 5, fontSize: 11, color: 'var(--accent-600)', verticalAlign: 'middle' }}>
              →
            </span>
          )}
        </div>
        <div style={{ fontSize: 11.5, color: 'var(--text-muted)', fontWeight: 400 }}>
          {sub}
        </div>
      </div>
    </div>
  )
}

// ─── Sales Trend Chart (pure SVG) ────────────────────────────────────────────
function SalesTrendChart({ period, onPeriodChange }) {
  const { data: raw, isLoading, isError } = useSalesTrend(period)
  const points = Array.isArray(raw) ? raw : []

  const W = 600
  const H = 180
  const PAD_L = 56
  const PAD_R = 20
  const PAD_T = 20
  const PAD_B = 40

  const chartW = W - PAD_L - PAD_R
  const chartH = H - PAD_T - PAD_B

  // PERF: maxVal, coords, and yTicks are all derived purely from `points`.
  // Without memoization these array maps + Math.max spread re-run on every
  // render (sidebar toggle, theme switch, unrelated parent state changes),
  // even though `points` itself only changes when useSalesTrend refetches.
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
      const prev = pts[i - 1]
      const curr = pts[i]
      const cpx = (prev.x + curr.x) / 2
      d += ` C ${cpx} ${prev.y} ${cpx} ${curr.y} ${curr.x} ${curr.y}`
    }
    return d
  }

  function areaPath(pts) {
    if (pts.length < 2) return ''
    const baseline = PAD_T + chartH
    return smoothPath(pts)
      + ` L ${pts[pts.length - 1].x} ${baseline}`
      + ` L ${pts[0].x} ${baseline} Z`
  }

  function fmtY(val) { return String(Math.round(val)) }

  const PERIODS = [
    { key: 'weekly',  label: 'Weekly' },
    { key: 'monthly', label: 'Monthly' },
    { key: 'yearly',  label: 'Yearly' },
  ]

  return (
    <div style={{
      background: 'var(--bg-card)',
      border: '1px solid var(--border)',
      borderRadius: 18,
      boxShadow: 'var(--shadow-card)',
      padding: '24px 24px 20px',
      marginBottom: 40,
    }}>
      <div style={{
        display: 'flex', alignItems: 'center',
        justifyContent: 'space-between',
        marginBottom: 20, flexWrap: 'wrap', gap: 12,
      }}>
        <div>
          <h2 style={{ fontSize: 15, fontWeight: 700, color: 'var(--text-primary)', margin: '0 0 3px' }}>
            Sales Trend
          </h2>
          <p style={{ fontSize: 12, color: 'var(--text-muted)', margin: 0, fontWeight: 400 }}>
            Invoices raised over time — all history
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
        <div style={{
          height: H, display: 'flex', alignItems: 'center', justifyContent: 'center',
          color: 'var(--danger-text)', fontSize: 13.5, flexDirection: 'column', gap: 8,
        }}>
          <span style={{ fontSize: 24 }}>⚠️</span>
          <span>Failed to load trend data.</span>
        </div>
      ) : isLoading ? (
        <div style={{ height: H, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <Skeleton w="80%" h={H - 60} />
        </div>
      ) : points.every(p => p.value === 0) ? (
        <div style={{
          height: H, display: 'flex', alignItems: 'center', justifyContent: 'center',
          color: 'var(--text-muted)', fontSize: 13.5,
        }}>
          No sales data for this period.
        </div>
      ) : (
        <svg
          viewBox={`0 0 ${W} ${H}`}
          preserveAspectRatio="xMidYMid meet"
          style={{ width: '100%', height: 'auto', overflow: 'visible' }}
        >
          <defs>
            <linearGradient id="trendFill" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%"   stopColor="var(--accent-500)" stopOpacity="0.18" />
              <stop offset="100%" stopColor="var(--accent-500)" stopOpacity="0.01" />
            </linearGradient>
            <filter id="glow" x="-20%" y="-20%" width="140%" height="140%">
              <feGaussianBlur stdDeviation="3" result="coloredBlur" />
              <feMerge>
                <feMergeNode in="coloredBlur" />
                <feMergeNode in="SourceGraphic" />
              </feMerge>
            </filter>
          </defs>

          {yTicks.map((tick, i) => {
            const y = PAD_T + chartH - (tick / maxVal) * chartH
            return (
              <g key={i}>
                <line x1={PAD_L} y1={y} x2={W - PAD_R} y2={y} stroke="var(--border)" strokeWidth="1" strokeDasharray="4 4" />
                <text x={PAD_L - 8} y={y + 4} textAnchor="end" fontSize="10" fill="var(--text-muted)"
                  fontFamily="var(--font-sans, 'Plus Jakarta Sans', sans-serif)">
                  {fmtY(tick)}
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
                fill="var(--text-muted)" fontFamily="var(--font-sans, 'Plus Jakarta Sans', sans-serif)" fontWeight="500">
                {pt.label}
              </text>
            </g>
          ))}
        </svg>
      )}
    </div>
  )
}

// ─── Payment Status Donut ─────────────────────────────────────────────────────
// Uses paid_count, pending_payments (partial), unpaid_count from summary.
// Pure SVG arc math — no library needed.
function PaymentDonut({ paid = 0, partial = 0, unpaid = 0, loading }) {
  // FIX 1: rawTotal is the real count shown in the center text.
  // 'total' (safe divisor) uses || 1 only to avoid division-by-zero in % math.
  // Previously both used the same variable so the center showed "1" when empty.
  const rawTotal = paid + partial + unpaid
  const total    = rawTotal || 1
  const segments = [
    { label: 'Paid',    value: paid,    color: '#10B981' },
    { label: 'Partial', value: partial, color: '#F59E0B' },
    { label: 'Unpaid',  value: unpaid,  color: '#EF4444' },
  ]

  // Build SVG arc paths. cx,cy = center, r = radius, hole = donut hole radius
  const cx = 80, cy = 80, r = 60, hole = 36
  let startAngle = -Math.PI / 2   // start at 12 o'clock

  function polarToXY(angle, radius) {
    return {
      x: cx + radius * Math.cos(angle),
      y: cy + radius * Math.sin(angle),
    }
  }

  function arcPath(start, end, outerR, innerR) {
    const largeArc = end - start > Math.PI ? 1 : 0
    const o1 = polarToXY(start, outerR)
    const o2 = polarToXY(end,   outerR)
    const i1 = polarToXY(end,   innerR)
    const i2 = polarToXY(start, innerR)
    return [
      `M ${o1.x} ${o1.y}`,
      `A ${outerR} ${outerR} 0 ${largeArc} 1 ${o2.x} ${o2.y}`,
      `L ${i1.x} ${i1.y}`,
      `A ${innerR} ${innerR} 0 ${largeArc} 0 ${i2.x} ${i2.y}`,
      'Z'
    ].join(' ')
  }

  const arcs = segments.map(seg => {
    const sweep = (seg.value / total) * 2 * Math.PI
    const end = startAngle + sweep
    const path = sweep > 0.001 ? arcPath(startAngle, end, r, hole) : null
    startAngle = end
    return { ...seg, path }
  })

  return (
    <div style={{
      background: 'var(--bg-card)',
      border: '1px solid var(--border)',
      borderRadius: 18,
      boxShadow: 'var(--shadow-card)',
      padding: '24px',
      display: 'flex',
      flexDirection: 'column',
      gap: 16,
    }}>
      <div>
        <h2 style={{ fontSize: 15, fontWeight: 700, color: 'var(--text-primary)', margin: '0 0 3px' }}>
          Payment Status
        </h2>
        <p style={{ fontSize: 12, color: 'var(--text-muted)', margin: 0 }}>
          Breakdown across all invoices
        </p>
      </div>

      {loading ? (
        <div style={{ display: 'flex', justifyContent: 'center', padding: '24px 0' }}>
          <Skeleton w={120} h={120} />
        </div>
      ) : (
        <div style={{ display: 'flex', alignItems: 'center', gap: 24, flexWrap: 'wrap' }}>
          <svg viewBox="0 0 160 160" style={{ width: 140, height: 140, flexShrink: 0 }}>
            {arcs.map(arc => arc.path && (
              <path key={arc.label} d={arc.path} fill={arc.color} opacity={0.92} />
            ))}
            {/* Center text — FIX 1: use rawTotal (real count), not total (safe divisor) */}
            <text x={cx} y={cy - 6} textAnchor="middle" fontSize="18" fontWeight="800"
              fill="var(--text-primary)" fontFamily="var(--font-sans,'Plus Jakarta Sans',sans-serif)">
              {rawTotal}
            </text>
            <text x={cx} y={cy + 10} textAnchor="middle" fontSize="10"
              fill="var(--text-muted)" fontFamily="var(--font-sans,'Plus Jakarta Sans',sans-serif)">
              invoices
            </text>
          </svg>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {segments.map(seg => (
              <div key={seg.label} style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <div style={{ width: 10, height: 10, borderRadius: '50%', background: seg.color, flexShrink: 0 }} />
                <div>
                  <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-primary)' }}>
                    {seg.value}
                  </span>
                  <span style={{ fontSize: 12, color: 'var(--text-muted)', marginLeft: 6 }}>
                    {seg.label} ({total > 0 ? Math.round(seg.value / total * 100) : 0}%)
                  </span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

// ─── Revenue vs Expenses Bar ──────────────────────────────────────────────────
// Two bars side by side using the revenue + expenses already in summary.
// Only shown when both values are non-null (admin/manager).
function RevenueExpensesBar({ revenue, expenses, country, loading }) {
  if (!loading && (revenue == null || expenses == null)) return null

  const maxVal = Math.max(revenue || 0, expenses || 0, 1)
  const revenueW  = ((revenue  || 0) / maxVal) * 100
  const expensesW = ((expenses || 0) / maxVal) * 100
  const profit    = (revenue || 0) - (expenses || 0)
  const profitPct = revenue > 0 ? Math.round((profit / revenue) * 100) : 0

  const bars = [
    { label: 'Revenue',  value: revenue  || 0, pct: revenueW,  color: '#10B981' },
    { label: 'Expenses', value: expenses || 0, pct: expensesW, color: '#EF4444' },
  ]

  return (
    <div style={{
      background: 'var(--bg-card)',
      border: '1px solid var(--border)',
      borderRadius: 18,
      boxShadow: 'var(--shadow-card)',
      padding: '24px',
      display: 'flex',
      flexDirection: 'column',
      gap: 16,
    }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
        <div>
          <h2 style={{ fontSize: 15, fontWeight: 700, color: 'var(--text-primary)', margin: '0 0 3px' }}>
            Revenue vs Expenses
          </h2>
          <p style={{ fontSize: 12, color: 'var(--text-muted)', margin: 0 }}>
            All-time totals comparison
          </p>
        </div>
        {!loading && (
          <div style={{
            padding: '4px 10px', borderRadius: 8, fontSize: 12, fontWeight: 700,
            background: profit >= 0 ? 'rgba(16,185,129,0.12)' : 'rgba(239,68,68,0.12)',
            color: profit >= 0 ? '#10B981' : '#EF4444',
          }}>
            {profit >= 0 ? '▲' : '▼'} {Math.abs(profitPct)}% margin
          </div>
        )}
      </div>

      {loading ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          <Skeleton w="80%" h={20} />
          <Skeleton w="60%" h={20} />
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
          {bars.map(bar => (
            <div key={bar.label}>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
                <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-secondary)' }}>{bar.label}</span>
                <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-primary)' }}>
                  {formatCurrency(bar.value, country)}
                </span>
              </div>
              <div style={{ height: 10, background: 'var(--bg-subtle)', borderRadius: 999, overflow: 'hidden' }}>
                <div style={{
                  height: '100%',
                  width: `${bar.pct}%`,
                  background: bar.color,
                  borderRadius: 999,
                  transition: 'width 0.6s ease',
                }} />
              </div>
            </div>
          ))}

          <div style={{
            marginTop: 4,
            paddingTop: 14,
            borderTop: '1px solid var(--border)',
            display: 'flex',
            justifyContent: 'space-between',
          }}>
            <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-secondary)' }}>Net Profit</span>
            <span style={{
              fontSize: 14, fontWeight: 800,
              color: profit >= 0 ? '#10B981' : '#EF4444',
            }}>
              {formatCurrency(Math.abs(profit), country)}
              <span style={{ fontSize: 11, fontWeight: 500, marginLeft: 4 }}>
                {profit >= 0 ? 'profit' : 'loss'}
              </span>
            </span>
          </div>
        </div>
      )}
    </div>
  )
}

// ─── Business Health Score ────────────────────────────────────────────────────
// Computed entirely from existing summary fields — no new API call.
// Score 0-100 based on: payment collection rate, stock alerts, expense ratio.
function HealthScore({ data, loading }) {
  if (!loading && !data) return null

  // Each metric contributes to the score (computed from already-fetched data)
  const total = (data?.total_invoices || 0)
  const paid  = (data?.paid_count     || 0)
  const low   = (data?.low_stock_alerts || 0)
  const rev   = data?.total_revenue   || 0
  const exp   = data?.total_expenses  || 0

  // FIX 2: Detect whether there is any real data to compute a score from.
  // When a brand-new business has zero invoices and zero stock alerts,
  // the old formula gave stockScore=30 + expenseScore=10 = 40 for free.
  // Now we show an empty state instead of a misleading score.
  const hasAnyData = total > 0 || low > 0 || rev > 0

  // Metric 1: Collection rate — paid / total invoices (max 50 pts)
  const collectionRate = total > 0 ? paid / total : 0
  const collectionScore = Math.round(collectionRate * 50)

  // Metric 2: Stock health — 0 alerts = 30 pts, deduct 5 per alert (min 0)
  const stockScore = Math.max(0, 30 - low * 5)

  // Metric 3: Expense ratio — only if financial data present (max 20 pts)
  let expenseScore = 10  // neutral if no financial data
  if (rev > 0 && exp != null) {
    const ratio = exp / rev   // lower = healthier
    expenseScore = ratio <= 0.5 ? 20 : ratio <= 0.8 ? 12 : 4
  }

  const score = Math.min(100, collectionScore + stockScore + expenseScore)

  const scoreColor = score >= 75 ? '#10B981' : score >= 50 ? '#F59E0B' : '#EF4444'
  const scoreLabel = score >= 75 ? 'Healthy' : score >= 50 ? 'Moderate' : 'Needs Attention'

  // SVG arc for the score gauge
  const radius = 54
  const circ   = 2 * Math.PI * radius
  const dash   = (score / 100) * circ * 0.75   // 270° arc
  const gap    = circ - dash

  return (
    <div style={{
      background: 'var(--bg-card)',
      border: '1px solid var(--border)',
      borderRadius: 18,
      boxShadow: 'var(--shadow-card)',
      padding: '24px',
      display: 'flex',
      flexDirection: 'column',
      gap: 16,
    }}>
      <div>
        <h2 style={{ fontSize: 15, fontWeight: 700, color: 'var(--text-primary)', margin: '0 0 3px' }}>
          Business Health
        </h2>
        <p style={{ fontSize: 12, color: 'var(--text-muted)', margin: 0 }}>
          Score based on payments, stock &amp; expenses
        </p>
      </div>

      {loading ? (
        <div style={{ display: 'flex', justifyContent: 'center', padding: '20px 0' }}>
          <Skeleton w={120} h={120} />
        </div>
      ) : !hasAnyData ? (
        /* FIX 2: No data yet — show empty state instead of a fake score */
        <div style={{
          display: 'flex', flexDirection: 'column', alignItems: 'center',
          justifyContent: 'center', padding: '24px 0', gap: 8,
        }}>
          <div style={{ fontSize: 32 }}>📊</div>
          <p style={{ fontSize: 13, color: 'var(--text-muted)', margin: 0, textAlign: 'center', lineHeight: 1.6 }}>
            No data yet.<br />Score will appear once invoices are raised.
          </p>
        </div>
      ) : (
        <div style={{ display: 'flex', alignItems: 'center', gap: 24, flexWrap: 'wrap' }}>
          {/* Gauge */}
          <svg viewBox="0 0 130 130" style={{ width: 120, height: 120, flexShrink: 0, transform: 'rotate(135deg)' }}>
            {/* Background track */}
            <circle cx="65" cy="65" r={radius} fill="none"
              stroke="var(--bg-subtle)" strokeWidth="10"
              strokeDasharray={`${circ * 0.75} ${circ * 0.25}`}
              strokeLinecap="round" />
            {/* Score arc */}
            <circle cx="65" cy="65" r={radius} fill="none"
              stroke={scoreColor} strokeWidth="10"
              strokeDasharray={`${dash} ${gap + circ * 0.25}`}
              strokeLinecap="round"
              style={{ transition: 'stroke-dasharray 0.8s ease' }} />
            {/* Center — rotate back to read text normally */}
            <g transform="rotate(-135 65 65)">
              <text x="65" y="60" textAnchor="middle" fontSize="22" fontWeight="800"
                fill="var(--text-primary)" fontFamily="var(--font-sans,'Plus Jakarta Sans',sans-serif)">
                {score}
              </text>
              <text x="65" y="75" textAnchor="middle" fontSize="10"
                fill="var(--text-muted)" fontFamily="var(--font-sans,'Plus Jakarta Sans',sans-serif)">
                / 100
              </text>
            </g>
          </svg>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            <div style={{
              padding: '4px 12px', borderRadius: 8, fontSize: 13, fontWeight: 700,
              background: score >= 75 ? 'rgba(16,185,129,0.12)' : score >= 50 ? 'rgba(245,158,11,0.12)' : 'rgba(239,68,68,0.12)',
              color: scoreColor, display: 'inline-block', alignSelf: 'flex-start',
            }}>
              {scoreLabel}
            </div>
            {[
              { label: 'Collection Rate', val: `${Math.round(collectionRate * 100)}%` },
              { label: 'Stock Alerts',    val: low },
            ].map(m => (
              <div key={m.label} style={{ display: 'flex', justifyContent: 'space-between', gap: 20 }}>
                <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>{m.label}</span>
                <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-primary)' }}>{m.val}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

// ─── Main Page ────────────────────────────────────────────────────────────────
export default function DashboardPage() {
  const { data, isLoading, isError } = useDashboard()
  const business      = useAuthStore(s => s.business)
  const country       = business?.business_country_code || 'IN'
  const navigate      = useNavigate()
  const [trendPeriod, setTrendPeriod] = useState('weekly')

  // ── Build stat cards ──────────────────────────────────────────────────────
  // Financial cards only appear when the backend returns a non-null value.
  // Backend sends null when user lacks dashboard.financial permission.
  // This way the frontend never needs to check permission codes directly —
  // null is the signal to hide.

  const allCards = [
    // Financial (shown only when backend returns a value — admin/manager)
    data?.total_revenue != null ? {
      label: 'Total Revenue',
      value: formatCurrency(data.total_revenue, country),
      sub: 'Gross from all invoices',
      icon: '💰',
      gradient: 'linear-gradient(135deg, #4F46E5, #7C3AED)',
      onClick: () => navigate('/reports'),
    } : null,
    data?.total_expenses != null ? {
      label: 'Total Expenses',
      value: formatCurrency(data.total_expenses, country),
      sub: 'All recorded expenses',
      icon: '📊',
      gradient: 'linear-gradient(135deg, #8B5CF6, #A855F7)',
      onClick: () => navigate('/expenses'),
    } : null,

    // Always visible (dashboard.view)
    {
      label: 'Total Invoices',
      value: data?.total_invoices ?? 0,
      sub: 'All invoices raised',
      icon: '🧾',
      gradient: 'linear-gradient(135deg, #0EA5E9, #06B6D4)',
      onClick: () => navigate('/sales'),
    },
    {
      label: 'Customers',
      value: data?.total_customers ?? 0,
      sub: 'Active accounts — click to view',
      icon: '👥',
      gradient: 'linear-gradient(135deg, #10B981, #059669)',
      onClick: () => navigate('/customers'),
    },
    {
      label: 'Products',
      value: data?.total_products ?? 0,
      sub: 'Active products — click to view',
      icon: '📦',
      gradient: 'linear-gradient(135deg, #F59E0B, #F97316)',
      onClick: () => navigate('/products')
    },
    {
      label: 'Pending Payments',
      value: data?.pending_payments ?? 0,
      sub: 'Unpaid + partially paid invoices',
      icon: '⏳',
      gradient: 'linear-gradient(135deg, #F97316, #EF4444)',
      onClick: () => navigate('/payments')
    },
    {
      label: 'Low Stock Alerts',
      value: data?.low_stock_alerts ?? 0,
      sub: 'Unread alerts',
      icon: '⚠️',
      gradient: 'linear-gradient(135deg, #EF4444, #DC2626)',
      onClick: () => navigate('/stock')
    },
  ].filter(Boolean)   // removes the null entries when financial fields are absent

  return (
    <>
      {/* ── Page header ── */}
      <div style={{ marginBottom: 40 }}>
        <h1 style={{ fontSize: 24, fontWeight: 800, color: 'var(--text-primary)', letterSpacing: '-0.5px', margin: '0 0 6px' }}>
          Overview
        </h1>
        <p style={{ fontSize: 13.5, color: 'var(--text-muted)', margin: 0, fontWeight: 400 }}>
          {business?.business_name || 'Your store'} · live summary
        </p>
      </div>

      {/* ── Error banner ── */}
      {isError && (
        <div style={{
          background: 'var(--danger-bg)', border: '1px solid var(--danger-border)',
          borderRadius: 12, padding: '13px 18px', color: 'var(--danger-text)',
          fontSize: 13.5, marginBottom: 32, fontWeight: 500,
        }}>
          ⚠️ Could not load data. Make sure the backend is running, then refresh.
        </div>
      )}

      {/* ── Stat cards grid ── */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))',
        gap: 16,
        marginBottom: 40,
      }}>
        {(isLoading ? Array(5).fill(null) : allCards).map((card, i) => (
          card
            ? <StatCard key={card.label} {...card} loading={false} />
            : <StatCard key={i} label="" value="" sub="" icon="💰"
                gradient="linear-gradient(135deg, #4F46E5, #7C3AED)" loading={true} />
        ))}
      </div>

      {/* ── BI Visuals row ── */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))',
        gap: 16,
        marginBottom: 40,
      }}>
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

      {/* ── Sales Trend Chart ── */}
      <SalesTrendChart period={trendPeriod} onPeriodChange={setTrendPeriod} />
    </>
  )
}
