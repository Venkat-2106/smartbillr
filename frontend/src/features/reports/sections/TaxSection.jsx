import { useState, useMemo } from 'react'
import { BentoCard, LineChart } from '../../../shared/components'
import UpgradeBlur from '../../../shared/components/UpgradeBlur'
import { formatCurrency } from '../../../shared/utils/formatCurrency'
import { getTaxLabel } from '../../../shared/utils/formatTax'
import { useTaxCollected, useTaxPaid, useTaxLiability, useTaxByRate, usePurchaseTaxByRate, useTaxTrend, useReportCountry } from '../hooks/useReports'
import { StatCard, SectionTitle, ChartCard, InfoCard, DataTable } from '../components/shared'
import { useFeatureAccess } from '../../../shared/hooks/useFeatureAccess'
import useAuthStore from '../../../store/authStore'

export default function TaxSection({ dateFrom, dateTo }) {
  const { reason } = useFeatureAccess('financial_reports')
  const [period, setPeriod] = useState('monthly')
  const collected = useTaxCollected(dateFrom, dateTo)
  const paid = useTaxPaid(dateFrom, dateTo)
  const liability = useTaxLiability(dateFrom, dateTo)
  const byRate = useTaxByRate(dateFrom, dateTo)
  const purchaseByRate = usePurchaseTaxByRate(dateFrom, dateTo)
  const trend = useTaxTrend(period, dateFrom, dateTo)
  const country = useReportCountry()
  const business = useAuthStore(s => s.business)
  const isGstRegistered = business?.is_gst_registered || false

  const totalCollected = collected.data?.total_tax ?? 0
  const totalPaid = paid.data?.total_tax ?? 0
  const netLiability = liability.data?.net_tax_liability

  const taxLabel = getTaxLabel(country, isGstRegistered)
  const collectedSub = country === 'IN'
    ? `CGST: ${formatCurrency(collected.data?.total_cgst ?? 0, country)} · SGST: ${formatCurrency(collected.data?.total_sgst ?? 0, country)}`
    : undefined

  const trendDataCollected = useMemo(() => {
    if (!Array.isArray(trend.data)) return []
    return trend.data.map(d => ({ label: d.label, value: Math.round(d.gst_collected ?? 0) }))
  }, [trend.data])

  const trendDataPaid = useMemo(() => {
    if (!Array.isArray(trend.data)) return []
    return trend.data.map(d => ({ label: d.label, value: Math.round(d.gst_paid ?? 0) }))
  }, [trend.data])

  return (
    <UpgradeBlur reason={reason}>
    <BentoCard>
      <SectionTitle title={`${taxLabel} Reports`} subtitle={`${taxLabel} collected, paid, and net liability`} />
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: 14, marginBottom: 20 }}>
        <StatCard label={`${taxLabel} Collected`} value={formatCurrency(totalCollected, country)} sub={collectedSub} icon={<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>} loading={collected.isLoading} />
        <StatCard label={`${taxLabel} Paid`} value={formatCurrency(totalPaid, country)} sub={`On purchases`} icon={<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/></svg>} loading={paid.isLoading} />
        {netLiability != null && <StatCard label="Net Liability" value={formatCurrency(Math.abs(netLiability), country)} sub={netLiability >= 0 ? 'Payable' : 'Refundable'} icon={<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/></svg>} loading={liability.isLoading} />}
        {country === 'IN' && liability.data?.net_cgst_payable != null && <StatCard label="Net CGST Payable" value={formatCurrency(Math.abs(liability.data.net_cgst_payable), country)} sub={liability.data.net_cgst_payable >= 0 ? 'Payable' : 'Refundable'} loading={liability.isLoading} />}
        {country === 'IN' && liability.data?.net_sgst_payable != null && <StatCard label="Net SGST Payable" value={formatCurrency(Math.abs(liability.data.net_sgst_payable), country)} sub={liability.data.net_sgst_payable >= 0 ? 'Payable' : 'Refundable'} loading={liability.isLoading} />}
        {country === 'IN' && liability.data?.net_igst_payable != null && <StatCard label="Net IGST Payable" value={formatCurrency(Math.abs(liability.data.net_igst_payable), country)} sub={liability.data.net_igst_payable >= 0 ? 'Payable' : 'Refundable'} loading={liability.isLoading} />}
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20, marginBottom: 20 }}>
        <ChartCard title={`${taxLabel} Trend`} subtitle="Output vs Input over time" period={period} onPeriodChange={setPeriod}>
          <LineChart data={trendDataCollected} loading={trend.isLoading} error={trend.isError} />
        </ChartCard>
        <ChartCard title={`${taxLabel} Paid Trend`} subtitle="Input tax over time" period={period} onPeriodChange={setPeriod}>
          <LineChart data={trendDataPaid} loading={trend.isLoading} error={trend.isError} />
        </ChartCard>
      </div>

      <InfoCard title={`${taxLabel} by Rate (Sales)`} subtitle="Breakdown by tax slab on sales — before returns">
        <DataTable columns={[
          { key: 'gst_rate', label: `${taxLabel} Rate`, bold: true, format: v => `${v}%` },
          { key: 'item_count', label: 'Items', align: 'center' },
          { key: 'taxable_amount', label: 'Taxable Value', align: 'right', format: v => formatCurrency(v, country) },
          { key: 'tax_amount', label: 'Tax Amount', align: 'right', format: v => formatCurrency(v, country) },
        ]} data={Array.isArray(byRate.data) ? byRate.data : []} loading={byRate.isLoading} />
      </InfoCard>

      <InfoCard title={`${taxLabel} by Rate (Purchases)`} subtitle="Breakdown by tax slab on purchases — before returns">
        <DataTable columns={[
          { key: 'gst_rate', label: `${taxLabel} Rate`, bold: true, format: v => `${v}%` },
          { key: 'item_count', label: 'Items', align: 'center' },
          { key: 'taxable_amount', label: 'Taxable Value', align: 'right', format: v => formatCurrency(v, country) },
          { key: 'tax_amount', label: 'Tax Amount', align: 'right', format: v => formatCurrency(v, country) },
        ]} data={Array.isArray(purchaseByRate.data) ? purchaseByRate.data : []} loading={purchaseByRate.isLoading} />
      </InfoCard>
    </BentoCard>
    </UpgradeBlur>
  )
}
