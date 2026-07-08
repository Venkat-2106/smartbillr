import { useState, useEffect, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import toast from 'react-hot-toast'
import { Table, Pagination, SearchBar, Badge } from '../../../shared/components'
import api from '../../../api/axios'

const COLUMNS = [
  { key: 'business_name', label: 'Business', sortable: true, render: (r) => (
    <span style={{ fontWeight: 600, color: 'var(--text-primary)' }}>{r.business_name}</span>
  )},
  { key: 'business_email', label: 'Email' },
  { key: 'subscription_type', label: 'Plan', sortable: true, render: (r) => {
    const colors = { trial: 'warning', monthly: 'info', annual: 'success', lifetime: 'purple' }
    return <Badge variant={colors[r.subscription_type] || 'neutral'} label={r.subscription_type} />
  }},
  { key: 'payment_status', label: 'Payment', sortable: true, render: (r) =>
    <Badge status={r.payment_status} />
  },
  { key: 'is_active', label: 'Status', sortable: true, render: (r) =>
    r.is_active ? <Badge variant="success" label="Active" /> : <Badge variant="danger" label="Suspended" />
  },
  { key: 'created_at', label: 'Created', sortable: true, render: (r) =>
    r.created_at ? new Date(r.created_at).toLocaleDateString() : '—'
  },
]

export default function AdminBusinessesPage() {
  const navigate = useNavigate()
  const [rows, setRows] = useState([])
  const [loading, setLoading] = useState(true)
  const [pagination, setPagination] = useState(null)
  const [page, setPage] = useState(1)
  const [sortKey, setSortKey] = useState('created_at')
  const [sortDir, setSortDir] = useState('desc')
  const [search, setSearch] = useState('')

  const fetchData = useCallback(async () => {
    setLoading(true)
    try {
      const params = { page, limit: 20, sort_by: sortKey, sort_order: sortDir }
      if (search.trim()) params.search = search.trim()
      const resp = await api.get('/superadmin/businesses', { params })
      setRows(resp.data.items || [])
      setPagination(resp.data.pagination)
    } catch (err) {
      toast.error('Failed to load businesses')
    } finally {
      setLoading(false)
    }
  }, [page, sortKey, sortDir, search])

  useEffect(() => { fetchData() }, [fetchData])

  function handleSort(key) {
    if (sortKey === key) {
      setSortDir(d => d === 'asc' ? 'desc' : 'asc')
    } else {
      setSortKey(key)
      setSortDir('asc')
    }
    setPage(1)
  }

  return (
    <div>
      <div style={{ marginBottom: '1.5rem' }}>
        <h1 style={{ fontSize: '1.2rem', fontWeight: 700, color: '#F8FAFC', margin: 0 }}>
          Businesses
        </h1>
        <p style={{ fontSize: '0.78rem', color: '#94A3B8', marginTop: 4 }}>
          Manage all tenant businesses on the platform
        </p>
      </div>

      <div style={{ marginBottom: '1rem', maxWidth: 320 }}>
        <SearchBar
          value={search}
          onChange={setSearch}
          onSearch={(val) => { setSearch(val); setPage(1) }}
          placeholder="Search by business name..."
        />
      </div>

      <Table
        columns={COLUMNS}
        rows={rows}
        loading={loading}
        sortKey={sortKey}
        sortDir={sortDir}
        onSort={handleSort}
        onRowClick={(row) => navigate(`/admin/businesses/${row.business_id}`)}
        emptyText="No businesses found"
        rowKey="business_id"
      />

      {pagination && (
        <Pagination pagination={pagination} onPageChange={setPage} />
      )}
    </div>
  )
}
