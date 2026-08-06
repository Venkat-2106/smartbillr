// src/features/products/pages/ProductsPage.jsx
//
// BARCODE CHANGES (2026-06-06):
//   - AddProductForm / EditProductForm: barcode field now has a "Generate" button
//   - Generate creates a 13-digit EAN-style barcode (12 random + check digit)
//   - onBlur fires checkBarcode() — shows inline duplicate error if barcode taken
//   - USB scanner support: handleBarcodeKeyDown/Up prevent form submission on Enter
//   - barcodeError + onBarcodeErrorClear props added (mirrors nameError pattern)
//   - doCreate/doUpdate catch "barcode already exists" and surface inline
//   - excludeProdId passed to EditProductForm for self-barcode check
//
// UI/UX AUDIT (2026-07-18):
//   Finding #1  — PageHeader replaces inline page title markup
//   Finding #6  — EmptyState with built-in context icon replaces inline SVG
//   Finding #11 — SkeletonTable shown during initial load (isInitialLoading)
//   Finding #12 — selectStyle applied to status filter select
//   Finding #14 — .bento-grid.bento-grid-12 for metric cards
//   Finding #15 — Dismissible error banner with role="alert"
//   See UI_UX_AUDIT_REPORT.md
//   No layout, column, modal, permission, or architecture changes.
//
// FIX (2026-07-18):
//   Stock Value MetricCard — changed locked={canViewProfit && isTierLocked} to
//   locked={isTierLocked} (canViewProfit from useFeatureAccess is false when
//   tier-locked, so the && always evaluated to false).
//   ImportButton endpoint: removed /v1 prefix (baseURL already contains it).
//
// VALIDATION CHANGES (2026-06-06):
//
// ── Feature 1: Cost Price vs Sale Price Confirmation ─────────────────────────
//   When prod_sell_price < prod_cost_price, we intercept the submit in
//   handleCreate / handleUpdate, store the payload, and open a "LossWarning"
//   ConfirmDialog (variant="warning").
//   • Cancel  → closes the dialog, form stays open, user can adjust prices.
//   • Continue → actually fires the API call.
//   Fires for every user who can create/edit products (admin + manager on any
//   plan) — it is intentionally NOT gated on the profit permission. Staff lack
//   products.edit, so they never reach this form/path.
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
//   ✅ Profit permission gate (canViewProfit) for cost/profit columns only
//      (Cost Price is always editable in the Add/Edit product forms)
//   ✅ Zod .trim() on prod_name (trimmed before schema min/max check)

import { useState, useMemo, useCallback, useEffect } from 'react'
import { useQuery } from '@tanstack/react-query'
import { useNavigate } from 'react-router-dom'

import {
  Button,
  Table,
  Badge,
  ConfirmDialog,
  UpgradePrompt,
  EmptyState,
  Pagination,
  SearchBar,
  ExportButton,
  BulkImportPanel,
  BulkImportGuidelines,
  MetricCard,
  BentoCard,
  PageHeader,
  SkeletonTable,
  LockedCell,
} from '../../../shared/components'

import { PRODUCT_CSV_COLUMNS, PRODUCT_CSV_COLUMNS_NO_PROFIT } from '../../../shared/utils/csvExport'
import { productImportConfig } from '../importConfig'
import { usePermissions }       from '../../../shared/hooks/usePermissions'
import { useFeatureAccess }     from '../../../shared/hooks/useFeatureAccess'
import { formatDate }           from '../../../shared/utils/formatDate'
import { formatCurrency }       from '../../../shared/utils/formatCurrency'
import useAuthStore             from '../../../store/authStore'
import useTableKeyboardNav      from '../../../shared/hooks/useTableKeyboardNav'
import { fetchCategories }      from '../../categories/api/categoriesApi'

import {
  useProducts,
  useCreateProduct,
  useUpdateProduct,
  useDeleteProduct,
} from '../hooks/useProducts'
import { fetchProductByBarcode, fetchProductSummary } from '../api/productsApi'
import ProductDetailDrawer from '../components/ProductDetailDrawer'
import AddProductModal from '../components/AddProductModal'
import EditProductModal from '../components/EditProductModal'

// ── Static SVG icons (hoisted to module scope) ──────────────────────────────────
// Why: Inline JSX SVGs are re-created as new element trees on every render.
// Hoisting them here creates a single stable reference, eliminating unnecessary
// DOM reconciliation and GC pressure across this heavy page.
// Note: BarcodeIcon (line ~204) is a pre-existing module-scope function component —
// it was not touched because it's already defined outside the page component.
const TrashIcon = (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <polyline points="3 6 5 6 21 6" />
    <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
  </svg>
)

const BoxIcon = (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M16.5 9.4 7.55 4.24" />
    <path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z" />
    <polyline points="3.29 7 12 12 20.71 7" />
    <line x1="12" y1="22" x2="12" y2="12" />
  </svg>
)

const TrendingUpIcon = (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <polyline points="23 6 13.5 15.5 8.5 10.5 1 18" />
    <polyline points="17 6 23 6 23 12" />
  </svg>
)

const AlertTriangleIcon = (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
    <line x1="12" y1="9" x2="12" y2="13" />
    <line x1="12" y1="17" x2="12.01" y2="17" />
  </svg>
)

const CircleXIcon = (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <circle cx="12" cy="12" r="10" />
    <line x1="15" y1="9" x2="9" y2="15" />
    <line x1="9" y1="9" x2="15" y2="15" />
  </svg>
)

const XIcon = (
  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <line x1="18" y1="6" x2="6" y2="18" />
    <line x1="6" y1="6" x2="18" y2="18" />
  </svg>
)

const ErrorAlertIcon = (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0 }} aria-hidden="true">
    <path d="M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
    <line x1="12" y1="9" x2="12" y2="13" />
    <line x1="12" y1="17" x2="12.01" y2="17" />
  </svg>
)

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
    </div>
  )
}

const dateInputStyle = {
  padding: '6px 10px',
  background: 'var(--bg-card)',
  border: '1.5px solid var(--border)',
  borderRadius: 8,
  fontSize: 13,
  color: 'var(--text-primary)',
  fontFamily: 'var(--font-sans)',
  outline: 'none',
  cursor: 'pointer',
}

// ── Currency formatter ─────────────────────────────────────────────────────────
// Removed: local fmt() with hardcoded 'en-IN'. Now uses formatCurrency() which
// reads the business's country code and formats correctly for any locale.


// ── Barcode scanner UI helpers ─────────────────────────────────────────────────
// Inline SVG barcode icon — no external icon library needed.
function BarcodeIcon() {
  return (
    <svg width="15" height="11" viewBox="0 0 15 11" fill="currentColor" aria-hidden="true">
      <rect x="0"    y="0" width="1.4" height="11" />
      <rect x="2.3"  y="0" width="0.9" height="11" />
      <rect x="4.1"  y="0" width="1.8" height="11" />
      <rect x="6.8"  y="0" width="0.7" height="11" />
      <rect x="8.4"  y="0" width="1.4" height="11" />
      <rect x="10.7" y="0" width="0.9" height="11" />
      <rect x="12.5" y="0" width="2.5" height="11" />
    </svg>
  )
}

// Small pill shown next to the SearchBar to tell the user that a USB barcode
// scanner can be pointed at the page and will work immediately.
// No click action — it is a hint, not a mode toggle.
function BarcodeHint() {
  return (
    <div
      title="Barcode scanner supported — scan any product barcode to find it instantly"
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 5,
        padding: '5px 10px',
        background: 'var(--bg-card)',
        border: '1.5px solid var(--border)',
        borderRadius: 8,
        fontSize: 11.5,
        fontWeight: 600,
        color: 'var(--text-muted)',
        userSelect: 'none',
        flexShrink: 0,
        letterSpacing: '0.01em',
      }}
    >
      <BarcodeIcon />
      <span>Scan</span>
    </div>
  )
}

// ── Main Page ──────────────────────────────────────────────────────────────────
export default function ProductsPage() {
  const { can }   = usePermissions()
  const { allowed: canViewProfit, reason: tierReason } = useFeatureAccess('product_profit_view')
  const canManage = can('products.edit')
  const business      = useAuthStore(s => s.business)
  const countryCode   = business?.business_country_code
  const isTierLocked  = tierReason != null

  const categories = useCategoryOptions()
  const navigate = useNavigate()

  const {
    products,
    pagination,
    setPage,
    search,
    setSearch,
    // ── server-side sort (hook sends sort_by/sort_dir to backend) ──────────
    sortKey,
    sortDir,
    handleSort,
    // ── server-side date filter (hook sends updated_from/updated_to) ───────
    dateFrom,
    dateTo,
    handleDateChange,
    // ── lazy export (fetches all matching rows on click) ────────────────────
    handleExport,
    isLoading,
    isError,
  } = useProducts()

  const [bannerDismissed, setBannerDismissed] = useState(false)
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { setBannerDismissed(false) }, [isError])

  // LOCAL sort + date state REMOVED:
  //   Previously sortKey/sortDir/dateFrom/dateTo were local useState in this
  //   component. The displayRows useMemo then filtered/sorted on either the
  //   current page (20 rows) or allProducts (10000 rows) in JavaScript.
  //
  //   Problems with the old approach:
  //     - Date filter triggered a 10,000-row fetch (allProducts) even when not
  //       searching, wasting bandwidth and browser memory.
  //     - Sort ran on the current page only — changing page reset the sort visually.
  //     - export came from allProducts filtered in JS — wrong when > 10,000 records.
  //
  //   NOW: all four params are owned by the hook. The hook's queryKey includes
  //   them, so any change triggers a fresh backend fetch. PostgreSQL does the
  //   work. The browser receives only 20 rows regardless of total record count.

  // ── Barcode scanner Enter handler ────────────────────────────────────────────
  // USB barcode scanners work by emulating a keyboard: they "type" each digit of
  // the barcode rapidly, then fire an Enter keypress when the scan is complete.
  //
  // This handler is placed on a wrapper <div> around the SearchBar so we don't
  // need to modify the shared SearchBar component. React's synthetic events
  // bubble from the <input> inside SearchBar up through this wrapper div.
  //
  // Behaviour on Enter:
  //   1. Read the current input value from the DOM (e.target.value) — more
  //      reliable than the React state at this instant because the scanner fires
  //      chars very quickly and state updates may still be batching.
  //   2. Look up the exact barcode via GET /products/barcode/{code} — the same
  //      lean, indexed endpoint CreateSalePage's scanner uses.
  //   3. If a match is found → auto-open the detail drawer instantly (same UX
  //      as before). The drawer only needs prod_id to fetch full details.
  //   4. If no match → do nothing extra; the filtered table already shows the
  //      partial-match results (search is server-side and includes barcode).
  //
  // PERF NOTE: this replaces the old in-memory lookup over a pre-fetched
  // 10,000-row dataset (allProducts) with a single indexed DB query — faster
  // and correct at any catalogue size.
  async function handleScannerEnter(e) {
    if (e.key !== 'Enter') return
    const rawValue = (e.target.value ?? search).trim()
    if (!rawValue) return

    try {
      const match = await fetchProductByBarcode(rawValue)
      if (match) {
        setDetailProduct({ prod_id: match.prod_id })
      }
    } catch {
      // Silently ignore — table search already reflects the typed value.
    }
  }

  // dateFrom, dateTo, handleDateChange now come from the hook above.
  // The hook's handleDateChange already calls setPage(1) on every change.

  // displayRows / exportData useMemo REMOVED (v1):
  //   Previously selected between products (20 rows) and allProducts
  //   (10,000 rows), with client-side filter/sort/export.
  //
  //   NOW (v2): `products` from the hook is a single server-filtered,
  //   server-sorted, server-paginated dataset for ALL cases (browsing or
  //   searching, including category_name search). No post-processing needed.
  //   ExportButton uses onFetch={handleExport}, which lazily fetches all
  //   matching rows with the same active filters.

  // Convenience: total record count (across all pages) for the toolbar.
  const totalCount = pagination ? (pagination.total ?? products.length) : products.length

  const { data: productSummary } = useQuery({
    queryKey: ['product-summary'],
    queryFn: fetchProductSummary,
    staleTime: 5 * 60_000,
  })

  const { mutate: createProduct, isPending: isCreating } = useCreateProduct()
  const { mutate: updateProduct, isPending: isUpdating } = useUpdateProduct()
  const { mutate: deleteProduct, isPending: isDeleting } = useDeleteProduct()

  // ── Modal open/close state ────────────────────────────────────────────────
  const subscription    = useAuthStore(s => s.subscription)
  const [showUpgradeBanner, setShowUpgradeBanner] = useState(true)
  const [showProfitBanner, setShowProfitBanner] = useState(true)
  const [showAdd,        setShowAdd]        = useState(false)
  const [editTarget,     setEditTarget]     = useState(null)
  const [deleteTarget,   setDeleteTarget]   = useState(null)
  const [detailProduct,  setDetailProduct]  = useState(null)

  // ── Feature 2: Duplicate name — per-modal error state ─────────────────────
  // These hold the "A product with this name already exists." message from
  // the server. They are separate for Add vs Edit so one modal's error doesn't
  // bleed into the other.
  const [addNameError,    setAddNameError]    = useState(null)
  const [editNameError,   setEditNameError]   = useState(null)
  // BARCODE FIX: barcode error states (mirror name error pattern)
  const [addBarcodeError,  setAddBarcodeError]  = useState(null)
  const [editBarcodeError, setEditBarcodeError] = useState(null)

  // ── Feature 1: Loss-price confirmation state ──────────────────────────────
  // pendingPayload — the validated form data waiting for user confirmation
  // pendingAction  — 'create' | 'update' — which mutation to run on confirm
  const [lossConfirmOpen, setLossConfirmOpen] = useState(false)
  const [pendingPayload,  setPendingPayload]  = useState(null)
  const [pendingAction,   setPendingAction]   = useState(null)

  // ── MRP FEATURE: Sell-above-MRP confirmation state ────────────────────────
  // Separate from lossConfirmOpen so both dialogs can chain cleanly.
  // Flow: sell > MRP → mrpConfirmOpen → user confirms → check loss → save
  const [mrpConfirmOpen,    setMrpConfirmOpen]    = useState(false)
  const [mrpPendingPayload, setMrpPendingPayload] = useState(null)
  const [mrpPendingAction,  setMrpPendingAction]  = useState(null)

  // ── Helper: normalise the raw form data into an API payload ──────────────
  function buildPayload(data) {
    return {
      ...data,
      tax_code:    data.tax_code    || null,
      barcode:     data.barcode     || null,
      category_id: data.category_id,
      // MRP FEATURE: send null when prod_mrp is 0 or empty — means "no MRP set"
      prod_mrp:    Number(data.prod_mrp) > 0 ? Number(data.prod_mrp) : null,
    }
  }

  // ── Helper: did the user enter sell < cost? ───────────────────────────────
  // Data-integrity guard: fires for every user who can create/edit products
  // (admin + manager on any plan). Deliberately NOT gated on canViewProfit —
  // a Basic/Trial business should still be warned before saving a product that
  // sells below cost. Staff cannot create products, so they never reach here.
  function isSellingAtLoss(payload) {
    const sell = parseFloat(payload.prod_sell_price)
    const cost = parseFloat(payload.prod_cost_price)
    return !isNaN(sell) && !isNaN(cost) && sell < cost
  }

  // ── MRP FEATURE: did the user enter sell > MRP? ──────────────────────────
  // Only warns when prod_mrp is explicitly set (not null). If the admin sets
  // MRP=0 (which buildPayload converts to null), this guard is skipped.
  function isSellAboveMRP(payload) {
    const sell = parseFloat(payload.prod_sell_price)
    const mrp  = parseFloat(payload.prod_mrp)
    return !isNaN(sell) && !isNaN(mrp) && mrp > 0 && sell > mrp
  }

  // ── Actual API calls (called after loss-check passes or user confirms) ────
  function doCreate(payload) {
    createProduct(payload, {
      onSuccess: () => {
        setShowAdd(false)
        setAddNameError(null)
        setAddBarcodeError(null)  // BARCODE FIX
      },
      onError: (err) => {
        const msg = err?.response?.data?.message || ''
        // If the backend says the name exists, surface it inside the form field.
        // The toast in useProducts.js also fires — that's fine as a fallback.
        if (msg.toLowerCase().includes('name already exists')) {
          setAddNameError(msg)
        }
        // BARCODE FIX
        if (msg.toLowerCase().includes('barcode already exists')) {
          setAddBarcodeError(msg)
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
          setEditBarcodeError(null)  // BARCODE FIX
        },
        onError: (err) => {
          const msg = err?.response?.data?.message || ''
          if (msg.toLowerCase().includes('name already exists')) {
            setEditNameError(msg)
          }
          // BARCODE FIX
          if (msg.toLowerCase().includes('barcode already exists')) {
            setEditBarcodeError(msg)
          }
        },
      }
    )
  }

  // ── Form submit handlers ───────────────────────────────────────────────────
  function handleCreate(data) {
    const payload = buildPayload(data)

    // MRP FEATURE: intercept if sell > MRP → show MRP warning first
    if (isSellAboveMRP(payload)) {
      setMrpPendingPayload(payload)
      setMrpPendingAction('create')
      setMrpConfirmOpen(true)
      return
    }

    // Feature 1: intercept if selling at a loss → show loss confirmation dialog
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

    // MRP FEATURE: check sell > MRP first (same pattern as handleCreate)
    if (isSellAboveMRP(payload)) {
      setMrpPendingPayload(payload)
      setMrpPendingAction('update')
      setMrpConfirmOpen(true)
      return
    }

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

  // ── MRP FEATURE: Sell-above-MRP confirm handlers ─────────────────────────
  // After user clicks "Proceed" on the MRP warning, we continue to the
  // loss check (which may open a second dialog). Both modals can open in
  // sequence; the Add/Edit modal stays open throughout so nothing is lost.
  function handleMrpConfirmed() {
    setMrpConfirmOpen(false)
    const payload = mrpPendingPayload
    const action  = mrpPendingAction
    setMrpPendingPayload(null)
    setMrpPendingAction(null)

    // After the user acknowledged the MRP warning, still check for loss
    if (isSellingAtLoss(payload)) {
      setPendingPayload(payload)
      setPendingAction(action)
      setLossConfirmOpen(true)
      return
    }
    action === 'create'
      ? doCreate(payload)
      : doUpdate(editTarget.prod_id, payload)
  }

  function handleMrpCancelled() {
    setMrpConfirmOpen(false)
    setMrpPendingPayload(null)
    setMrpPendingAction(null)
    // Add/Edit modals remain open so user can correct the prices
  }

  // ── Table columns ─────────────────────────────────────────────────────────
  // PERF: columns is a fairly large array of objects with inline render
  // functions. Table.jsx receives it as a prop on every render of this page
  // (e.g. while the user types in the search box). Memoizing it keeps the
  // same array/object references across re-renders triggered by search,
  // pagination, or unrelated state — so Table (and any memoized row
  // components within it) don't see "columns" as a changed prop.
  // Dependencies: only canViewProfit/canManage actually change which columns
  // appear or what their action buttons do. setEditTarget/setDeleteTarget are
  // stable useState setters and don't need to be listed.
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
      key:      'prod_stock_qty',
      label:    'Stock',
      sortable: true,
      width:    90,
      render: (row) => {
        const isLow = row.prod_stock_qty <= row.prod_low_stock_alert
        return (
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <span style={{ fontWeight: 600, fontSize: 13, color: isLow ? 'var(--danger-text)' : 'var(--text-primary)' }}>
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
        <span style={{ fontWeight: 600, fontSize: 13, color: 'var(--text-primary)' }}>
          {formatCurrency(row.prod_sell_price, countryCode)}
        </span>
      ),
    },
    {
      // MRP FEATURE: Maximum Retail Price column.
      // Shown struck-through (retail sticker price) or '—' when not set.
      // No permission gate — MRP is a public price, not profit data.
      key:      'prod_mrp',
      label:    'MRP',
      sortable: true,
      width:    100,
      render: (row) => (
        row.prod_mrp != null
          ? (
            <span style={{ fontSize: 13, color: 'var(--text-muted)', textDecoration: 'line-through' }}>
              {formatCurrency(row.prod_mrp, countryCode)}
            </span>
          )
          : <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>—</span>
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
                    {formatCurrency(row.prod_cost_price, countryCode)}
                  </span>
                )
                : isTierLocked
                  ? <LockedCell message="Upgrade to view" />
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
              if (profit == null) {
                return isTierLocked
                  ? <LockedCell message="Upgrade to view" />
                  : <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>—</span>
              }
              const isNeg  = Number(profit) < 0
              return (
                <span style={{ fontSize: 13, fontWeight: 600, color: isNeg ? 'var(--danger-text)' : 'var(--success-text)' }}>
                  {isNeg ? '' : '+'}{formatCurrency(profit, countryCode)}
                </span>
              )
            },
          },
          {
            key:      'prod_profit_margin',
            label:    'Margin',
            sortable: true,
            width:    80,
            render: (row) => {
              const margin = row.prod_profit_margin
              if (margin == null) {
                return isTierLocked
                  ? <LockedCell message="Upgrade to view" />
                  : <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>—</span>
              }
              const isNeg  = Number(margin) < 0
              return (
                <span style={{ fontSize: 13, fontWeight: 600, color: isNeg ? 'var(--danger-text)' : 'var(--success-text)' }}>
                  {Number(margin).toFixed(1)}%
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
        <span style={{ fontSize: 13, color: 'var(--text-muted)' }}>
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
              <Button variant="danger" size="sm" onClick={(e) => { e.stopPropagation(); setDeleteTarget(row) }}
                leftIcon={TrashIcon}>
                Delete
              </Button>
            </div>
          ),
        }]
      : []),
  ], [canViewProfit, canManage, countryCode, isTierLocked, setEditTarget, setDeleteTarget])

  const activeSearch     = search.trim().length > 0
  const activeDateFilter = dateFrom || dateTo
  const activeFilters    = activeSearch || activeDateFilter

  const csvColumns = canViewProfit ? PRODUCT_CSV_COLUMNS : PRODUCT_CSV_COLUMNS_NO_PROFIT

  const handleRowClick = useCallback((row) => setDetailProduct(row), [])

  const { selectedIndex, setSelectedIndex } = useTableKeyboardNav({
    rows: products,
    rowKey: 'prod_id',
    onEnterRow: handleRowClick,
    onEditRow: canManage ? (row) => setEditTarget(row) : undefined,
    onDeleteRow: canManage ? (row) => setDeleteTarget(row) : undefined,
  })

  // ── Metric computations from server-side summary ────────────────────────────
  const lowStockCount    = productSummary?.low_stock_count ?? 0
  const outOfStockCount  = productSummary?.out_of_stock_count ?? 0
  const stockValue = canViewProfit && productSummary?.stock_value != null
    ? formatCurrency(productSummary.stock_value, countryCode)
    : null

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
              onFetch={handleExport}
              filename="products"
              columns={csvColumns}
            />
            <BulkImportPanel config={productImportConfig} canImport={canManage} />
            {canManage && (
              <Button
                variant="primary"
                leftIcon={<span style={{ fontSize: 16, lineHeight: 1 }}>+</span>}
                onClick={() => setShowAdd(true)}
                data-shortcut="new"
              >
                Add Product
              </Button>
            )}
          </div>
        }
      />

      <BulkImportGuidelines config={productImportConfig} />

      {showUpgradeBanner && subscription?.subscription_type === 'trial' && (
        <UpgradePrompt
          variant="banner"
          feature="products"
          onDismiss={() => setShowUpgradeBanner(false)}
          style={{ marginBottom: 24 }}
        />
      )}

      {showProfitBanner && (tierReason === 'trial' || tierReason === 'basic') && (
        <UpgradePrompt
          variant="banner"
          feature="profit data"
          currentTier={tierReason}
          title="Cost price & profit are hidden on your plan"
          message="Upgrade to Pro, Pro Yearly, or Lifetime to see cost price, profit, and margin for every product."
          onDismiss={() => setShowProfitBanner(false)}
          style={{ marginBottom: 24 }}
        />
      )}



      {/* METRIC CARDS */}
      <div className="bento-grid bento-grid-12" style={{ marginBottom: 24 }}>
        <MetricCard
          colSpan={3}
          loading={isLoading}
          icon={BoxIcon}
          label="Total Products"
          value={totalCount}
        />
        <MetricCard
          colSpan={3}
          loading={isLoading}
          icon={TrendingUpIcon}
          label="Stock Value"
          value={stockValue}
          locked={isTierLocked}
        />
        <MetricCard
          colSpan={3}
          loading={isLoading}
          icon={AlertTriangleIcon}
          label="Low Stock"
          value={lowStockCount}
          subtitle="Items below alert threshold"
        />
        <MetricCard
          colSpan={3}
          loading={isLoading}
          icon={CircleXIcon}
          label="Out of Stock"
          value={outOfStockCount}
        />
      </div>

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
          {/* Wrap SearchBar in a div so the scanner's Enter keypress bubbles up
              to handleScannerEnter without modifying the shared SearchBar component */}
          <div
            onKeyDown={handleScannerEnter}
            style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}
          >
            <SearchBar
              value={search}
              onChange={setSearch}
              onSearch={setSearch}
              placeholder="Search by product, category or barcode…"
              width="290px"
            />
            {/* Barcode scanner hint pill — tells the user that a USB scanner works here */}
            <BarcodeHint />
          </div>
          <span style={{ fontSize: 13, color: 'var(--text-muted)', fontWeight: 500 }}>
            {totalCount} product{totalCount !== 1 ? 's' : ''}
            {activeFilters && ' (filtered)'}
          </span>
          {activeFilters && (
            <button
              onClick={() => { setSearch(''); handleDateChange('from', ''); handleDateChange('to', '') }}
              style={{
                background: 'none', border: 'none', cursor: 'pointer',
                fontSize: 12, color: 'var(--accent-600)', fontWeight: 600,
                padding: '2px 6px', display: 'inline-flex', alignItems: 'center', gap: 4,
              }}
            >
              {XIcon}
              Clear filters
            </button>
          )}
        </div>
        <DateRangeFilter from={dateFrom} to={dateTo} onChange={handleDateChange} />
      </div>

      {isError && !bannerDismissed && (
        <div role="alert" style={{
          background: 'var(--danger-bg)', border: '1px solid var(--danger-border)',
          borderRadius: 12, padding: '12px 16px', color: 'var(--danger-text)',
          fontSize: 13, marginBottom: 24, fontWeight: 500,
          display: 'flex', alignItems: 'center', gap: 8,
        }}>
          {ErrorAlertIcon}
          Could not load products. Check that the backend is running and refresh.
          <button type="button" onClick={() => setBannerDismissed(true)} style={{ marginLeft: 'auto', background: 'none', border: 'none', color: 'var(--danger-text)', cursor: 'pointer', padding: 2, lineHeight: 1, flexShrink: 0 }} aria-label="Dismiss error">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" /></svg>
          </button>
        </div>
      )}

      {isLoading ? (
        <BentoCard padding={false}>
          <SkeletonTable rows={8} columns={8} />
        </BentoCard>
      ) : products.length === 0 ? (
        <BentoCard>
          <EmptyState
            context="product"
            hasFilters={activeFilters}
            title={activeFilters ? 'No results matching your filters' : 'Nothing here yet'}
            description={activeFilters ? 'Try adjusting your search or filters to find what you\'re looking for.' : 'Add your first product to get started.'}
            action={activeFilters ? (
              <Button variant="secondary" size="sm" onClick={() => { setSearch(''); handleDateChange('from', ''); handleDateChange('to', '') }}>
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
              rows={products}
              loading={isLoading}
              rowKey="prod_id"
              onRowClick={handleRowClick}
              sortKey={sortKey}
              sortDir={sortDir}
              onSort={handleSort}
              selectedIndex={selectedIndex}
              onSelectedIndexChange={setSelectedIndex}
            />
          </div>
        </BentoCard>
      )}

      <Pagination pagination={pagination} onPageChange={setPage} />

      {/* ── Add Product Modal ─────────────────────────────────────────────── */}
      <AddProductModal
        open={showAdd}
        onClose={() => { setShowAdd(false); setAddNameError(null) }}
        onSubmit={handleCreate}
        isPending={isCreating}
        categories={categories}
        nameError={addNameError}
        onNameErrorClear={() => setAddNameError(null)}
        barcodeError={addBarcodeError}
        onBarcodeErrorClear={(msg) => setAddBarcodeError(msg ?? null)}
      />

      {/* ── Edit Product Modal ────────────────────────────────────────────── */}
      <EditProductModal
        editTarget={editTarget}
        onClose={() => { setEditTarget(null); setEditNameError(null) }}
        onSubmit={handleUpdate}
        isPending={isUpdating}
        categories={categories}
        nameError={editNameError}
        onNameErrorClear={() => setEditNameError(null)}
        barcodeError={editBarcodeError}
        onBarcodeErrorClear={(msg) => setEditBarcodeError(msg ?? null)}
      />

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
          Opens when: prod_sell_price < prod_cost_price.
          Fires for any user who can create/edit products (all plans) — the
          loss warning is a data-integrity guard, not a profit-permission gate.
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

      {/* ── MRP FEATURE: Sell-above-MRP confirmation dialog ──────────────── */}
      {/*
          Opens when: prod_sell_price > prod_mrp (and prod_mrp is set).
          Reuses the same ConfirmDialog pattern as the loss warning above.
          Cancel  → closes dialog, form stays open for correction.
          Proceed → continues to loss-check (which may open a second dialog).
      */}
      <ConfirmDialog
        open={mrpConfirmOpen}
        onClose={handleMrpCancelled}
        onConfirm={handleMrpConfirmed}
        variant="warning"
        title="Sale Price Higher Than MRP"
        message="The Sale Price is higher than the MRP (Maximum Retail Price). This means the customer will be charged above the printed retail price. Do you want to continue?"
        confirmText="Yes, Proceed"
        cancelText="Cancel"
        loading={isCreating || isUpdating}
      />
    </>
  )
}

