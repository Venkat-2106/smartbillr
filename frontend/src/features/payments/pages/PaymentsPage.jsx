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

import { useState, useMemo } from 'react'
import { useQuery }         from '@tanstack/react-query'
import { usePayments }       from '../hooks/usePayments'
import { fetchPaymentSummary } from '../api/paymentsApi'
import useAuthStore              from '../../../store/authStore'
import PaymentHistoryDrawer, { DrawerOverlay }
  from '../components/PaymentHistoryDrawer'
import {
  Button, Table, Badge, SearchBar,
  Pagination, DateRangeFilter, ExportButton,
  EmptyState, MetricCard, BentoCard, PageHeader, SkeletonTable,
} from '../../../shared/components'
import { selectStyle }           from '../../../shared/components/FormField'
import { formatCurrency }        from '../../../shared/utils/formatCurrency'
import { formatDate }            from '../../../shared/utils/formatDate'
import { PAYMENT_CSV_COLUMNS }   from '../../../shared/utils/csvExport'
import useTableKeyboardNav from '../../../shared/hooks/useTableKeyboardNav'

// ── Badge mappings ────────────────────────────────────────────────────────────
const STATUS_VARIANT = { paid: 'success', partial: 'warning', pending: 'danger' }
const STATUS_LABEL   = { paid: 'Paid',    partial: 'Partial', pending: 'Unpaid' }

const METHOD_LABEL = {
  cash: 'Cash', upi: 'UPI', card: 'Card',
  bank: 'Bank Transfer', split: 'Split', adjustment: 'Adjustment',
}

// ── Column definitions ────────────────────────────────────────────────────────
function buildColumns(onRowClick, country) {
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
        <span style={{ fontWeight: 600, color: 'var(--text-primary)', fontSize: 13 }}>
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
        <span style={{ fontWeight: 600, color: 'var(--text-primary)', fontSize: 13 }}>
          {formatCurrency(row.sales_final_amount || 0, country)}
        </span>
      ),
    },
    {
      key:      'cumulative_paid',
      label:    'Paid',
      sortable: true,
      width:    110,
      render:   (row) => (
        <span style={{ fontWeight: 600, color: 'var(--text-primary)', fontSize: 13 }}>
          {formatCurrency(row.cumulative_paid || 0, country)}
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
          fontSize: 13,
          color: row.remaining_balance > 0 ? 'var(--danger-text, #EF4444)' : 'var(--text-muted)',
        }}>
          {row.remaining_balance > 0 ? formatCurrency(row.remaining_balance, country) : '—'}
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
        <span style={{ fontSize: 13, color: 'var(--text-secondary)' }}>
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
        <span style={{ fontSize: 13, color: 'var(--text-muted)' }}>
          {row.payment_paid_at ? formatDate(row.payment_paid_at) : '—'}
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
  ]
}

// ── Main Page ─────────────────────────────────────────────────────────────────
export default function PaymentsPage() {
  const hasPermission = useAuthStore(s => s.hasPermission)
  const canManage     = hasPermission('payments.manage')
  const business      = useAuthStore(s => s.business)
  const country       = business?.business_country_code || 'IN'

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

  const { data: paymentSummary, isLoading: summaryLoading } = useQuery({
    queryKey: ['payment-summary'],
    queryFn: fetchPaymentSummary,
    staleTime: 60_000,
  })

  // Drawer state — stores the sale_id of the selected row
  const [selectedSaleId, setSelectedSaleId] = useState(null)

  const { selectedIndex, setSelectedIndex } = useTableKeyboardNav({
    rows: payments,
    rowKey: 'sale_id',
    onEnterRow: (row) => setSelectedSaleId(row.sale_id),
  })

  const columns = useMemo(
    () => buildColumns(setSelectedSaleId, country),
    [country] // eslint-disable-line react-hooks/exhaustive-deps
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
        subtitle="Track payment collections, invoices, and outstanding balances"
        action={
          <ExportButton
            onFetch={handleExport}
            filename="payments"
            columns={PAYMENT_CSV_COLUMNS}
          />
        }
      />

      {/* METRIC CARDS */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(12, 1fr)',
        gap: 16,
        marginBottom: 24,
      }}>
        <MetricCard
          colSpan={6}
          loading={isLoading}
          icon={
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <line x1="12" y1="1" x2="12" y2="23" />
              <path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6" />
            </svg>
          }
          label="Total Payments Collected"
          value={paymentSummary?.total_collected != null ? formatCurrency(paymentSummary.total_collected, country) : '\u2014'}
          loading={isLoading || summaryLoading}
        />
        <MetricCard
          colSpan={6}
          loading={isLoading || summaryLoading}
          icon={
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <circle cx="12" cy="12" r="10" />
              <polyline points="12 6 12 12 16 14" />
            </svg>
          }
          label="Pending Payments"
          value={paymentSummary?.pending_count ?? 0}
        />
      </div>

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
            className="sb-select"
            style={{ ...selectStyle, width: 'auto', padding: '9px 32px 9px 14px', fontSize: 13 }}
            aria-label="Filter by payment status"
          >
            <option value="">All Statuses</option>
            <option value="paid">Paid</option>
            <option value="partial">Partial</option>
            <option value="pending">Unpaid</option>
          </select>
          <span style={{ fontSize: 13, color: 'var(--text-muted)', fontWeight: 500 }}>
            {totalItems} invoice{totalItems !== 1 ? 's' : ''}
            {activeFilters > 0 && ' (filtered)'}
          </span>
          {activeFilters > 0 && (
            <button
              onClick={() => { setSearch(''); setStatus(''); setDateFrom(''); setDateTo('') }}
              style={{
                background: 'none', border: 'none', cursor: 'pointer',
                fontSize: 12, color: 'var(--accent-600)', fontWeight: 600,
                padding: '2px 6px', display: 'inline-flex', alignItems: 'center', gap: 4,
              }}
            >
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <line x1="18" y1="6" x2="6" y2="18" />
                <line x1="6" y1="6" x2="18" y2="18" />
              </svg>
              Clear filters
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
          borderRadius: 12, padding: '12px 16px', color: 'var(--danger-text)',
          fontSize: 13, marginBottom: 24, fontWeight: 500,
          display: 'flex', alignItems: 'center', gap: 8,
        }}>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0 }} aria-hidden="true">
            <path d="M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
            <line x1="12" y1="9" x2="12" y2="13" />
            <line x1="12" y1="17" x2="12.01" y2="17" />
          </svg>
          Could not load payments. Check that the backend is running and refresh.
        </div>
      )}

      {/* TABLE — click row to open history drawer */}
      {isLoading ? (
        <BentoCard padding={false}>
          <SkeletonTable rows={8} columns={10} />
        </BentoCard>
      ) : payments.length === 0 ? (
        <BentoCard>
          <EmptyState
            context="payment"
            hasFilters={activeFilters > 0}
            title={activeFilters > 0 ? 'No results matching your filters' : 'Nothing here yet'}
            description={activeFilters > 0 ? 'Try adjusting your search or filters to find what you\'re looking for.' : 'Payments are recorded when sales are created or updated.'}
            action={activeFilters > 0 ? (
              <Button variant="secondary" size="sm" onClick={() => { setSearch(''); setStatus(''); setDateFrom(''); setDateTo('') }}>
                Clear filters
              </Button>
            ) : undefined}
          />
        </BentoCard>
      ) : (
        <BentoCard padding={false} className="premium-table-wrap">
          <div className="premium-table" style={{ overflowX: 'auto', width: '100%' }}>
            <Table
              columns={columns}
              rows={payments}
              rowKey="sale_id"
              loading={isLoading}
              sortKey={sortKey}
              sortDir={sortDir}
              onSort={handleSort}
              onRowClick={(row) => setSelectedSaleId(row.sale_id)}
              selectedIndex={selectedIndex}
              onSelectedIndexChange={setSelectedIndex}
            />
          </div>
        </BentoCard>
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

