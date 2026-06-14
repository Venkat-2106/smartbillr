// src/features/purchases/pages/PurchasesPage.jsx
//
// Standard list page — read-only view of purchases.
// Clicking a row opens PurchaseDetailDrawer (items + tax + returns).
// Status can be updated from the drawer by users with purchases.edit.

import { useState, useMemo }     from 'react'
import { useNavigate }           from 'react-router-dom'
import { usePurchases }          from '../hooks/usePurchases'
import useAuthStore              from '../../../store/authStore'
import PurchaseDetailDrawer, { DrawerOverlay }
  from '../components/PurchaseDetailDrawer'
import {
  Table, Badge, SearchBar, Button,
  Pagination, PageHeader, DateRangeFilter, ExportButton,
} from '../../../shared/components'
import { selectStyle }           from '../../../shared/components/FormField'
import { formatCurrency }        from '../../../shared/utils/formatCurrency'
import { formatDate }            from '../../../shared/utils/formatDate'
import { PURCHASE_CSV_COLUMNS }  from '../../../shared/utils/csvExport'

const STATUS_VARIANT = { paid: 'success', partial: 'warning', pending: 'danger' }
const STATUS_LABEL   = { paid: 'Paid',    partial: 'Partial', pending: 'Unpaid' }

function buildColumns() {
  return [
    {
      key:      'supp_name',
      label:    'Supplier',
      sortable: true,
      render:   (row) => (
        <span style={{ fontWeight: 600, color: 'var(--text-primary)', fontSize: 13.5 }}>
          {row.supp_name || 'Unknown Supplier'}
        </span>
      ),
    },
    {
      key:      'pur_total_amount',
      label:    'Subtotal',
      sortable: false,
      width:    110,
      render:   (row) => (
        <span style={{ fontSize: 13, color: 'var(--text-secondary)' }}>
          {formatCurrency(row.pur_total_amount || 0)}
        </span>
      ),
    },
    {
      key:      'pur_final_amount',
      label:    'Total',
      sortable: true,
      width:    120,
      render:   (row) => (
        <span style={{ fontWeight: 700, color: 'var(--text-primary)', fontSize: 14 }}>
          {formatCurrency(row.pur_final_amount || 0)}
        </span>
      ),
    },
    {
      key:      'pur_payment_status',
      label:    'Status',
      sortable: true,
      width:    100,
      render:   (row) => (
        <Badge
          variant={STATUS_VARIANT[row.pur_payment_status] || 'neutral'}
          label={STATUS_LABEL[row.pur_payment_status]    || row.pur_payment_status || '—'}
          dot
        />
      ),
    },
    {
      key:      'pur_discount',
      label:    'Discount',
      sortable: false,
      width:    100,
      render:   (row) => (
        <span style={{ fontSize: 12.5, color: 'var(--text-muted)' }}>
          {(row.pur_discount || 0) > 0 ? formatCurrency(row.pur_discount) : '—'}
        </span>
      ),
    },
    {
      key:      'pur_created_at',
      label:    'Date',
      sortable: true,
      width:    120,
      render:   (row) => (
        <span style={{ fontSize: 12.5, color: 'var(--text-muted)' }}>
          {row.pur_created_at ? formatDate(row.pur_created_at) : '—'}
        </span>
      ),
    },
  ]
}

export default function PurchasesPage() {
  const navigate      = useNavigate()
  const hasPermission = useAuthStore(s => s.hasPermission)
  const canEdit       = hasPermission('purchases.edit')
  const canCreate     = hasPermission('purchases.view') // same permission gates create

  const {
    purchases,
    isLoading, isError,
    search,    setSearch,
    status,    setStatus,
    dateFrom,  setDateFrom,
    dateTo,    setDateTo,
    sortKey,   sortDir, handleSort,
    page,      setPage, totalPages, totalItems,
    handleExport,
    updateStatus,
    isUpdatingStatus,
  } = usePurchases()

  const [selectedPurId, setSelectedPurId] = useState(null)

  const columns = useMemo(() => buildColumns(), [])

  function handleDateChange(field, value) {
    if (field === 'from') setDateFrom(value)
    else                  setDateTo(value)
  }

  const activeFilters = [search.trim(), status, dateFrom, dateTo].filter(Boolean).length

  return (
    <>
      <PageHeader
        title="Purchases"
        subtitle="View and manage all stock purchases from suppliers"
        back
        onBack={() => navigate('/dashboard')}
        action={
          <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
            <ExportButton
              onFetch={handleExport}
              filename="purchases"
              columns={PURCHASE_CSV_COLUMNS}
            />
            {canCreate && (
              <Button variant="primary" onClick={() => navigate('/purchases/new')}>
                + New Purchase
              </Button>
            )}
          </div>
        }
      />

      {/* TOOLBAR */}
      <div style={{
        display: 'flex', alignItems: 'center',
        justifyContent: 'space-between',
        marginBottom: 20, gap: 12, flexWrap: 'wrap',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
          <SearchBar
            value={search}
            onChange={setSearch}
            onSearch={setSearch}
            placeholder="Search by supplier name…"
            width="260px"
          />
          <select
            value={status}
            onChange={e => setStatus(e.target.value)}
            style={{ ...selectStyle, width: 'auto', padding: '9px 14px', fontSize: 13 }}
          >
            <option value="">All Statuses</option>
            <option value="paid">Paid</option>
            <option value="partial">Partial</option>
            <option value="pending">Unpaid</option>
          </select>
          <span style={{ fontSize: 12.5, color: 'var(--text-muted)', fontWeight: 500 }}>
            {totalItems} purchase{totalItems !== 1 ? 's' : ''}
            {activeFilters > 0 && ' (filtered)'}
          </span>
          {activeFilters > 0 && (
            <button
              onClick={() => { setSearch(''); setStatus(''); setDateFrom(''); setDateTo('') }}
              style={{
                background: 'none', border: 'none', cursor: 'pointer',
                fontSize: 12, color: 'var(--accent-600)', fontWeight: 600,
                padding: '2px 6px',
                fontFamily: "var(--font-sans, 'Plus Jakarta Sans', sans-serif)",
              }}
            >
              ✕ Clear filters
            </button>
          )}
        </div>
        <DateRangeFilter
          label="Purchase Date"
          from={dateFrom}
          to={dateTo}
          onChange={handleDateChange}
        />
      </div>

      {/* ERROR BANNER */}
      {isError && (
        <div style={{
          background: 'var(--danger-bg)', border: '1px solid var(--danger-border)',
          borderRadius: 12, padding: '13px 18px', color: 'var(--danger-text)',
          fontSize: 13.5, marginBottom: 24, fontWeight: 500,
        }}>
          ⚠️ Could not load purchases. Check that the backend is running and refresh.
        </div>
      )}

      {/* TABLE */}
      <div style={{ overflowX: 'auto', width: '100%' }}>
        <Table
          columns={columns}
          rows={purchases}
          rowKey="pur_id"
          loading={isLoading}
          sortKey={sortKey}
          sortDir={sortDir}
          onSort={handleSort}
          onRowClick={(row) => setSelectedPurId(row.pur_id)}
          emptyText={
            activeFilters > 0
              ? 'No purchases match your current filters.'
              : 'No purchases yet.'
          }
        />
      </div>

      {/* PAGINATION */}
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

      {/* DETAIL DRAWER */}
      {selectedPurId && (
        <>
          <DrawerOverlay
            open={!!selectedPurId}
            onClick={() => setSelectedPurId(null)}
          />
          <PurchaseDetailDrawer
            purId={selectedPurId}
            onClose={() => setSelectedPurId(null)}
            onUpdateStatus={updateStatus}
            isUpdatingStatus={isUpdatingStatus}
            canEdit={canEdit}
          />
        </>
      )}
    </>
  )
}