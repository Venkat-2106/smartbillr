import { useState, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'

import {
  Button, Table, Badge, SearchBar,
  Pagination, PageHeader, DateRangeFilter, ExportButton,
  ConfirmDialog, EmptyState,
} from '../../../shared/components'
import { usePermissions } from '../../../shared/hooks/usePermissions'
import { formatCurrency } from '../../../shared/utils/formatCurrency'
import useAuthStore from '../../../store/authStore'

import { formatDate, formatDateCSV } from '../../../shared/utils/formatDate'
import { usePurchaseReturns } from '../hooks/usePurchaseReturns'
import PurchaseReturnDetailDrawer from '../components/PurchaseReturnDetailDrawer'

const STATUS_VARIANT = { pending: 'warning', approved: 'success', rejected: 'danger' }
const STATUS_LABEL = { pending: 'Pending', approved: 'Approved', rejected: 'Rejected' }

function buildColumns(canManage, onDelete, country) {
  return [
    {
      key: 'return_created_at',
      label: 'Return Date',
      sortable: true,
      width: 120,
      render: (row) => (
        <span style={{ fontSize: 13, color: 'var(--text-secondary)' }}>
          {row.return_created_at ? formatDate(row.return_created_at) : '—'}
        </span>
      ),
    },
    {
      key: 'supp_name',
      label: 'Supplier',
      width: 180,
      render: (row) => (
        <span style={{ fontWeight: 600, color: 'var(--text-primary)', fontSize: 13 }}>
          {row.supp_name || '—'}
        </span>
      ),
    },
    {
      key: 'return_amount',
      label: 'Amount',
      sortable: true,
      width: 120,
      render: (row) => (
        <span style={{ fontWeight: 700, color: 'var(--text-primary)', fontSize: 14 }}>
          {formatCurrency(row.return_amount, country)}
        </span>
      ),
    },
    {
      key: 'return_status',
      label: 'Status',
      sortable: true,
      width: 110,
      render: (row) => (
        <Badge
          variant={STATUS_VARIANT[row.return_status] || 'warning'}
          label={STATUS_LABEL[row.return_status] || row.return_status}
          dot
        />
      ),
    },
    {
      key: 'return_reason',
      label: 'Reason',
      render: (row) => (
        <span style={{
          fontSize: 13, color: 'var(--text-secondary)',
          overflow: 'hidden', textOverflow: 'ellipsis',
          whiteSpace: 'nowrap', maxWidth: 240, display: 'inline-block',
        }}>
          {row.return_reason || '—'}
        </span>
      ),
    },
    {
      key: 'items',
      label: 'Items',
      width: 80,
      render: (row) => (
        <span style={{ fontSize: 13, color: 'var(--text-muted)' }}>
          {row.items?.length || 0}
        </span>
      ),
    },
    {
      key:      'updated_at',
      label:    'Last Updated',
      sortable: false,
      width:    110,
      render: (row) => (
        <span style={{ fontSize: 13, color: 'var(--text-muted)' }}>
          {row.updated_at ? formatDate(row.updated_at) : '—'}
        </span>
      ),
    },
    {
      key:      'last_updated_by',
      label:    'Last Updated By',
      sortable: false,
      width:    140,
      render: (row) => (
        row.last_updated_by
          ? (
            <span style={{ fontSize: 13, color: 'var(--text-secondary)', fontWeight: 500 }}>
              {row.last_updated_by}
            </span>
          )
          : <span style={{ fontSize: 13, color: 'var(--text-muted)' }}>—</span>
      ),
    },
    ...(canManage ? [{
      key: 'actions',
      label: '',
      width: 80,
      render: (row) => (
        <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
          {row.return_status === 'pending' && (
            <Button
              variant="danger"
              size="sm"
              onClick={(e) => { e.stopPropagation(); onDelete(row) }}
            >
              Delete
            </Button>
          )}
        </div>
      ),
    }] : []),
  ]
}

export default function PurchaseReturnsPage() {
  const navigate = useNavigate()
  const { can } = usePermissions()
  const canManage = can('purchase_returns.manage')
  const canApprove = can('purchase_returns.approve')
  const business  = useAuthStore(s => s.business)
  const country   = business?.business_country_code || 'IN'

  const {
    returns, isLoading, isError,
    search, setSearch,
    dateFrom, setDateFrom,
    dateTo, setDateTo,
    sortKey, sortDir, handleSort,
    page, setPage, totalPages, totalItems,
    handleExport,
    deleteReturn, isDeleting,
  } = usePurchaseReturns()

  const [selectedReturnId, setSelectedReturnId] = useState(null)
  const [deletingReturn, setDeletingReturn] = useState(null)
  const [showDelete, setShowDelete] = useState(false)

  function handleDeleteClick(row) {
    setDeletingReturn(row)
    setShowDelete(true)
  }

  function handleCloseDelete() {
    setShowDelete(false)
    setDeletingReturn(null)
  }

  function onConfirmDelete() {
    deleteReturn(deletingReturn.return_id, { onSuccess: handleCloseDelete })
  }

  const columns = useMemo(
    () => buildColumns(canManage, handleDeleteClick, country),
    [canManage, country]
  )

  function handleDateChange(field, value) {
    if (field === 'from') setDateFrom(value)
    else setDateTo(value)
  }

  const activeFilters = [search.trim(), dateFrom, dateTo].filter(Boolean).length

  return (
    <>
      <PageHeader
        title="Purchase Returns"
        subtitle="Manage returns to suppliers and track refunds"
        back
        onBack={() => navigate('/dashboard')}
        action={
          <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
            <ExportButton
              onFetch={handleExport}
              filename="purchase-returns"
              columns={[
                { key: 'return_created_at', label: 'Return Date', format: (v) => formatDateCSV(v) },
                { key: 'return_amount', label: 'Amount', format: (v) => formatCurrency(v, country) },
                { key: 'return_status', label: 'Status' },
                { key: 'return_reason', label: 'Reason' },
              ]}
            />
          </div>
        }
      />

      <div style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        marginBottom: 20,
        gap: 12,
        flexWrap: 'wrap',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
          <SearchBar
            value={search}
            onChange={setSearch}
            onSearch={setSearch}
            placeholder="Search by reason or supplier\u2026"
            width="280px"
          />
          <span style={{ fontSize: 13, color: 'var(--text-muted)', fontWeight: 500 }}>
            {totalItems} return{totalItems !== 1 ? 's' : ''}
            {activeFilters > 0 && ' (filtered)'}
          </span>
          {activeFilters > 0 && (
            <button
              onClick={() => { setSearch(''); setDateFrom(''); setDateTo('') }}
              style={{
                background: 'none', border: 'none', cursor: 'pointer',
                fontSize: 12, color: 'var(--accent-600)', fontWeight: 600,
                padding: '2px 6px',
                fontFamily: "var(--font-sans, 'Plus Jakarta Sans', sans-serif)",
              }}
            >
              {'\u2715'} Clear filters
            </button>
          )}
        </div>
        <DateRangeFilter
          label="Return Date"
          from={dateFrom}
          to={dateTo}
          onChange={handleDateChange}
        />
      </div>

      {isError && (
        <div style={{
          background: 'var(--danger-bg)', border: '1px solid var(--danger-border)',
          borderRadius: 12, padding: '12px 16px', color: 'var(--danger-text)',
          fontSize: 13, marginBottom: 24, fontWeight: 500,
        }}>
          Could not load purchase returns. Check that the backend is running and refresh.
        </div>
      )}

      {!isLoading && returns.length === 0 ? (
        <EmptyState
          context="return"
          hasFilters={activeFilters > 0}
          title={activeFilters > 0 ? 'No results matching your filters' : 'Nothing here yet'}
          description={activeFilters > 0 ? 'Try adjusting your search or filters to find what you\'re looking for.' : 'No purchase returns yet. Create one from a purchase record.'}
          action={activeFilters > 0 ? (
            <Button variant="secondary" size="sm" onClick={() => { setSearch(''); setDateFrom(''); setDateTo('') }}>
              Clear filters
            </Button>
          ) : undefined}
        />
      ) : (
      <div style={{ overflowX: 'auto', width: '100%' }}>
        <Table
          columns={columns}
          rows={returns}
          rowKey="return_id"
          loading={isLoading}
          sortKey={sortKey}
          sortDir={sortDir}
          onSort={handleSort}
          onRowClick={(row) => setSelectedReturnId(row.return_id)}
        />
      </div>
      )}

      <Pagination
        pagination={{
          page,
          total_pages: totalPages,
          total:       totalItems,
          has_next:    page < totalPages,
          has_prev:    page > 1,
        }}
        onPageChange={setPage}
      />

      <ConfirmDialog
        open={showDelete}
        onClose={handleCloseDelete}
        onConfirm={onConfirmDelete}
        title="Delete Return?"
        message="Only pending returns can be deleted. This action cannot be undone."
        confirmText={isDeleting ? 'Deleting\u2026' : 'Yes, Delete'}
        loading={isDeleting}
      />

      {selectedReturnId && (
        <PurchaseReturnDetailDrawer
          returnId={selectedReturnId}
          onClose={() => setSelectedReturnId(null)}
          onStatusUpdate={() => setSelectedReturnId(null)}
          canApprove={canApprove}
          canManage={canManage}
        />
      )}
    </>
  )
}
