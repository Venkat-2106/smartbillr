import { BentoCard, EmptyState } from '../../../shared/components'
import useAuthStore from '../../../store/authStore'
import { useUserActivities, useLoginActivities, useDataChanges, useExportActivities } from '../hooks/useReports'
import { SectionTitle, InfoCard, DataTable } from '../components/shared'

export default function AuditSection({ dateFrom, dateTo }) {
  const perms = useAuthStore(st => st.permissions)
  const isAdmin = perms?.includes('staff.manage')

  const activities = useUserActivities(dateFrom, dateTo, { enabled: isAdmin })
  const logins = useLoginActivities(dateFrom, dateTo, { enabled: isAdmin })
  const changes = useDataChanges(dateFrom, dateTo, { enabled: isAdmin })
  const exports = useExportActivities(dateFrom, dateTo, { enabled: isAdmin })

  if (!isAdmin) {
    return <EmptyState icon={<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><rect x="3" y="11" width="18" height="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0110 0v4"/></svg>} title="Admin Only" description="Audit reports are restricted to administrators." />
  }

  return (
    <BentoCard>
      <SectionTitle title="Audit Reports" subtitle="User activities, login history, and data changes" />
      <InfoCard title="Recent User Activities" subtitle="Latest 500 actions">
        <DataTable columns={[
          { key: 'user_name', label: 'User', bold: true },
          { key: 'action_type', label: 'Action' },
          { key: 'table_name', label: 'Table' },
          { key: 'created_at', label: 'Time', format: v => v ? new Date(v).toLocaleString() : '—' },
        ]} data={Array.isArray(activities.data) ? activities.data.slice(0, 50) : []} loading={activities.isLoading} />
      </InfoCard>
      <div style={{ height: 16 }} />
      <InfoCard title="Login Activities" subtitle="User login history">
        <DataTable columns={[
          { key: 'user_name', label: 'User', bold: true },
          { key: 'login_at', label: 'Login Time', format: v => v ? new Date(v).toLocaleString() : '—' },
        ]} data={Array.isArray(logins.data) ? logins.data : []} loading={logins.isLoading} />
      </InfoCard>
      <div style={{ height: 16 }} />
      <InfoCard title="Data Changes" subtitle="Create, update, delete logs">
        <DataTable columns={[
          { key: 'user_name', label: 'User', bold: true },
          { key: 'action_type', label: 'Action' },
          { key: 'table_name', label: 'Table' },
          { key: 'created_at', label: 'Time', format: v => v ? new Date(v).toLocaleString() : '—' },
        ]} data={Array.isArray(changes.data) ? changes.data.slice(0, 50) : []} loading={changes.isLoading} />
      </InfoCard>
    </BentoCard>
  )
}
