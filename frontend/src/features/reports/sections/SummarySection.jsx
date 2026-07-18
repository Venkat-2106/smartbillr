import { useMemo } from 'react'
import { BentoCard, UpgradeBlur } from '../../../shared/components'
import { formatCurrency } from '../../../shared/utils/formatCurrency'
import { useReportSummary, useReportCountry } from '../hooks/useReports'
import { StatCard, SkeletonCard, SectionTitle } from '../components/shared'

export default function SummarySection({ dateFrom, dateTo }) {
  const { data: s, isLoading, isError } = useReportSummary(dateFrom, dateTo)
  const country = useReportCountry()
  const lockedReason = s?.financial_locked_reason

  const cards = useMemo(() => {
    if (!s) return []
    return [
      { id: 'sales', label: 'Total Sales', value: s.total_sales != null ? formatCurrency(s.total_sales, country) : '—', sub: `${s.total_invoices ?? 0} invoices`, icon: <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><line x1="12" y1="1" x2="12" y2="23"/><path d="M17 5H9.5a3.5 3.5 0 000 7h5a3.5 3.5 0 010 7H6"/></svg> },
      { id: 'purchases', label: 'Total Purchases', value: s.total_purchases != null ? formatCurrency(s.total_purchases, country) : '—', sub: `${s.total_purchases_count ?? 0} purchases`, icon: <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M16.5 9.4 7.55 4.24"/><path d="M21 16V8a2 2 0 00-1-1.73l-7-4a2 2 0 00-2 0l-7 4A2 2 0 002 8v8a2 2 0 001 1.73l7 4a2 2 0 002 0l7-4A2 2 0 0021 16z"/><polyline points="3.29 7 12 12 20.71 7"/><line x1="12" y1="22" x2="12" y2="12"/></svg> },
      { id: 'profit', label: 'Gross Profit', value: s.gross_profit != null ? formatCurrency(s.gross_profit, country) : '—', sub: s.total_sales ? `${((s.gross_profit / s.total_sales) * 100).toFixed(1)}% margin` : '—', icon: <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><polyline points="23 6 13.5 15.5 8.5 10.5 1 18"/><polyline points="17 6 23 6 23 12"/></svg> },
      { id: 'expenses', label: 'Expenses', value: s.total_expenses != null ? formatCurrency(s.total_expenses, country) : '—', sub: 'Operating costs', icon: <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><rect x="1" y="4" width="22" height="16" rx="2"/><line x1="1" y1="10" x2="23" y2="10"/></svg> },
      { id: 'net', label: 'Net Profit', value: (s.total_sales != null && s.total_expenses != null) ? formatCurrency(s.total_sales - s.total_expenses, country) : '—', sub: 'Revenue minus expenses', icon: <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><rect x="3" y="12" width="4" height="9"/><rect x="10" y="7" width="4" height="14"/><rect x="17" y="3" width="4" height="18"/></svg> },
      { id: 'outstanding', label: 'Outstanding', value: s.outstanding_receivables != null ? formatCurrency(s.outstanding_receivables, country) : '—', sub: 'Pending collections', icon: <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg> },
      { id: 'inventory', label: 'Inventory Value', value: s.inventory_value != null ? formatCurrency(s.inventory_value, country) : '—', sub: `${s.total_products ?? 0} products`, icon: <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M12 2H2v10l9.29 9.29a2 2 0 002.83 0l6.17-6.17a2 2 0 000-2.83L12 2z"/><circle cx="7" cy="7" r="1"/></svg> },
      { id: 'lowstock', label: 'Low Stock', value: String(s.low_stock_count ?? 0), sub: 'Products below threshold', icon: <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg> },
    ]
  }, [s, country])

  const content = (
    <BentoCard>
      <SectionTitle title="Dashboard Summary" subtitle="Key metrics at a glance" />
      {isError && <div style={{ padding: '12px 16px', background: 'var(--danger-bg)', border: '1px solid var(--danger-border)', borderRadius: 12, color: 'var(--danger-text)', fontSize: 13, marginBottom: 20 }}>Could not load summary data.</div>}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: 16 }}>
        {(isLoading ? Array(8).fill(null) : cards).map((card, i) => card ? <StatCard key={card.id} {...card} loading={false} /> : <SkeletonCard key={i} />)}
      </div>
    </BentoCard>
  )

  return lockedReason ? <UpgradeBlur reason={lockedReason} feature="reports & financial data">{content}</UpgradeBlur> : content
}