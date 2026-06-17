import { useState, useMemo, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { PageHeader, LineChart, BarChart, DonutChart, EmptyState } from '../../../shared/components'
import { formatCurrency } from '../../../shared/utils/formatCurrency'
import { formatDate } from '../../../shared/utils/formatDate'
import useAuthStore from '../../../store/authStore'
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
    <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 18, padding: '24px 22px 22px', display: 'flex', flexDirection: 'column', gap: 18, boxShadow: 'var(--shadow-card)' }}>
      <Skeleton w={46} h={46} />
      <Skeleton w="70%" h={28} />
      <Skeleton w="50%" h={14} />
    </div>
  )
}

// ─── Stat Card ─────────────────────────────────────────────────────────────────
function StatCard({ label, value, sub, gradient, icon, loading, currency }) {
  return (
    <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 18, padding: '24px 22px 22px', display: 'flex', flexDirection: 'column', gap: 18, boxShadow: 'var(--shadow-card)', minWidth: 0, overflow: 'hidden', position: 'relative' }}>
      <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 3.5, background: gradient, borderRadius: '18px 18px 0 0' }} />
      <div style={{ width: 46, height: 46, borderRadius: 14, background: gradient, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 22, flexShrink: 0, boxShadow: '0 4px 12px rgba(0,0,0,0.10)' }}>{icon}</div>
      {loading ? <Skeleton w="70%" h={28} /> : <div style={{ fontSize: 'clamp(18px, 2.4vw, 28px)', fontWeight: 800, color: 'var(--text-primary)', letterSpacing: '-0.6px', lineHeight: 1.1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{value}</div>}
      <div>
        <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-primary)', marginBottom: 3 }}>{label}</div>
        <div style={{ fontSize: 12, color: 'var(--text-muted)', fontWeight: 400 }}>{sub}</div>
      </div>
    </div>
  )
}

// ─── Section Headers ─────────────────────────────────────────────────────────
function SectionTitle({ title, subtitle }) {
  return (
    <div style={{ marginBottom: 20 }}>
      <h2 style={{ fontSize: 17, fontWeight: 700, color: 'var(--text-primary)', margin: '0 0 4px', letterSpacing: '-0.3px' }}>{title}</h2>
      {subtitle && <p style={{ fontSize: 12.5, color: 'var(--text-muted)', margin: 0, fontWeight: 400 }}>{subtitle}</p>}
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
    <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 18, boxShadow: 'var(--shadow-card)', padding: '24px 24px 20px', marginBottom: 20 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20, flexWrap: 'wrap', gap: 12 }}>
        <div>
          <h3 style={{ fontSize: 15, fontWeight: 700, color: 'var(--text-primary)', margin: '0 0 4px' }}>{title}</h3>
          {subtitle && <p style={{ fontSize: 12, color: 'var(--text-muted)', margin: 0 }}>{subtitle}</p>}
        </div>
        {onPeriodChange && <div style={{ display: 'flex', gap: 6, background: 'var(--bg-subtle)', border: '1px solid var(--border)', borderRadius: 10, padding: 4 }}>
          {PERIODS.map(p => (
            <button key={p.key} onClick={() => onPeriodChange(p.key)}
              style={{ padding: '5px 14px', borderRadius: 7, border: 'none', cursor: 'pointer', fontSize: 12, fontWeight: 600, transition: 'all 0.15s',
                background: period === p.key ? 'linear-gradient(135deg, var(--accent-600), var(--accent-500))' : 'transparent',
                color: period === p.key ? '#fff' : 'var(--text-secondary)',
                boxShadow: period === p.key ? '0 2px 8px var(--accent-glow)' : 'none' }}>
              {p.label}
            </button>
          ))}
        </div>}
      </div>
      {children}
    </div>
  )
}

function InfoCard({ title, subtitle, children }) {
  return (
    <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 18, boxShadow: 'var(--shadow-card)', padding: '24px' }}>
      <h3 style={{ fontSize: 14, fontWeight: 700, color: 'var(--text-primary)', margin: '0 0 4px' }}>{title}</h3>
      {subtitle && <p style={{ fontSize: 12, color: 'var(--text-muted)', margin: '0 0 16px' }}>{subtitle}</p>}
      {children}
    </div>
  )
}

function DataTable({ columns, data, loading }) {
  if (loading) return <Skeleton w="100%" h={200} />
  if (!data || data.length === 0) return <EmptyState title="No data" description="No records found for the selected period." />
  return (
    <div style={{ overflowX: 'auto' }}>
      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12.5 }}>
        <thead>
          <tr>
            {columns.map(col => (
              <th key={col.key} style={{ textAlign: col.align || 'left', padding: '8px 10px', fontSize: 11, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.04em', borderBottom: '2px solid var(--border)', whiteSpace: 'nowrap' }}>{col.label}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {data.map((row, i) => (
            <tr key={row.id || i} style={{ background: i % 2 === 0 ? 'transparent' : 'var(--bg-subtle)' }}>
              {columns.map(col => (
                <td key={col.key} style={{ textAlign: col.align || 'left', padding: '7px 10px', color: 'var(--text-primary)', fontWeight: col.bold ? 700 : 500, borderBottom: '1px solid var(--border)', whiteSpace: col.nowrap ? 'nowrap' : 'normal' }}>
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
const TABS = [
  { key: 'summary', label: 'Summary', icon: '📊', permission: 'reports.view' },
  { key: 'sales', label: 'Sales', icon: '💰', permission: 'reports.view' },
  { key: 'purchases', label: 'Purchases', icon: '📦', permission: 'reports.view' },
  { key: 'profit', label: 'Profitability', icon: '📈', permission: 'reports.view' },
  { key: 'inventory', label: 'Inventory', icon: '🏷️', permission: 'reports.view' },
  { key: 'customers', label: 'Customers', icon: '👥', permission: 'reports.view' },
  { key: 'suppliers', label: 'Suppliers', icon: '🏭', permission: 'reports.view' },
  { key: 'expenses', label: 'Expenses', icon: '💸', permission: 'reports.view' },
  { key: 'tax', label: 'Tax', icon: '🧾', permission: 'reports.view' },
  { key: 'returns', label: 'Returns', icon: '🔄', permission: 'reports.view' },
  { key: 'payments', label: 'Payments', icon: '💳', permission: 'reports.view' },
  { key: 'audit', label: 'Audit', icon: '📋', permission: 'reports.view' },
]

const GRADIENTS = {
  sales: 'linear-gradient(135deg, #4F46E5, #7C3AED)',
  purchases: 'linear-gradient(135deg, #F59E0B, #F97316)',
  profit: 'linear-gradient(135deg, #10B981, #059669)',
  expenses: 'linear-gradient(135deg, #EF4444, #DC2626)',
  revenue: 'linear-gradient(135deg, #3B82F6, #2563EB)',
  inventory: 'linear-gradient(135deg, #8B5CF6, #A855F7)',
  customers: 'linear-gradient(135deg, #0EA5E9, #06B6D4)',
  suppliers: 'linear-gradient(135deg, #F97316, #EA580C)',
  tax: 'linear-gradient(135deg, #6B7280, #4B5563)',
  returns: 'linear-gradient(135deg, #EC4899, #DB2777)',
  payments: 'linear-gradient(135deg, #14B8A6, #0D9488)',
  audit: 'linear-gradient(135deg, #374151, #1F2937)',
}

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
      { key: 'sales', label: 'Total Sales', value: s.total_sales != null ? formatCurrency(s.total_sales, country) : '—', sub: `${s.total_invoices ?? 0} invoices`, gradient: GRADIENTS.sales, icon: '💰' },
      { key: 'purchases', label: 'Total Purchases', value: s.total_purchases != null ? formatCurrency(s.total_purchases, country) : '—', sub: `${s.total_purchases_count ?? 0} purchases`, gradient: GRADIENTS.purchases, icon: '📦' },
      { key: 'profit', label: 'Gross Profit', value: s.gross_profit != null ? formatCurrency(s.gross_profit, country) : '—', sub: s.total_sales ? `${((s.gross_profit / s.total_sales) * 100).toFixed(1)}% margin` : '—', gradient: GRADIENTS.profit, icon: '📈' },
      { key: 'expenses', label: 'Expenses', value: s.total_expenses != null ? formatCurrency(s.total_expenses, country) : '—', sub: 'Operating costs', gradient: GRADIENTS.expenses, icon: '💸' },
      { key: 'net', label: 'Net Profit', value: (s.total_sales != null && s.total_expenses != null) ? formatCurrency(s.total_sales - s.total_expenses, country) : '—', sub: 'Revenue minus expenses', gradient: GRADIENTS.revenue, icon: '📊' },
      { key: 'outstanding', label: 'Outstanding', value: s.outstanding_receivables != null ? formatCurrency(s.outstanding_receivables, country) : '—', sub: 'Pending collections', gradient: GRADIENTS.customers, icon: '⏳' },
      { key: 'inventory', label: 'Inventory Value', value: s.inventory_value != null ? formatCurrency(s.inventory_value, country) : '—', sub: `${s.total_products ?? 0} products`, gradient: GRADIENTS.inventory, icon: '🏷️' },
      { key: 'lowstock', label: 'Low Stock', value: String(s.low_stock_count ?? 0), sub: 'Products below threshold', gradient: 'linear-gradient(135deg, #EF4444, #DC2626)', icon: '⚠️' },
    ]
  }, [s, country])

  return (
    <div>
      <SectionTitle title="Dashboard Summary" subtitle="Key metrics at a glance" />
      {isError && <div style={{ padding: '12px 16px', background: 'var(--danger-bg)', border: '1px solid var(--danger-border)', borderRadius: 12, color: 'var(--danger-text)', fontSize: 13, marginBottom: 20 }}>Could not load summary data.</div>}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: 16, marginBottom: 28 }}>
        {(isLoading ? Array(8).fill(null) : cards).map((card, i) => card ? <StatCard key={card.key} {...card} loading={false} /> : <SkeletonCard key={i} />)}
      </div>
    </div>
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
    <div>
      <SectionTitle title="Sales Reports" subtitle="Revenue, customer trends, product performance" />

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: 14, marginBottom: 20 }}>
        {[
          { label: 'Total Revenue', value: invoiceStatus.data ? formatCurrency(
            (invoiceStatus.data.paid_amount + invoiceStatus.data.partial_amount + invoiceStatus.data.pending_amount), country) : '—', gradient: GRADIENTS.sales, icon: '💰' },
          { label: 'Paid Invoices', value: invoiceStatus.data?.paid_count ?? '—', sub: `${invoiceStatus.data?.paid_amount ? formatCurrency(invoiceStatus.data.paid_amount, country) : ''}`, gradient: GRADIENTS.profit, icon: '✅' },
          { label: 'Partial', value: invoiceStatus.data?.partial_count ?? '—', sub: `${invoiceStatus.data?.partial_amount ? formatCurrency(invoiceStatus.data.partial_amount, country) : ''}`, gradient: GRADIENTS.expenses, icon: '⏳' },
          { label: 'Pending', value: invoiceStatus.data?.pending_count ?? '—', sub: `${invoiceStatus.data?.pending_amount ? formatCurrency(invoiceStatus.data.pending_amount, country) : ''}`, gradient: 'linear-gradient(135deg, #EF4444, #DC2626)', icon: '⚠️' },
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
    </div>
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
    <div>
      <SectionTitle title="Purchase Reports" subtitle="Spend analysis and supplier performance" />
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: 14, marginBottom: 20 }}>
        {[
          { label: 'Total Spend', value: s ? formatCurrency(s.total_amount, country) : '—', sub: `${s?.total_purchases ?? 0} purchases`, gradient: GRADIENTS.purchases, icon: '📦' },
          { label: 'Total Tax', value: s ? formatCurrency(s.total_tax, country) : '—', sub: `CGST: ${formatCurrency(s?.total_cgst ?? 0, country)} · SGST: ${formatCurrency(s?.total_sgst ?? 0, country)}`, gradient: GRADIENTS.tax, icon: '🧾' },
          { label: 'Paid', value: s?.paid_count ?? '—', sub: 'Completed purchases', gradient: GRADIENTS.profit, icon: '✅' },
          { label: 'Pending', value: s?.pending_count ?? '—', sub: 'Unpaid purchases', gradient: 'linear-gradient(135deg, #EF4444, #DC2626)', icon: '⏳' },
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
    </div>
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
      <div>
        <SectionTitle title="Profitability Reports" subtitle="You need financial access to view profit data." />
        <EmptyState icon="🔒" title="Restricted" description="Contact your admin for financial report access." />
      </div>
    )
  }

  const profitCards = [
    { label: 'Gross Revenue', value: formatCurrency(grossProfit.data?.total_revenue ?? 0, country), sub: 'Total sales revenue', gradient: GRADIENTS.sales, icon: '💰' },
    { label: 'Total Cost', value: formatCurrency(grossProfit.data?.total_cost ?? 0, country), sub: 'Cost of goods sold', gradient: GRADIENTS.purchases, icon: '📦' },
    { label: 'Gross Profit', value: formatCurrency(grossProfit.data?.gross_profit ?? 0, country), sub: `${grossProfit.data?.margin_pct ?? 0}% margin`, gradient: GRADIENTS.profit, icon: '📈' },
  ]

  return (
    <div>
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
    </div>
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
    <div>
      <SectionTitle title="Inventory Reports" subtitle="Stock levels, valuation, and movement analysis" />
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: 14, marginBottom: 20 }}>
        <StatCard label="Total Products" value={String(valuation.data?.total_products ?? '—')} sub={valuation.data ? `${valuation.data.total_stock_qty} units total` : ''} gradient={GRADIENTS.inventory} icon="🏷️" loading={valuation.isLoading} />
        <StatCard label="Stock Value" value={valuation.data?.total_value != null ? formatCurrency(valuation.data.total_value, country) : '—'} sub="Current stock × cost price" gradient={GRADIENTS.sales} icon="💰" loading={valuation.isLoading} />
        <StatCard label="Stock In" value={sf?.stock_in ?? '—'} sub="Units received" gradient={GRADIENTS.profit} icon="📥" loading={stockFlow.isLoading} />
        <StatCard label="Stock Out" value={sf?.stock_out ?? '—'} sub="Units sold/removed" gradient={GRADIENTS.expenses} icon="📤" loading={stockFlow.isLoading} />
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
              { title: '🚀 Fast', data: moving.data?.fast_moving ?? [], key: 'qty_sold' },
              { title: '🐢 Slow', data: moving.data?.slow_moving ?? [], key: 'qty_sold' },
              { title: '💀 Dead', data: moving.data?.dead_stock ?? [], key: 'stock_qty' },
            ].map(box => (
              <div key={box.title} style={{ background: 'var(--bg-subtle)', borderRadius: 10, padding: 12 }}>
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
    </div>
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
    <div>
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
    </div>
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
    <div>
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
    </div>
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
    <div>
      <SectionTitle title="Expense Reports" subtitle="Expense tracking and category analysis" />
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: 14, marginBottom: 20 }}>
        <StatCard label="Total Expenses" value={distribution.data ? formatCurrency(distribution.data.total_expenses, country) : '—'} sub={`${distribution.data?.total_count ?? 0} entries`} gradient={GRADIENTS.expenses} icon="💸" loading={distribution.isLoading} />
        <StatCard label="Categories" value={String(distribution.data?.categories?.length ?? '—')} sub="Active expense categories" gradient={GRADIENTS.tax} icon="📂" loading={distribution.isLoading} />
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
    </div>
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
    <div>
      <SectionTitle title="Tax Reports" subtitle="Tax collected, paid, and net liability" />
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: 14, marginBottom: 20 }}>
        <StatCard label="Tax Collected" value={formatCurrency(totalCollected, country)} sub={`CGST: ${formatCurrency(collected.data?.total_cgst ?? 0, country)} · SGST: ${formatCurrency(collected.data?.total_sgst ?? 0, country)}`} gradient={GRADIENTS.sales} icon="📤" loading={collected.isLoading} />
        <StatCard label="Tax Paid" value={formatCurrency(totalPaid, country)} sub={`On purchases`} gradient={GRADIENTS.purchases} icon="📥" loading={paid.isLoading} />
        {netLiability != null && <StatCard label="Net Liability" value={formatCurrency(Math.abs(netLiability), country)} sub={netLiability >= 0 ? 'Payable' : 'Refundable'} gradient={netLiability >= 0 ? GRADIENTS.expenses : GRADIENTS.profit} icon="🧾" loading={liability.isLoading} />}
      </div>

      <InfoCard title="Tax by GST Rate" subtitle="Breakdown by tax slab">
        <DataTable columns={[
          { key: 'gst_rate', label: 'GST Rate', bold: true, format: v => `${v}%` },
          { key: 'item_count', label: 'Items', align: 'center' },
          { key: 'taxable_amount', label: 'Taxable Value', align: 'right', format: v => formatCurrency(v, country) },
          { key: 'tax_amount', label: 'Tax Amount', align: 'right', format: v => formatCurrency(v, country) },
        ]} data={Array.isArray(byRate.data) ? byRate.data : []} loading={byRate.isLoading} />
      </InfoCard>
    </div>
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
    <div>
      <SectionTitle title="Return Reports" subtitle="Sales returns, purchase returns, and profit impact" />
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: 14, marginBottom: 20 }}>
        <StatCard label="Sales Returns" value={sr ? formatCurrency(sr.summary?.total_amount ?? 0, country) : '—'} sub={`${sr?.summary?.total_returns ?? 0} returns | ${sr?.summary?.approved_count ?? 0} approved`} gradient={GRADIENTS.returns} icon="🔄" loading={salesReturns.isLoading} />
        <StatCard label="Purchase Returns" value={pr ? formatCurrency(pr.total_amount ?? 0, country) : '—'} sub={`${pr?.total_returns ?? 0} returns`} gradient={GRADIENTS.purchases} icon="↩️" loading={purchaseReturns.isLoading} />
        {impact.data && <StatCard label="Net Return Impact" value={formatCurrency(impact.data.net_return_impact ?? 0, country)} sub={`Sales: ${formatCurrency(impact.data.sales_return_value ?? 0, country)}`} gradient={GRADIENTS.expenses} icon="📊" loading={false} />}
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
    </div>
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
    <div>
      <SectionTitle title="Payment Reports" subtitle="Collections, outstanding, and payment methods" />
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: 14, marginBottom: 20 }}>
        <StatCard label="Total Outstanding" value={outstanding.data ? formatCurrency(outstanding.data.total_outstanding, country) : '—'} sub={`${outstanding.data?.total_invoices ?? 0} unpaid invoices`} gradient={GRADIENTS.expenses} icon="⏳" loading={outstanding.isLoading} />
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
    </div>
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
    return <EmptyState icon="🔒" title="Admin Only" description="Audit reports are restricted to administrators." />
  }

  return (
    <div>
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
    </div>
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
  const [activeTab, setActiveTab] = useState('summary')
  const [datePreset, setDatePreset] = useState('all')
  const [customFrom, setCustomFrom] = useState('')
  const [customTo, setCustomTo] = useState('')

  const dateRange = useMemo(() => {
    if (datePreset === 'custom') return { dateFrom: customFrom, dateTo: customTo }
    return getDatePreset(datePreset)
  }, [datePreset, customFrom, customTo])

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

  const ActiveSection = SECTIONS[activeTab]

  return (
    <>
      <PageHeader
        title="Reports"
        subtitle="Business performance and financial reporting"
        back
        onBack={() => navigate('/dashboard')}
      />

      {/* ── Date Range Filter ── */}
      <div style={{
        display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap',
        marginBottom: 24, padding: '10px 14px', background: 'var(--bg-card)',
        border: '1px solid var(--border)', borderRadius: 12,
      }}>
        <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>Period</span>
        {PRESETS.map(p => (
          <button key={p.key} onClick={() => handlePresetChange(p.key)}
            style={{ padding: '4px 12px', borderRadius: 7, border: '1px solid var(--border)', cursor: 'pointer', fontSize: 12, fontWeight: 600,
              background: datePreset === p.key ? 'var(--accent-500)' : 'transparent',
              color: datePreset === p.key ? '#fff' : 'var(--text-secondary)',
              transition: 'all 0.15s' }}>{p.label}</button>
        ))}
        {datePreset === 'custom' && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginLeft: 4 }}>
            <input type="date" value={customFrom} onChange={e => setCustomFrom(e.target.value)}
              style={{ padding: '4px 8px', borderRadius: 6, border: '1.5px solid var(--border)', fontSize: 12, background: 'var(--bg-card)', color: 'var(--text-primary)', outline: 'none' }} />
            <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>to</span>
            <input type="date" value={customTo} onChange={e => setCustomTo(e.target.value)}
              style={{ padding: '4px 8px', borderRadius: 6, border: '1.5px solid var(--border)', fontSize: 12, background: 'var(--bg-card)', color: 'var(--text-primary)', outline: 'none' }} />
          </div>
        )}
      </div>

      {/* ── Tab Navigation ── */}
      <div style={{
        display: 'flex', gap: 4, flexWrap: 'wrap', marginBottom: 28,
        padding: 4, background: 'var(--bg-subtle)', borderRadius: 12,
        border: '1px solid var(--border)',
      }}>
        {TABS.map(tab => (
          <button key={tab.key} onClick={() => setActiveTab(tab.key)}
            style={{
              padding: '8px 16px', borderRadius: 9, border: 'none', cursor: 'pointer',
              fontSize: 12.5, fontWeight: 600, transition: 'all 0.15s',
              background: activeTab === tab.key ? 'var(--bg-card)' : 'transparent',
              color: activeTab === tab.key ? 'var(--accent-500)' : 'var(--text-secondary)',
              boxShadow: activeTab === tab.key ? '0 1px 4px rgba(0,0,0,0.06)' : 'none',
              display: 'flex', alignItems: 'center', gap: 6,
            }}>
            <span style={{ fontSize: 16, lineHeight: 1 }}>{tab.icon}</span>
            {tab.label}
          </button>
        ))}
      </div>

      {/* ── Active Report Section ── */}
      <ActiveSection dateFrom={dateRange.dateFrom} dateTo={dateRange.dateTo} />
    </>
  )
}
