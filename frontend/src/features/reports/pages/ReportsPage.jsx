import { useState, useMemo, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { BentoCard, LineChart, BarChart, DonutChart, EmptyState } from '../../../shared/components'
import { formatCurrency } from '../../../shared/utils/formatCurrency'
import { formatDate } from '../../../shared/utils/formatDate'
import useAuthStore from '../../../store/authStore'
import { usePermissions } from '../../../shared/hooks/usePermissions'
import {
  useReportSummary,
  useSalesTrend, useSalesByCustomer, useSalesByProduct, useSalesByCategory,
  useSalesByPaymentMethod, useSalesInvoiceStatus,
  usePurchaseSummary, usePurchaseTrend, usePurchasesBySupplier, usePurchasesByProduct,
  usePurchaseTaxSummary,
  useGrossProfit, useProfitByProduct, useProfitByCategory, useProfitByCustomer, useProfitTrend,
  useInventoryValuation, useInventoryMovementSummary, useStockFlow, useMovingProducts,
  useTopCustomers, useCustomerOutstanding,
  useTopSuppliers, useSupplierSpendAnalysis,
  useExpensesByCategory, useExpenseTrend, useExpenseDistribution,
  useTaxCollected, useTaxPaid, useTaxLiability, useTaxByRate,
  useSalesReturns, usePurchaseReturns, useReturnsTrend, useReturnsImpact,
  usePaymentCollections, useOutstandingReceivables, usePaymentsByMethod, usePartialPayments,
  useUserActivities, useLoginActivities, useDataChanges, useExportActivities,
} from '../hooks/useReports'

// ─── Skeleton ─────────────────────────────────────────────────────────────────
function Skeleton({ w = '60%', h = 28 }) {
  return <div style={{ height: h, width: w, background: 'var(--bg-hover)', borderRadius: 6, animation: 'pulse-shimmer 1.5s ease-in-out infinite' }} />
}

function SkeletonCard() {
  return (
    <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 'var(--r-xl)', padding: '24px', display: 'flex', flexDirection: 'column', gap: 16, boxShadow: 'var(--shadow-card)' }}>
      <Skeleton w={46} h={46} />
      <Skeleton w="70%" h={28} />
      <Skeleton w="50%" h={14} />
    </div>
  )
}

// ─── Stat Card ─────────────────────────────────────────────────────────────────
function StatCard({ label, value, sub, icon, loading }) {
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
function SectionTitle({ title, subtitle }) {
  return (
    <div style={{ marginBottom: 20 }}>
      <h2 style={{ fontSize: 16, fontWeight: 700, color: 'var(--text-primary)', margin: '0 0 4px', letterSpacing: '-0.3px' }}>{title}</h2>
      {subtitle && <p style={{ fontSize: 13, color: 'var(--text-muted)', margin: 0, fontWeight: 400 }}>{subtitle}</p>}
    </div>
  )
}

function ChartCard({ title, subtitle, children, period, onPeriodChange }) {
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

function InfoCard({ title, subtitle, children, style }) {
  return (
    <BentoCard style={style}>
      <h3 style={{ fontSize: 14, fontWeight: 700, color: 'var(--text-primary)', margin: '0 0 4px' }}>{title}</h3>
      {subtitle && <p style={{ fontSize: 12, color: 'var(--text-muted)', margin: '0 0 16px' }}>{subtitle}</p>}
      {children}
    </BentoCard>
  )
}

function DataTable({ columns, data, loading }) {
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

// ─── Tab Config ────────────────────────────────────────────────────────────────
const _S = (d) => <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{d}</svg>

const TABS = [
  { key: 'summary', label: 'Summary', icon: _S(<><rect x="3" y="12" width="4" height="9"/><rect x="10" y="7" width="4" height="14"/><rect x="17" y="3" width="4" height="18"/></>), permission: 'reports.view' },
  { key: 'sales', label: 'Sales', icon: _S(<><line x1="12" y1="1" x2="12" y2="23"/><path d="M17 5H9.5a3.5 3.5 0 000 7h5a3.5 3.5 0 010 7H6"/></>), permission: 'reports.view' },
  { key: 'purchases', label: 'Purchases', icon: _S(<><path d="M16.5 9.4 7.55 4.24"/><path d="M21 16V8a2 2 0 00-1-1.73l-7-4a2 2 0 00-2 0l-7 4A2 2 0 002 8v8a2 2 0 001 1.73l7 4a2 2 0 002 0l7-4A2 2 0 0021 16z"/><polyline points="3.29 7 12 12 20.71 7"/><line x1="12" y1="22" x2="12" y2="12"/></>), permission: 'reports.view' },
  { key: 'profit', label: 'Profitability', icon: _S(<><polyline points="23 6 13.5 15.5 8.5 10.5 1 18"/><polyline points="17 6 23 6 23 12"/></>), permission: 'reports.view', financial: true },
  { key: 'inventory', label: 'Inventory', icon: _S(<><path d="M12 2H2v10l9.29 9.29a2 2 0 002.83 0l6.17-6.17a2 2 0 000-2.83L12 2z"/><circle cx="7" cy="7" r="1"/></>), permission: 'reports.view' },
  { key: 'customers', label: 'Customers', icon: _S(<><path d="M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 00-3-3.87"/><path d="M16 3.13a4 4 0 010 7.75"/></>), permission: 'reports.view' },
  { key: 'suppliers', label: 'Suppliers', icon: _S(<><rect x="4" y="2" width="16" height="20"/><path d="M9 22v-4h6v4"/><path d="M8 6h2"/><path d="M8 10h2"/><path d="M14 6h2"/><path d="M14 10h2"/></>), permission: 'reports.view' },
  { key: 'expenses', label: 'Expenses', icon: _S(<><rect x="1" y="4" width="22" height="16" rx="2"/><line x1="1" y1="10" x2="23" y2="10"/></>), permission: 'reports.view' },
  { key: 'tax', label: 'Tax', icon: _S(<><path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/></>), permission: 'reports.view', financial: true },
  { key: 'returns', label: 'Returns', icon: _S(<><polyline points="23 4 23 10 17 10"/><polyline points="1 20 1 14 7 14"/><path d="M3.51 9a9 9 0 0114.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0020.49 15"/></>), permission: 'reports.view', financial: true },
  { key: 'payments', label: 'Payments', icon: _S(<><rect x="1" y="6" width="22" height="12" rx="2"/><circle cx="7" cy="12" r="2"/><path d="M17 12h.01"/></>), permission: 'reports.view', financial: true },
  { key: 'audit', label: 'Audit', icon: _S(<><path d="M16 4h2a2 2 0 012 2v14a2 2 0 01-2 2H6a2 2 0 01-2-2V6a2 2 0 012-2h2"/><rect x="8" y="2" width="8" height="4" rx="1"/></>), permission: 'reports.view' },
]



// ═══════════════════════════════════════════════════════════════════════════════
// 1. SUMMARY SECTION
// ═══════════════════════════════════════════════════════════════════════════════

function SummarySection({ dateFrom, dateTo }) {
  const { data: s, isLoading, isError } = useReportSummary(dateFrom, dateTo)
  const business = useAuthStore(st => st.business)
  const country = business?.business_country_code || 'IN'

  const cards = useMemo(() => {
    if (!s) return []
    return [
      { key: 'sales', label: 'Total Sales', value: s.total_sales != null ? formatCurrency(s.total_sales, country) : '—', sub: `${s.total_invoices ?? 0} invoices`, icon: <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><line x1="12" y1="1" x2="12" y2="23"/><path d="M17 5H9.5a3.5 3.5 0 000 7h5a3.5 3.5 0 010 7H6"/></svg> },
      { key: 'purchases', label: 'Total Purchases', value: s.total_purchases != null ? formatCurrency(s.total_purchases, country) : '—', sub: `${s.total_purchases_count ?? 0} purchases`, icon: <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M16.5 9.4 7.55 4.24"/><path d="M21 16V8a2 2 0 00-1-1.73l-7-4a2 2 0 00-2 0l-7 4A2 2 0 002 8v8a2 2 0 001 1.73l7 4a2 2 0 002 0l7-4A2 2 0 0021 16z"/><polyline points="3.29 7 12 12 20.71 7"/><line x1="12" y1="22" x2="12" y2="12"/></svg> },
      { key: 'profit', label: 'Gross Profit', value: s.gross_profit != null ? formatCurrency(s.gross_profit, country) : '—', sub: s.total_sales ? `${((s.gross_profit / s.total_sales) * 100).toFixed(1)}% margin` : '—', icon: <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><polyline points="23 6 13.5 15.5 8.5 10.5 1 18"/><polyline points="17 6 23 6 23 12"/></svg> },
      { key: 'expenses', label: 'Expenses', value: s.total_expenses != null ? formatCurrency(s.total_expenses, country) : '—', sub: 'Operating costs', icon: <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><rect x="1" y="4" width="22" height="16" rx="2"/><line x1="1" y1="10" x2="23" y2="10"/></svg> },
      { key: 'net', label: 'Net Profit', value: (s.total_sales != null && s.total_expenses != null) ? formatCurrency(s.total_sales - s.total_expenses, country) : '—', sub: 'Revenue minus expenses', icon: <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><rect x="3" y="12" width="4" height="9"/><rect x="10" y="7" width="4" height="14"/><rect x="17" y="3" width="4" height="18"/></svg> },
      { key: 'outstanding', label: 'Outstanding', value: s.outstanding_receivables != null ? formatCurrency(s.outstanding_receivables, country) : '—', sub: 'Pending collections', icon: <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg> },
      { key: 'inventory', label: 'Inventory Value', value: s.inventory_value != null ? formatCurrency(s.inventory_value, country) : '—', sub: `${s.total_products ?? 0} products`, icon: <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M12 2H2v10l9.29 9.29a2 2 0 002.83 0l6.17-6.17a2 2 0 000-2.83L12 2z"/><circle cx="7" cy="7" r="1"/></svg> },
      { key: 'lowstock', label: 'Low Stock', value: String(s.low_stock_count ?? 0), sub: 'Products below threshold', icon: <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg> },
    ]
  }, [s, country])

  return (
    <BentoCard>
      <SectionTitle title="Dashboard Summary" subtitle="Key metrics at a glance" />
      {isError && <div style={{ padding: '12px 16px', background: 'var(--danger-bg)', border: '1px solid var(--danger-border)', borderRadius: 12, color: 'var(--danger-text)', fontSize: 13, marginBottom: 20 }}>Could not load summary data.</div>}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: 16 }}>
        {(isLoading ? Array(8).fill(null) : cards).map((card, i) => card ? <StatCard key={card.key} {...card} loading={false} /> : <SkeletonCard key={i} />)}
      </div>
    </BentoCard>
  )
}

// ═══════════════════════════════════════════════════════════════════════════════
// 2. SALES SECTION
// ═══════════════════════════════════════════════════════════════════════════════

function SalesSection({ dateFrom, dateTo }) {
  const [period, setPeriod] = useState('monthly')
  const trend = useSalesTrend(period, dateFrom, dateTo)
  const byCustomer = useSalesByCustomer(dateFrom, dateTo)
  const byProduct = useSalesByProduct(dateFrom, dateTo)
  const byCategory = useSalesByCategory(dateFrom, dateTo)
  const byPayment = useSalesByPaymentMethod(dateFrom, dateTo)
  const invoiceStatus = useSalesInvoiceStatus(dateFrom, dateTo)
  const business = useAuthStore(st => st.business)
  const country = business?.business_country_code || 'IN'

  const trendData = useMemo(() => {
    if (!Array.isArray(trend.data)) return []
    return trend.data.map(d => ({ label: d.label, value: Math.round(d.revenue) }))
  }, [trend.data])

  const statusData = invoiceStatus.data ? [
    { label: 'Paid', value: invoiceStatus.data.paid_count ?? 0, color: 'var(--success)' },
    { label: 'Partial', value: invoiceStatus.data.partial_count ?? 0, color: 'var(--warning)' },
    { label: 'Pending', value: invoiceStatus.data.pending_count ?? 0, color: 'var(--danger)' },
  ] : []

  const paymentData = useMemo(() => {
    if (!Array.isArray(byPayment.data)) return []
    return byPayment.data.map(d => ({ label: d.payment_method, value: d.total_amount }))
  }, [byPayment.data])

  return (
    <BentoCard>
      <SectionTitle title="Sales Reports" subtitle="Revenue, customer trends, product performance" />

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: 14, marginBottom: 20 }}>
        {[
          { label: 'Total Revenue', value: invoiceStatus.data ? formatCurrency(
            (invoiceStatus.data.paid_amount + invoiceStatus.data.partial_amount + invoiceStatus.data.pending_amount), country) : '—', icon: <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><line x1="12" y1="1" x2="12" y2="23"/><path d="M17 5H9.5a3.5 3.5 0 000 7h5a3.5 3.5 0 010 7H6"/></svg> },
          { label: 'Paid Invoices', value: invoiceStatus.data?.paid_count ?? '—', sub: `${invoiceStatus.data?.paid_amount ? formatCurrency(invoiceStatus.data.paid_amount, country) : ''}`, icon: <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M22 11.08V12a10 10 0 11-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></svg> },
          { label: 'Partial', value: invoiceStatus.data?.partial_count ?? '—', sub: `${invoiceStatus.data?.partial_amount ? formatCurrency(invoiceStatus.data.partial_amount, country) : ''}`, icon: <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg> },
          { label: 'Pending', value: invoiceStatus.data?.pending_count ?? '—', sub: `${invoiceStatus.data?.pending_amount ? formatCurrency(invoiceStatus.data.pending_amount, country) : ''}`, icon: <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg> },
        ].map((c, i) => <StatCard key={i} {...c} loading={invoiceStatus.isLoading} />)}
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20, marginBottom: 20 }}>
        <ChartCard title="Revenue Trend" subtitle="Sales revenue over time" period={period} onPeriodChange={setPeriod}>
          <LineChart data={trendData} loading={trend.isLoading} error={trend.isError} />
        </ChartCard>
        <InfoCard title="Invoice Status" subtitle="Payment status breakdown">
          <DonutChart data={statusData} loading={invoiceStatus.isLoading} error={invoiceStatus.isError} centerText={String(invoiceStatus.data?.total ?? 0)} />
        </InfoCard>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20, marginBottom: 20 }}>
        <InfoCard title="Top Products" subtitle="By revenue">
          <BarChart data={useMemo(() => (Array.isArray(byProduct.data) ? byProduct.data.map(d => ({ label: d.prod_name, value: d.total_revenue })) : []), [byProduct.data])}
            loading={byProduct.isLoading} error={byProduct.isError} />
        </InfoCard>
        <InfoCard title="Payment Methods" subtitle="Revenue by payment type">
          <DonutChart data={paymentData} loading={byPayment.isLoading} error={byPayment.isError} />
        </InfoCard>
      </div>

      <InfoCard title="Sales by Customer" subtitle="Top customers">
        <DataTable columns={[
          { key: 'cust_name', label: 'Customer', bold: true },
          { key: 'invoice_count', label: 'Invoices', align: 'center' },
          { key: 'total_amount', label: 'Total', align: 'right', format: v => formatCurrency(v, country) },
          { key: 'outstanding_amount', label: 'Outstanding', align: 'right', format: v => formatCurrency(v, country) },
        ]} data={Array.isArray(byCustomer.data) ? byCustomer.data : []} loading={byCustomer.isLoading} />
      </InfoCard>

      <InfoCard title="Sales by Product" subtitle="Product-wise revenue" style={{ marginTop: 20 }}>
        <DataTable columns={[
          { key: 'prod_name', label: 'Product', bold: true },
          { key: 'category_name', label: 'Category' },
          { key: 'total_qty_sold', label: 'Qty', align: 'center' },
          { key: 'total_revenue', label: 'Revenue', align: 'right', format: v => formatCurrency(v, country) },
        ]} data={Array.isArray(byProduct.data) ? byProduct.data : []} loading={byProduct.isLoading} />
      </InfoCard>
    </BentoCard>
  )
}

// ═══════════════════════════════════════════════════════════════════════════════
// 3. PURCHASES SECTION
// ═══════════════════════════════════════════════════════════════════════════════

function PurchasesSection({ dateFrom, dateTo }) {
  const [period, setPeriod] = useState('monthly')
  const summary = usePurchaseSummary(dateFrom, dateTo)
  const trend = usePurchaseTrend(period, dateFrom, dateTo)
  const bySupplier = usePurchasesBySupplier(dateFrom, dateTo)
  const byProduct = usePurchasesByProduct(dateFrom, dateTo)
  const taxSummary = usePurchaseTaxSummary(dateFrom, dateTo)
  const business = useAuthStore(st => st.business)
  const country = business?.business_country_code || 'IN'

  const trendData = useMemo(() => {
    if (!Array.isArray(trend.data)) return []
    return trend.data.map(d => ({ label: d.label, value: Math.round(d.amount) }))
  }, [trend.data])

  const s = summary.data

  return (
    <BentoCard>
      <SectionTitle title="Purchase Reports" subtitle="Spend analysis and supplier performance" />
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: 14, marginBottom: 20 }}>
        {[
          { label: 'Total Spend', value: s ? formatCurrency(s.total_amount, country) : '—', sub: `${s?.total_purchases ?? 0} purchases`, icon: <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M16.5 9.4 7.55 4.24"/><path d="M21 16V8a2 2 0 00-1-1.73l-7-4a2 2 0 00-2 0l-7 4A2 2 0 002 8v8a2 2 0 001 1.73l7 4a2 2 0 002 0l7-4A2 2 0 0021 16z"/><polyline points="3.29 7 12 12 20.71 7"/><line x1="12" y1="22" x2="12" y2="12"/></svg> },
          { label: 'Total Tax', value: s ? formatCurrency(s.total_tax, country) : '—', sub: `CGST: ${formatCurrency(s?.total_cgst ?? 0, country)} · SGST: ${formatCurrency(s?.total_sgst ?? 0, country)}`, icon: <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/></svg> },
          { label: 'Paid', value: s?.paid_count ?? '—', sub: 'Completed purchases', icon: <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M22 11.08V12a10 10 0 11-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></svg> },
          { label: 'Pending', value: s?.pending_count ?? '—', sub: 'Unpaid purchases', icon: <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg> },
        ].map((c, i) => <StatCard key={i} {...c} loading={summary.isLoading} />)}
      </div>

      <ChartCard title="Purchase Trend" subtitle="Spend over time" period={period} onPeriodChange={setPeriod}>
        <LineChart data={trendData} loading={trend.isLoading} error={trend.isError} />
      </ChartCard>

      <div style={{ marginTop: 20 }}>
        <InfoCard title="Purchases by Supplier">
          <BarChart data={useMemo(() => (Array.isArray(bySupplier.data) ? bySupplier.data.map(d => ({ label: d.supp_name, value: d.total_amount })) : []), [bySupplier.data])}
            loading={bySupplier.isLoading} error={bySupplier.isError} />
        </InfoCard>
      </div>
    </BentoCard>
  )
}

// ═══════════════════════════════════════════════════════════════════════════════
// 4. PROFITABILITY SECTION
// ═══════════════════════════════════════════════════════════════════════════════

function ProfitSection({ dateFrom, dateTo }) {
  const [period, setPeriod] = useState('monthly')
  const grossProfit = useGrossProfit(dateFrom, dateTo)
  const byProduct = useProfitByProduct(dateFrom, dateTo)
  const byCategory = useProfitByCategory(dateFrom, dateTo)
  const byCustomer = useProfitByCustomer(dateFrom, dateTo)
  const trend = useProfitTrend(period, dateFrom, dateTo)
  const business = useAuthStore(st => st.business)
  const country = business?.business_country_code || 'IN'

  const trendData = useMemo(() => {
    if (!Array.isArray(trend.data)) return []
    return trend.data.map(d => ({ label: d.label, value: Math.round(d.profit) }))
  }, [trend.data])

  const profitByProductData = useMemo(() => (Array.isArray(byProduct.data) ? byProduct.data.map(d => ({ label: d.prod_name, value: d.profit ?? d.revenue })) : []), [byProduct.data])

  const profitByCategoryData = useMemo(() => (Array.isArray(byCategory.data) ? byCategory.data.map(d => ({ label: d.category_name, value: d.profit ?? d.revenue })) : []), [byCategory.data])

  if (grossProfit.data?.gross_profit === undefined || grossProfit.data?.gross_profit === null) {
    return (
      <BentoCard>
        <SectionTitle title="Profitability Reports" subtitle="You need financial access to view profit data." />
        <EmptyState icon={<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><rect x="3" y="11" width="18" height="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0110 0v4"/></svg>} title="Restricted" description="Contact your admin for financial report access." />
      </BentoCard>
    )
  }

  const profitCards = [
    { label: 'Gross Revenue', value: formatCurrency(grossProfit.data?.total_revenue ?? 0, country), sub: 'Total sales revenue', icon: <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><line x1="12" y1="1" x2="12" y2="23"/><path d="M17 5H9.5a3.5 3.5 0 000 7h5a3.5 3.5 0 010 7H6"/></svg> },
    { label: 'Total Cost', value: formatCurrency(grossProfit.data?.total_cost ?? 0, country), sub: 'Cost of goods sold', icon: <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M16.5 9.4 7.55 4.24"/><path d="M21 16V8a2 2 0 00-1-1.73l-7-4a2 2 0 00-2 0l-7 4A2 2 0 002 8v8a2 2 0 001 1.73l7 4a2 2 0 002 0l7-4A2 2 0 0021 16z"/><polyline points="3.29 7 12 12 20.71 7"/><line x1="12" y1="22" x2="12" y2="12"/></svg> },
    { label: 'Gross Profit', value: formatCurrency(grossProfit.data?.gross_profit ?? 0, country), sub: `${grossProfit.data?.margin_pct ?? 0}% margin`, icon: <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><polyline points="23 6 13.5 15.5 8.5 10.5 1 18"/><polyline points="17 6 23 6 23 12"/></svg> },
  ]

  return (
    <BentoCard>
      <SectionTitle title="Profitability Reports" subtitle="Revenue, costs, and margin analysis" />
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: 14, marginBottom: 20 }}>
        {profitCards.map(c => <StatCard key={c.label} {...c} loading={grossProfit.isLoading} />)}
      </div>
      <ChartCard title="Profit Trend" subtitle="Profit over time" period={period} onPeriodChange={setPeriod}>
        <LineChart data={trendData} loading={trend.isLoading} error={trend.isError} />
      </ChartCard>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20, marginTop: 20 }}>
        <InfoCard title="Profit by Product">
          <BarChart data={profitByProductData}
            loading={byProduct.isLoading} error={byProduct.isError} />
        </InfoCard>
        <InfoCard title="Profit by Category">
          <BarChart data={profitByCategoryData}
            loading={byCategory.isLoading} error={byCategory.isError} />
        </InfoCard>
      </div>
    </BentoCard>
  )
}

// ═══════════════════════════════════════════════════════════════════════════════
// 5. INVENTORY SECTION
// ═══════════════════════════════════════════════════════════════════════════════

function InventorySection({ dateFrom, dateTo }) {
  const [movementPeriod, setMovementPeriod] = useState('monthly')
  const valuation = useInventoryValuation()
  const movementSummary = useInventoryMovementSummary(dateFrom, dateTo)
  const stockFlow = useStockFlow(dateFrom, dateTo)
  const moving = useMovingProducts(movementPeriod)
  const business = useAuthStore(st => st.business)
  const country = business?.business_country_code || 'IN'

  const mv = movementSummary.data
  const sf = stockFlow.data

  return (
    <BentoCard>
      <SectionTitle title="Inventory Reports" subtitle="Stock levels, valuation, and movement analysis" />
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: 14, marginBottom: 20 }}>
        <StatCard label="Total Products" value={String(valuation.data?.total_products ?? '—')} sub={valuation.data ? `${valuation.data.total_stock_qty} units total` : ''} icon={<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M12 2H2v10l9.29 9.29a2 2 0 002.83 0l6.17-6.17a2 2 0 000-2.83L12 2z"/><circle cx="7" cy="7" r="1"/></svg>} loading={valuation.isLoading} />
        <StatCard label="Stock Value" value={valuation.data?.total_value != null ? formatCurrency(valuation.data.total_value, country) : '—'} sub="Current stock × cost price" icon={<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><line x1="12" y1="1" x2="12" y2="23"/><path d="M17 5H9.5a3.5 3.5 0 000 7h5a3.5 3.5 0 010 7H6"/></svg>} loading={valuation.isLoading} />
        <StatCard label="Stock In" value={sf?.stock_in ?? '—'} sub="Units received" icon={<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>} loading={stockFlow.isLoading} />
        <StatCard label="Stock Out" value={sf?.stock_out ?? '—'} sub="Units sold/removed" icon={<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/></svg>} loading={stockFlow.isLoading} />
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20, marginBottom: 20 }}>
        <InfoCard title="Stock Movement by Type">
          {mv && mv.length > 0 ? mv.map(m => (
            <div key={m.move_type} style={{ display: 'flex', justifyContent: 'space-between', padding: '8px 0', borderBottom: '1px solid var(--border)' }}>
              <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-primary)' }}>{m.move_type.replace(/_/g, ' ')}</span>
              <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-secondary)' }}>{m.net_qty} units</span>
            </div>
          )) : <EmptyState title="No movements" description="" />}
        </InfoCard>
        <InfoCard title="Fast / Slow / Dead Stock" subtitle={`Based on ${movementPeriod} sales`}>
          <div style={{ display: 'flex', gap: 8, marginBottom: 12 }}>
            {['weekly', 'monthly', 'quarterly', 'yearly'].map(p => (
              <button key={p} onClick={() => setMovementPeriod(p)}
                style={{ padding: '4px 10px', borderRadius: 6, border: '1px solid var(--border)', cursor: 'pointer', fontSize: 11, fontWeight: 600,
                  background: movementPeriod === p ? 'var(--accent-500)' : 'transparent',
                  color: movementPeriod === p ? '#fff' : 'var(--text-secondary)' }}>{p}</button>
            ))}
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 12 }}>
            {[
              { title: 'Fast', data: moving.data?.fast_moving ?? [], key: 'qty_sold' },
              { title: 'Slow', data: moving.data?.slow_moving ?? [], key: 'qty_sold' },
              { title: 'Dead', data: moving.data?.dead_stock ?? [], key: 'stock_qty' },
            ].map(box => (
              <div key={box.title} style={{ background: 'var(--bg-subtle)', borderRadius: 'var(--r-md)', padding: 12 }}>
                <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-muted)', marginBottom: 8 }}>{box.title}</div>
                {box.data.slice(0, 5).map(item => (
                  <div key={item.prod_id} style={{ fontSize: 11.5, padding: '3px 0', color: 'var(--text-primary)', display: 'flex', justifyContent: 'space-between' }}>
                    <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flex: 1 }}>{item.prod_name}</span>
                    <span style={{ fontWeight: 600, marginLeft: 6, flexShrink: 0 }}>{item[box.key]}</span>
                  </div>
                ))}
                {box.data.length === 0 && <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>None</div>}
              </div>
            ))}
          </div>
        </InfoCard>
      </div>
    </BentoCard>
  )
}

// ═══════════════════════════════════════════════════════════════════════════════
// 6. CUSTOMERS SECTION
// ═══════════════════════════════════════════════════════════════════════════════

function CustomersSection({ dateFrom, dateTo }) {
  const topCustomers = useTopCustomers(dateFrom, dateTo)
  const outstanding = useCustomerOutstanding()
  const business = useAuthStore(st => st.business)
  const country = business?.business_country_code || 'IN'

  return (
    <BentoCard>
      <SectionTitle title="Customer Reports" subtitle="Top customers, outstanding, and purchase history" />
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20 }}>
        <InfoCard title="Top Customers" subtitle="By total spend">
          <DataTable columns={[
            { key: 'cust_name', label: 'Customer', bold: true },
            { key: 'invoice_count', label: 'Invoices', align: 'center' },
            { key: 'total_spent', label: 'Total', align: 'right', format: v => formatCurrency(v, country) },
            { key: 'avg_invoice_value', label: 'Avg', align: 'right', format: v => formatCurrency(v, country) },
          ]} data={Array.isArray(topCustomers.data) ? topCustomers.data : []} loading={topCustomers.isLoading} />
        </InfoCard>
        <InfoCard title="Outstanding Receivables" subtitle="Customers with pending payments">
          <DataTable columns={[
            { key: 'cust_name', label: 'Customer', bold: true },
            { key: 'unpaid_invoices', label: 'Unpaid', align: 'center' },
            { key: 'total_outstanding', label: 'Amount', align: 'right', format: v => formatCurrency(v, country) },
          ]} data={Array.isArray(outstanding.data) ? outstanding.data : []} loading={outstanding.isLoading} />
        </InfoCard>
      </div>
    </BentoCard>
  )
}

// ═══════════════════════════════════════════════════════════════════════════════
// 7. SUPPLIERS SECTION
// ═══════════════════════════════════════════════════════════════════════════════

function SuppliersSection({ dateFrom, dateTo }) {
  const topSuppliers = useTopSuppliers(dateFrom, dateTo)
  const spend = useSupplierSpendAnalysis()
  const business = useAuthStore(st => st.business)
  const country = business?.business_country_code || 'IN'

  return (
    <BentoCard>
      <SectionTitle title="Supplier Reports" subtitle="Supplier performance and spend analysis" />
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20 }}>
        <InfoCard title="Top Suppliers" subtitle="By total spend">
          <DataTable columns={[
            { key: 'supp_name', label: 'Supplier', bold: true },
            { key: 'purchase_count', label: 'Orders', align: 'center' },
            { key: 'total_spend', label: 'Total', align: 'right', format: v => formatCurrency(v, country) },
            { key: 'avg_purchase_value', label: 'Avg', align: 'right', format: v => formatCurrency(v, country) },
          ]} data={Array.isArray(topSuppliers.data) ? topSuppliers.data : []} loading={topSuppliers.isLoading} />
        </InfoCard>
        <InfoCard title="Spend Analysis" subtitle="Per supplier breakdown">
          <BarChart data={useMemo(() => (Array.isArray(spend.data) ? spend.data.map(d => ({ label: d.supp_name, value: d.total_spend })).slice(0, 10) : []), [spend.data])}
            loading={spend.isLoading} error={spend.isError} />
        </InfoCard>
      </div>
    </BentoCard>
  )
}

// ═══════════════════════════════════════════════════════════════════════════════
// 8. EXPENSES SECTION
// ═══════════════════════════════════════════════════════════════════════════════

function ExpensesSection({ dateFrom, dateTo }) {
  const [period, setPeriod] = useState('monthly')
  const byCategory = useExpensesByCategory(dateFrom, dateTo)
  const trend = useExpenseTrend(period, dateFrom, dateTo)
  const distribution = useExpenseDistribution(dateFrom, dateTo)
  const business = useAuthStore(st => st.business)
  const country = business?.business_country_code || 'IN'

  const trendData = useMemo(() => {
    if (!Array.isArray(trend.data)) return []
    return trend.data.map(d => ({ label: d.label, value: Math.round(d.amount) }))
  }, [trend.data])

  const categoryData = useMemo(() => {
    if (!Array.isArray(byCategory.data)) return []
    return byCategory.data.map(d => ({ label: d.category, value: d.total_amount }))
  }, [byCategory.data])

  const distData = useMemo(() => {
    if (!distribution.data?.categories) return []
    return distribution.data.categories.map(d => ({ label: d.category, value: d.amount, pct: d.percentage }))
  }, [distribution.data])

  return (
    <BentoCard>
      <SectionTitle title="Expense Reports" subtitle="Expense tracking and category analysis" />
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: 14, marginBottom: 20 }}>
        <StatCard label="Total Expenses" value={distribution.data ? formatCurrency(distribution.data.total_expenses, country) : '—'} sub={`${distribution.data?.total_count ?? 0} entries`} icon={<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><rect x="1" y="4" width="22" height="16" rx="2"/><line x1="1" y1="10" x2="23" y2="10"/></svg>} loading={distribution.isLoading} />
        <StatCard label="Categories" value={String(distribution.data?.categories?.length ?? '—')} sub="Active expense categories" icon={<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/></svg>} loading={distribution.isLoading} />
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20, marginBottom: 20 }}>
        <ChartCard title="Expense Trend" subtitle="Over time" period={period} onPeriodChange={setPeriod}>
          <LineChart data={trendData} loading={trend.isLoading} error={trend.isError} />
        </ChartCard>
        <InfoCard title="Expense Breakdown" subtitle="By category">
          <DonutChart data={distData} loading={distribution.isLoading} error={distribution.isError} />
        </InfoCard>
      </div>

      <InfoCard title="Expenses by Category" subtitle="Detailed breakdown">
        <DataTable columns={[
          { key: 'category', label: 'Category', bold: true },
          { key: 'expense_count', label: 'Count', align: 'center' },
          { key: 'total_amount', label: 'Amount', align: 'right', format: v => formatCurrency(v, country) },
        ]} data={Array.isArray(byCategory.data) ? byCategory.data : []} loading={byCategory.isLoading} />
      </InfoCard>
    </BentoCard>
  )
}

// ═══════════════════════════════════════════════════════════════════════════════
// 9. TAX SECTION
// ═══════════════════════════════════════════════════════════════════════════════

function TaxSection({ dateFrom, dateTo }) {
  const collected = useTaxCollected(dateFrom, dateTo)
  const paid = useTaxPaid(dateFrom, dateTo)
  const liability = useTaxLiability(dateFrom, dateTo)
  const byRate = useTaxByRate(dateFrom, dateTo)
  const business = useAuthStore(st => st.business)
  const country = business?.business_country_code || 'IN'

  const totalCollected = collected.data?.total_tax ?? 0
  const totalPaid = paid.data?.total_tax ?? 0
  const netLiability = liability.data?.net_tax_liability

  return (
    <BentoCard>
      <SectionTitle title="Tax Reports" subtitle="Tax collected, paid, and net liability" />
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: 14, marginBottom: 20 }}>
        <StatCard label="Tax Collected" value={formatCurrency(totalCollected, country)} sub={`CGST: ${formatCurrency(collected.data?.total_cgst ?? 0, country)} · SGST: ${formatCurrency(collected.data?.total_sgst ?? 0, country)}`} icon={<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>} loading={collected.isLoading} />
        <StatCard label="Tax Paid" value={formatCurrency(totalPaid, country)} sub={`On purchases`} icon={<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/></svg>} loading={paid.isLoading} />
        {netLiability != null && <StatCard label="Net Liability" value={formatCurrency(Math.abs(netLiability), country)} sub={netLiability >= 0 ? 'Payable' : 'Refundable'} icon={<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/></svg>} loading={liability.isLoading} />}
      </div>

      <InfoCard title="Tax by GST Rate" subtitle="Breakdown by tax slab">
        <DataTable columns={[
          { key: 'gst_rate', label: 'GST Rate', bold: true, format: v => `${v}%` },
          { key: 'item_count', label: 'Items', align: 'center' },
          { key: 'taxable_amount', label: 'Taxable Value', align: 'right', format: v => formatCurrency(v, country) },
          { key: 'tax_amount', label: 'Tax Amount', align: 'right', format: v => formatCurrency(v, country) },
        ]} data={Array.isArray(byRate.data) ? byRate.data : []} loading={byRate.isLoading} />
      </InfoCard>
    </BentoCard>
  )
}

// ═══════════════════════════════════════════════════════════════════════════════
// 10. RETURNS SECTION
// ═══════════════════════════════════════════════════════════════════════════════

function ReturnsSection({ dateFrom, dateTo }) {
  const [period, setPeriod] = useState('monthly')
  const salesReturns = useSalesReturns(dateFrom, dateTo)
  const purchaseReturns = usePurchaseReturns(dateFrom, dateTo)
  const trend = useReturnsTrend(period, dateFrom, dateTo)
  const impact = useReturnsImpact(dateFrom, dateTo)
  const business = useAuthStore(st => st.business)
  const country = business?.business_country_code || 'IN'

  const sr = salesReturns.data
  const pr = purchaseReturns.data

  const trendData = useMemo(() => {
    if (!Array.isArray(trend.data)) return []
    return trend.data.map(d => ({ label: d.label, value: d.sales_return_count + d.purchase_return_count }))
  }, [trend.data])

  return (
    <BentoCard>
      <SectionTitle title="Return Reports" subtitle="Sales returns, purchase returns, and profit impact" />
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: 14, marginBottom: 20 }}>
        <StatCard label="Sales Returns" value={sr ? formatCurrency(sr.summary?.total_amount ?? 0, country) : '—'} sub={`${sr?.summary?.total_returns ?? 0} returns | ${sr?.summary?.approved_count ?? 0} approved`} icon={<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><polyline points="23 4 23 10 17 10"/><polyline points="1 20 1 14 7 14"/><path d="M3.51 9a9 9 0 0114.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0020.49 15"/></svg>} loading={salesReturns.isLoading} />
        <StatCard label="Purchase Returns" value={pr ? formatCurrency(pr.total_amount ?? 0, country) : '—'} sub={`${pr?.total_returns ?? 0} returns`} icon={<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><polyline points="1 4 1 10 7 10"/><polyline points="23 20 23 14 17 14"/><path d="M20.49 9A9 9 0 005.64 5.64L1 10m22 4l-4.64 4.36A9 9 0 013.51 15"/></svg>} loading={purchaseReturns.isLoading} />
        {impact.data && <StatCard label="Net Return Impact" value={formatCurrency(impact.data.net_return_impact ?? 0, country)} sub={`Sales: ${formatCurrency(impact.data.sales_return_value ?? 0, country)}`} icon={<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><rect x="3" y="12" width="4" height="9"/><rect x="10" y="7" width="4" height="14"/><rect x="17" y="3" width="4" height="18"/></svg>} loading={false} />}
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20 }}>
        <ChartCard title="Return Trend" subtitle="Over time" period={period} onPeriodChange={setPeriod}>
          <LineChart data={trendData} loading={trend.isLoading} error={trend.isError} />
        </ChartCard>
        <InfoCard title="Return Reasons" subtitle="Sales return reasons">
          <DataTable columns={[
            { key: 'reason', label: 'Reason', bold: true },
            { key: 'count', label: 'Count', align: 'center' },
          ]} data={sr?.reasons ?? []} loading={salesReturns.isLoading} />
        </InfoCard>
      </div>
    </BentoCard>
  )
}

// ═══════════════════════════════════════════════════════════════════════════════
// 11. PAYMENTS SECTION
// ═══════════════════════════════════════════════════════════════════════════════

function PaymentsSection({ dateFrom, dateTo }) {
  const [period, setPeriod] = useState('monthly')
  const collections = usePaymentCollections(period, dateFrom, dateTo)
  const outstanding = useOutstandingReceivables()
  const byMethod = usePaymentsByMethod(dateFrom, dateTo)
  const partial = usePartialPayments()
  const business = useAuthStore(st => st.business)
  const country = business?.business_country_code || 'IN'

  const trendData = useMemo(() => {
    if (!Array.isArray(collections.data)) return []
    return collections.data.map(d => ({ label: d.label, value: Math.round(d.amount) }))
  }, [collections.data])

  const methodData = useMemo(() => {
    if (!Array.isArray(byMethod.data)) return []
    return byMethod.data.map(d => ({ label: d.method, value: d.total_amount, pct: d.percentage }))
  }, [byMethod.data])

  return (
    <BentoCard>
      <SectionTitle title="Payment Reports" subtitle="Collections, outstanding, and payment methods" />
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: 14, marginBottom: 20 }}>
        <StatCard label="Total Outstanding" value={outstanding.data ? formatCurrency(outstanding.data.total_outstanding, country) : '—'} sub={`${outstanding.data?.total_invoices ?? 0} unpaid invoices`} icon={<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>} loading={outstanding.isLoading} />
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20, marginBottom: 20 }}>
        <ChartCard title="Collection Trend" subtitle="Payments received over time" period={period} onPeriodChange={setPeriod}>
          <LineChart data={trendData} loading={collections.isLoading} error={collections.isError} />
        </ChartCard>
        <InfoCard title="Payment Methods" subtitle="Distribution">
          <DonutChart data={methodData} loading={byMethod.isLoading} error={byMethod.isError} />
        </InfoCard>
      </div>

      <InfoCard title="Partial Payments" subtitle="Invoices with partial payment">
        <DataTable columns={[
          { key: 'invoice_no', label: 'Invoice', bold: true },
          { key: 'cust_name', label: 'Customer' },
          { key: 'invoice_total', label: 'Total', align: 'right', format: v => formatCurrency(v, country) },
          { key: 'cumulative_paid', label: 'Paid', align: 'right', format: v => formatCurrency(v, country) },
          { key: 'remaining', label: 'Remaining', align: 'right', format: v => formatCurrency(v, country) },
        ]} data={Array.isArray(partial.data) ? partial.data : []} loading={partial.isLoading} />
      </InfoCard>
    </BentoCard>
  )
}

// ═══════════════════════════════════════════════════════════════════════════════
// 12. AUDIT SECTION (Admin only — backend returns [] without staff.manage)
// ═══════════════════════════════════════════════════════════════════════════════

function AuditSection({ dateFrom, dateTo }) {
  const activities = useUserActivities(dateFrom, dateTo)
  const logins = useLoginActivities(dateFrom, dateTo)
  const changes = useDataChanges(dateFrom, dateTo)
  const exports = useExportActivities(dateFrom, dateTo)
  const perms = useAuthStore(st => st.permissions)

  const isAdmin = perms?.includes('staff.manage')

  if (!isAdmin) {
    return <EmptyState icon={<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><rect x="3" y="11" width="18" height="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0110 0v4"/></svg>} title="Admin Only" description="Audit reports are restricted to administrators." />
  }

  return (
    <BentoCard>
      <SectionTitle title="Audit Reports" subtitle="User activities, login history, and data changes" />
      <InfoCard title="Recent User Activities" subtitle="Latest 500 actions">
        <DataTable columns={[
          { key: 'user_name', label: 'User', bold: true },
          { key: 'action_type', label: 'Action' },
          { key: 'table_name', label: 'Table' },
          { key: 'created_at', label: 'Time', format: v => v ? new Date(v).toLocaleString() : '—' },
        ]} data={Array.isArray(activities.data) ? activities.data.slice(0, 50) : []} loading={activities.isLoading} />
      </InfoCard>
      <div style={{ height: 16 }} />
      <InfoCard title="Login Activities" subtitle="User login history">
        <DataTable columns={[
          { key: 'user_name', label: 'User', bold: true },
          { key: 'login_at', label: 'Login Time', format: v => v ? new Date(v).toLocaleString() : '—' },
        ]} data={Array.isArray(logins.data) ? logins.data : []} loading={logins.isLoading} />
      </InfoCard>
      <div style={{ height: 16 }} />
      <InfoCard title="Data Changes" subtitle="Create, update, delete logs">
        <DataTable columns={[
          { key: 'user_name', label: 'User', bold: true },
          { key: 'action_type', label: 'Action' },
          { key: 'table_name', label: 'Table' },
          { key: 'created_at', label: 'Time', format: v => v ? new Date(v).toLocaleString() : '—' },
        ]} data={Array.isArray(changes.data) ? changes.data.slice(0, 50) : []} loading={changes.isLoading} />
      </InfoCard>
    </BentoCard>
  )
}

// ─── Section Renderer ──────────────────────────────────────────────────────────
const SECTIONS = {
  summary: SummarySection,
  sales: SalesSection,
  purchases: PurchasesSection,
  profit: ProfitSection,
  inventory: InventorySection,
  customers: CustomersSection,
  suppliers: SuppliersSection,
  expenses: ExpensesSection,
  tax: TaxSection,
  returns: ReturnsSection,
  payments: PaymentsSection,
  audit: AuditSection,
}

// ─── Date Range Presets ────────────────────────────────────────────────────────
function getDatePreset(preset) {
  const now = new Date()
  const today = now.toISOString().split('T')[0]
  switch (preset) {
    case 'today':
      return { dateFrom: today, dateTo: today }
    case 'week': {
      const d = new Date(now); d.setDate(d.getDate() - 6)
      return { dateFrom: d.toISOString().split('T')[0], dateTo: today }
    }
    case 'month': {
      const d = new Date(now); d.setDate(1)
      return { dateFrom: d.toISOString().split('T')[0], dateTo: today }
    }
    case 'quarter': {
      const d = new Date(now); d.setMonth(d.getMonth() - 3)
      return { dateFrom: d.toISOString().split('T')[0], dateTo: today }
    }
    case 'year': {
      const d = new Date(now); d.setFullYear(d.getFullYear() - 1)
      return { dateFrom: d.toISOString().split('T')[0], dateTo: today }
    }
    case 'all':
      return { dateFrom: '', dateTo: '' }
    default:
      return { dateFrom: '', dateTo: '' }
  }
}

// ═══════════════════════════════════════════════════════════════════════════════
// MAIN PAGE
// ═══════════════════════════════════════════════════════════════════════════════

export default function ReportsPage() {
  const navigate = useNavigate()
  const { can } = usePermissions()
  const canFinancial = can('dashboard.financial')
  const [activeTab, setActiveTab] = useState('summary')
  const [datePreset, setDatePreset] = useState('all')
  const [customFrom, setCustomFrom] = useState('')
  const [customTo, setCustomTo] = useState('')

  const dateRange = useMemo(() => {
    if (datePreset === 'custom') return { dateFrom: customFrom, dateTo: customTo }
    return getDatePreset(datePreset)
  }, [datePreset, customFrom, customTo])

  const visibleTabs = useMemo(
    () => TABS.filter(t => !t.financial || canFinancial),
    [canFinancial]
  )

  const safeActiveTab = useMemo(
    () => visibleTabs.some(t => t.key === activeTab) ? activeTab : 'summary',
    [activeTab, visibleTabs]
  )

  const handlePresetChange = useCallback((preset) => {
    setDatePreset(preset)
    if (preset !== 'custom') {
      setCustomFrom('')
      setCustomTo('')
    }
  }, [])

  const PRESETS = [
    { key: 'today', label: 'Today' },
    { key: 'week', label: 'This Week' },
    { key: 'month', label: 'This Month' },
    { key: 'quarter', label: 'This Quarter' },
    { key: 'year', label: 'This Year' },
    { key: 'all', label: 'All Time' },
    { key: 'custom', label: 'Custom' },
  ]

  const ActiveSection = SECTIONS[safeActiveTab]

  return (
    <>
      <div style={{ marginBottom: 28 }}>
        <h1 style={{ fontSize: 28, fontWeight: 700, color: 'var(--text-primary)', letterSpacing: '-0.03em', margin: 0 }}>
          Reports
        </h1>
        <p style={{ fontSize: 13, color: 'var(--text-secondary)', margin: '6px 0 0', fontWeight: 400 }}>
          Business performance and financial reporting
        </p>
      </div>

      {/* ── Date Range Filter ── */}
      <div style={{
        display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap',
        marginBottom: 24, padding: '10px 14px', background: 'var(--bg-card)',
        border: '1px solid var(--border)', borderRadius: 12,
      }}>
        <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>Period</span>
        {PRESETS.map(p => (
          <button key={p.key} onClick={() => handlePresetChange(p.key)}
            style={{ padding: '4px 12px', borderRadius: 'var(--r-sm)', border: '1px solid var(--border)', cursor: 'pointer', fontSize: 12, fontWeight: 600,
              background: datePreset === p.key ? 'var(--accent-500)' : 'transparent',
              color: datePreset === p.key ? '#fff' : 'var(--text-secondary)',
              transition: 'background 0.15s, color 0.15s' }}>{p.label}</button>
        ))}
        {datePreset === 'custom' && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginLeft: 4 }}>
            <input type="date" value={customFrom} onChange={e => setCustomFrom(e.target.value)}
              style={{ padding: '4px 8px', borderRadius: 'var(--r-sm)', border: '1.5px solid var(--border)', fontSize: 12, background: 'var(--bg-card)', color: 'var(--text-primary)', outline: 'none' }} />
            <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>to</span>
            <input type="date" value={customTo} onChange={e => setCustomTo(e.target.value)}
              style={{ padding: '4px 8px', borderRadius: 'var(--r-sm)', border: '1.5px solid var(--border)', fontSize: 12, background: 'var(--bg-card)', color: 'var(--text-primary)', outline: 'none' }} />
          </div>
        )}
      </div>

      {/* ── Tab Navigation ── */}
      <div style={{
        display: 'flex', gap: 4, flexWrap: 'wrap', marginBottom: 28,
        padding: 4, background: 'var(--bg-subtle)', borderRadius: 12,
        border: '1px solid var(--border)',
      }}>
        {visibleTabs.map(tab => (
          <button key={tab.key} onClick={() => setActiveTab(tab.key)}
            style={{
              padding: '8px 16px', borderRadius: 9, border: 'none', cursor: 'pointer',
              fontSize: 13, fontWeight: 600, transition: 'all 0.15s',
              background: safeActiveTab === tab.key ? 'var(--bg-card)' : 'transparent',
              color: safeActiveTab === tab.key ? 'var(--accent-500)' : 'var(--text-secondary)',
              boxShadow: safeActiveTab === tab.key ? '0 1px 4px rgba(0,0,0,0.06)' : 'none',
              display: 'flex', alignItems: 'center', gap: 6,
            }}>
            {tab.icon}
            {tab.label}
          </button>
        ))}
      </div>

      {/* ── Active Report Section ── */}
      <ActiveSection dateFrom={dateRange.dateFrom} dateTo={dateRange.dateTo} />
    </>
  )
}
