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
import { useNavigate } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'

import {
  Table,
  Badge,
  Button,
  PageHeader,
  Pagination,
  SearchBar,
  ExportButton,
  DateRangeFilter,
  selectStyle,
} from '../../../shared/components'

import { STOCK_CSV_COLUMNS, STOCK_CSV_COLUMNS_NO_PROFIT } from '../../../shared/utils/csvExport'
import { usePermissions } from '../../../shared/hooks/usePermissions'
import { formatDate }     from '../../../shared/utils/formatDate'
import { fetchCategories } from '../../categories/api/categoriesApi'
import { useStock, useStockMovements, useStockAlerts } from '../hooks/useStock'
import AdjustStockModal from '../components/AdjustStockModal'

// ── Movement CSV columns ──────────────────────────────────────────────────────
const MOVEMENTS_CSV_COLUMNS = [
  { key: 'prod_name',       label: 'Product' },
  { key: 'move_type',       label: 'Movement Type' },
  { key: 'move_qty',        label: 'Qty Change' },
  { key: 'move_prev_stock', label: 'Before' },
  { key: 'move_new_stock',  label: 'After' },
  { key: 'move_notes',      label: 'Reason', format: v => v ?? '' },
  { key: 'move_created_at', label: 'Date & Time', format: v => v ?? '' },
]

// ── Tab bar ────────────────────────────────────────────────────────────────────
const TABS = [
  { key: 'current',   label: 'Current Stock' },
  { key: 'movements', label: 'Stock Movements' },
  { key: 'alerts',    label: 'Low Stock Alerts' },
]

function TabBar({ active, onChange }) {
  return (
    <div style={{
      display: 'flex',
      alignItems: 'center',
      gap: 4,
      borderBottom: '2px solid var(--border)',
      marginBottom: 24,
    }}>
      {TABS.map(tab => {
        const isActive = tab.key === active
        return (
          <button
            key={tab.key}
            onClick={() => onChange(tab.key)}
            style={{
              background: 'none',
              border: 'none',
              borderBottom: isActive ? '2px solid var(--accent-600)' : '2px solid transparent',
              marginBottom: -2,
              padding: '10px 18px',
              fontSize: 13.5,
              fontWeight: isActive ? 700 : 500,
              color: isActive ? 'var(--accent-600)' : 'var(--text-muted)',
              cursor: 'pointer',
              transition: 'all 0.15s',
              fontFamily: 'var(--font-sans, "Plus Jakarta Sans", sans-serif)',
              whiteSpace: 'nowrap',
            }}
          >
            {tab.label}
          </button>
        )
      })}
    </div>
  )
}

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
function fmt(num) {
  if (num == null) return '—'
  return Number(num).toLocaleString('en-IN', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })
}

// ── Stock status badge ─────────────────────────────────────────────────────────
function StockStatusBadge({ status }) {
  if (status === 'out_of_stock') return <Badge variant="danger"  label="Out of Stock" dot />
  if (status === 'low_stock')    return <Badge variant="warning" label="Low Stock"    dot />
  return <Badge variant="success" label="In Stock" dot />
}

// ── Movement type badge ────────────────────────────────────────────────────────
function MoveTypeBadge({ type }) {
  const map = {
    sale:       { variant: 'danger',  label: 'Sale'       },
    purchase:   { variant: 'success', label: 'Purchase'   },
    adjustment: { variant: 'info',    label: 'Adjustment' },
    return:     { variant: 'warning', label: 'Return'     },
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
  const categories = useCategoryOptions()
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

  const columns = useMemo(() => [
    {
      key:      'prod_name',
      label:    'Product',
      sortable: true,
      render: (row) => (
        <div>
          <div style={{ fontWeight: 600, color: 'var(--text-primary)', fontSize: 13.5 }}>
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
        <span style={{ fontSize: 12.5, color: 'var(--text-muted)' }}>
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
        <span style={{ fontWeight: 600, fontSize: 13.5, color: 'var(--text-primary)' }}>
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
          ₹{fmt(row.prod_sell_price)}
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
                ? <span style={{ fontSize: 13, color: 'var(--text-secondary)' }}>₹{fmt(row.prod_cost_price)}</span>
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
                ? <span style={{ fontWeight: 600, fontSize: 13.5, color: 'var(--text-primary)' }}>₹{fmt(row.stock_value)}</span>
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
        <span style={{ fontSize: 12.5, color: 'var(--text-muted)' }}>
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
  ], [canViewProfit, canAdjust, handleAdjustClick])

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
            placeholder="Search by product name or barcode…"
            width="290px"
          />
          <span style={{ fontSize: 12.5, color: 'var(--text-muted)', fontWeight: 500 }}>
            {totalItems} product{totalItems !== 1 ? 's' : ''}
            {activeFilters && ' (filtered)'}
          </span>
          {activeFilters && (
            <button
              onClick={() => { setSearch(''); setCategoryId(''); setStatus(''); setIsActive('') }}
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

        <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
          <select
            value={categoryId}
            onChange={e => setCategoryId(e.target.value)}
            style={{ ...selectStyle, width: 'auto', padding: '9px 14px', fontSize: 13 }}
          >
            <option value="">All Categories</option>
            {categories.map(c => (
              <option key={c.category_id} value={c.category_id}>{c.category_name}</option>
            ))}
          </select>

          <select
            value={status}
            onChange={e => setStatus(e.target.value)}
            style={{ ...selectStyle, width: 'auto', padding: '9px 14px', fontSize: 13 }}
          >
            <option value="">All Stock Status</option>
            <option value="in_stock">In Stock</option>
            <option value="low_stock">Low Stock</option>
            <option value="out_of_stock">Out of Stock</option>
          </select>

          <select
            value={isActive}
            onChange={e => setIsActive(e.target.value)}
            style={{ ...selectStyle, width: 'auto', padding: '9px 14px', fontSize: 13 }}
          >
            <option value="">Active &amp; Inactive</option>
            <option value="true">Active Only</option>
            <option value="false">Inactive Only</option>
          </select>

          <ExportButton onFetch={handleExport} filename="stock" columns={csvColumns} />
        </div>
      </div>

      {isError && (
        <div style={{
          background: 'var(--danger-bg)', border: '1px solid var(--danger-border)',
          borderRadius: 12, padding: '13px 18px', color: 'var(--danger-text)',
          fontSize: 13.5, marginBottom: 24, fontWeight: 500,
        }}>
          ⚠️ Could not load stock data. Check that the backend is running and refresh.
        </div>
      )}

      <div style={{ overflowX: 'auto', width: '100%' }}>
        <Table
          columns={columns}
          rows={stock}
          loading={isLoading}
          rowKey="prod_id"
          sortKey={sortKey}
          sortDir={sortDir}
          onSort={handleSort}
          emptyText={
            activeFilters
              ? 'No products match your filters.'
              : 'No products yet. Add products to start tracking stock.'
          }
        />
      </div>

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
        <span style={{ fontWeight: 600, fontSize: 13.5, color: 'var(--text-primary)' }}>
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
            fontSize: 13.5,
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
        <span style={{ fontSize: 12.5, color: 'var(--text-muted)' }}>
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
        <span style={{ fontSize: 12.5, color: 'var(--text-muted)' }}>
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
            style={{ ...selectStyle, width: 'auto', padding: '9px 14px', fontSize: 13 }}
          >
            <option value="">All Types</option>
            <option value="sale">Sale</option>
            <option value="purchase">Purchase</option>
            <option value="adjustment">Adjustment</option>
            <option value="return">Return</option>
          </select>
          <span style={{ fontSize: 12.5, color: 'var(--text-muted)', fontWeight: 500 }}>
            {totalItems} movement{totalItems !== 1 ? 's' : ''}
            {activeFilters && ' (filtered)'}
          </span>
          {activeFilters && (
            <button
              onClick={() => { setSearch(''); setMoveType(''); setDateFrom(''); setDateTo('') }}
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
          borderRadius: 12, padding: '13px 18px', color: 'var(--danger-text)',
          fontSize: 13.5, marginBottom: 24, fontWeight: 500,
        }}>
          ⚠️ Could not load stock movements. Check that the backend is running and refresh.
        </div>
      )}

      <div style={{ overflowX: 'auto', width: '100%' }}>
        <Table
          columns={columns}
          rows={movements}
          loading={isLoading}
          rowKey="move_id"
          sortKey={sortKey}
          sortDir={sortDir}
          onSort={handleSort}
          emptyText={
            activeFilters
              ? 'No movements match your filters.'
              : 'No stock movements recorded yet.'
          }
        />
      </div>

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

  const columns = useMemo(() => [
    {
      key:      'prod_name',
      label:    'Product',
      sortable: false,
      render: (row) => (
        <div>
          <div style={{ fontWeight: 600, color: 'var(--text-primary)', fontSize: 13.5 }}>
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
      render: (row) => <AlertBadge stockQty={row.alert_stock_qty} />,
    },
    {
      key:      'alert_stock_qty',
      label:    'Current Stock',
      sortable: false,
      width:    120,
      render: (row) => (
        <span style={{
          fontWeight: 700,
          fontSize: 15,
          color: row.alert_stock_qty === 0
            ? 'var(--danger-text, #DC2626)'
            : 'var(--warning-text, #D97706)',
        }}>
          {row.alert_stock_qty}
        </span>
      ),
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
        const shortage = row.alert_threshold - row.alert_stock_qty
        return (
          <span style={{
            fontWeight: 600, fontSize: 13.5,
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
        <span style={{ fontSize: 12.5, color: 'var(--text-muted)' }}>
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
        <span style={{ fontSize: 12.5, color: 'var(--text-muted)', fontWeight: 500 }}>
          {totalItems} alert{totalItems !== 1 ? 's' : ''} active
        </span>
        <Button
          variant="secondary"
          size="sm"
          onClick={() => refetch()}
          style={{ fontSize: 12.5 }}
        >
          ↻ Refresh
        </Button>
      </div>

      {/* Info note */}
      <div style={{
        background: 'rgba(14,165,233,0.07)',
        border: '1px solid rgba(14,165,233,0.2)',
        borderRadius: 10,
        padding: '10px 14px',
        fontSize: 12.5,
        color: '#0284C7',
        marginBottom: 18,
        fontWeight: 500,
      }}>
        💡 Alerts are generated automatically when product stock falls at or below its reorder level.
        Use <strong>Adjust Stock</strong> on the <strong>Current Stock</strong> tab to restock.
      </div>

      {isError && (
        <div style={{
          background: 'var(--danger-bg)', border: '1px solid var(--danger-border)',
          borderRadius: 12, padding: '13px 18px', color: 'var(--danger-text)',
          fontSize: 13.5, marginBottom: 24, fontWeight: 500,
        }}>
          ⚠️ Could not load stock alerts. Check that the backend is running and refresh.
        </div>
      )}

      <div style={{ overflowX: 'auto', width: '100%' }}>
        <Table
          columns={columns}
          rows={alerts}
          loading={isLoading}
          rowKey="alert_id"
          sortKey={null}
          sortDir={null}
          onSort={null}
          emptyText="🎉 No low stock alerts — all products are well stocked!"
        />
      </div>

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
  const navigate       = useNavigate()

  const [activeTab, setActiveTab] = useState('current')

  return (
    <>
      <PageHeader
        title="Stock"
        subtitle="Track current inventory levels, movements, and reorder alerts"
        back
        onBack={() => navigate('/dashboard')}
      />

      <TabBar active={activeTab} onChange={setActiveTab} />

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