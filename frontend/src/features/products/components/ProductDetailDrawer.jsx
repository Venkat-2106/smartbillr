// src/features/products/components/ProductDetailDrawer.jsx
//
// Opens when a user clicks a product row in ProductsPage.
// Calls GET /products/{prod_id} and displays:
//   - Record Activity  (Created On/By + Last Updated On/By)  ← NEW SECTION
//   - Core product info (price, stock, category, tax)
//   - History summary (units sold, received, returned, price changes)
//   - Stock movement history (timeline)
//   - Price change history (audit log)

import { useQuery } from '@tanstack/react-query'
import { XMarkIcon, CubeIcon, PrinterIcon } from '@heroicons/react/24/outline'
import { fetchProduct } from '../api/productsApi'
import { Spinner } from '../../../shared/components'
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
import useAuthStore from '../../../store/authStore'

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
// Includes a dedicated "Audit Information" section matching the on-screen drawer.
function buildProductPrintHTML(business, product, detail, summary, stockHistory, priceHistory) {
  const p = detail || product

  // Product meta (category, tax, etc.) — no audit fields here
  const metaFields = [
    { label: 'Category',  value: p.category_name || product.category_name || '—' },
    { label: 'Unit',      value: p.unit || product.unit || 'pcs' },
    { label: 'Barcode',   value: p.barcode || product.barcode || '—' },
    { label: 'Tax Rate',  value: `${p.tax_rate ?? product.tax_rate ?? 0}%` },
    { label: 'Tax Code',  value: p.tax_code || product.tax_code || '—' },
  ]

  // Audit fields — separate section, matching CategoryDetailDrawer print pattern
  const fmtPrintDate = (dt) =>
    dt ? new Date(dt).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }) : '—'

  const auditFields = [
    { label: 'Created On',       value: fmtPrintDate(p.prod_created_at || product.prod_created_at) },
    { label: 'Created By',       value: p.created_by_name || product.created_by_name || '—' },
    { label: 'Last Updated On',  value: fmtPrintDate(p.updated_at || product.updated_at) },
    { label: 'Last Updated By',  value: p.last_updated_by || product.last_updated_by || '—' },
  ]

  const stockCols = [
    { label: 'Event',   key: 'event',       align: 'left' },
    { label: 'Change',  key: 'qty_changed',  align: 'center', format: (v, row) => {
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

  return `
    ${buildPrintWatermark()}
    ${buildPrintHeader(business)}

    <!-- Product name -->
    <div style="margin-bottom:20px;">
      <div style="font-size:24px;font-weight:900;color:#111827;letter-spacing:-0.5px;line-height:1.1;">${p.prod_name || product.prod_name}</div>
      <div style="font-size:11.5px;color:#9ca3af;margin-top:5px;">Product Report</div>
    </div>

    <!-- Pricing summary -->
    ${buildPrintSectionTitle('Pricing & Stock')}
    <div style="display:grid;grid-template-columns:repeat(4,1fr);gap:12px;margin-bottom:22px;">
      <div style="border:1.5px solid #e5e7eb;border-radius:8px;padding:12px;text-align:center;">
        <div style="font-size:10px;font-weight:700;color:#9ca3af;text-transform:uppercase;letter-spacing:0.06em;margin-bottom:4px;">Selling Price</div>
        <div style="font-size:18px;font-weight:800;color:#4F46E5;">${formatCurrency(p.prod_sell_price ?? product.prod_sell_price)}</div>
      </div>
      <div style="border:1.5px solid #e5e7eb;border-radius:8px;padding:12px;text-align:center;">
        <div style="font-size:10px;font-weight:700;color:#9ca3af;text-transform:uppercase;letter-spacing:0.06em;margin-bottom:4px;">Cost Price</div>
        <div style="font-size:18px;font-weight:800;color:#374151;">${formatCurrency(p.prod_cost_price ?? product.prod_cost_price)}</div>
      </div>
      <div style="border:1.5px solid #e5e7eb;border-radius:8px;padding:12px;text-align:center;">
        <div style="font-size:10px;font-weight:700;color:#9ca3af;text-transform:uppercase;letter-spacing:0.06em;margin-bottom:4px;">Profit</div>
        <div style="font-size:18px;font-weight:800;color:#10B981;">${formatCurrency(p.prod_profit ?? product.prod_profit ?? 0)}</div>
      </div>
      <div style="border:1.5px solid #e5e7eb;border-radius:8px;padding:12px;text-align:center;">
        <div style="font-size:10px;font-weight:700;color:#9ca3af;text-transform:uppercase;letter-spacing:0.06em;margin-bottom:4px;">Current Stock</div>
        <div style="font-size:18px;font-weight:800;color:${(p.prod_stock_qty ?? product.prod_stock_qty) <= (p.prod_low_stock_alert ?? product.prod_low_stock_alert) ? '#EF4444' : '#111827'};">${p.prod_stock_qty ?? product.prod_stock_qty} ${p.unit || product.unit || 'pcs'}</div>
      </div>
    </div>

    ${buildPrintSectionTitle('Product Details')}
    ${buildPrintMetaGrid(metaFields, 5)}

    ${buildPrintSectionTitle('Audit Information')}
    ${buildPrintMetaGrid(auditFields, 4)}

    ${stockHistory.length > 0 ? buildPrintSectionTitle(`Stock Movement History (${stockHistory.length} records)`) : ''}
    ${buildPrintTable(stockCols, stockHistory, '')}

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
      <span style={{ fontSize: 12.5, color: 'var(--text-muted)', fontWeight: 500 }}>{label}</span>
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
// Matches the pattern used in CategoryDetailDrawer exactly.
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
      {/* Created On */}
      <div>
        <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.07em', marginBottom: 4 }}>
          Created On
        </div>
        <div style={{ fontSize: 12.5, fontWeight: 600, color: 'var(--text-primary)' }}>
          {createdAt ? formatDate(createdAt) : '—'}
        </div>
      </div>

      {/* Created By */}
      <div>
        <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.07em', marginBottom: 4 }}>
          Created By
        </div>
        <div style={{ fontSize: 12.5, fontWeight: 600, color: 'var(--text-primary)' }}>
          {createdBy || '—'}
        </div>
      </div>

      {/* Last Updated On */}
      <div>
        <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.07em', marginBottom: 4 }}>
          Last Updated On
        </div>
        <div style={{ fontSize: 12.5, fontWeight: 600, color: 'var(--text-primary)' }}>
          {updatedAt ? formatDate(updatedAt) : '—'}
        </div>
      </div>

      {/* Last Updated By */}
      <div>
        <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.07em', marginBottom: 4 }}>
          Last Updated By
        </div>
        <div style={{ fontSize: 12.5, fontWeight: 600, color: 'var(--text-primary)' }}>
          {updatedBy || '—'}
        </div>
      </div>
    </div>
  )
}

// ── Main drawer ───────────────────────────────────────────────────────────────
export default function ProductDetailDrawer({ product, onClose }) {
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

  const isLowStock = detail
    ? detail.prod_stock_qty <= detail.prod_low_stock_alert
    : product?.prod_stock_qty <= product?.prod_low_stock_alert

  function handlePrint() {
    if (!product) return
    const business = useAuthStore.getState().business
    const html = buildProductPrintHTML(business, product, detail, summary, stockHistory, priceHistory)
    triggerPrint(html)
  }

  return (
    <>
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
            <div>
              <h2 style={{ fontSize: 15, fontWeight: 700, color: 'var(--text-primary)', margin: 0, lineHeight: 1.3 }}>
                {product.prod_name}
              </h2>
              <p style={{ fontSize: 12, color: 'var(--text-muted)', margin: '3px 0 0' }}>
                Product Details
              </p>
            </div>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <button
              onClick={handlePrint}
              title="Print product report"
              style={{
                display: 'flex', alignItems: 'center', gap: 5,
                background: 'var(--bg-page)', border: '1px solid var(--border)',
                cursor: 'pointer', padding: '6px 12px', borderRadius: 8,
                color: 'var(--text-secondary)', fontSize: 12.5, fontWeight: 600,
                fontFamily: 'inherit', transition: 'background 0.12s',
              }}
              onMouseEnter={e => { e.currentTarget.style.background = 'var(--bg-hover)' }}
              onMouseLeave={e => { e.currentTarget.style.background = 'var(--bg-page)' }}
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
              borderRadius: 12, fontSize: 13.5,
              color: 'var(--danger-text, #B91C1C)', fontWeight: 500,
            }}>
              ⚠️ Could not load product details. Close and try again.
            </div>
          ) : (
            <>
              {/* ── Record Activity (audit section) ─────────────────────── */}
              {/* This section is always shown, even while waiting for detail.
                  Falls back to list-row data until detail loads. */}
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
              <Section title="Product Details">
                <InfoRow label="Selling Price"  value={formatCurrency(detail?.prod_sell_price ?? product.prod_sell_price)} />
                <InfoRow label="Cost Price"     value={formatCurrency(detail?.prod_cost_price ?? product.prod_cost_price)} />
                <InfoRow label="Profit Margin"  value={formatCurrency(detail?.prod_profit     ?? product.prod_profit ?? 0)} />
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
                <StatCard label="Price Changes"   value={summary.price_change_count    ?? 0} />
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

              {/* ── Price change history ─────────────────────────────────── */}
              {priceHistory.length > 0 && (
                <Section title={`Price History (${priceHistory.length})`}>
                  {priceHistory.map((entry, idx) => (
                    <div key={entry.audit_id} style={{
                      padding: '12px 14px',
                      borderBottom: idx === priceHistory.length - 1 ? 'none' : '1px solid var(--border)',
                    }}>
                      <div style={{ fontSize: 11.5, color: 'var(--text-muted)', marginBottom: 6 }}>
                        {entry.changed_by} · {formatDate(entry.changed_at)}
                      </div>
                      {entry.changes.map(ch => (
                        <div key={ch.field} style={{
                          display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                          marginTop: 4,
                        }}>
                          <span style={{ fontSize: 12.5, color: 'var(--text-secondary)' }}>{ch.label}</span>
                          <span style={{ fontSize: 12.5, color: 'var(--text-primary)', fontWeight: 600 }}>
                            {formatCurrency(ch.old_value)} → {formatCurrency(ch.new_value)}
                            <span style={{
                              marginLeft: 6, fontSize: 11.5,
                              color: ch.difference > 0 ? '#10B981' : '#EF4444',
                            }}>
                              ({ch.difference > 0 ? '+' : ''}{formatCurrency(ch.difference)})
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
    </>
  )
}