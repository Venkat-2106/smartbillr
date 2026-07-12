import { BentoCard } from '../../../shared/components'
import { formatCurrency } from '../../../shared/utils/formatCurrency'
import useAuthStore from '../../../store/authStore'
import { useTopCustomers, useCustomerOutstanding } from '../hooks/useReports'
import { SectionTitle, InfoCard, DataTable } from '../components/shared'

export default function CustomersSection({ dateFrom, dateTo }) {
  const topCustomers = useTopCustomers(dateFrom, dateTo)
  const outstanding = useCustomerOutstanding()
  const business = useAuthStore(st => st.business)
  const country = business?.business_country_code || 'IN'

  return (
    <BentoCard>
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
    </BentoCard>
  )
}
