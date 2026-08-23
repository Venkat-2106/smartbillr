// src/features/products/components/ProductDetailDrawer.jsx
//
// PROFIT PERMISSION CHANGES IN THIS VERSION:
//   ✅ Reads can_view_profit from API response (backend now returns this flag)
//   ✅ Cost Price row → hidden when user lacks view_product_profit
//   ✅ Profit Margin row → hidden when user lacks view_product_profit
//   ✅ Price History section → hidden entirely (backend also returns empty array)
//   ✅ Print layout → profit box + price history only shown when permitted
//   ✅ No hardcoded role checks anywhere in this file
//
// PREVIOUS SECTIONS RETAINED (unchanged):
//   - Record Activity (audit section)
//   - Stock summary cards
//   - Stock movement history

import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { XMarkIcon, CubeIcon, PrinterIcon } from '@heroicons/react/24/outline'
import { fetchProduct } from '../api/productsApi'
import { Spinner, DrawerPortal } from '../../../shared/components'
import { formatCurrency } from '../../../shared/utils/formatCurrency'
import { formatDate }     from '../../../shared/utils/formatDate'
import {
  buildPrintHeader,
  buildPrintWatermark,
  buildPrintFooter,
  buildPrintMetaGrid,
  buildPrintSectionTitle,
  buildPrintTable,
  triggerPrint,
} from '../../../shared/utils/printUtils'
import { printBarcodeLabels, clampCopies, MIN_LABEL_COPIES, MAX_LABEL_COPIES } from '../utils/barcodeLabelPrint'
import useAuthStore from '../../../store/authStore'
import { usePermissions } from '../../../shared/hooks/usePermissions'
import useEscapeToClose from '../../../shared/hooks/useEscapeToClose'

// ── Direction badge for stock movements ──────────────────────────────────────
function DirectionBadge({ direction, qty }) {
  const isIn  = direction === 'in'
  const color = isIn ? '#10B981' : '#EF4444'
  const sign  = isIn ? '+' : '-'
  return (
    <span style={{
      fontSize: 12, fontWeight: 700,
      color,
      background: isIn ? 'rgba(16,185,129,0.08)' : 'rgba(239,68,68,0.08)',
      border: `1px solid ${isIn ? 'rgba(16,185,129,0.2)' : 'rgba(239,68,68,0.2)'}`,
      borderRadius: 6, padding: '2px 8px',
    }}>
      {sign}{qty}
    </span>
  )
}

// ── Print builder ─────────────────────────────────────────────────────────────
// showProfit parameter controls whether profit box and price history appear.
// When false:
//   - The pricing grid shrinks to 2 columns (Sell Price, Current Stock)
//   - The "Audit Information" section still shows (it's not profit data)
//   - The Price History table is omitted entirely
function buildProductPrintHTML(business, product, detail, summary, stockHistory, priceHistory, showProfit) {
  const country = business?.business_country_code || 'IN'
  const p = detail || product

  // Product meta (category, tax, etc.) — no profit data here
  const metaFields = [
    { label: 'Category',  value: p.category_name || product.category_name || '—' },
    { label: 'Unit',      value: p.unit || product.unit || 'pcs' },
    { label: 'Barcode',   value: p.barcode || product.barcode || '—' },
    { label: 'Tax Rate',  value: `${p.tax_rate ?? product.tax_rate ?? 0}%` },
    { label: 'Tax Code',  value: p.tax_code || product.tax_code || '—' },
  ]

  // Audit fields — always shown (not profit-gated)
  const fmtPrintDate = (dt) => formatDate(dt)

  const auditFields = [
    { label: 'Created On',       value: fmtPrintDate(p.prod_created_at || product.prod_created_at) },
    { label: 'Created By',       value: p.created_by_name || product.created_by_name || '—' },
    { label: 'Last Updated On',  value: fmtPrintDate(p.updated_at || product.updated_at) },
    { label: 'Last Updated By',  value: p.last_updated_by || product.last_updated_by || '—' },
  ]

  const stockCols = [
    { label: 'Event',      key: 'event',       align: 'left' },
    { label: 'Invoice #',  key: 'invoice_no',  align: 'left', format: v => v || '—' },
    { label: 'Change',     key: 'qty_changed',  align: 'center', html: true, format: (v, row) => {
        const isIn  = row.direction === 'in'
        const color = isIn ? '#10B981' : '#EF4444'
        return `<span style="font-weight:700;color:${color};">${isIn ? '+' : '-'}${v}</span>`
      }
    },
    { label: 'Before',  key: 'stock_before', align: 'right' },
    { label: 'After',   key: 'stock_after',  align: 'right' },
    { label: 'By',      key: 'changed_by',   align: 'left' },
    { label: 'Date',    key: 'changed_at',   align: 'left', format: v => fmtPrintDate(v) },
  ]
  // ── Pricing cards — responsive wrapping flex layout ──────────────────────
  // WHY FLEXBOX INSTEAD OF GRID:
  //   CSS grid with repeat(N, 1fr) uses a FIXED column count regardless of
  //   available width. On narrow page sizes (Envelope #9 = ~3.8 inches wide,
  //   Letter landscape, thermal roll, etc.) a 4- or 5-column grid overflows
  //   and produces illegible squished text or horizontal overflow.
  //
  //   flex-wrap: wrap + flex: 1 1 120px means each card:
  //     - Grows to fill available space (flex-grow: 1)
  //     - Shrinks when space is tight (flex-shrink: 1)
  //     - Has a minimum width of 120px before it wraps to the next row
  //   On a wide A4 page all cards sit in one row.
  //   On a narrow envelope page they wrap to 2 rows automatically.
  //   The layout never overflows — it always fits the printable area.
  //
  // CARD SIZE:
  //   font-size on the value is reduced from 18px → 15px so numbers
  //   like "₹1,23,456.00" fit inside a 120px-wide card without clipping.
  //   Label font-size stays at 10px (already compact).

  const cardStyle = 'border:1.5px solid #e5e7eb;border-radius:8px;padding:10px 12px;text-align:center;flex:1 1 120px;min-width:0;box-sizing:border-box;'
  const labelStyle = 'font-size:10px;font-weight:700;color:#9ca3af;text-transform:uppercase;letter-spacing:0.06em;margin-bottom:4px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;'
  const wrapStyle = 'display:flex;flex-wrap:wrap;gap:10px;margin-bottom:22px;'

  const mrpVal = p.prod_mrp ?? product.prod_mrp ?? null
  const mrpCard = mrpVal != null
    ? `<div style="${cardStyle}">
        <div style="${labelStyle}">MRP</div>
        <div style="font-size:15px;font-weight:800;color:#9ca3af;text-decoration:line-through;word-break:break-all;">${formatCurrency(mrpVal, country)}</div>
      </div>`
    : ''

  const stockColor = (p.prod_stock_qty ?? product.prod_stock_qty) <= (p.prod_low_stock_alert ?? product.prod_low_stock_alert) ? '#EF4444' : '#111827'

  const pricingGrid = showProfit
    ? `<div style="${wrapStyle}">
        <div style="${cardStyle}">
          <div style="${labelStyle}">Selling Price</div>
          <div style="font-size:15px;font-weight:800;color:#4F46E5;word-break:break-all;">${formatCurrency(p.prod_sell_price ?? product.prod_sell_price, country)}</div>
        </div>
        ${mrpCard}
        <div style="${cardStyle}">
          <div style="${labelStyle}">Cost Price</div>
          <div style="font-size:15px;font-weight:800;color:#374151;word-break:break-all;">${formatCurrency(p.prod_cost_price ?? product.prod_cost_price, country)}</div>
        </div>
        <div style="${cardStyle}">
          <div style="${labelStyle}">Profit</div>
          <div style="font-size:15px;font-weight:800;color:#10B981;word-break:break-all;">${formatCurrency(p.prod_profit ?? product.prod_profit ?? 0, country)}</div>
        </div>
        <div style="${cardStyle}">
          <div style="${labelStyle}">Margin</div>
          <div style="font-size:15px;font-weight:800;color:#10B981;word-break:break-all;">${p.prod_profit_margin != null || product.prod_profit_margin != null ? `${Number(p.prod_profit_margin ?? product.prod_profit_margin ?? 0).toFixed(1)}%` : '—'}</div>
        </div>
        <div style="${cardStyle}">
          <div style="${labelStyle}">Current Stock</div>
          <div style="font-size:15px;font-weight:800;color:${stockColor};word-break:break-all;">${p.prod_stock_qty ?? product.prod_stock_qty} ${p.unit || product.unit || 'pcs'}</div>
        </div>
      </div>`
    : `<div style="${wrapStyle}">
        <div style="${cardStyle}">
          <div style="${labelStyle}">Selling Price</div>
          <div style="font-size:15px;font-weight:800;color:#4F46E5;word-break:break-all;">${formatCurrency(p.prod_sell_price ?? product.prod_sell_price, country)}</div>
        </div>
        ${mrpCard}
        <div style="${cardStyle}">
          <div style="${labelStyle}">Current Stock</div>
          <div style="font-size:15px;font-weight:800;color:${stockColor};word-break:break-all;">${p.prod_stock_qty ?? product.prod_stock_qty} ${p.unit || product.unit || 'pcs'}</div>
        </div>
      </div>`

  // ── Price history table — only if user has profit permission ──────────────
  const priceHistorySection = showProfit && priceHistory.length > 0
    ? buildPrintSectionTitle(`Price Change History (${priceHistory.length} records)`) +
      `<p style="font-size:11px;color:#9ca3af;margin:0 0 8px;">Price history shows changes to selling and cost prices.</p>`
    : ''

  return `
    ${buildPrintWatermark()}
    ${buildPrintHeader(business)}

    <!-- Product name -->
    <div style="margin-bottom:20px;">
      <div style="font-size:24px;font-weight:900;color:#111827;letter-spacing:-0.5px;line-height:1.1;">${p.prod_name || product.prod_name}</div>
      <div style="font-size:11.5px;color:#9ca3af;margin-top:5px;">Product Report</div>
    </div>

    <!-- Pricing summary — profit-gated -->
    ${buildPrintSectionTitle('Pricing & Stock')}
    ${pricingGrid}

    ${buildPrintSectionTitle('Product Details')}
    ${buildPrintMetaGrid(metaFields, 5)}

    ${buildPrintSectionTitle('Audit Information')}
    ${buildPrintMetaGrid(auditFields, 4)}

    ${stockHistory.length > 0 ? buildPrintSectionTitle(`Stock Movement History (${stockHistory.length} records)`) : ''}
    ${buildPrintTable(stockCols, stockHistory, '')}

    ${priceHistorySection}

    ${buildPrintFooter()}
  `
}

// ── StatCard ──────────────────────────────────────────────────────────────────
function StatCard({ label, value, color }) {
  return (
    <div style={{
      background: 'var(--bg-page)', border: '1.5px solid var(--border)',
      borderRadius: 12, padding: '14px 16px',
    }}>
      <div style={{ fontSize: 10.5, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.07em', marginBottom: 6 }}>
        {label}
      </div>
      <div style={{ fontSize: 20, fontWeight: 800, color: color || 'var(--text-primary)' }}>
        {value}
      </div>
    </div>
  )
}

// ── InfoRow (list-style) ──────────────────────────────────────────────────────
function InfoRow({ label, value, isLast }) {
  return (
    <div style={{
      display: 'flex', justifyContent: 'space-between', alignItems: 'center',
      padding: '10px 14px',
      borderBottom: isLast ? 'none' : '1px solid var(--border)',
    }}>
      <span style={{ fontSize: 13, color: 'var(--text-muted)', fontWeight: 500 }}>{label}</span>
      <span style={{ fontSize: 13, color: 'var(--text-primary)', fontWeight: 600, textAlign: 'right' }}>{value}</span>
    </div>
  )
}

// ── Section wrapper ───────────────────────────────────────────────────────────
function Section({ title, children }) {
  return (
    <div style={{ marginBottom: 24 }}>
      <p style={{
        fontSize: 10.5, fontWeight: 700, textTransform: 'uppercase',
        letterSpacing: '0.08em', color: 'var(--text-muted)', margin: '0 0 10px',
      }}>
        {title}
      </p>
      <div style={{
        background: 'var(--bg-page)', border: '1px solid var(--border)',
        borderRadius: 12, overflow: 'hidden',
      }}>
        {children}
      </div>
    </div>
  )
}

// ── AuditGrid — 2×2 read-only audit info block ───────────────────────────────
function AuditGrid({ createdAt, createdBy, updatedAt, updatedBy }) {
  return (
    <div style={{
      background: 'var(--bg-page)',
      border: '1px solid var(--border)',
      borderRadius: 12,
      padding: '14px 16px',
      marginBottom: 24,
      display: 'grid',
      gridTemplateColumns: '1fr 1fr',
      gap: '12px 20px',
    }}>
      <div>
        <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.07em', marginBottom: 4 }}>
          Created On
        </div>
        <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-primary)' }}>
          {createdAt ? formatDate(createdAt) : '—'}
        </div>
      </div>

      <div>
        <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.07em', marginBottom: 4 }}>
          Created By
        </div>
        <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-primary)' }}>
          {createdBy || '—'}
        </div>
      </div>

      <div>
        <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.07em', marginBottom: 4 }}>
          Last Updated On
        </div>
        <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-primary)' }}>
          {updatedAt ? formatDate(updatedAt) : '—'}
        </div>
      </div>

      <div>
        <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.07em', marginBottom: 4 }}>
          Last Updated By
        </div>
        <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-primary)' }}>
          {updatedBy || '—'}
        </div>
      </div>
    </div>
  )
}

// ── Main drawer ───────────────────────────────────────────────────────────────
export default function ProductDetailDrawer({ product, onClose }) {
  useEscapeToClose(onClose)
  const [printHovered, setPrintHovered] = useState(false)
  const [barcodeHovered, setBarcodeHovered] = useState(false)
  // Copies kept as a raw string while typing; clamped on blur and at print time
  const [labelCopies, setLabelCopies] = useState('1')
  const business  = useAuthStore(s => s.business)
  const subType   = business?.subscription_type
  const country   = business?.business_country_code || 'IN'
  // ── Permission check ─────────────────────────────────────────────────────
  // We get this from two sources and use whichever is available:
  //   1. The frontend permission store (immediate, available before API call)
  //   2. The can_view_profit flag the backend returns in the detail response
  //      (a server-verified confirmation that matches the backend gate)
  //
  // We use the frontend store as the primary source. The backend flag
  // (detail.can_view_profit) is a belt-and-suspenders check — if both are
  // false, profit is hidden. The REAL security is the backend stripping
  // the values (they return null); this is just the UI display layer.
  const { can } = usePermissions()
  const canViewProfitFromStore = can('view_product_profit')

  const { data, isLoading, isError } = useQuery({
    queryKey: ['product', product?.prod_id],
    queryFn:  () => fetchProduct(product.prod_id),
    enabled:  !!product?.prod_id,
    staleTime: 2 * 60 * 1000,
  })

  // Backend wraps in { success, data }
  const detail        = data?.data ?? data
  const summary       = detail?.history_summary ?? {}
  const stockHistory  = detail?.stock_history   ?? []
  const priceHistory  = detail?.price_history   ?? []

  // Combine both sources: use store permission OR backend flag (both must agree)
  // In practice they'll always match because the backend checks the same DB.
  // If they disagree (e.g. permission changed mid-session), be safe and hide.
  const canViewProfit = canViewProfitFromStore && (detail?.can_view_profit !== false)
  const isTierLocked  = canViewProfit && (subType === 'trial' || subType === 'suspended')

  const isLowStock = detail
    ? detail.prod_stock_qty <= detail.prod_low_stock_alert
    : product?.prod_stock_qty <= product?.prod_low_stock_alert

  function handlePrint() {
    if (!product) return
    const business = useAuthStore.getState().business
    const html = buildProductPrintHTML(
      business, product, detail, summary, stockHistory, priceHistory,
      canViewProfit  // ← Pass the profit permission to the print builder
    )
    triggerPrint(html)
  }

  // ── Barcode label printing (separate from the product report) ────────────
  // A shelf sticker and an A4 business document are different physical paper
  // sizes — deliberately two distinct print flows. Uses the row/detail object
  // already in hand; nothing new is fetched.
  const barcodeValue = String(detail?.barcode || product.barcode || '').trim()
  const hasBarcode   = Boolean(barcodeValue)

  function handlePrintBarcode() {
    if (!product || !hasBarcode) return
    printBarcodeLabels(
      {
        prod_name:       product.prod_name,
        barcode:         barcodeValue,
        prod_sell_price: detail?.prod_sell_price ?? product.prod_sell_price,
      },
      clampCopies(labelCopies),
      country
    )
  }

  // DRAWER VIEWPORT FIX — see DrawerPortal.jsx: mount at document.body so
  // position:fixed anchors to the viewport, not the .fade-up wrapper.
  return (
    <DrawerPortal>
      {/* Backdrop */}
      <div
        onClick={onClose}
        style={{
          position: 'fixed', inset: 0,
          background: 'rgba(0,0,0,0.35)',
          zIndex: 1000, backdropFilter: 'blur(3px)',
        }}
      />

      {/* Drawer */}
      <div style={{
        position: 'fixed', top: 0, right: 0,
        height: '100vh', width: 560, maxWidth: '95vw',
        background: 'var(--bg-card)',
        borderLeft: '1px solid var(--border)',
        boxShadow: '-8px 0 40px rgba(0,0,0,0.14)',
        zIndex: 1001,
        display: 'flex', flexDirection: 'column',
        overflow: 'hidden',
      }}>

        {/* Header */}
        <div style={{
          padding: '20px 24px',
          borderBottom: '1px solid var(--border)',
          display: 'flex', alignItems: 'flex-start',
          justifyContent: 'space-between', gap: 16, flexShrink: 0,
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
            <div style={{
              width: 46, height: 46, borderRadius: 13, flexShrink: 0,
              background: 'linear-gradient(135deg, var(--accent-600), var(--accent-500))',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}>
              <CubeIcon style={{ width: 22, height: 22, color: '#fff' }} />
            </div>
            <div style={{ minWidth: 0 }}>
              <h2 style={{ fontSize: 15, fontWeight: 700, color: 'var(--text-primary)', margin: 0, lineHeight: 1.3, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                {product.prod_name}
              </h2>
              <p style={{ fontSize: 12, color: 'var(--text-muted)', margin: '3px 0 0' }}>
                Product Details
              </p>
            </div>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 }}>
            {/* Copies stepper for barcode stickers (1–50) */}
            <label
              title="Number of barcode stickers to print (1–50)"
              style={{
                display: 'flex', alignItems: 'center', gap: 6,
                fontSize: 12, fontWeight: 600,
                color: 'var(--text-muted)', fontFamily: 'inherit',
              }}
            >
              Copies
              <input
                type="number"
                min={MIN_LABEL_COPIES}
                max={MAX_LABEL_COPIES}
                value={labelCopies}
                disabled={!hasBarcode}
                onChange={(e) => setLabelCopies(e.target.value)}
                onBlur={(e) => setLabelCopies(String(clampCopies(e.target.value)))}
                onKeyDown={(e) => { if (e.key === 'Enter') e.preventDefault() }}
                style={{
                  width: 54, padding: '6px',
                  border: '1px solid var(--border)', borderRadius: 8,
                  fontSize: 13, fontFamily: 'inherit',
                  color: 'var(--text-primary)', background: 'var(--bg-page)',
                  outline: 'none',
                  opacity: hasBarcode ? 1 : 0.55,
                }}
              />
            </label>

            {/* Barcode sticker print — separate from the full product report
                (different physical paper size). Native disabled <button> keeps
                the "Generate a barcode first" tooltip visible. */}
            <button
              onClick={handlePrintBarcode}
              disabled={!hasBarcode}
              title={hasBarcode ? 'Print barcode label' : 'Generate a barcode first'}
              onMouseEnter={() => setBarcodeHovered(true)}
              onMouseLeave={() => setBarcodeHovered(false)}
              style={{
                display: 'flex', alignItems: 'center', gap: 5,
                background: barcodeHovered && hasBarcode ? 'var(--bg-hover)' : 'var(--bg-page)',
                border: '1px solid var(--border)',
                cursor: hasBarcode ? 'pointer' : 'not-allowed',
                opacity: hasBarcode ? 1 : 0.55,
                padding: '6px 10px', borderRadius: 8,
                color: 'var(--text-secondary)', fontSize: 13, fontWeight: 600,
                fontFamily: 'inherit', transition: 'background 0.12s',
              }}
            >
              <PrinterIcon style={{ width: 15, height: 15 }} />
              Barcode
            </button>

            <button
              onClick={handlePrint}
              title="Print product report"
              onMouseEnter={() => setPrintHovered(true)}
              onMouseLeave={() => setPrintHovered(false)}
              style={{
                display: 'flex', alignItems: 'center', gap: 5,
                background: printHovered ? 'var(--bg-hover)' : 'var(--bg-page)',
                border: '1px solid var(--border)',
                cursor: 'pointer', padding: '6px 12px', borderRadius: 8,
                color: 'var(--text-secondary)', fontSize: 13, fontWeight: 600,
                fontFamily: 'inherit', transition: 'background 0.12s',
              }}
            >
              <PrinterIcon style={{ width: 15, height: 15 }} />
              Print
            </button>
            <button
              onClick={onClose}
              style={{
                background: 'var(--bg-page)', border: '1px solid var(--border)',
                cursor: 'pointer', padding: 6, borderRadius: 8,
                color: 'var(--text-muted)',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
              }}
            >
              <XMarkIcon style={{ width: 18, height: 18 }} />
            </button>
          </div>
        </div>

        {/* Scrollable body */}
        <div style={{ flex: 1, overflowY: 'auto', padding: 24 }}>
          {isLoading ? (
            <div style={{ display: 'flex', justifyContent: 'center', padding: 48 }}>
              <Spinner size="md" />
            </div>
          ) : isError ? (
            <div style={{
              padding: '18px 16px',
              background: 'var(--danger-bg, #FEF2F2)',
              border: '1px solid var(--danger-border, #FCA5A5)',
              borderRadius: 12, fontSize: 13,
              color: 'var(--danger-text, #B91C1C)', fontWeight: 500,
            }}>
              ⚠️ Could not load product details. Close and try again.
            </div>
          ) : (
            <>
              {/* ── Record Activity (audit section) ─────────────────────── */}
              <p style={{
                fontSize: 10.5, fontWeight: 700, textTransform: 'uppercase',
                letterSpacing: '0.08em', color: 'var(--text-muted)', margin: '0 0 10px',
              }}>
                Record Activity
              </p>
              <AuditGrid
                createdAt={detail?.prod_created_at || product.prod_created_at}
                createdBy={detail?.created_by_name  || product.created_by_name}
                updatedAt={detail?.updated_at        || product.updated_at}
                updatedBy={detail?.last_updated_by   || product.last_updated_by}
              />

              {/* ── Core product details ─────────────────────────────────── */}
              {/* Profit-gated rows: Cost Price and Profit Margin             */}
              {/* These rows are present only when canViewProfit is true.     */}
              {/* The backend also returns null for these fields when the     */}
              {/* user lacks view_product_profit — so even if this UI check  */}
              {/* were bypassed, the values would display as '—'.            */}
              <Section title="Product Details">
                <InfoRow label="Selling Price"  value={formatCurrency(detail?.prod_sell_price ?? product.prod_sell_price, country)} />
                <InfoRow label="MRP" value={
                  (detail?.prod_mrp != null)
                    ? formatCurrency(detail.prod_mrp, country)
                    : (product.prod_mrp != null)
                      ? formatCurrency(product.prod_mrp, country)
                      : '—'
                } />
                {canViewProfit && (
                  <InfoRow label="Cost Price" value={
                    detail?.prod_cost_price != null
                      ? formatCurrency(detail.prod_cost_price, country)
                      : product.prod_cost_price != null
                        ? formatCurrency(product.prod_cost_price, country)
                        : isTierLocked ? 'Upgrade to view' : '—'
                  } />
                )}
                {canViewProfit && (
                  <InfoRow label="Profit" value={
                    isTierLocked
                      ? 'Upgrade to view'
                      : (() => {
                          const profit = detail?.prod_profit ?? product.prod_profit
                          return profit != null ? formatCurrency(profit, country) : '—'
                        })()
                  } />
                )}
                {canViewProfit && (
                  <InfoRow label="Margin" value={
                    isTierLocked
                      ? 'Upgrade to view'
                      : (() => {
                          const margin = detail?.prod_profit_margin ?? product.prod_profit_margin
                          return margin != null ? `${Number(margin).toFixed(1)}%` : '—'
                        })()
                  } />
                )}
                <InfoRow label="Category"       value={detail?.category_name || product.category_name || '—'} />
                <InfoRow label="Unit"           value={detail?.unit || product.unit || 'pcs'} />
                <InfoRow label="Tax Rate"       value={`${detail?.tax_rate ?? product.tax_rate ?? 0}%`} />
                <InfoRow label="Barcode"        value={detail?.barcode || product.barcode || '—'} isLast />
              </Section>

              {/* ── Stock summary cards ──────────────────────────────────── */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 24 }}>
                <StatCard
                  label="Current Stock"
                  value={`${detail?.prod_stock_qty ?? product.prod_stock_qty} ${detail?.unit || product.unit || 'pcs'}`}
                  color={isLowStock ? '#EF4444' : 'var(--text-primary)'}
                />
                <StatCard label="Units Sold"      value={summary.total_units_sold     ?? 0} />
                <StatCard label="Units Received"  value={summary.total_units_received  ?? 0} />
                {/* Price change count — only shown when user has profit permission */}
                {/* When hidden, the 4th card slot shows nothing (grid collapses) */}
                {canViewProfit && (
                  <StatCard label="Price Changes"   value={summary.price_change_count    ?? 0} />
                )}
              </div>

              {/* ── Stock movement history ───────────────────────────────── */}
              {stockHistory.length > 0 ? (
                <Section title={`Stock History (${stockHistory.length})`}>
                  {stockHistory.map((move, idx) => (
                    <div key={move.move_id} style={{
                      padding: '12px 14px',
                      borderBottom: idx === stockHistory.length - 1 ? 'none' : '1px solid var(--border)',
                      display: 'flex', justifyContent: 'space-between',
                      alignItems: 'flex-start', gap: 12,
                    }}>
                      <div style={{ flex: 1 }}>
                        <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-primary)', marginBottom: 2 }}>
                          {move.event}
                          {move.invoice_no && (
                            <span style={{
                              marginLeft: 8,
                              fontSize: 11.5,
                              fontWeight: 600,
                              color: 'var(--accent-600)',
                              background: 'var(--accent-50, rgba(79,70,229,0.07))',
                              border: '1px solid var(--accent-200, rgba(79,70,229,0.18))',
                              borderRadius: 5,
                              padding: '1px 6px',
                              letterSpacing: '0.01em',
                            }}>
                              {move.invoice_no}
                            </span>
                          )}
                        </div>
                        <div style={{ fontSize: 11.5, color: 'var(--text-muted)' }}>
                          {move.changed_by} · {formatDate(move.changed_at)}
                        </div>
                        <div style={{ fontSize: 11.5, color: 'var(--text-muted)', marginTop: 2 }}>
                          Stock: {move.stock_before} → {move.stock_after}
                        </div>
                      </div>
                      <DirectionBadge direction={move.direction} qty={move.qty_changed} />
                    </div>
                  ))}
                </Section>
              ) : (
                <Section title="Stock History">
                  <div style={{ padding: '24px 16px', textAlign: 'center', color: 'var(--text-muted)', fontSize: 13 }}>
                    No stock movements recorded yet.
                  </div>
                </Section>
              )}

              {/* ── Price change history — only shown with view_product_profit ── */}
              {/* The backend also returns an empty array when user lacks        */}
              {/* the permission, so this section naturally disappears either    */}
              {/* way. The canViewProfit check here is a belt-and-suspenders     */}
              {/* guard for the case where old cached data might still exist.    */}
              {canViewProfit && priceHistory.length > 0 && (
                <Section title={`Price History (${priceHistory.length})`}>
                  {priceHistory.map((entry, idx) => (
                    <div key={entry.audit_id} style={{
                      padding: '12px 14px',
                      borderBottom: idx === priceHistory.length - 1 ? 'none' : '1px solid var(--border)',
                    }}>
                      <div style={{ fontSize: 11.5, color: 'var(--text-muted)', marginBottom: 6 }}>
                        {entry.changed_by} · {formatDate(entry.changed_at)}
                        {entry.source === 'purchase' && (
                          <span style={{
                            marginLeft: 6, fontSize: 10, fontWeight: 600,
                            padding: '1px 5px', borderRadius: 4,
                            background: '#DBEAFE', color: '#1D4ED8',
                          }}>
                            By Purchase
                          </span>
                        )}
                      </div>
                      {entry.changes.map(ch => (
                        <div key={ch.field} style={{
                          display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                          marginTop: 4,
                        }}>
                          <span style={{ fontSize: 13, color: 'var(--text-secondary)' }}>{ch.label}</span>
                          <span style={{ fontSize: 13, color: 'var(--text-primary)', fontWeight: 600 }}>
                            {formatCurrency(ch.old_value, country)} → {formatCurrency(ch.new_value, country)}
                            <span style={{
                              marginLeft: 6, fontSize: 11.5,
                              color: ch.difference > 0 ? '#10B981' : '#EF4444',
                            }}>
                              ({ch.difference > 0 ? '+' : ''}{formatCurrency(ch.difference, country)})
                            </span>
                          </span>
                        </div>
                      ))}
                    </div>
                  ))}
                </Section>
              )}
            </>
          )}
        </div>
      </div>
    </DrawerPortal>
  )
}