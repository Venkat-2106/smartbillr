// src/features/products/pages/ProductsPage.jsx
//
// VALIDATION CHANGES (2026-06-06):
//
// ── Feature 1: Cost Price vs Sale Price Confirmation ─────────────────────────
//   When prod_sell_price < prod_cost_price (and the user can see cost price),
//   we intercept the submit in handleCreate / handleUpdate, store the payload,
//   and open a "LossWarning" ConfirmDialog (variant="warning").
//   • Cancel  → closes the dialog, form stays open, user can adjust prices.
//   • Continue → actually fires the API call.
//   Staff who cannot see cost price (canViewProfit = false) are never shown the
//   dialog because their hidden cost-price field always defaults to 0.
//
// ── Feature 2: Duplicate Product Name Prevention ──────────────────────────────
//   The backend returns HTTP 400 { message: "A product with this name already
//   exists." } for duplicate names (case-insensitive, trimmed).
//   We catch that error in handleCreate / handleUpdate and set a per-modal
//   name-error state (addNameError / editNameError).
//   The error is rendered INSIDE the form's "Product Name" FormField — not just
//   a toast — so the user sees exactly which field needs fixing.
//   The error clears automatically the moment the user types a new character in
//   the Product Name input (via onInput on the Input element).
//   The modal's own name-error state is cleared when the modal closes.
//
// PREVIOUS CHANGES RETAINED:
//   ✅ FIX A — Tax Rate changed from dropdown to number textbox
//   ✅ FIX B — Back button wired up (← Back to Dashboard via useNavigate)
//   ✅ ExportButton with PRODUCT_CSV_COLUMNS in the PageHeader action slot
//   ✅ Profit permission gate (canViewProfit) for cost/profit columns + form
//   ✅ Zod .trim() on prod_name (trimmed before schema min/max check)

import { useState, useMemo } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { useQuery } from '@tanstack/react-query'
import { useNavigate } from 'react-router-dom'

import {
  Button,
  Table,
  Badge,
  Modal,
  ConfirmDialog,
  PageHeader,
  Pagination,
  FormField,
  Input,
  SearchBar,
  ExportButton,
  selectStyle,
} from '../../../shared/components'

import { PRODUCT_CSV_COLUMNS, PRODUCT_CSV_COLUMNS_NO_PROFIT } from '../../../shared/utils/csvExport'
import { usePermissions }       from '../../../shared/hooks/usePermissions'
import { formatDate }            from '../../../shared/utils/formatDate'
import { fetchCategories }       from '../../categories/api/categoriesApi'

import {
  useProducts,
  useCreateProduct,
  useUpdateProduct,
  useDeleteProduct,
} from '../hooks/useProducts'
import ProductDetailDrawer from '../components/ProductDetailDrawer'

// ── Unit options ───────────────────────────────────────────────────────────────
const UNITS = ['pcs', 'kg', 'g', 'litre', 'ml', 'box', 'pack', 'pair', 'set', 'dozen']

// ── Zod schema (create) ───────────────────────────────────────────────────────
// .trim() is first so whitespace-only names ("   ") fail the .min(1) check.
const createSchema = z.object({
  prod_name:            z.string().trim().min(1, 'Product name is required').max(100),
  prod_sell_price:      z.coerce.number({ invalid_type_error: 'Enter a valid price' }).min(0, 'Cannot be negative'),
  prod_cost_price:      z.coerce.number({ invalid_type_error: 'Enter a valid price' }).min(0, 'Cannot be negative'),
  prod_stock_qty:       z.coerce.number().int().min(0, 'Cannot be negative').default(0),
  prod_low_stock_alert: z.coerce.number().int().min(0, 'Cannot be negative').default(10),
  tax_rate:             z.coerce.number().min(0, 'Cannot be negative').max(100, 'Max 100%').default(0),
  tax_code:             z.string().max(50).optional().or(z.literal('')),
  barcode:              z.string().max(100).optional().or(z.literal('')),
  unit:                 z.string().default('pcs'),
  category_id:          z.string().optional().or(z.literal('')),
})

// ── Zod schema (edit — stock qty excluded) ────────────────────────────────────
const editSchema = z.object({
  prod_name:            z.string().trim().min(1, 'Product name is required').max(100),
  prod_sell_price:      z.coerce.number({ invalid_type_error: 'Enter a valid price' }).min(0, 'Cannot be negative'),
  prod_cost_price:      z.coerce.number({ invalid_type_error: 'Enter a valid price' }).min(0, 'Cannot be negative'),
  prod_low_stock_alert: z.coerce.number().int().min(0, 'Cannot be negative').default(10),
  tax_rate:             z.coerce.number().min(0, 'Cannot be negative').max(100, 'Max 100%').default(0),
  tax_code:             z.string().max(50).optional().or(z.literal('')),
  barcode:              z.string().max(100).optional().or(z.literal('')),
  unit:                 z.string().default('pcs'),
  category_id:          z.string().optional().or(z.literal('')),
})

// ── Category dropdown ─────────────────────────────────────────────────────────
function useCategoryOptions() {
  const { data } = useQuery({
    queryKey: ['categories', 'list', 1],
    queryFn:  () => fetchCategories({ page: 1, limit: 100 }),
    staleTime: 60_000,
  })
  return data?.items ?? []
}

// ── Date range filter bar ─────────────────────────────────────────────────────
// Note: This is the ProductsPage-local DateRangeFilter (intentional — see architecture notes).
function DateRangeFilter({ from, to, onChange }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
      <span style={{
        fontSize: 12, fontWeight: 600, color: 'var(--text-muted)',
        letterSpacing: '0.04em', textTransform: 'uppercase', whiteSpace: 'nowrap',
      }}>
        Last Updated
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

// ── Add Product Form ──────────────────────────────────────────────────────────
// Props:
//   nameError        — string | null  — server-side "name already exists" error
//   onNameErrorClear — () => void     — called on first keystroke in Name field
//                                       so the red error banner disappears
function AddProductForm({ onSubmit, onClose, isPending, categories, canViewProfit, nameError, onNameErrorClear }) {
  const { register, handleSubmit, formState: { errors } } = useForm({
    resolver: zodResolver(createSchema),
    defaultValues: {
      prod_stock_qty:       0,
      prod_low_stock_alert: 10,
      tax_rate:             0,
      unit:                 'pcs',
      prod_cost_price:      0,
    },
  })

  // Combine Zod client-side error with server-side name error.
  // Zod error takes priority (runs first). Server error shows only after a
  // successful Zod pass but a failed API call.
  const nameFieldError = errors.prod_name || (nameError ? { message: nameError } : undefined)

  return (
    <form onSubmit={handleSubmit(onSubmit)}>
      {/* ── Product Name — shows BOTH Zod errors and server duplicate errors ── */}
      <FormField label="Product Name" error={nameFieldError} required style={{ marginBottom: 16 }}>
        <Input
          placeholder="e.g. Basmati Rice 5kg"
          autoFocus
          {...register('prod_name')}
          onInput={() => { if (nameError) onNameErrorClear?.() }}
        />
      </FormField>

      <div style={{ display: 'grid', gridTemplateColumns: canViewProfit ? '1fr 1fr' : '1fr', gap: 12, marginBottom: 16 }}>
        <FormField label="Selling Price" error={errors.prod_sell_price} required>
          <Input type="number" step="0.01" placeholder="0.00" {...register('prod_sell_price')} />
        </FormField>
        {canViewProfit && (
          <FormField label="Cost Price" error={errors.prod_cost_price} required>
            <Input type="number" step="0.01" placeholder="0.00" {...register('prod_cost_price')} />
          </FormField>
        )}
        {!canViewProfit && (
          <input type="hidden" value={0} {...register('prod_cost_price')} />
        )}
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 16 }}>
        <FormField label="Opening Stock Qty" error={errors.prod_stock_qty}>
          <Input type="number" step="1" placeholder="0" {...register('prod_stock_qty')} />
        </FormField>
        <FormField label="Low Stock Alert" error={errors.prod_low_stock_alert} helper="Alert when stock falls below this">
          <Input type="number" step="1" placeholder="10" {...register('prod_low_stock_alert')} />
        </FormField>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 16 }}>
        <FormField label="Category" error={errors.category_id}>
          <select className="sb-select" {...register('category_id')} style={selectStyle}>
            <option value="">— No category —</option>
            {categories.map(c => (
              <option key={c.category_id} value={c.category_id}>{c.category_name}</option>
            ))}
          </select>
        </FormField>
        <FormField label="Unit" error={errors.unit}>
          <select className="sb-select" {...register('unit')} style={selectStyle}>
            {UNITS.map(u => <option key={u} value={u}>{u}</option>)}
          </select>
        </FormField>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 16 }}>
        <FormField label="Tax Rate (%)" error={errors.tax_rate} helper="e.g. 0, 5, 7.5, 10, 18, 20">
          <Input type="number" step="0.01" min="0" max="100" placeholder="e.g. 18" {...register('tax_rate')} />
        </FormField>
        <FormField label="Tax Code (HSN / SAC)" error={errors.tax_code} helper="Optional">
          <Input placeholder="e.g. 1006" {...register('tax_code')} />
        </FormField>
      </div>

      <FormField label="Barcode" error={errors.barcode} helper="Optional" style={{ marginBottom: 8 }}>
        <Input placeholder="e.g. 8901234567890" {...register('barcode')} />
      </FormField>

      <Modal.Footer>
        <Button variant="ghost" onClick={onClose} disabled={isPending}>Cancel</Button>
        <Button type="submit" variant="primary" loading={isPending}>Create Product</Button>
      </Modal.Footer>
    </form>
  )
}

// ── Edit Product Form ─────────────────────────────────────────────────────────
// Same nameError / onNameErrorClear pattern as AddProductForm.
function EditProductForm({ defaultValues, onSubmit, onClose, isPending, categories, canViewProfit, nameError, onNameErrorClear }) {
  const { register, handleSubmit, formState: { errors } } = useForm({
    resolver: zodResolver(editSchema),
    defaultValues,
  })

  const nameFieldError = errors.prod_name || (nameError ? { message: nameError } : undefined)

  return (
    <form onSubmit={handleSubmit(onSubmit)}>
      <div style={{
        background: 'var(--bg-page)',
        border: '1.5px solid var(--border)',
        borderRadius: 10,
        padding: '10px 14px',
        marginBottom: 16,
        fontSize: 12.5,
        color: 'var(--text-muted)',
        display: 'flex',
        alignItems: 'center',
        gap: 8,
      }}>
        <span>📦</span>
        <span>
          Current stock: <strong style={{ color: 'var(--text-primary)' }}>
            {defaultValues._stock_qty ?? '—'} {defaultValues.unit ?? 'pcs'}
          </strong>
          &nbsp;— to adjust stock, use the <strong>Stock</strong> page.
        </span>
      </div>

      <FormField label="Product Name" error={nameFieldError} required style={{ marginBottom: 16 }}>
        <Input
          placeholder="e.g. Basmati Rice 5kg"
          autoFocus
          {...register('prod_name')}
          onInput={() => { if (nameError) onNameErrorClear?.() }}
        />
      </FormField>

      <div style={{ display: 'grid', gridTemplateColumns: canViewProfit ? '1fr 1fr' : '1fr', gap: 12, marginBottom: 16 }}>
        <FormField label="Selling Price" error={errors.prod_sell_price} required>
          <Input type="number" step="0.01" placeholder="0.00" {...register('prod_sell_price')} />
        </FormField>
        {canViewProfit && (
          <FormField label="Cost Price" error={errors.prod_cost_price} required>
            <Input type="number" step="0.01" placeholder="0.00" {...register('prod_cost_price')} />
          </FormField>
        )}
        {!canViewProfit && (
          <input type="hidden" {...register('prod_cost_price')} />
        )}
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 16 }}>
        <FormField label="Low Stock Alert" error={errors.prod_low_stock_alert} helper="Alert when stock falls below this">
          <Input type="number" step="1" placeholder="10" {...register('prod_low_stock_alert')} />
        </FormField>
        <FormField label="Unit" error={errors.unit}>
          <select className="sb-select" {...register('unit')} style={selectStyle}>
            {UNITS.map(u => <option key={u} value={u}>{u}</option>)}
          </select>
        </FormField>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 16 }}>
        <FormField label="Category" error={errors.category_id}>
          <select className="sb-select" {...register('category_id')} style={selectStyle}>
            <option value="">— No category —</option>
            {categories.map(c => (
              <option key={c.category_id} value={c.category_id}>{c.category_name}</option>
            ))}
          </select>
        </FormField>
        <FormField label="Tax Rate (%)" error={errors.tax_rate} helper="e.g. 0, 5, 7.5, 10, 18, 20">
          <Input type="number" step="0.01" min="0" max="100" placeholder="e.g. 18" {...register('tax_rate')} />
        </FormField>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 8 }}>
        <FormField label="Tax Code (HSN / SAC)" error={errors.tax_code} helper="Optional">
          <Input placeholder="e.g. 1006" {...register('tax_code')} />
        </FormField>
        <FormField label="Barcode" error={errors.barcode} helper="Optional">
          <Input placeholder="e.g. 8901234567890" {...register('barcode')} />
        </FormField>
      </div>

      <Modal.Footer>
        <Button variant="ghost" onClick={onClose} disabled={isPending}>Cancel</Button>
        <Button type="submit" variant="primary" loading={isPending}>Save Changes</Button>
      </Modal.Footer>
    </form>
  )
}

// ── Currency formatter ─────────────────────────────────────────────────────────
function fmt(num) {
  if (num == null) return '—'
  return Number(num).toLocaleString('en-IN', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })
}

// ── Main Page ──────────────────────────────────────────────────────────────────
export default function ProductsPage() {
  const { can }   = usePermissions()
  const canManage = can('products.edit')
  const canViewProfit = can('view_product_profit')

  const categories = useCategoryOptions()
  const navigate = useNavigate()

  const {
    products,
    allProducts,
    pagination,
    page,
    setPage,
    search,
    setSearch,
    isLoading,
    isError,
  } = useProducts()

  const [sortKey, setSortKey] = useState(null)
  const [sortDir, setSortDir] = useState('asc')

  function handleSort(key) {
    if (sortKey === key) {
      setSortDir(d => d === 'asc' ? 'desc' : 'asc')
    } else {
      setSortKey(key)
      setSortDir('asc')
    }
  }

  const [dateFrom, setDateFrom] = useState('')
  const [dateTo,   setDateTo]   = useState('')

  function handleDateChange(field, value) {
    if (field === 'from') setDateFrom(value)
    else                  setDateTo(value)
  }

  const displayRows = useMemo(() => {
    let rows = [...products]

    if (dateFrom) {
      const from = new Date(dateFrom)
      from.setHours(0, 0, 0, 0)
      rows = rows.filter(r => r.updated_at && new Date(r.updated_at) >= from)
    }
    if (dateTo) {
      const to = new Date(dateTo)
      to.setHours(23, 59, 59, 999)
      rows = rows.filter(r => r.updated_at && new Date(r.updated_at) <= to)
    }

    if (sortKey) {
      rows.sort((a, b) => {
        let valA = a[sortKey]
        let valB = b[sortKey]

        if (sortKey === 'updated_at') {
          valA = valA ? new Date(valA).getTime() : 0
          valB = valB ? new Date(valB).getTime() : 0
          return sortDir === 'asc' ? valA - valB : valB - valA
        }

        if (typeof valA === 'number' || !isNaN(Number(valA))) {
          valA = Number(valA ?? 0)
          valB = Number(valB ?? 0)
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
  }, [products, sortKey, sortDir, dateFrom, dateTo])

  const exportData = useMemo(() => {
    let rows = [...allProducts]
    const q = search.trim().toLowerCase()
    if (q) rows = rows.filter(p =>
      p.prod_name?.toLowerCase().includes(q) ||
      p.category_name?.toLowerCase().includes(q)
    )
    if (dateFrom) {
      const from = new Date(dateFrom); from.setHours(0, 0, 0, 0)
      rows = rows.filter(r => r.updated_at && new Date(r.updated_at) >= from)
    }
    if (dateTo) {
      const to = new Date(dateTo); to.setHours(23, 59, 59, 999)
      rows = rows.filter(r => r.updated_at && new Date(r.updated_at) <= to)
    }
    return rows
  }, [allProducts, search, dateFrom, dateTo])

  const { mutate: createProduct, isPending: isCreating } = useCreateProduct()
  const { mutate: updateProduct, isPending: isUpdating } = useUpdateProduct()
  const { mutate: deleteProduct, isPending: isDeleting } = useDeleteProduct()

  // ── Modal open/close state ────────────────────────────────────────────────
  const [showAdd,        setShowAdd]        = useState(false)
  const [editTarget,     setEditTarget]     = useState(null)
  const [deleteTarget,   setDeleteTarget]   = useState(null)
  const [detailProduct,  setDetailProduct]  = useState(null)

  // ── Feature 2: Duplicate name — per-modal error state ─────────────────────
  // These hold the "A product with this name already exists." message from
  // the server. They are separate for Add vs Edit so one modal's error doesn't
  // bleed into the other.
  const [addNameError,  setAddNameError]  = useState(null)
  const [editNameError, setEditNameError] = useState(null)

  // ── Feature 1: Loss-price confirmation state ──────────────────────────────
  // pendingPayload — the validated form data waiting for user confirmation
  // pendingAction  — 'create' | 'update' — which mutation to run on confirm
  const [lossConfirmOpen, setLossConfirmOpen] = useState(false)
  const [pendingPayload,  setPendingPayload]  = useState(null)
  const [pendingAction,   setPendingAction]   = useState(null)

  // ── Helper: normalise the raw form data into an API payload ──────────────
  function buildPayload(data) {
    return {
      ...data,
      tax_code:    data.tax_code    || null,
      barcode:     data.barcode     || null,
      category_id: data.category_id || null,
    }
  }

  // ── Helper: did the user enter sell < cost? ───────────────────────────────
  // Only fires when the user has the profit permission — staff submit with a
  // hidden cost-price of 0, so the check would always be false anyway, but we
  // gate it explicitly to be safe and clear.
  function isSellingAtLoss(payload) {
    if (!canViewProfit) return false
    const sell = parseFloat(payload.prod_sell_price)
    const cost = parseFloat(payload.prod_cost_price)
    return !isNaN(sell) && !isNaN(cost) && sell < cost
  }

  // ── Actual API calls (called after loss-check passes or user confirms) ────
  function doCreate(payload) {
    createProduct(payload, {
      onSuccess: () => {
        setShowAdd(false)
        setAddNameError(null)
      },
      onError: (err) => {
        const msg = err?.response?.data?.message || ''
        // If the backend says the name exists, surface it inside the form field.
        // The toast in useProducts.js also fires — that's fine as a fallback.
        if (msg.toLowerCase().includes('name already exists')) {
          setAddNameError(msg)
        }
      },
    })
  }

  function doUpdate(prodId, payload) {
    updateProduct(
      { id: prodId, payload },
      {
        onSuccess: () => {
          setEditTarget(null)
          setEditNameError(null)
        },
        onError: (err) => {
          const msg = err?.response?.data?.message || ''
          if (msg.toLowerCase().includes('name already exists')) {
            setEditNameError(msg)
          }
        },
      }
    )
  }

  // ── Form submit handlers ───────────────────────────────────────────────────
  function handleCreate(data) {
    const payload = buildPayload(data)

    // Feature 1: intercept if selling at a loss → show confirmation dialog
    if (isSellingAtLoss(payload)) {
      setPendingPayload(payload)
      setPendingAction('create')
      setLossConfirmOpen(true)
      return
    }

    doCreate(payload)
  }

  function handleUpdate(data) {
    const payload = buildPayload(data)

    if (isSellingAtLoss(payload)) {
      setPendingPayload(payload)
      setPendingAction('update')
      setLossConfirmOpen(true)
      return
    }

    doUpdate(editTarget.prod_id, payload)
  }

  function handleDelete() {
    deleteProduct(deleteTarget.prod_id, {
      onSuccess: () => setDeleteTarget(null),
    })
  }

  // ── Loss-price confirm: user clicked "Yes, Continue" ──────────────────────
  function handleLossConfirmed() {
    setLossConfirmOpen(false)
    if (pendingAction === 'create') {
      doCreate(pendingPayload)
    } else if (pendingAction === 'update') {
      doUpdate(editTarget.prod_id, pendingPayload)
    }
    setPendingPayload(null)
    setPendingAction(null)
  }

  // ── Loss-price confirm: user clicked "Cancel" ─────────────────────────────
  function handleLossCancelled() {
    setLossConfirmOpen(false)
    setPendingPayload(null)
    setPendingAction(null)
    // Modals remain open — user can correct prices and try again
  }

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
      key:      'prod_stock_qty',
      label:    'Stock',
      sortable: true,
      width:    90,
      render: (row) => {
        const isLow = row.prod_stock_qty <= row.prod_low_stock_alert
        return (
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <span style={{ fontWeight: 600, fontSize: 13.5, color: isLow ? '#EF4444' : 'var(--text-primary)' }}>
              {row.prod_stock_qty}
            </span>
            <span style={{ fontSize: 11.5, color: 'var(--text-muted)' }}>{row.unit ?? 'pcs'}</span>
            {isLow && <Badge variant="danger" label="Low" dot />}
          </div>
        )
      },
    },
    {
      key:      'prod_sell_price',
      label:    'Sell Price',
      sortable: true,
      width:    110,
      render: (row) => (
        <span style={{ fontWeight: 600, fontSize: 13.5, color: 'var(--text-primary)' }}>
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
                ? (
                  <span style={{ fontSize: 13, color: 'var(--text-secondary)' }}>
                    ₹{fmt(row.prod_cost_price)}
                  </span>
                )
                : <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>—</span>
            ),
          },
          {
            key:      'prod_profit',
            label:    'Profit',
            sortable: true,
            width:    100,
            render: (row) => {
              const profit = row.prod_profit
              if (profit == null) return <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>—</span>
              const isNeg  = Number(profit) < 0
              return (
                <span style={{ fontSize: 13, fontWeight: 600, color: isNeg ? '#EF4444' : '#10B981' }}>
                  {isNeg ? '−' : '+'}₹{fmt(Math.abs(profit))}
                </span>
              )
            },
          },
        ]
      : []),
    {
      key:      'tax_rate',
      label:    'Tax',
      sortable: true,
      width:    70,
      render: (row) => (
        <span style={{ fontSize: 12.5, color: 'var(--text-muted)' }}>
          {row.tax_rate ?? 0}%
        </span>
      ),
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
    {
      key:      'last_updated_by',
      label:    'Last Updated By',
      sortable: false,
      width:    140,
      render: (row) => (
        row.last_updated_by
          ? (
            <span style={{ fontSize: 12.5, color: 'var(--text-secondary)', fontWeight: 500 }}>
              {row.last_updated_by}
            </span>
          )
          : <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>—</span>
      ),
    },
    ...(canManage
      ? [{
          key:   'actions',
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

  const activeSearch     = search.trim().length > 0
  const activeDateFilter = dateFrom || dateTo

  const csvColumns = canViewProfit ? PRODUCT_CSV_COLUMNS : PRODUCT_CSV_COLUMNS_NO_PROFIT

  return (
    <>
      <PageHeader
        title="Products"
        subtitle="Manage your product catalogue, prices, and stock alerts"
        back
        onBack={() => navigate('/dashboard')}
        action={
          <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
            <ExportButton
              data={exportData}
              filename="products"
              columns={csvColumns}
            />
            {canManage && (
              <Button
                variant="primary"
                leftIcon={<span style={{ fontSize: 16, lineHeight: 1 }}>+</span>}
                onClick={() => setShowAdd(true)}
              >
                Add Product
              </Button>
            )}
          </div>
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
            placeholder="Search by product or category…"
            width="280px"
          />
          <span style={{ fontSize: 12.5, color: 'var(--text-muted)', fontWeight: 500 }}>
            {displayRows.length} product{displayRows.length !== 1 ? 's' : ''}
            {(activeSearch || activeDateFilter) && ' (filtered)'}
          </span>
        </div>
        <DateRangeFilter from={dateFrom} to={dateTo} onChange={handleDateChange} />
      </div>

      {isError && (
        <div style={{
          background: 'var(--danger-bg)', border: '1px solid var(--danger-border)',
          borderRadius: 12, padding: '13px 18px', color: 'var(--danger-text)',
          fontSize: 13.5, marginBottom: 24, fontWeight: 500,
        }}>
          ⚠️ Could not load products. Check that the backend is running and refresh.
        </div>
      )}

      <div style={{ overflowX: 'auto', width: '100%' }}>
        <Table
          columns={columns}
          rows={displayRows}
          loading={isLoading}
          rowKey="prod_id"
          onRowClick={(row) => setDetailProduct(row)}
          sortKey={sortKey}
          sortDir={sortDir}
          onSort={handleSort}
          emptyText={
            activeSearch
              ? 'No products match your search.'
              : activeDateFilter
                ? 'No products in the selected date range.'
                : 'No products yet. Add your first product to get started.'
          }
        />
      </div>

      {!activeSearch && !activeDateFilter && (
        <Pagination pagination={pagination} onPageChange={setPage} />
      )}

      {/* ── Add Product Modal ─────────────────────────────────────────────── */}
      <Modal
        open={showAdd}
        onClose={() => { setShowAdd(false); setAddNameError(null) }}
        title="Add Product"
        subtitle="Add a new product to your catalogue"
        size="lg"
      >
        <AddProductForm
          onSubmit={handleCreate}
          onClose={() => { setShowAdd(false); setAddNameError(null) }}
          isPending={isCreating}
          categories={categories}
          canViewProfit={canViewProfit}
          nameError={addNameError}
          onNameErrorClear={() => setAddNameError(null)}
        />
      </Modal>

      {/* ── Edit Product Modal ────────────────────────────────────────────── */}
      <Modal
        open={Boolean(editTarget)}
        onClose={() => { setEditTarget(null); setEditNameError(null) }}
        title="Edit Product"
        subtitle={editTarget?.prod_name}
        size="lg"
      >
        {editTarget && (
          <EditProductForm
            key={editTarget.prod_id}
            defaultValues={{
              prod_name:            editTarget.prod_name,
              prod_sell_price:      editTarget.prod_sell_price,
              prod_cost_price:      editTarget.prod_cost_price ?? 0,
              prod_low_stock_alert: editTarget.prod_low_stock_alert,
              tax_rate:             editTarget.tax_rate ?? 0,
              tax_code:             editTarget.tax_code  ?? '',
              barcode:              editTarget.barcode   ?? '',
              unit:                 editTarget.unit      ?? 'pcs',
              category_id:          editTarget.category_id ?? '',
              _stock_qty:           editTarget.prod_stock_qty,
            }}
            onSubmit={handleUpdate}
            onClose={() => { setEditTarget(null); setEditNameError(null) }}
            isPending={isUpdating}
            categories={categories}
            canViewProfit={canViewProfit}
            nameError={editNameError}
            onNameErrorClear={() => setEditNameError(null)}
          />
        )}
      </Modal>

      {/* ── Product detail drawer ─────────────────────────────────────────── */}
      {detailProduct && (
        <ProductDetailDrawer
          product={detailProduct}
          onClose={() => setDetailProduct(null)}
        />
      )}

      {/* ── Delete confirm ────────────────────────────────────────────────── */}
      <ConfirmDialog
        open={Boolean(deleteTarget)}
        onClose={() => setDeleteTarget(null)}
        onConfirm={handleDelete}
        title={`Delete "${deleteTarget?.prod_name}"?`}
        message="This will permanently deactivate the product. It will no longer appear in sales or purchases. This cannot be undone."
        confirmText="Yes, delete"
        loading={isDeleting}
      />

      {/* ── Feature 1: Loss-price confirmation dialog ────────────────────── */}
      {/*
          Opens when: prod_sell_price < prod_cost_price AND canViewProfit.
          variant="warning" → amber icon (⚠️) instead of the default red bin.
          Cancel  → closes dialog, both Add/Edit modals remain open so user
                    can correct the prices without losing their other inputs.
          Continue → fires the actual createProduct / updateProduct call.
      */}
      <ConfirmDialog
        open={lossConfirmOpen}
        onClose={handleLossCancelled}
        onConfirm={handleLossConfirmed}
        variant="warning"
        title="Selling Below Cost Price"
        message="The Sale Price is lower than the Cost Price. This product will be sold at a loss. Do you want to continue?"
        confirmText="Yes, Continue"
        cancelText="Cancel"
        loading={isCreating || isUpdating}
      />
    </>
  )
}