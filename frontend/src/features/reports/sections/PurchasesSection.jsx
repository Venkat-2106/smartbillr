import { useState, useMemo } from 'react'
import { BentoCard, LineChart, BarChart } from '../../../shared/components'
import { formatCurrency } from '../../../shared/utils/formatCurrency'
import { getTaxLabel } from '../../../shared/utils/formatTax'
import useAuthStore from '../../../store/authStore'
import { usePurchaseSummary, usePurchaseTrend, usePurchasesBySupplier, usePurchasesByProduct, usePurchaseTaxSummary } from '../hooks/useReports'
import { StatCard, SectionTitle, ChartCard, InfoCard } from '../components/shared'

export default function PurchasesSection({ dateFrom, dateTo }) {
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
          { label: `${getTaxLabel(country)} Total`, value: s ? formatCurrency(s.total_tax, country) : '—', sub: country === 'IN' ? `CGST: ${formatCurrency(s?.total_cgst ?? 0, country)} · SGST: ${formatCurrency(s?.total_sgst ?? 0, country)}` : undefined, icon: <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/></svg> },
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
