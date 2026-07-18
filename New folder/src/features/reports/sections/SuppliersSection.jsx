import { useMemo } from 'react'
import { BentoCard, BarChart } from '../../../shared/components'
import { formatCurrency } from '../../../shared/utils/formatCurrency'
import { useTopSuppliers, useSupplierSpendAnalysis, useReportCountry } from '../hooks/useReports'
import { SectionTitle, InfoCard, DataTable } from '../components/shared'

export default function SuppliersSection({ dateFrom, dateTo }) {
  const topSuppliers = useTopSuppliers(dateFrom, dateTo)
  const spend = useSupplierSpendAnalysis()
  const country = useReportCountry()

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
