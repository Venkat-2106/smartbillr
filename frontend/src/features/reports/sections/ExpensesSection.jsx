import { useState, useMemo } from 'react'
import { BentoCard, LineChart, DonutChart } from '../../../shared/components'
import UpgradeBlur from '../../../shared/components/UpgradeBlur'
import { formatCurrency } from '../../../shared/utils/formatCurrency'
import { useExpensesByCategory, useExpenseTrend, useExpenseDistribution, useReportCountry } from '../hooks/useReports'
import { StatCard, SectionTitle, ChartCard, InfoCard, DataTable } from '../components/shared'
import { useFeatureAccess } from '../../../shared/hooks/useFeatureAccess'

export default function ExpensesSection({ dateFrom, dateTo }) {
  const { reason } = useFeatureAccess('financial_reports')
  const [period, setPeriod] = useState('monthly')
  const byCategory = useExpensesByCategory(dateFrom, dateTo)
  const trend = useExpenseTrend(period, dateFrom, dateTo)
  const distribution = useExpenseDistribution(dateFrom, dateTo)
  const country = useReportCountry()

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
    <UpgradeBlur reason={reason}>
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
    </UpgradeBlur>
  )
}
