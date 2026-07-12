import { useState, useMemo } from 'react'
import { BentoCard, LineChart, BarChart, EmptyState } from '../../../shared/components'
import { formatCurrency } from '../../../shared/utils/formatCurrency'
import useAuthStore from '../../../store/authStore'
import { useGrossProfit, useProfitByProduct, useProfitByCategory, useProfitByCustomer, useProfitTrend } from '../hooks/useReports'
import { StatCard, SectionTitle, ChartCard, InfoCard } from '../components/shared'

export default function ProfitSection({ dateFrom, dateTo }) {
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
