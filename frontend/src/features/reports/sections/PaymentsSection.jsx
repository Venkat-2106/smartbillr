import { useState, useMemo } from 'react'
import { BentoCard, LineChart, DonutChart } from '../../../shared/components'
import { formatCurrency } from '../../../shared/utils/formatCurrency'
import useAuthStore from '../../../store/authStore'
import { usePaymentCollections, useOutstandingReceivables, usePaymentsByMethod, usePartialPayments } from '../hooks/useReports'
import { StatCard, SectionTitle, ChartCard, InfoCard, DataTable } from '../components/shared'

export default function PaymentsSection({ dateFrom, dateTo }) {
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
