import { useState, useMemo } from 'react'
import { BentoCard, LineChart, BarChart, DonutChart } from '../../../shared/components'
import UpgradeBlur from '../../../shared/components/UpgradeBlur'
import { formatCurrency } from '../../../shared/utils/formatCurrency'
import { useSalesTrend, useSalesByCustomer, useSalesByProduct, useSalesByPaymentMethod, useSalesInvoiceStatus, useReportCountry } from '../hooks/useReports'
import { StatCard, SectionTitle, ChartCard, InfoCard, DataTable } from '../components/shared'
import { useFeatureAccess } from '../../../shared/hooks/useFeatureAccess'

export default function SalesSection({ dateFrom, dateTo }) {
  const { reason } = useFeatureAccess('financial_reports')
  const [period, setPeriod] = useState('monthly')
  const trend = useSalesTrend(period, dateFrom, dateTo)
  const byCustomer = useSalesByCustomer(dateFrom, dateTo)
  const byProduct = useSalesByProduct(dateFrom, dateTo)
  const byPayment = useSalesByPaymentMethod(dateFrom, dateTo)
  const invoiceStatus = useSalesInvoiceStatus(dateFrom, dateTo)
  const country = useReportCountry()

  const trendData = useMemo(() => {
    if (!Array.isArray(trend.data)) return []
    return trend.data.map(d => ({ label: d.label, value: d.revenue != null ? Math.round(d.revenue) : 0 }))
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
    <UpgradeBlur reason={reason}>
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
        ]} data={Array.isArray(byCustomer.data) ? byCustomer.data.slice(0, 100) : []} loading={byCustomer.isLoading} />
      </InfoCard>

      <InfoCard title="Sales by Product" subtitle="Product-wise revenue" style={{ marginTop: 20 }}>
        <DataTable columns={[
          { key: 'prod_name', label: 'Product', bold: true },
          { key: 'category_name', label: 'Category' },
          { key: 'total_qty_sold', label: 'Qty', align: 'center' },
          { key: 'total_revenue', label: 'Revenue', align: 'right', format: v => formatCurrency(v, country) },
        ]} data={Array.isArray(byProduct.data) ? byProduct.data.slice(0, 100) : []} loading={byProduct.isLoading} />
      </InfoCard>
    </BentoCard>
    </UpgradeBlur>
  )
}
