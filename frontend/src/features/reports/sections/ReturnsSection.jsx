import { useState, useMemo } from 'react'
import { BentoCard, LineChart } from '../../../shared/components'
import UpgradeBlur from '../../../shared/components/UpgradeBlur'
import { formatCurrency } from '../../../shared/utils/formatCurrency'
import { useSalesReturns, usePurchaseReturns, useReturnsTrend, useReturnsImpact, useReportCountry } from '../hooks/useReports'
import { StatCard, SectionTitle, ChartCard, InfoCard, DataTable } from '../components/shared'
import { useFeatureAccess } from '../../../shared/hooks/useFeatureAccess'

export default function ReturnsSection({ dateFrom, dateTo }) {
  const { reason } = useFeatureAccess('financial_reports')
  const [period, setPeriod] = useState('monthly')
  const salesReturns = useSalesReturns(dateFrom, dateTo)
  const purchaseReturns = usePurchaseReturns(dateFrom, dateTo)
  const trend = useReturnsTrend(period, dateFrom, dateTo)
  const impact = useReturnsImpact(dateFrom, dateTo)
  const country = useReportCountry()

  const sr = salesReturns.data
  const pr = purchaseReturns.data

  const trendData = useMemo(() => {
    if (!Array.isArray(trend.data)) return []
    return trend.data.map(d => ({ label: d.label, value: d.sales_return_count + d.purchase_return_count }))
  }, [trend.data])

  return (
    <UpgradeBlur reason={reason}>
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
    </UpgradeBlur>
  )
}
