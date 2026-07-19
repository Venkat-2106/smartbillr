import { useState, useMemo, useEffect } from 'react'

// UI/UX Audit (2026-07-18):
//   Finding #1  — PageHeader replaces inline page title markup
//   Finding #6  — EmptyState with built-in context icon replaces inline SVG
//   Finding #11 — SkeletonTable shown during initial load (isInitialLoading)
//   Finding #12 — selectStyle applied to status filter select
//   Finding #14 — .bento-grid.bento-grid-12 for metric cards
//   Finding #15 — Dismissible error banner with role="alert"
//   See UI_UX_AUDIT_REPORT.md
//
// FIX (2026-07-18):
//   ImportButton endpoint: removed /v1 prefix (baseURL already contains it).
import { useQuery } from '@tanstack/react-query'
import { useNavigate } from 'react-router-dom'
import { usePurchases } from '../hooks/usePurchases'
import { fetchPurchaseSummary } from '../api/purchasesApi'
import useAuthStore from '../../../store/authStore'
import PurchaseDetailDrawer, { DrawerOverlay }
  from '../components/PurchaseDetailDrawer'
import {
  Table, Badge, SearchBar, Button,
  Pagination, DateRangeFilter, ExportButton, ImportButton, ImportGuidelines,
  EmptyState, BentoCard, MetricCard, SkeletonTable,
  ConfirmDialog, UpgradePrompt, PageHeader,
} from '../../../shared/components'
import { selectStyle } from '../../../shared/components/FormField'
import { formatCurrency } from '../../../shared/utils/formatCurrency'
import { formatDate } from '../../../shared/utils/formatDate'
import { PURCHASE_CSV_COLUMNS, PURCHASE_IMPORT_TEMPLATE, PURCHASE_IMPORT_SAMPLES } from '../../../shared/utils/csvExport'
import { PURCHASE_GUIDELINES } from '../../../shared/utils/importGuidelines'
import useTableKeyboardNav from '../../../shared/hooks/useTableKeyboardNav'

const STATUS_VARIANT = { paid: 'success', partial: 'warning', pending: 'danger' }
const STATUS_LABEL = { paid: 'Paid', partial: 'Partial', pending: 'Unpaid' }

function buildColumns(country) {
  return [
    {
      key: 'supp_name',
      label: 'Supplier',
      sortable: true,
      render: (row) => (
        <span style={{ fontWeight: 600, color: 'var(--text-primary)', fontSize: 13 }}>
          {row.supp_name || 'Unknown Supplier'}
        </span>
      ),
    },
    {
      key: 'pur_total_amount',
      label: 'Subtotal',
      sortable: false,
      width: 110,
      render: (row) => (
        <span style={{ fontSize: 13, color: 'var(--text-secondary)' }}>
          {formatCurrency(row.pur_total_amount || 0, country)}
        </span>
      ),
    },
    {
      key: 'pur_final_amount',
      label: 'Total',
      sortable: true,
      width: 120,
      render: (row) => (
        <span style={{ fontWeight: 700, color: 'var(--text-primary)', fontSize: 14 }}>
          {formatCurrency(row.pur_final_amount || 0, country)}
        </span>
      ),
    },
    {
      key: 'pur_payment_status',
      label: 'Status',
      sortable: true,
      width: 100,
      render: (row) => (
        <Badge
          variant={STATUS_VARIANT[row.pur_payment_status] || 'neutral'}
          label={STATUS_LABEL[row.pur_payment_status] || row.pur_payment_status || '\u2014'}
          dot
        />
      ),
    },
    {
      key: 'pur_discount',
      label: 'Discount',
      sortable: false,
      width: 100,
      render: (row) => (
        <span style={{ fontSize: 13, color: 'var(--text-muted)' }}>
          {(row.pur_discount || 0) > 0 ? formatCurrency(row.pur_discount, country) : '\u2014'}
        </span>
      ),
    },
    {
      key: 'pur_created_at',
      label: 'Date',
      sortable: true,
      width: 120,
      render: (row) => (
        <span style={{ fontSize: 13, color: 'var(--text-muted)' }}>
          {row.pur_created_at ? formatDate(row.pur_created_at) : '\u2014'}
        </span>
      ),
    },
    {
      key:      'updated_at',
      label:    'Last Updated',
      sortable: true,
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

export default function PurchasesPage() {
  const navigate = useNavigate()
  const hasPermission = useAuthStore(s => s.hasPermission)
  const canEdit = hasPermission('purchases.edit')
  const canCreate = hasPermission('purchases.create')
  const subscription = useAuthStore(s => s.subscription)
  const business  = useAuthStore(s => s.business)
  const country   = business?.business_country_code || 'IN'

  const {
    purchases,
    isLoading, isError,
    search, setSearch,
    status, setStatus,
    dateFrom, setDateFrom,
    dateTo, setDateTo,
    sortKey, sortDir, handleSort,
    page, setPage, totalPages, totalItems,
    handleExport,
    updateStatus,
    isUpdatingStatus,
    deletePurchase,
    isDeleting,
  } = usePurchases()

  const [bannerDismissed, setBannerDismissed] = useState(false)
  useEffect(() => { setBannerDismissed(false) }, [isError])

  const [showUpgradeBanner, setShowUpgradeBanner] = useState(true)
  const [selectedPurId, setSelectedPurId] = useState(null)
  const [showDelete,    setShowDelete]    = useState(false)
  const [deletingPur,   setDeletingPur]   = useState(null)
  const [reduceStock,   setReduceStock]   = useState(false)

  function handleDeleteClick(pur) {
    setDeletingPur(pur)
    setReduceStock(false)
    setShowDelete(true)
  }

  function handleCloseDelete() {
    setShowDelete(false)
    setDeletingPur(null)
    setReduceStock(false)
  }

  function onConfirmDelete() {
    deletePurchase(deletingPur.pur_id, reduceStock, { onSuccess: handleCloseDelete })
  }

  const { selectedIndex, setSelectedIndex } = useTableKeyboardNav({
    rows: purchases,
    rowKey: 'pur_id',
    onEnterRow: (row) => setSelectedPurId(row.pur_id),
    onDeleteRow: handleDeleteClick,
  })

  const columns = useMemo(() => buildColumns(country), [country])

  function handleDateChange(field, value) {
    if (field === 'from') setDateFrom(value)
    else setDateTo(value)
  }

  const { data: purchaseSummary } = useQuery({
    queryKey: ['purchase-summary'],
    queryFn: fetchPurchaseSummary,
    staleTime: 60_000,
  })

  const activeFilters = [search.trim(), status, dateFrom, dateTo].filter(Boolean).length

  const monthlyPurchases = purchaseSummary?.monthly_count ?? 0
  const pendingPayments  = purchaseSummary?.pending_count ?? 0
  const activeSuppliers  = purchaseSummary?.active_suppliers ?? 0

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
              <ImportButton
                endpoint="/purchases/import"
                title="Purchases"
                columns={PURCHASE_IMPORT_TEMPLATE}
                sampleRows={PURCHASE_IMPORT_SAMPLES}
                requiredColumns={[
                  { key: 'qty', label: 'Quantity', alternates: ['quantity'] },
                  { key: 'unit_price', label: 'Unit Price', alternates: ['price'] },
                  { key: 'prod_name', label: 'Product Name', alternates: ['product_name', 'barcode', 'Barcode'] },
                ]}
              />
            )}
            {canCreate && (
              <Button variant="primary" onClick={() => navigate('/purchases/new')}>
                + New Purchase
              </Button>
            )}
          </div>
        }
      />

      {showUpgradeBanner && subscription?.subscription_type === 'trial' && (
        <UpgradePrompt
          variant="banner"
          feature="purchases"
          onDismiss={() => setShowUpgradeBanner(false)}
          style={{ marginBottom: 24 }}
        />
      )}

      <ImportGuidelines
        guidelines={PURCHASE_GUIDELINES}
        columns={PURCHASE_IMPORT_TEMPLATE}
        sampleRows={PURCHASE_IMPORT_SAMPLES}
        templateName="purchases"
      />

      {/* METRIC CARDS */}
      <div className="bento-grid bento-grid-12" style={{ marginBottom: 24 }}>
        <MetricCard
          colSpan={3}
          icon={
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d="M6 2L3 6v14a2 2 0 002 2h14a2 2 0 002-2V6l-3-4z" />
              <path d="M3 6h18" />
              <path d="M16 10a4 4 0 01-8 0" />
            </svg>
          }
          label="Total Purchases"
          value={totalItems.toLocaleString()}
          loading={isLoading}
        />
        <MetricCard
          colSpan={3}
          icon={
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <rect x="3" y="4" width="18" height="18" rx="2" ry="2" />
              <line x1="16" y1="2" x2="16" y2="6" />
              <line x1="8" y1="2" x2="8" y2="6" />
              <line x1="3" y1="10" x2="21" y2="10" />
            </svg>
          }
          label="Monthly Purchases"
          value={monthlyPurchases}
          loading={isLoading}
        />
        <MetricCard
          colSpan={3}
          icon={
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <circle cx="12" cy="12" r="10" />
              <polyline points="12 6 12 12 16 14" />
            </svg>
          }
          label="Pending Supplier Payments"
          value={pendingPayments}
          loading={isLoading}
        />
        <MetricCard
          colSpan={3}
          icon={
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d="M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2" />
              <circle cx="9" cy="7" r="4" />
              <path d="M23 21v-2a4 4 0 00-3-3.87" />
              <path d="M16 3.13a4 4 0 010 7.75" />
            </svg>
          }
          label="Active Suppliers"
          value={activeSuppliers}
          loading={isLoading}
        />
      </div>

      {/* TOOLBAR */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20, gap: 12, flexWrap: 'wrap' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
          <SearchBar
            value={search}
            onChange={setSearch}
            onSearch={setSearch}
            placeholder="Search by supplier name\u2026"
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
            {totalItems} purchase{totalItems !== 1 ? 's' : ''}
            {activeFilters > 0 && ' (filtered)'}
          </span>
          {activeFilters > 0 && (
            <button
              onClick={() => { setSearch(''); setStatus(''); setDateFrom(''); setDateTo('') }}
              style={{
                background: 'none', border: 'none', cursor: 'pointer',
                display: 'inline-flex', alignItems: 'center', gap: 4,
                fontSize: 12, color: 'var(--accent-600)', fontWeight: 600,
                padding: '2px 6px',
              }}
            >
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <line x1="18" y1="6" x2="6" y2="18" />
                <line x1="6" y1="6" x2="18" y2="18" />
              </svg>
              Clear filters
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
      {isError && !bannerDismissed && (
        <div role="alert" style={{
          display: 'flex', alignItems: 'center', gap: 10,
          background: 'var(--danger-bg)', border: '1px solid var(--danger-border)',
          borderRadius: 12, padding: '12px 16px', color: 'var(--danger-text)',
          fontSize: 13, marginBottom: 24, fontWeight: 500,
        }}>
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0 }} aria-hidden="true">
            <circle cx="12" cy="12" r="10" />
            <line x1="12" y1="8" x2="12" y2="12" />
            <line x1="12" y1="16" x2="12.01" y2="16" />
          </svg>
          Could not load purchases. Check that the backend is running and refresh.
          <button type="button" onClick={() => setBannerDismissed(true)} style={{ marginLeft: 'auto', background: 'none', border: 'none', color: 'var(--danger-text)', cursor: 'pointer', padding: 2, lineHeight: 1, flexShrink: 0 }} aria-label="Dismiss error">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" /></svg>
          </button>
        </div>
      )}

      {/* TABLE */}
      {isLoading ? (
        <BentoCard padding={false}>
          <SkeletonTable rows={8} columns={8} />
        </BentoCard>
      ) : purchases.length === 0 ? (
        <BentoCard>
          <EmptyState
            context="purchase"
            hasFilters={activeFilters > 0}
            title={activeFilters > 0 ? 'No results matching your filters' : 'Nothing here yet'}
            description={activeFilters > 0 ? "Try adjusting your search or filters to find what you're looking for." : 'No purchases yet.'}
            action={activeFilters > 0 ? (
              <Button variant="secondary" size="sm" onClick={() => { setSearch(''); setStatus(''); setDateFrom(''); setDateTo('') }}>
                Clear filters
              </Button>
            ) : undefined}
          />
        </BentoCard>
      ) : (
        <BentoCard padding={false}>
          <div className="premium-table-wrap">
            <Table
              columns={columns}
              rows={purchases}
              rowKey="pur_id"
              loading={isLoading}
              sortKey={sortKey}
              sortDir={sortDir}
              onSort={handleSort}
              onRowClick={(row) => setSelectedPurId(row.pur_id)}
              selectedIndex={selectedIndex}
              onSelectedIndexChange={setSelectedIndex}
            />
          </div>
        </BentoCard>
      )}

      {/* PAGINATION */}
      <Pagination
        pagination={{
          page,
          total_pages: totalPages,
          total: totalItems,
          has_next: page < totalPages,
          has_prev: page > 1,
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
            onDelete={handleDeleteClick}
          />
        </>
      )}

      {/* DELETE CONFIRMATION */}
      <ConfirmDialog
        open={showDelete}
        onClose={handleCloseDelete}
        onConfirm={onConfirmDelete}
        title={'Delete Purchase?'}
        message={'This action cannot be undone. The purchase record will be soft-deleted and will no longer appear in reports.'}
        confirmText={isDeleting ? 'Deleting...' : 'Yes, Delete Purchase'}
        loading={isDeleting}
      >
        <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, color: 'var(--text-secondary)', cursor: 'pointer', userSelect: 'none', padding: '4px 0' }}>
          <input type="checkbox" checked={reduceStock} onChange={(e) => setReduceStock(e.target.checked)} style={{ accentColor: 'var(--accent-600)', cursor: 'pointer' }} />
          Reduce product stock
        </label>
      </ConfirmDialog>
    </>
  )
}
