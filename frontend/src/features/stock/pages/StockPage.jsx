// src/features/stock/pages/StockPage.jsx
//
// /stock — Stock Listing page (permission: stock.view)
//
// Follows the STANDARD LIST PAGE PATTERN used across SmartBillr:
//   1. PageHeader: title, subtitle, back button, ExportButton in action slot
//   2. Toolbar: SearchBar + record count + filters (category, status, active)
//   3. Table: sortKey/sortDir/onSort from hook, server-paginated
//   4. Pagination: always shown on server-paginated pages
//
// Data source: GET /stock/current (backend/app/routers/stock.py)
//   - prod_stock_qty / prod_low_stock_alert come from the products table —
//     prod_stock_qty is kept accurate by the existing stock_movements
//     triggers (fn_sale_stock_movement, fn_purchase_stock_movement,
//     fn_sales_return_stock, manual adjustments via POST /stock/adjust).
//     This page does NOT recompute stock — it reads the same source of
//     truth used everywhere else (ProductsPage Stock column, Dashboard).
//   - stock_value = prod_stock_qty * prod_cost_price (computed server-side,
//     same formula as the existing inventory valuation logic).
//   - prod_cost_price / stock_value are gated by view_product_profit,
//     mirroring ProductsPage's canViewProfit pattern exactly.

import React from 'react'
import { useNavigate } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'

import {
  Table,
  Badge,
  PageHeader,
  Pagination,
  SearchBar,
  ExportButton,
  selectStyle,
} from '../../../shared/components'

import { STOCK_CSV_COLUMNS, STOCK_CSV_COLUMNS_NO_PROFIT } from '../../../shared/utils/csvExport'
import { usePermissions } from '../../../shared/hooks/usePermissions'
import { formatDate }     from '../../../shared/utils/formatDate'
import { fetchCategories } from '../../categories/api/categoriesApi'
import { useStock } from '../hooks/useStock'

// ── Category dropdown — same pattern as ProductsPage useCategoryOptions ───────
function useCategoryOptions() {
  const { data } = useQuery({
    queryKey: ['categories', 'list', 1],
    queryFn:  () => fetchCategories({ page: 1, limit: 100 }),
    staleTime: 60_000,
  })
  return data?.items ?? []
}

// ── Currency formatter — same as ProductsPage fmt() ───────────────────────────
function fmt(num) {
  if (num == null) return '—'
  return Number(num).toLocaleString('en-IN', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })
}

// ── Stock status badge — derived from existing product settings, no hardcoding ─
function StockStatusBadge({ status }) {
  if (status === 'out_of_stock') return <Badge variant="danger"  label="Out of Stock" dot />
  if (status === 'low_stock')    return <Badge variant="warning" label="Low Stock"    dot />
  return <Badge variant="success" label="In Stock" dot />
}

export default function StockPage() {
  const { can } = usePermissions()
  const canViewProfit = can('view_product_profit')
  const navigate = useNavigate()
  const categories = useCategoryOptions()

  const {
    stock,
    pagination,
    totalItems,
    isLoading,
    isError,

    search,     setSearch,
    categoryId, setCategoryId,
    status,     setStatus,
    isActive,   setIsActive,

    sortKey, sortDir, handleSort,
    page, setPage,

    handleExport,
  } = useStock()

  const csvColumns = canViewProfit ? STOCK_CSV_COLUMNS : STOCK_CSV_COLUMNS_NO_PROFIT

  const activeFilters = Boolean(search.trim() || categoryId || status || isActive)

  // ── Table columns ─────────────────────────────────────────────────────────
  const columns = [
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
      key:      'available_stock',
      label:    'Available Stock',
      sortable: false,
      width:    120,
      render: (row) => (
        <span style={{ fontSize: 13, color: 'var(--text-secondary)' }}>
          {row.available_stock}
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
  ]

  return (
    <>
      <PageHeader
        title="Stock"
        subtitle="Track current inventory levels, valuation, and reorder status"
        back
        onBack={() => navigate('/dashboard')}
        action={
          <ExportButton
            onFetch={handleExport}
            filename="stock"
            columns={csvColumns}
          />
        }
      />

      {/* Toolbar */}
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
            placeholder="Search by product name or barcode…"
            width="290px"
          />
          <span style={{ fontSize: 12.5, color: 'var(--text-muted)', fontWeight: 500 }}>
            {totalItems} product{totalItems !== 1 ? 's' : ''}
            {activeFilters && ' (filtered)'}
          </span>
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
    </>
  )
}