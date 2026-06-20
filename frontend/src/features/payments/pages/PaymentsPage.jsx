// src/features/payments/pages/PaymentsPage.jsx
//
// Standard list page following the SmartBillr page pattern exactly.
//
// WHAT THIS PAGE SHOWS:
//   One row per sale (is_active=true payments snapshot).
//   Each row = current payment state for that sale.
//   Clicking a row opens PaymentHistoryDrawer showing full installment
//   history + the "Record Payment" form for pending/partial sales.
//
// ARCHITECTURE:
//   - No fetch in this component — everything comes from usePayments()
//   - No useState for form fields — React Hook Form in the drawer
//   - Permissions gated by payments.manage (read + write same permission)
//   - ExportButton uses onFetch (lazy — only runs when clicked)

import { useState, useMemo }     from 'react'
import { useNavigate }           from 'react-router-dom'
import { usePayments }           from '../hooks/usePayments'
import useAuthStore              from '../../../store/authStore'
import PaymentHistoryDrawer, { DrawerOverlay }
  from '../components/PaymentHistoryDrawer'
import {
  Button, Table, Badge, SearchBar,
  Pagination, PageHeader, DateRangeFilter, ExportButton,
  EmptyState,
} from '../../../shared/components'
import { selectStyle }           from '../../../shared/components/FormField'
import { formatCurrency }        from '../../../shared/utils/formatCurrency'
import { formatDate }            from '../../../shared/utils/formatDate'
import { PAYMENT_CSV_COLUMNS }   from '../../../shared/utils/csvExport'

// ── Badge mappings ────────────────────────────────────────────────────────────
const STATUS_VARIANT = { paid: 'success', partial: 'warning', pending: 'danger' }
const STATUS_LABEL   = { paid: 'Paid',    partial: 'Partial', pending: 'Unpaid' }

const METHOD_LABEL = {
  cash: 'Cash', upi: 'UPI', card: 'Card',
  bank: 'Bank Transfer', split: 'Split', adjustment: 'Adjustment',
}

// ── Column definitions ────────────────────────────────────────────────────────
function buildColumns(onRowClick) {
  return [
    {
      key:      'invoice_no',
      label:    'Invoice No',
      sortable: true,
      width:    130,
      render:   (row) => (
        <span style={{
          fontWeight: 700, color: 'var(--accent-600)',
          fontFamily: 'monospace', fontSize: 13,
        }}>
          {row.invoice_no || '—'}
        </span>
      ),
    },
    {
      key:      'customer_name',
      label:    'Customer',
      sortable: true,
      render:   (row) => (
        <span style={{ fontWeight: 600, color: 'var(--text-primary)', fontSize: 13.5 }}>
          {row.customer_name || 'Walk-in'}
        </span>
      ),
    },
    {
      key:      'sales_final_amount',
      label:    'Invoice Total',
      sortable: false,
      width:    120,
      render:   (row) => (
        <span style={{ fontWeight: 600, color: 'var(--text-primary)', fontSize: 13.5 }}>
          {formatCurrency(row.sales_final_amount || 0)}
        </span>
      ),
    },
    {
      key:      'cumulative_paid',
      label:    'Paid',
      sortable: true,
      width:    110,
      render:   (row) => (
        <span style={{ fontWeight: 600, color: 'var(--text-primary)', fontSize: 13.5 }}>
          {formatCurrency(row.cumulative_paid || 0)}
        </span>
      ),
    },
    {
      key:      'remaining_balance',
      label:    'Remaining',
      sortable: false,
      width:    110,
      render:   (row) => (
        <span style={{
          fontWeight: 600,
          fontSize: 13.5,
          color: row.remaining_balance > 0 ? 'var(--danger-text, #EF4444)' : 'var(--text-muted)',
        }}>
          {row.remaining_balance > 0 ? formatCurrency(row.remaining_balance) : '—'}
        </span>
      ),
    },
    {
      key:      'payment_status',
      label:    'Status',
      sortable: true,
      width:    100,
      render:   (row) => (
        <Badge
          variant={STATUS_VARIANT[row.payment_status] || 'neutral'}
          label={STATUS_LABEL[row.payment_status]    || row.payment_status || '—'}
          dot
        />
      ),
    },
    {
      key:      'payment_method',
      label:    'Method',
      sortable: false,
      width:    120,
      render:   (row) => (
        <span style={{ fontSize: 12.5, color: 'var(--text-secondary)' }}>
          {METHOD_LABEL[row.payment_method] || (row.payment_method || '—').toUpperCase()}
        </span>
      ),
    },
    {
      key:      'payment_paid_at',
      label:    'Last Payment',
      sortable: true,
      width:    120,
      render:   (row) => (
        <span style={{ fontSize: 12.5, color: 'var(--text-muted)' }}>
          {row.payment_paid_at ? formatDate(row.payment_paid_at) : '—'}
        </span>
      ),
    },
  ]
}

// ── Main Page ─────────────────────────────────────────────────────────────────
export default function PaymentsPage() {
  const navigate      = useNavigate()
  const hasPermission = useAuthStore(s => s.hasPermission)
  const canManage     = hasPermission('payments.manage')

  const {
    payments,
    isLoading, isError,
    search,    setSearch,
    status,    setStatus,
    dateFrom,  setDateFrom,
    dateTo,    setDateTo,
    sortKey,   sortDir, handleSort,
    page,      setPage, totalPages, totalItems,
    pagination: paginationObj,
    handleExport,
    recordPayment,
    isRecording,
  } = usePayments()

  // Drawer state — stores the sale_id of the selected row
  const [selectedSaleId, setSelectedSaleId] = useState(null)

  const columns = useMemo(
    () => buildColumns(setSelectedSaleId),
    [] // eslint-disable-line react-hooks/exhaustive-deps
  )

  function handleDateChange(field, value) {
    if (field === 'from') setDateFrom(value)
    else                  setDateTo(value)
  }

  const activeFilters = [search.trim(), status, dateFrom, dateTo].filter(Boolean).length

  return (
    <>
      <PageHeader
        title="Payments"
        subtitle="Track invoice payments and record new installments"
        back
        onBack={() => navigate('/dashboard')}
        action={
          <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
            <ExportButton
              onFetch={handleExport}
              filename="payments"
              columns={PAYMENT_CSV_COLUMNS}
            />
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
            placeholder="Search invoice or customer…"
            width="260px"
          />
          <select
            value={status}
            onChange={e => setStatus(e.target.value)}
            style={{ ...selectStyle, width: 'auto', padding: '9px 32px 9px 14px', fontSize: 13 }}
          >
            <option value="">All Statuses</option>
            <option value="paid">Paid</option>
            <option value="partial">Partial</option>
            <option value="pending">Unpaid</option>
          </select>
          <span style={{ fontSize: 12.5, color: 'var(--text-muted)', fontWeight: 500 }}>
            {totalItems} invoice{totalItems !== 1 ? 's' : ''}
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
          label="Last Payment"
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
          ⚠️ Could not load payments. Check that the backend is running and refresh.
        </div>
      )}

      {/* TABLE — click row to open history drawer */}
      {!isLoading && payments.length === 0 ? (
        <EmptyState
          icon={activeFilters > 0 ? '🔍' : '💳'}
          title={activeFilters > 0 ? 'No results matching your filters' : 'Nothing here yet'}
          description={activeFilters > 0 ? 'Try adjusting your search or filters to find what you\'re looking for.' : 'Payments are recorded when sales are created or updated.'}
          action={activeFilters > 0 ? (
            <Button variant="secondary" size="sm" onClick={() => { setSearch(''); setStatus(''); setDateFrom(''); setDateTo('') }}>
              Clear filters
            </Button>
          ) : undefined}
        />
      ) : (
      <div style={{ overflowX: 'auto', width: '100%' }}>
        <Table
          columns={columns}
          rows={payments}
          rowKey="sale_id"
          loading={isLoading}
          sortKey={sortKey}
          sortDir={sortDir}
          onSort={handleSort}
          onRowClick={(row) => setSelectedSaleId(row.sale_id)}
        />
      </div>
      )}

      {/* PAGINATION — always shown */}
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

      {/* PAYMENT HISTORY DRAWER */}
      {selectedSaleId && (
        <>
          <DrawerOverlay
            open={!!selectedSaleId}
            onClick={() => setSelectedSaleId(null)}
          />
          <PaymentHistoryDrawer
            saleId={selectedSaleId}
            onClose={() => setSelectedSaleId(null)}
            onRecorded={recordPayment}
            isRecording={isRecording}
          />
        </>
      )}
    </>
  )
}