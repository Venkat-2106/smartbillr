// src/features/customers/pages/CustomersPage.jsx
//
// REWRITE — reduced from 969 lines to ~200 by importing the already-extracted
// components instead of duplicating them inline:
//
//   CustomerForm         → features/customers/components/CustomerForm.jsx
//   CustomerDetailDrawer → features/customers/components/CustomerDetailDrawer.jsx
//   DrawerOverlay        → features/customers/components/CustomerDetailDrawer.jsx
//
// The page now only owns:
//   - List state (page, search, sort, date filter)
//   - Modal/drawer open state (showAdd, editTarget, deleteTarget, detailCustId)
//   - Table column definitions
//   - CRUD handlers (create, update, delete)
//
// Print fix is in CustomerDetailDrawer.jsx (see that file for details).

import { useState, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'

import {
  Button,
  Table,
  Modal,
  ConfirmDialog,
  PageHeader,
  Pagination,
  SearchBar,
} from '../../../shared/components'

import { usePermissions } from '../../../shared/hooks/usePermissions'
import { formatDate }     from '../../../shared/utils/formatDate'

import CustomerForm from '../components/CustomerForm'
import CustomerDetailDrawer, { DrawerOverlay } from '../components/CustomerDetailDrawer'

import {
  useCustomers,
  useCreateCustomer,
  useUpdateCustomer,
  useDeleteCustomer,
} from '../hooks/useCustomers'

// ── Date range filter bar ─────────────────────────────────────────────────────
const dateInputStyle = {
  padding: '6px 10px',
  background: 'var(--bg-card)',
  border: '1.5px solid var(--border)',
  borderRadius: 8,
  fontSize: 12.5,
  color: 'var(--text-primary)',
  fontFamily: 'var(--font-sans, "Plus Jakarta Sans", sans-serif)',
  outline: 'none',
  cursor: 'pointer',
}

function DateRangeFilter({ from, to, onChange }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
      <span style={{
        fontSize: 12, fontWeight: 600, color: 'var(--text-muted)',
        letterSpacing: '0.04em', textTransform: 'uppercase', whiteSpace: 'nowrap',
      }}>
        Added
      </span>
      <input type="date" value={from} onChange={e => onChange('from', e.target.value)} style={dateInputStyle} />
      <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>to</span>
      <input type="date" value={to}   onChange={e => onChange('to',   e.target.value)} style={dateInputStyle} />
      {(from || to) && (
        <button
          onClick={() => { onChange('from', ''); onChange('to', '') }}
          style={{
            background: 'none', border: 'none', cursor: 'pointer',
            fontSize: 11.5, color: 'var(--accent-600)', fontWeight: 600,
            padding: '2px 6px',
            fontFamily: 'var(--font-sans, "Plus Jakarta Sans", sans-serif)',
          }}
        >
          Clear
        </button>
      )}
    </div>
  )
}

// ── Main Page ─────────────────────────────────────────────────────────────────
export default function CustomersPage() {
  const { can }   = usePermissions()
  const canManage = can('customers.manage')
  const navigate  = useNavigate()

  const {
    customers,
    pagination,
    page,
    setPage,
    search,
    setSearch,
    isLoading,
    isError,
  } = useCustomers()

  // ── Sort + date filter (client-side on current page) ─────────────────────
  const [sortKey, setSortKey] = useState(null)
  const [sortDir, setSortDir] = useState('asc')
  const [dateFrom, setDateFrom] = useState('')
  const [dateTo,   setDateTo]   = useState('')

  function handleSort(key) {
    if (sortKey === key) setSortDir(d => d === 'asc' ? 'desc' : 'asc')
    else { setSortKey(key); setSortDir('asc') }
  }

  function handleDateChange(field, value) {
    if (field === 'from') setDateFrom(value)
    else                  setDateTo(value)
    setPage?.(1)
  }

  const displayRows = useMemo(() => {
    let rows = [...customers]

    if (dateFrom) {
      const from = new Date(dateFrom).getTime()
      rows = rows.filter(r => r.cust_created_at && new Date(r.cust_created_at).getTime() >= from)
    }
    if (dateTo) {
      const to = new Date(dateTo).getTime() + 86400000 - 1
      rows = rows.filter(r => r.cust_created_at && new Date(r.cust_created_at).getTime() <= to)
    }

    if (sortKey) {
      rows.sort((a, b) => {
        let valA = a[sortKey]
        let valB = b[sortKey]
        if (sortKey === 'cust_created_at') {
          valA = valA ? new Date(valA).getTime() : 0
          valB = valB ? new Date(valB).getTime() : 0
          return sortDir === 'asc' ? valA - valB : valB - valA
        }
        valA = String(valA ?? '').toLowerCase()
        valB = String(valB ?? '').toLowerCase()
        if (valA < valB) return sortDir === 'asc' ? -1 :  1
        if (valA > valB) return sortDir === 'asc' ?  1 : -1
        return 0
      })
    }

    return rows
  }, [customers, sortKey, sortDir, dateFrom, dateTo])

  // ── Mutations ─────────────────────────────────────────────────────────────
  const { mutate: createCustomer, isPending: isCreating } = useCreateCustomer()
  const { mutate: updateCustomer, isPending: isUpdating } = useUpdateCustomer()
  const { mutate: deleteCustomer, isPending: isDeleting } = useDeleteCustomer()

  // ── Modal/drawer state ────────────────────────────────────────────────────
  const [showAdd,      setShowAdd]      = useState(false)
  const [editTarget,   setEditTarget]   = useState(null)
  const [deleteTarget, setDeleteTarget] = useState(null)
  const [detailCustId, setDetailCustId] = useState(null)

  // ── CRUD handlers ─────────────────────────────────────────────────────────
  function handleCreate(data) {
    const clean = Object.fromEntries(Object.entries(data).filter(([, v]) => v !== ''))
    createCustomer(clean, { onSuccess: () => setShowAdd(false) })
  }

  function handleUpdate(data) {
    const clean = Object.fromEntries(Object.entries(data).filter(([, v]) => v !== ''))
    updateCustomer(
      { id: editTarget.cust_id, payload: clean },
      { onSuccess: () => setEditTarget(null) }
    )
  }

  function handleDelete() {
    deleteCustomer(deleteTarget.cust_id, {
      onSuccess: () => {
        setDeleteTarget(null)
        if (detailCustId === deleteTarget.cust_id) setDetailCustId(null)
      },
    })
  }

  function openEditFromDrawer(customer) {
    setEditTarget(customer)
    setDetailCustId(null)
  }

  const activeFilters = [search.trim(), dateFrom, dateTo].filter(Boolean).length

  // ── Table columns ─────────────────────────────────────────────────────────
  const columns = [
    {
      key: 'cust_name',
      label: 'Customer Name',
      sortable: true,
      render: (row) => (
        <span style={{ fontWeight: 600, color: 'var(--text-primary)', fontSize: 13.5 }}>
          {row.cust_name}
        </span>
      ),
    },
    {
      key: 'cust_phone',
      label: 'Phone',
      sortable: true,
      width: 140,
      render: (row) => (
        <span style={{ fontSize: 13, color: 'var(--text-secondary)' }}>
          {row.cust_phone || '—'}
        </span>
      ),
    },
    {
      key: 'cust_email',
      label: 'Email',
      sortable: false,
      render: (row) => (
        <span style={{ fontSize: 12.5, color: 'var(--text-muted)' }}>
          {row.cust_email || '—'}
        </span>
      ),
    },
    {
      key: 'cust_state',
      label: 'State',
      sortable: true,
      width: 130,
      render: (row) => (
        <span style={{ fontSize: 12.5, color: 'var(--text-muted)' }}>
          {row.cust_state || '—'}
        </span>
      ),
    },
    {
      key: 'cust_created_at',
      label: 'Added',
      sortable: true,
      width: 130,
      render: (row) => (
        <span style={{ fontSize: 12.5, color: 'var(--text-muted)' }}>
          {row.cust_created_at ? formatDate(row.cust_created_at) : '—'}
        </span>
      ),
    },
    ...(canManage
      ? [{
          key: 'actions',
          label: '',
          width: 130,
          render: (row) => (
            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
              <Button variant="secondary" size="sm" onClick={(e) => { e.stopPropagation(); setEditTarget(row) }}>
                Edit
              </Button>
              <Button variant="danger" size="sm" onClick={(e) => { e.stopPropagation(); setDeleteTarget(row) }}>
                Delete
              </Button>
            </div>
          ),
        }]
      : []),
  ]

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <>
      <PageHeader
        title="Customers"
        subtitle="Manage your customer records and view purchase history"
        back
        onBack={() => navigate('/dashboard')}
        action={
          canManage && (
            <Button
              variant="primary"
              leftIcon={<span style={{ fontSize: 16, lineHeight: 1 }}>+</span>}
              onClick={() => setShowAdd(true)}
            >
              Add Customer
            </Button>
          )
        }
      />

      {/* Toolbar */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 20, flexWrap: 'wrap' }}>
        <SearchBar
          value={search}
          onChange={setSearch}
          onSearch={setSearch}
          placeholder="Search by name, phone or email…"
          width="300px"
        />
        <DateRangeFilter from={dateFrom} to={dateTo} onChange={handleDateChange} />
        <div style={{ flex: 1 }} />
        <span style={{
          fontSize: 12, fontWeight: 600, color: 'var(--text-muted)',
          background: 'var(--bg-subtle)', border: '1px solid var(--border)',
          borderRadius: 20, padding: '4px 12px', whiteSpace: 'nowrap',
        }}>
          {displayRows.length} record{displayRows.length !== 1 ? 's' : ''}
          {activeFilters > 0 && (
            <span style={{
              marginLeft: 6, fontSize: 10.5, fontWeight: 700,
              color: 'var(--accent-600)', background: 'var(--accent-50)',
              borderRadius: 10, padding: '1px 6px',
            }}>
              {activeFilters} filter{activeFilters !== 1 ? 's' : ''}
            </span>
          )}
        </span>
      </div>

      {isError && (
        <div style={{
          background: 'var(--danger-bg)', border: '1px solid var(--danger-border)',
          borderRadius: 12, padding: '13px 18px', color: 'var(--danger-text)',
          fontSize: 13.5, marginBottom: 24, fontWeight: 500,
        }}>
          ⚠️ Could not load customers. Check that the backend is running and refresh.
        </div>
      )}

      <Table
        columns={columns}
        rows={displayRows}
        loading={isLoading}
        rowKey="cust_id"
        sortKey={sortKey}
        sortDir={sortDir}
        onSort={handleSort}
        onRowClick={(row) => setDetailCustId(row.cust_id)}
        emptyText={
          activeFilters > 0
            ? 'No customers match your filters.'
            : 'No customers yet. Add your first one to start tracking.'
        }
      />

      {activeFilters === 0 && (
        <Pagination pagination={pagination} onPageChange={setPage} />
      )}

      {/* Detail drawer */}
      <DrawerOverlay open={Boolean(detailCustId)} onClick={() => setDetailCustId(null)} />
      {detailCustId && (
        <CustomerDetailDrawer
          custId={detailCustId}
          onClose={() => setDetailCustId(null)}
          onEdit={openEditFromDrawer}
          canManage={canManage}
        />
      )}

      {/* Add modal */}
      <Modal open={showAdd} onClose={() => setShowAdd(false)} title="Add Customer" subtitle="Create a new customer record">
        <CustomerForm
          onSubmit={handleCreate}
          onClose={() => setShowAdd(false)}
          isPending={isCreating}
        />
      </Modal>

      {/* Edit modal */}
      <Modal open={Boolean(editTarget)} onClose={() => setEditTarget(null)} title="Edit Customer" subtitle={editTarget?.cust_name}>
        {editTarget && (
          <CustomerForm
            key={editTarget.cust_id}
            defaultValues={{
              cust_name:         editTarget.cust_name         || '',
              cust_phone:        editTarget.cust_phone        || '',
              cust_email:        editTarget.cust_email        || '',
              cust_address:      editTarget.cust_address      || '',
              cust_state:        editTarget.cust_state        || '',
              cust_country_code: editTarget.cust_country_code || '',
              cust_tax_number:   editTarget.cust_tax_number   || '',
            }}
            onSubmit={handleUpdate}
            onClose={() => setEditTarget(null)}
            isPending={isUpdating}
          />
        )}
      </Modal>

      {/* Delete confirm */}
      <ConfirmDialog
        open={Boolean(deleteTarget)}
        onClose={() => setDeleteTarget(null)}
        onConfirm={handleDelete}
        title={`Delete "${deleteTarget?.cust_name}"?`}
        message="This will permanently remove the customer. Their past sales records will remain intact."
        confirmText="Yes, delete"
        loading={isDeleting}
      />
    </>
  )
}