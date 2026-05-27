// src/features/dashboard/pages/DashboardPage.jsx
//
// FIXES IN THIS VERSION:
//   ✅ FIX — Clicking the "Customers" stat card navigates to /customers
//            StatCard now accepts an optional `onClick` prop.
//            Only the Customers card has it — other cards remain non-clickable.
//   All other logic, layout, styles, chart, and permissions unchanged.

import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useDashboard, useSalesTrend } from '../hooks/useDashboard'
import useAuthStore from '../../../store/authStore'
import { formatCurrency } from '../../../shared/utils/formatCurrency'
import { formatDate } from '../../../shared/utils/formatDate'

// ─── Skeleton ─────────────────────────────────────────────────────────────────
function Skeleton({ w = '60%', h = 28 }) {
  return (
    <div style={{
      height: h, width: w,
      background: 'var(--bg-hover)',
      borderRadius: 6,
      animation: 'shimmer 1.5s ease-in-out infinite',
    }} />
  )
}

// ─── Stat Card (Premium Colored) ──────────────────────────────────────────────
// FIX: Added optional `onClick` prop — shows pointer cursor + slight ring on hover
// when clickable. Non-clickable cards (onClick=undefined) behave exactly as before.
function StatCard({ label, value, sub, icon, gradient, loading, onClick }) {
  const isClickable = typeof onClick === 'function'

  return (
    <div
      onClick={onClick}
      style={{
        background: 'var(--bg-card)',
        border: '1px solid var(--border)',
        borderRadius: 18,
        padding: '22px 20px 20px',
        display: 'flex',
        flexDirection: 'column',
        gap: 16,
        boxShadow: 'var(--shadow-card)',
        transition: 'transform 0.18s var(--ease-out), box-shadow 0.18s var(--ease-out), border-color 0.18s',
        minWidth: 0,
        overflow: 'hidden',
        position: 'relative',
        cursor: isClickable ? 'pointer' : 'default',
      }}
      onMouseEnter={e => {
        e.currentTarget.style.transform = 'translateY(-3px)'
        e.currentTarget.style.boxShadow = 'var(--shadow-elevated)'
        e.currentTarget.style.borderColor = isClickable ? 'var(--accent-600)' : 'var(--border-hover)'
      }}
      onMouseLeave={e => {
        e.currentTarget.style.transform = 'translateY(0)'
        e.currentTarget.style.boxShadow = 'var(--shadow-card)'
        e.currentTarget.style.borderColor = 'var(--border)'
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
          {/* Small arrow hint for clickable cards */}
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

// ─── Badge ────────────────────────────────────────────────────────────────────
function Badge({ status }) {
  const cfg = {
    paid:    { bg: 'var(--success-bg)', color: 'var(--success-text)', border: 'var(--success-border)', dot: '#22C55E', label: 'Paid' },
    partial: { bg: 'var(--warning-bg)', color: 'var(--warning-text)', border: 'var(--warning-border)', dot: '#F59E0B', label: 'Partial' },
    unpaid:  { bg: 'var(--danger-bg)',  color: 'var(--danger-text)',  border: 'var(--danger-border)',  dot: '#F43F5E', label: 'Unpaid' },
  }
  const c = cfg[status] || cfg.unpaid
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center', gap: 5,
      background: c.bg, color: c.color,
      border: '1px solid ' + c.border,
      padding: '3px 10px', borderRadius: 99,
      fontSize: 11.5, fontWeight: 600,
    }}>
      <span style={{ width: 5, height: 5, borderRadius: '50%', background: c.dot, flexShrink: 0 }} />
      {c.label}
    </span>
  )
}

// ─── Sales Trend Chart (pure SVG) ────────────────────────────────────────────
function SalesTrendChart({ period, onPeriodChange }) {
  const { data: points = [], isLoading } = useSalesTrend(period)

  const W = 600
  const H = 180
  const PAD_L = 56
  const PAD_R = 20
  const PAD_T = 20
  const PAD_B = 40

  const chartW = W - PAD_L - PAD_R
  const chartH = H - PAD_T - PAD_B

  const maxVal = Math.max(...points.map(p => p.value), 1)

  const coords = points.map((p, i) => ({
    x: PAD_L + (i / Math.max(points.length - 1, 1)) * chartW,
    y: PAD_T + chartH - (p.value / maxVal) * chartH,
    label: p.label,
    value: p.value,
  }))

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

  const yTicks = [0, maxVal / 2, maxVal]

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
            Invoices raised over time — all roles
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

      {isLoading ? (
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

// ─── Main Page ────────────────────────────────────────────────────────────────
export default function DashboardPage() {
  const { data, isLoading, isError } = useDashboard()
  const business      = useAuthStore(s => s.business)
  const hasPermission = useAuthStore(s => s.hasPermission)
  const country       = business?.business_country_code || 'IN'

  // FIX: navigate for clickable cards
  const navigate = useNavigate()

  const [trendPeriod, setTrendPeriod] = useState('weekly')

  const canSeeFinancials = hasPermission('dashboard.financial')

  // ── KPI cards — always visible (dashboard.view) ──────────────────────────
  // FIX: Customers card gets onClick → navigate('/customers')
  const kpiCards = [
    {
      label: 'Total Invoices',
      value: data?.totalInvoices   ?? 0,
      sub: 'All invoices raised',
      icon: '🧾',
      gradient: 'linear-gradient(135deg, #0EA5E9, #06B6D4)',
    },
    {
      label: 'Customers',
      value: data?.totalCustomers  ?? 0,
      sub: 'Active accounts — click to view',
      icon: '👥',
      gradient: 'linear-gradient(135deg, #10B981, #059669)',
      onClick: () => navigate('/customers'),
    },
    {
      label: 'Products',
      value: data?.totalProducts   ?? 0,
      sub: 'Items in catalogue',
      icon: '📦',
      gradient: 'linear-gradient(135deg, #F59E0B, #F97316)',
    },
    {
      label: 'Pending Payments',
      value: data?.pendingPayments ?? 0,
      sub: 'Partial invoices',
      icon: '⏳',
      gradient: 'linear-gradient(135deg, #F97316, #EF4444)',
    },
    {
      label: 'Low Stock Alerts',
      value: data?.lowStockAlerts  ?? 0,
      sub: 'Unread alerts',
      icon: '⚠️',
      gradient: 'linear-gradient(135deg, #EF4444, #DC2626)',
    },
  ]

  // ── Financial cards — only admin (dashboard.financial) ───────────────────
  const financialCards = [
    {
      label: 'Total Revenue',
      value: formatCurrency(data?.totalRevenue  || 0, country),
      sub: 'Gross from all invoices',
      icon: '💰',
      gradient: 'linear-gradient(135deg, #4F46E5, #7C3AED)',
    },
    {
      label: 'Total Expenses',
      value: formatCurrency(data?.totalExpenses || 0, country),
      sub: 'All recorded expenses',
      icon: '📊',
      gradient: 'linear-gradient(135deg, #8B5CF6, #A855F7)',
    },
  ]

  const visibleCards = canSeeFinancials
    ? [...financialCards, ...kpiCards]
    : kpiCards

  const tableHeaders = canSeeFinancials
    ? ['Invoice No', 'Amount', 'Status', 'Date']
    : ['Invoice No', 'Status', 'Date']

  const skeletonWidths = canSeeFinancials
    ? ['70%', '100px', '60px', '90px']
    : ['70%', '60px', '90px']

  return (
    <>
      <style>{`
        @keyframes shimmer {
          0%, 100% { opacity: 1 }
          50%       { opacity: 0.4 }
        }
      `}</style>

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
        {visibleCards.map(card => (
          <StatCard key={card.label} {...card} loading={isLoading} />
        ))}
      </div>

      {/* ── Sales Trend Chart ── */}
      <SalesTrendChart period={trendPeriod} onPeriodChange={setTrendPeriod} />

      {/* ── Recent Sales header ── */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 14 }}>
        <h2 style={{ fontSize: 15, fontWeight: 700, color: 'var(--text-primary)', margin: 0 }}>
          Recent Sales
        </h2>
        <span style={{
          fontSize: 11.5, fontWeight: 600,
          color: 'var(--text-secondary)',
          background: 'var(--bg-subtle)',
          border: '1px solid var(--border)',
          borderRadius: 99, padding: '2px 9px',
        }}>
          Last 5
        </span>
      </div>

      {/* ── Recent Sales table ── */}
      <div style={{
        background: 'var(--bg-card)',
        border: '1px solid var(--border)',
        borderRadius: 18,
        boxShadow: 'var(--shadow-card)',
        overflow: 'hidden',
      }}>
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr style={{ background: 'var(--bg-subtle)', borderBottom: '1px solid var(--border)' }}>
                {tableHeaders.map(h => (
                  <th key={h} style={{
                    padding: '12px 24px', textAlign: 'left',
                    fontSize: 10.5, fontWeight: 700, color: 'var(--text-muted)',
                    letterSpacing: '0.08em', textTransform: 'uppercase', whiteSpace: 'nowrap',
                  }}>
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {isLoading ? (
                [...Array(5)].map((_, i) => (
                  <tr key={i} style={{ borderBottom: '1px solid var(--border)' }}>
                    {skeletonWidths.map((w, j) => (
                      <td key={j} style={{ padding: '16px 24px' }}>
                        <Skeleton w={w} h={13} />
                      </td>
                    ))}
                  </tr>
                ))
              ) : !data?.recentSales?.length ? (
                <tr>
                  <td colSpan={tableHeaders.length} style={{
                    padding: '56px 24px', textAlign: 'center',
                    color: 'var(--text-muted)', fontSize: 13.5,
                  }}>
                    No sales yet. Create your first invoice to see it here.
                  </td>
                </tr>
              ) : (
                data.recentSales.map((sale, i) => (
                  <tr
                    key={sale.sales_id}
                    style={{
                      borderBottom: i < data.recentSales.length - 1 ? '1px solid var(--border)' : 'none',
                      transition: 'background 0.13s',
                    }}
                    onMouseEnter={e => e.currentTarget.style.background = 'var(--bg-subtle)'}
                    onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
                  >
                    <td style={{ padding: '16px 24px', fontSize: 13, fontWeight: 700, color: 'var(--accent-600)', letterSpacing: '0.01em' }}>
                      {sale.invoice_no}
                    </td>
                    {canSeeFinancials && (
                      <td style={{ padding: '16px 24px', fontSize: 13.5, fontWeight: 600, color: 'var(--text-primary)' }}>
                        {formatCurrency(parseFloat(sale.sales_final_amount), country)}
                      </td>
                    )}
                    <td style={{ padding: '16px 24px' }}>
                      <Badge status={sale.sales_payment_status} />
                    </td>
                    <td style={{ padding: '16px 24px', fontSize: 12.5, color: 'var(--text-muted)', fontWeight: 400 }}>
                      {formatDate(sale.sales_created_at)}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </>
  )
}
