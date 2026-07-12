import { BentoCard } from '../../../shared/components'
import { formatCurrency } from '../../../shared/utils/formatCurrency'
import { getTaxLabel } from '../../../shared/utils/formatTax'
import useAuthStore from '../../../store/authStore'
import { useTaxCollected, useTaxPaid, useTaxLiability, useTaxByRate } from '../hooks/useReports'
import { StatCard, SectionTitle, InfoCard, DataTable } from '../components/shared'

export default function TaxSection({ dateFrom, dateTo }) {
  const collected = useTaxCollected(dateFrom, dateTo)
  const paid = useTaxPaid(dateFrom, dateTo)
  const liability = useTaxLiability(dateFrom, dateTo)
  const byRate = useTaxByRate(dateFrom, dateTo)
  const business = useAuthStore(st => st.business)
  const country = business?.business_country_code || 'IN'

  const totalCollected = collected.data?.total_tax ?? 0
  const totalPaid = paid.data?.total_tax ?? 0
  const netLiability = liability.data?.net_tax_liability

  const taxLabel = getTaxLabel(country)
  const collectedSub = country === 'IN'
    ? `CGST: ${formatCurrency(collected.data?.total_cgst ?? 0, country)} · SGST: ${formatCurrency(collected.data?.total_sgst ?? 0, country)}`
    : undefined

  return (
    <BentoCard>
      <SectionTitle title={`${taxLabel} Reports`} subtitle={`${taxLabel} collected, paid, and net liability`} />
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: 14, marginBottom: 20 }}>
        <StatCard label={`${taxLabel} Collected`} value={formatCurrency(totalCollected, country)} sub={collectedSub} icon={<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>} loading={collected.isLoading} />
        <StatCard label={`${taxLabel} Paid`} value={formatCurrency(totalPaid, country)} sub={`On purchases`} icon={<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/></svg>} loading={paid.isLoading} />
        {netLiability != null && <StatCard label="Net Liability" value={formatCurrency(Math.abs(netLiability), country)} sub={netLiability >= 0 ? 'Payable' : 'Refundable'} icon={<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/></svg>} loading={liability.isLoading} />}
      </div>

      <InfoCard title={`${taxLabel} by Rate`} subtitle="Breakdown by tax slab">
        <DataTable columns={[
          { key: 'gst_rate', label: `${taxLabel} Rate`, bold: true, format: v => `${v}%` },
          { key: 'item_count', label: 'Items', align: 'center' },
          { key: 'taxable_amount', label: 'Taxable Value', align: 'right', format: v => formatCurrency(v, country) },
          { key: 'tax_amount', label: 'Tax Amount', align: 'right', format: v => formatCurrency(v, country) },
        ]} data={Array.isArray(byRate.data) ? byRate.data : []} loading={byRate.isLoading} />
      </InfoCard>
    </BentoCard>
  )
}
