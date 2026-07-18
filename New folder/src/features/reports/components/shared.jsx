import { BentoCard, EmptyState } from '../../../shared/components'

// ─── Skeleton ─────────────────────────────────────────────────────────────────
export function Skeleton({ w = '60%', h = 28 }) {
  return <div style={{ height: h, width: w, background: 'var(--bg-hover)', borderRadius: 6, animation: 'pulse-shimmer 1.5s ease-in-out infinite' }} />
}

export function SkeletonCard() {
  return (
    <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 'var(--r-xl)', padding: '24px', display: 'flex', flexDirection: 'column', gap: 16, boxShadow: 'var(--shadow-card)' }}>
      <Skeleton w={46} h={46} />
      <Skeleton w="70%" h={28} />
      <Skeleton w="50%" h={14} />
    </div>
  )
}

export function SectionSkeleton() {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
      <SkeletonCard />
      <SkeletonCard />
      <SkeletonCard />
    </div>
  )
}

// ─── Stat Card ─────────────────────────────────────────────────────────────────
export function StatCard({ label, value, sub, icon, loading }) {
  return (
    <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 16, padding: 20, display: 'flex', flexDirection: 'column', gap: 14, boxShadow: 'var(--shadow-card)', minWidth: 0, overflow: 'hidden' }}>
      <div style={{ width: 36, height: 36, borderRadius: 'var(--r-md)', background: 'var(--accent-50)', border: '1px solid var(--accent-100)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--accent-600)', flexShrink: 0 }}>{icon}</div>
      {loading ? <Skeleton w="70%" h={28} /> : <div style={{ fontSize: 'clamp(18px, 2.4vw, 28px)', fontWeight: 700, color: 'var(--text-primary)', letterSpacing: '-0.03em', lineHeight: 1.1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{value}</div>}
      <div>
        <div style={{ fontSize: 12, fontWeight: 500, color: 'var(--text-secondary)', marginBottom: 3 }}>{label}</div>
        <div style={{ fontSize: 12, color: 'var(--text-muted)', fontWeight: 400 }}>{sub}</div>
      </div>
    </div>
  )
}

// ─── Section Headers ─────────────────────────────────────────────────────────
export function SectionTitle({ title, subtitle }) {
  return (
    <div style={{ marginBottom: 20 }}>
      <h2 style={{ fontSize: 16, fontWeight: 700, color: 'var(--text-primary)', margin: '0 0 4px', letterSpacing: '-0.3px' }}>{title}</h2>
      {subtitle && <p style={{ fontSize: 13, color: 'var(--text-muted)', margin: 0, fontWeight: 400 }}>{subtitle}</p>}
    </div>
  )
}

export function ChartCard({ title, subtitle, children, period, onPeriodChange }) {
  const PERIODS = [
    { key: 'weekly', label: 'Weekly' },
    { key: 'monthly', label: 'Monthly' },
    { key: 'yearly', label: 'Yearly' },
  ]
  return (
    <BentoCard style={{ marginBottom: 20 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20, flexWrap: 'wrap', gap: 12 }}>
        <div>
          <h3 style={{ fontSize: 14, fontWeight: 700, color: 'var(--text-primary)', margin: '0 0 4px' }}>{title}</h3>
          {subtitle && <p style={{ fontSize: 12, color: 'var(--text-muted)', margin: 0 }}>{subtitle}</p>}
        </div>
        {onPeriodChange && <div style={{ display: 'flex', gap: 6, background: 'var(--bg-subtle)', border: '1px solid var(--border)', borderRadius: 'var(--r-md)', padding: 4 }}>
          {PERIODS.map(p => (
            <button key={p.key} onClick={() => onPeriodChange(p.key)}
              style={{ padding: '4px 12px', borderRadius: 'var(--r-sm)', border: 'none', cursor: 'pointer', fontSize: 12, fontWeight: 600, transition: 'background 0.15s, color 0.15s',
                background: period === p.key ? 'var(--accent-500)' : 'transparent',
                color: period === p.key ? '#fff' : 'var(--text-secondary)' }}>
              {p.label}
            </button>
          ))}
        </div>}
      </div>
      {children}
    </BentoCard>
  )
}

export function InfoCard({ title, subtitle, children, style }) {
  return (
    <BentoCard style={style}>
      <h3 style={{ fontSize: 14, fontWeight: 700, color: 'var(--text-primary)', margin: '0 0 4px' }}>{title}</h3>
      {subtitle && <p style={{ fontSize: 12, color: 'var(--text-muted)', margin: '0 0 16px' }}>{subtitle}</p>}
      {children}
    </BentoCard>
  )
}

export function DataTable({ columns, data, loading }) {
  if (loading) return <Skeleton w="100%" h={200} />
  if (!data || data.length === 0) return <EmptyState title="No data" description="No records found for the selected period." />
  return (
    <div className="premium-table-wrap" style={{ overflowX: 'auto' }}>
      <table className="premium-table" style={{ width: '100%' }}>
        <thead>
          <tr>
            {columns.map(col => (
              <th key={col.key} style={{ textAlign: col.align || 'left', padding: '12px 16px', fontSize: 11, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.04em', borderBottom: '2px solid var(--border)', whiteSpace: 'nowrap' }}>{col.label}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {data.map((row, i) => (
            <tr key={row.id || i}>
              {columns.map(col => (
                <td key={col.key} style={{ textAlign: col.align || 'left', padding: '12px 16px', color: 'var(--text-primary)', fontWeight: col.bold ? 700 : 500, borderBottom: '1px solid var(--border)', whiteSpace: col.nowrap ? 'nowrap' : 'normal' }}>
                  {col.format ? col.format(row[col.key], row) : (row[col.key] ?? '—')}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
