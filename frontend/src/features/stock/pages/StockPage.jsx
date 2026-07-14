// src/features/stock/pages/StockPage.jsx
//
// /stock — Stock Management Hub (permission: stock.view)
//
// Three tabs — data only fetched when the tab is first opened (lazy):
//   1. Current Stock  → GET /stock/current   (existing functionality + Adjust action)
//   2. Stock Movements → GET /stock/movements (new)
//   3. Low Stock Alerts → GET /stock/alerts   (new)
//
// Adjust Stock modal: POST /stock/adjust (gated by stock.adjust permission).

import React, { useState, useCallback, useMemo } from 'react'
import { useQuery } from '@tanstack/react-query'

import {
  Table,
  Badge,
  Button,
  EmptyState,
  Pagination,
  SearchBar,
  ExportButton,
  DateRangeFilter,
  MetricCard,
  BentoCard,
  TabBar,
  selectStyle,
} from '../../../shared/components'

import { STOCK_CSV_COLUMNS, STOCK_CSV_COLUMNS_NO_PROFIT } from '../../../shared/utils/csvExport'
import { usePermissions }  from '../../../shared/hooks/usePermissions'
import { formatDate }      from '../../../shared/utils/formatDate'
import { formatCurrency }  from '../../../shared/utils/formatCurrency'
import useAuthStore        from '../../../store/authStore'
import { fetchCategories } from '../../categories/api/categoriesApi'
import { fetchStockSummary } from '../api/stockApi'
import { useStock, useStockMovements, useStockAlerts } from '../hooks/useStock'
import AdjustStockModal from '../components/AdjustStockModal'
import { useStockAlertRead } from '../hooks/useStock'

// ── Static SVG icons (hoisted to module scope) ──────────────────────────────────
// Why: Inline JSX SVGs are re-created as new element trees on every render.
// Hoisting them here creates a single stable reference, eliminating unnecessary
// DOM reconciliation and GC pressure across this heavy page.
// Note: No icons were skipped — all 12 are fully static (zero dynamic content).
const PackageIconSm = (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z" />
    <polyline points="3.27 6.96 12 12.01 20.73 6.96" />
    <line x1="12" y1="22.08" x2="12" y2="12" />
  </svg>
)

const DollarIcon = (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <line x1="12" y1="1" x2="12" y2="23" />
    <path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6" />
  </svg>
)

const WarningTriangleLg = (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
    <line x1="12" y1="9" x2="12" y2="13" />
    <line x1="12" y1="17" x2="12.01" y2="17" />
  </svg>
)

const XCircleIcon = (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <circle cx="12" cy="12" r="10" />
    <line x1="15" y1="9" x2="9" y2="15" />
    <line x1="9" y1="9" x2="15" y2="15" />
  </svg>
)

const CloseIcon = (
  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <line x1="18" y1="6" x2="6" y2="18" />
    <line x1="6" y1="6" x2="18" y2="18" />
  </svg>
)

const WarningTriangleSm = (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0 }} aria-hidden="true">
    <path d="M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
    <line x1="12" y1="9" x2="12" y2="13" />
    <line x1="12" y1="17" x2="12.01" y2="17" />
  </svg>
)

const SearchIcon = (
  <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <circle cx="11" cy="11" r="8" />
    <line x1="21" y1="21" x2="16.65" y2="16.65" />
  </svg>
)

const PackageIconLg = (
  <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z" />
  </svg>
)

const DocumentIcon = (
  <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
    <polyline points="14 2 14 8 20 8" />
    <line x1="16" y1="13" x2="8" y2="13" />
    <line x1="16" y1="17" x2="8" y2="17" />
    <polyline points="10 9 9 9 8 9" />
  </svg>
)

const RefreshIcon = (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <polyline points="23 4 23 10 17 10" />
    <polyline points="1 20 1 14 7 14" />
    <path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15" />
  </svg>
)

const InfoIcon = (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0 }} aria-hidden="true">
    <circle cx="12" cy="12" r="10" />
    <line x1="12" y1="16" x2="12" y2="12" />
    <line x1="12" y1="8" x2="12.01" y2="8" />
  </svg>
)

const CheckCircleIcon = (
  <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" />
    <polyline points="22 4 12 14.01 9 11.01" />
  </svg>
)

// ── Helper: resolve display label for the reference column ────────────────────
function getReferenceLabel(row) {
  if (row.sale_invoice_no)       return row.sale_invoice_no
  if (row.purchase_reference_no) return row.purchase_reference_no.slice(0, 8) + '…'
  if (row.reference_type === 'adjusted_by' && row.reference_id) return `Adjusted by ${row.reference_id}`
  return '—'
}

function getReferenceRaw(v, row) {
  if (row.sale_invoice_no)       return row.sale_invoice_no
  if (row.purchase_reference_no) return row.purchase_reference_no
  if (row.reference_type === 'adjusted_by' && row.reference_id) return `Adjusted by ${row.reference_id}`
  return ''
}

// ── Movement CSV columns ──────────────────────────────────────────────────────
const MOVEMENTS_CSV_COLUMNS = [
  { key: 'prod_name',           label: 'Product' },
  { key: 'move_type',           label: 'Movement Type' },
  { key: 'reference_display',   label: 'Reference Invoice', format: getReferenceRaw },
  { key: 'move_qty',            label: 'Qty Change' },
  { key: 'move_prev_stock',     label: 'Before' },
  { key: 'move_new_stock',      label: 'After' },
  { key: 'move_notes',          label: 'Reason', format: v => v ?? '' },
  { key: 'move_created_at',     label: 'Date & Time', format: v => v ?? '' },
]

// ── Tab bar ────────────────────────────────────────────────────────────────────
const TABS = [
  { key: 'current',   label: 'Current Stock' },
  { key: 'movements', label: 'Stock Movements' },
  { key: 'alerts',    label: 'Low Stock Alerts' },
]

// ── Category dropdown (shared by Current Stock tab) ───────────────────────────
function useCategoryOptions() {
  const { data } = useQuery({
    queryKey: ['categories', 'list', 1],
    queryFn:  () => fetchCategories({ page: 1, limit: 100 }),
    staleTime: 60_000,
  })
  return data?.items ?? []
}

// ── Currency formatter ─────────────────────────────────────────────────────────
// Removed: local fmt() with hardcoded 'en-IN'. Now uses formatCurrency() which
// reads the business's country code and formats correctly for any locale.

// ── Stock status badge ─────────────────────────────────────────────────────────
function StockStatusBadge({ status }) {
  if (status === 'out_of_stock') return <Badge variant="danger"  label="Out of Stock" dot />
  if (status === 'low_stock')    return <Badge variant="warning" label="Low Stock"    dot />
  return <Badge variant="success" label="In Stock" dot />
}

// ── Movement type badge ────────────────────────────────────────────────────────
function MoveTypeBadge({ type }) {
  const map = {
    sale:              { variant: 'danger',  label: 'Sale'           },
    purchase:          { variant: 'success', label: 'Purchase'       },
    adjustment:        { variant: 'info',    label: 'Adjustment'     },
    stock_override:    { variant: 'warning', label: 'Stock Override' },
    return:            { variant: 'warning', label: 'Return'         },
    sales_return:      { variant: 'warning', label: 'Sales Return'   },
    purchase_return:   { variant: 'warning', label: 'Purchase Return'},
  }
  const cfg = map[type] ?? { variant: 'neutral', label: type }
  return <Badge variant={cfg.variant} label={cfg.label} dot />
}

// ── Alert urgency badge ────────────────────────────────────────────────────────
function AlertBadge({ stockQty }) {
  if (stockQty === 0) return <Badge variant="danger" label="Out of Stock" dot />
  return <Badge variant="warning" label="Low Stock" dot />
}

// ═══════════════════════════════════════════════════════════════════════════════
// TAB 1 — Current Stock
// ═══════════════════════════════════════════════════════════════════════════════
function CurrentStockTab({ canViewProfit, canAdjust }) {
  const categories  = useCategoryOptions()
  const business    = useAuthStore(s => s.business)
  const countryCode = business?.business_country_code
  const [adjustTarget, setAdjustTarget] = useState(null)

  const {
    stock, pagination, totalItems, isLoading, isError,
    search, setSearch,
    categoryId, setCategoryId,
    status,     setStatus,
    isActive,   setIsActive,
    sortKey, sortDir, handleSort,
    page, setPage,
    handleExport,
  } = useStock()

  const csvColumns    = canViewProfit ? STOCK_CSV_COLUMNS : STOCK_CSV_COLUMNS_NO_PROFIT
  const activeFilters = Boolean(search.trim() || categoryId || status || isActive)

  const handleAdjustClick = useCallback((row) => setAdjustTarget(row), [])
  const closeAdjust       = useCallback(() => setAdjustTarget(null), [])

  const { data: stockSummary } = useQuery({
    queryKey: ['stock-summary'],
    queryFn: fetchStockSummary,
    staleTime: 60_000,
  })

  const stockValue = stockSummary?.stock_value
  const lowStockCount    = stockSummary?.low_stock_count ?? 0
  const outOfStockCount  = stockSummary?.out_of_stock_count ?? 0

  const columns = useMemo(() => [
    {
      key:      'prod_name',
      label:    'Product',
      sortable: true,
      render: (row) => (
        <div>
          <div style={{ fontWeight: 600, color: 'var(--text-primary)', fontSize: 13 }}>
            {row.prod_name}
          </div>
          {row.barcode && (
            <div style={{ fontSize: 11.5, color: 'var(--text-muted)', marginTop: 2 }}>
              Barcode: {row.barcode}
            </div>
          )}
        </div>
      ),
    },
    {
      key:      'category_name',
      label:    'Category',
      sortable: true,
      width:    130,
      render: (row) => (
        row.category_name
          ? <Badge variant="neutral" label={row.category_name} />
          : <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>—</span>
      ),
    },
    {
      key:      'unit',
      label:    'Unit',
      sortable: true,
      width:    80,
      render: (row) => (
        <span style={{ fontSize: 13, color: 'var(--text-muted)' }}>
          {row.unit ?? 'pcs'}
        </span>
      ),
    },
    {
      key:      'prod_stock_qty',
      label:    'Current Stock',
      sortable: true,
      width:    110,
      render: (row) => (
        <span style={{ fontWeight: 600, fontSize: 13, color: 'var(--text-primary)' }}>
          {row.prod_stock_qty}
        </span>
      ),
    },
    {
      key:      'prod_low_stock_alert',
      label:    'Reorder Level',
      sortable: true,
      width:    110,
      render: (row) => (
        <span style={{ fontSize: 13, color: 'var(--text-secondary)' }}>
          {row.prod_low_stock_alert}
        </span>
      ),
    },
    {
      key:      'prod_sell_price',
      label:    'Selling Price',
      sortable: true,
      width:    110,
      render: (row) => (
        <span style={{ fontSize: 13, color: 'var(--text-secondary)' }}>
          {formatCurrency(row.prod_sell_price, countryCode)}
        </span>
      ),
    },
    ...(canViewProfit
      ? [
          {
            key:      'prod_cost_price',
            label:    'Cost Price',
            sortable: true,
            width:    110,
            render: (row) => (
              row.prod_cost_price != null
                ? <span style={{ fontSize: 13, color: 'var(--text-secondary)' }}>{formatCurrency(row.prod_cost_price, countryCode)}</span>
                : <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>—</span>
            ),
          },
          {
            key:      'stock_value',
            label:    'Stock Value',
            sortable: true,
            width:    120,
            render: (row) => (
              row.stock_value != null
                ? <span style={{ fontWeight: 600, fontSize: 13, color: 'var(--text-primary)' }}>{formatCurrency(row.stock_value, countryCode)}</span>
                : <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>—</span>
            ),
          },
        ]
      : []),
    {
      key:      'stock_status',
      label:    'Status',
      sortable: false,
      width:    120,
      render: (row) => <StockStatusBadge status={row.stock_status} />,
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
    // Adjust Stock action column — only rendered when user has stock.adjust permission
    ...(canAdjust
      ? [{
          key:      '_adjust',
          label:    '',
          sortable: false,
          width:    110,
          render: (row) => (
            <Button
              variant="ghost"
              size="sm"
              onClick={e => { e.stopPropagation(); handleAdjustClick(row) }}
              style={{ fontSize: 12, padding: '5px 10px' }}
            >
              Adjust Stock
            </Button>
          ),
        }]
      : []),
  ], [canViewProfit, canAdjust, handleAdjustClick, countryCode])

  return (
    <>
      {/* PAGE HEADER */}
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        marginBottom: 24, flexWrap: 'wrap', gap: 12,
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <h1 style={{ fontSize: 28, fontWeight: 700, color: 'var(--text-primary)', letterSpacing: '-0.03em', margin: 0 }}>
            Stock
          </h1>
          <p style={{ fontSize: 13, color: 'var(--text-secondary)', margin: '4px 0 0 0' }}>
            Inventory overview and stock management
          </p>
        </div>
        <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
          <ExportButton onFetch={handleExport} filename="stock" columns={csvColumns} />
        </div>
      </div>

      {/* METRIC CARDS */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(12, 1fr)',
        gap: 16,
        marginBottom: 24,
      }}>
        <MetricCard
          colSpan={3}
          loading={isLoading}
          icon={PackageIconSm}
          label="Total Products"
          value={totalItems}
        />
        <MetricCard
          colSpan={3}
          loading={isLoading}
          icon={DollarIcon}
          label="Stock Value"
          value={stockValue != null ? formatCurrency(stockValue, countryCode) : '\u2014'}
        />
        <MetricCard
          colSpan={3}
          loading={isLoading}
          icon={WarningTriangleLg}
          label="Low Stock"
          value={lowStockCount}
        />
        <MetricCard
          colSpan={3}
          loading={isLoading}
          icon={XCircleIcon}
          label="Out of Stock"
          value={outOfStockCount}
        />
      </div>

      {/* Toolbar */}
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        marginBottom: 20, gap: 12, flexWrap: 'wrap',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
          <SearchBar
            value={search}
            onChange={setSearch}
            onSearch={setSearch}
            placeholder="Search by product name or barcode…"
            width="290px"
          />
          <span style={{ fontSize: 13, color: 'var(--text-muted)', fontWeight: 500 }}>
            {totalItems} product{totalItems !== 1 ? 's' : ''}
            {activeFilters && ' (filtered)'}
          </span>
          {activeFilters && (
            <button
              onClick={() => { setSearch(''); setCategoryId(''); setStatus(''); setIsActive('') }}
              style={{
                background: 'none', border: 'none', cursor: 'pointer',
                fontSize: 12, color: 'var(--accent-600)', fontWeight: 600,
                padding: '2px 6px', display: 'inline-flex', alignItems: 'center', gap: 4,
              }}
            >
              {CloseIcon}
              Clear filters
            </button>
          )}
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
          <select
            value={categoryId}
            onChange={e => setCategoryId(e.target.value)}
            style={{ ...selectStyle, width: 'auto', padding: '9px 32px 9px 14px', fontSize: 13 }}
            aria-label="Filter by category"
          >
            <option value="">All Categories</option>
            {categories.map(c => (
              <option key={c.category_id} value={c.category_id}>{c.category_name}</option>
            ))}
          </select>

          <select
            value={status}
            onChange={e => setStatus(e.target.value)}
            style={{ ...selectStyle, width: 'auto', padding: '9px 32px 9px 14px', fontSize: 13 }}
            aria-label="Filter by stock status"
          >
            <option value="">All Stock Status</option>
            <option value="in_stock">In Stock</option>
            <option value="low_stock">Low Stock</option>
            <option value="out_of_stock">Out of Stock</option>
          </select>

          <select
            value={isActive}
            onChange={e => setIsActive(e.target.value)}
            style={{ ...selectStyle, width: 'auto', padding: '9px 32px 9px 14px', fontSize: 13 }}
            aria-label="Filter by active status"
          >
            <option value="">Active &amp; Inactive</option>
            <option value="true">Active Only</option>
            <option value="false">Inactive Only</option>
          </select>
        </div>
      </div>

      {isError && (
        <div style={{
          background: 'var(--danger-bg)', border: '1px solid var(--danger-border)',
          borderRadius: 12, padding: '12px 16px', color: 'var(--danger-text)',
          fontSize: 13, marginBottom: 24, fontWeight: 500,
          display: 'flex', alignItems: 'center', gap: 8,
        }}>
          {WarningTriangleSm}
          Could not load stock data. Check that the backend is running and refresh.
        </div>
      )}

      {!isLoading && stock.length === 0 ? (
        <BentoCard>
          <EmptyState
            icon={activeFilters ? SearchIcon : PackageIconLg}
            title={activeFilters ? 'No results matching your filters' : 'Nothing here yet'}
            description={activeFilters ? 'Try adjusting your search or filters to find what you\'re looking for.' : 'Add products to start tracking stock.'}
            action={activeFilters ? (
              <Button variant="secondary" size="sm" onClick={() => { setSearch(''); setCategoryId(''); setStatus(''); setIsActive('') }}>
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
              rows={stock}
              loading={isLoading}
              rowKey="prod_id"
              sortKey={sortKey}
              sortDir={sortDir}
              onSort={handleSort}
            />
          </div>
        </BentoCard>
      )}

      <Pagination pagination={pagination} onPageChange={setPage} />

      {/* Adjust Stock modal — only mounts when canAdjust */}
      {canAdjust && (
        <AdjustStockModal
          open={!!adjustTarget}
          onClose={closeAdjust}
          product={adjustTarget}
        />
      )}
    </>
  )
}

// ═══════════════════════════════════════════════════════════════════════════════
// TAB 2 — Stock Movements
// ═══════════════════════════════════════════════════════════════════════════════
function StockMovementsTab({ active }) {
  const {
    movements, pagination, totalItems, isLoading, isError,
    search,   setSearch,
    moveType, setMoveType,
    dateFrom, setDateFrom,
    dateTo,   setDateTo,
    sortKey, sortDir, handleSort,
    page, setPage,
    handleExport,
  } = useStockMovements({ active })

  const activeFilters = Boolean(search.trim() || moveType || dateFrom || dateTo)

  function handleDateChange(field, val) {
    if (field === 'from') setDateFrom(val)
    else setDateTo(val)
  }

  const columns = useMemo(() => [
    {
      key:      'prod_name',
      label:    'Product',
      sortable: true,
      render: (row) => (
        <span style={{ fontWeight: 600, fontSize: 13, color: 'var(--text-primary)' }}>
          {row.prod_name ?? <span style={{ color: 'var(--text-muted)', fontStyle: 'italic' }}>Unknown</span>}
        </span>
      ),
    },
    {
      key:      'move_type',
      label:    'Type',
      sortable: true,
      width:    120,
      render: (row) => <MoveTypeBadge type={row.move_type} />,
    },
    {
      key:      'reference_display',
      label:    'Reference',
      sortable: false,
      width:    140,
      render: (row) => (
        <span style={{ fontSize: 13, color: 'var(--text-secondary)', fontFamily: 'monospace' }}>
          {getReferenceLabel(row)}
        </span>
      ),
    },
    {
      key:      'move_qty',
      label:    'Qty Change',
      sortable: true,
      width:    100,
      render: (row) => {
        const qty = row.move_qty
        const positive = qty > 0
        return (
          <span style={{
            fontWeight: 700,
            fontSize: 13,
            color: positive ? 'var(--success-text, #16A34A)' : 'var(--danger-text, #DC2626)',
          }}>
            {positive ? `+${qty}` : qty}
          </span>
        )
      },
    },
    {
      key:      'move_prev_stock',
      label:    'Before → After',
      sortable: false,
      width:    130,
      render: (row) => (
        <span style={{ fontSize: 13, color: 'var(--text-secondary)', fontVariantNumeric: 'tabular-nums' }}>
          {row.move_prev_stock} → {row.move_new_stock ?? '—'}
        </span>
      ),
    },
    {
      key:      'move_notes',
      label:    'Reason',
      sortable: false,
      render: (row) => (
        <span style={{ fontSize: 13, color: 'var(--text-muted)' }}>
          {row.move_notes ?? '—'}
        </span>
      ),
    },
    {
      key:      'move_created_at',
      label:    'Date & Time',
      sortable: true,
      width:    130,
      render: (row) => (
        <span style={{ fontSize: 13, color: 'var(--text-muted)' }}>
          {row.move_created_at ? formatDate(row.move_created_at) : '—'}
        </span>
      ),
    },
  ], [])

  return (
    <>
      {/* Toolbar */}
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        marginBottom: 20, gap: 12, flexWrap: 'wrap',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
          <SearchBar
            value={search}
            onChange={setSearch}
            onSearch={setSearch}
            placeholder="Search by product name…"
            width="260px"
          />
          <select
            value={moveType}
            onChange={e => setMoveType(e.target.value)}
            style={{ ...selectStyle, width: 'auto', padding: '9px 32px 9px 14px', fontSize: 13 }}
            aria-label="Filter by movement type"
          >
            <option value="">All Types</option>
            <option value="sale">Sale</option>
            <option value="purchase">Purchase</option>
            <option value="adjustment">Adjustment</option>
            <option value="stock_override">Stock Override</option>
            <option value="return">Return</option>
          </select>
          <span style={{ fontSize: 13, color: 'var(--text-muted)', fontWeight: 500 }}>
            {totalItems} movement{totalItems !== 1 ? 's' : ''}
            {activeFilters && ' (filtered)'}
          </span>
          {activeFilters && (
            <button
              onClick={() => { setSearch(''); setMoveType(''); setDateFrom(''); setDateTo('') }}
              style={{
                background: 'none', border: 'none', cursor: 'pointer',
                fontSize: 12, color: 'var(--accent-600)', fontWeight: 600,
                padding: '2px 6px', display: 'inline-flex', alignItems: 'center', gap: 4,
              }}
            >
              {CloseIcon}
              Clear filters
            </button>
          )}
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
          <DateRangeFilter
            label="Date"
            from={dateFrom}
            to={dateTo}
            onChange={handleDateChange}
          />
          <ExportButton
            onFetch={handleExport}
            filename="stock-movements"
            columns={MOVEMENTS_CSV_COLUMNS}
          />
        </div>
      </div>

      {isError && (
        <div style={{
          background: 'var(--danger-bg)', border: '1px solid var(--danger-border)',
          borderRadius: 12, padding: '12px 16px', color: 'var(--danger-text)',
          fontSize: 13, marginBottom: 24, fontWeight: 500,
          display: 'flex', alignItems: 'center', gap: 8,
        }}>
          {WarningTriangleSm}
          Could not load stock movements. Check that the backend is running and refresh.
        </div>
      )}

      {!isLoading && movements.length === 0 ? (
        <BentoCard>
          <EmptyState
            icon={activeFilters ? SearchIcon : DocumentIcon}
            title={activeFilters ? 'No results matching your filters' : 'Nothing here yet'}
            description={activeFilters ? 'Try adjusting your search or filters to find what you\'re looking for.' : 'No stock movements recorded yet.'}
            action={activeFilters ? (
              <Button variant="secondary" size="sm" onClick={() => { setSearch(''); setMoveType(''); setDateFrom(''); setDateTo('') }}>
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
              rows={movements}
              loading={isLoading}
              rowKey="move_id"
              sortKey={sortKey}
              sortDir={sortDir}
              onSort={handleSort}
            />
          </div>
        </BentoCard>
      )}

      <Pagination pagination={pagination} onPageChange={setPage} />
    </>
  )
}

// ═══════════════════════════════════════════════════════════════════════════════
// TAB 3 — Low Stock Alerts
// ═══════════════════════════════════════════════════════════════════════════════
function LowStockAlertsTab({ active }) {
  const {
    alerts, pagination, totalItems, isLoading, isError,
    page, setPage,
    refetch,
  } = useStockAlerts({ active })
  const { markRead, isMarkingRead } = useStockAlertRead()

  const handleAlertClick = useCallback((row) => {
    // Only mark as read if it is currently unread
    if (row.alert_status === 'unread') {
      markRead(row.alert_id)
    }
  }, [markRead])

  const columns = useMemo(() => [
    {
      key:      'prod_name',
      label:    'Product',
      sortable: false,
      render: (row) => (
        <div>
          <div style={{ fontWeight: 600, color: 'var(--text-primary)', fontSize: 13 }}>
            {row.prod_name ?? <span style={{ color: 'var(--text-muted)', fontStyle: 'italic' }}>Unknown</span>}
          </div>
          {row.barcode && (
            <div style={{ fontSize: 11.5, color: 'var(--text-muted)', marginTop: 2 }}>
              {row.barcode}
            </div>
          )}
        </div>
      ),
    },
    {
      key:      'alert_status',
      label:    'Urgency',
      sortable: false,
      width:    130,
      render: (row) => <AlertBadge stockQty={row.current_stock ?? row.alert_stock_qty} />,
    },
    {
      key:      'current_stock',
      label:    'Current Stock',
      sortable: false,
      width:    120,
      render: (row) => {
        const qty = row.current_stock ?? row.alert_stock_qty
        return (
          <span style={{
            fontWeight: 700,
            fontSize: 15,
            color: qty === 0
              ? 'var(--danger-text, #DC2626)'
              : 'var(--warning-text, #D97706)',
          }}>
            {qty}
          </span>
        )
      },
    },
    {
      key:      'alert_threshold',
      label:    'Reorder Level',
      sortable: false,
      width:    120,
      render: (row) => (
        <span style={{ fontSize: 13, color: 'var(--text-secondary)' }}>
          {row.alert_threshold}
        </span>
      ),
    },
    {
      key:      '_shortage',
      label:    'Shortage',
      sortable: false,
      width:    100,
      render: (row) => {
        const qty     = row.current_stock ?? row.alert_stock_qty
        const thresh  = row.alert_threshold
        const shortage = thresh - qty
        return (
          <span style={{
            fontWeight: 600, fontSize: 13,
            color: shortage > 0 ? 'var(--danger-text, #DC2626)' : 'var(--text-muted)',
          }}>
            {shortage > 0 ? `-${shortage}` : '0'}
          </span>
        )
      },
    },
    {
      key:      'alert_status',
      label:    'Alert Status',
      sortable: false,
      width:    110,
      render: (row) => (
        <Badge
          variant={row.alert_status === 'read' ? 'neutral' : 'warning'}
          label={row.alert_status === 'read' ? 'Read' : 'Unread'}
          dot
        />
      ),
    },
    {
      key:      'alert_created_at',
      label:    'Alert Date',
      sortable: false,
      width:    120,
      render: (row) => (
        <span style={{ fontSize: 13, color: 'var(--text-muted)' }}>
          {row.alert_created_at ? formatDate(row.alert_created_at) : '—'}
        </span>
      ),
    },
  ], [])

  return (
    <>
      {/* Toolbar */}
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        marginBottom: 20, gap: 12, flexWrap: 'wrap',
      }}>
        <span style={{ fontSize: 13, color: 'var(--text-muted)', fontWeight: 500 }}>
          {totalItems} alert{totalItems !== 1 ? 's' : ''} active
        </span>
        <Button
          variant="secondary"
          size="sm"
          onClick={() => refetch()}
          style={{ fontSize: 13, display: 'inline-flex', alignItems: 'center', gap: 6 }}
        >
          {RefreshIcon}
          Refresh
        </Button>
      </div>

      <div style={{
        display: 'flex', alignItems: 'center', gap: 8,
        background: 'color-mix(in srgb, var(--accent-500) 8%, transparent)',
        border: '1px solid color-mix(in srgb, var(--accent-500) 20%, transparent)',
        borderRadius: 'var(--r-md)',
        padding: '10px 14px',
        fontSize: 13,
        color: 'var(--accent-600)',
        marginBottom: 18,
        fontWeight: 500,
      }}>
        {InfoIcon}
        Alerts are generated automatically when product stock falls at or below its reorder level.
        Use <strong>Adjust Stock</strong> on the <strong>Current Stock</strong> tab to restock.
      </div>

      {isError && (
        <div style={{
          background: 'var(--danger-bg)', border: '1px solid var(--danger-border)',
          borderRadius: 12, padding: '12px 16px', color: 'var(--danger-text)',
          fontSize: 13, marginBottom: 24, fontWeight: 500,
          display: 'flex', alignItems: 'center', gap: 8,
        }}>
          {WarningTriangleSm}
          Could not load stock alerts. Check that the backend is running and refresh.
        </div>
      )}

      {!isLoading && alerts.length === 0 ? (
        <BentoCard>
          <EmptyState
            icon={CheckCircleIcon}
            title="All stocked up!"
            description="No low stock alerts — all products are well stocked!"
          />
        </BentoCard>
      ) : (
        <BentoCard padding={false} className="premium-table-wrap">
          <div className="premium-table" style={{ overflowX: 'auto', width: '100%' }}>
            <Table
              columns={columns}
              rows={alerts}
              loading={isLoading}
              rowKey="alert_id"
              sortKey={null}
              sortDir={null}
              onSort={null}
              onRowClick={handleAlertClick}
            />
          </div>
        </BentoCard>
      )}

      <Pagination pagination={pagination} onPageChange={setPage} />
    </>
  )
}

// ═══════════════════════════════════════════════════════════════════════════════
// MAIN PAGE
// ═══════════════════════════════════════════════════════════════════════════════
export default function StockPage() {
  const { can }        = usePermissions()
  const canViewProfit  = can('view_product_profit')
  const canAdjust      = can('stock.adjust')

  const [activeTab, setActiveTab] = useState('current')

  return (
    <>
      <div style={{ marginBottom: 24 }}>
        <h1 style={{ fontSize: 28, fontWeight: 700, color: 'var(--text-primary)', letterSpacing: '-0.03em', margin: 0 }}>
          Stock
        </h1>
        <p style={{ fontSize: 13, color: 'var(--text-secondary)', margin: '4px 0 0 0' }}>
          Monitor inventory levels, stock movements, and low stock alerts
        </p>
      </div>

      <TabBar tabs={TABS} activeTab={activeTab} onChange={setActiveTab} />

      {activeTab === 'current' && (
        <CurrentStockTab canViewProfit={canViewProfit} canAdjust={canAdjust} />
      )}

      {activeTab === 'movements' && (
        <StockMovementsTab active={activeTab === 'movements'} />
      )}

      {activeTab === 'alerts' && (
        <LowStockAlertsTab active={activeTab === 'alerts'} />
      )}
    </>
  )
}


