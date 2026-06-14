// src/features/categories/components/CategoryDetailDrawer.jsx
//
// Opens when a user clicks a category row in CategoriesPage.
// Calls GET /categories/{category_id} and displays:
//   - Category summary (total products, low stock, out of stock, stock value)
//   - Full product list for that category with stock status

import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { XMarkIcon, TagIcon, PrinterIcon } from '@heroicons/react/24/outline'
import { fetchCategory } from '../api/categoriesApi'
import { Spinner } from '../../../shared/components'
import { formatCurrency } from '../../../shared/utils/formatCurrency'
import { formatDate }      from '../../../shared/utils/formatDate'
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

// ── Stock status badge ────────────────────────────────────────────────────────
function StockBadge({ qty, lowAlert }) {
  const isOut  = qty === 0
  const isLow  = !isOut && qty <= lowAlert
  const color  = isOut ? '#EF4444' : isLow ? '#F59E0B' : '#10B981'
  const label  = isOut ? 'Out' : isLow ? 'Low' : 'OK'
  return (
    <span style={{
      fontSize: 10.5, fontWeight: 700, color,
      background: `${color}14`,
      border: `1px solid ${color}30`,
      borderRadius: 5, padding: '2px 7px',
    }}>
      {label}
    </span>
  )
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

// ── Main drawer ───────────────────────────────────────────────────────────────
// ── Print builder ─────────────────────────────────────────────────────────────
function buildCategoryPrintHTML(business, category, detail, summary, products) {
  const metaFields = [
    { label: 'Total Products', value: String(summary.total_products ?? 0) },
    { label: 'Stock Value',    value: formatCurrency(summary.total_stock_value ?? 0) },
    { label: 'Low Stock',      value: String(summary.low_stock_count ?? 0) },
    { label: 'Out of Stock',   value: String(summary.out_of_stock_count ?? 0) },
  ]

  // Activity fields — created + last updated
  const activityFields = [
    { label: 'Created On',       value: detail?.created_at      ? formatDate(detail.created_at)  : '—' },
    { label: 'Created By',       value: detail?.created_by_name || '—' },
    { label: 'Last Updated On',  value: detail?.updated_at      ? formatDate(detail.updated_at)  : '—' },
    { label: 'Last Updated By',  value: detail?.last_updated_by || '—' },
  ]

  const prodCols = [
    { label: 'Product Name',   key: 'prod_name',         align: 'left' },
    { label: 'Sell Price',     key: 'prod_sell_price',   align: 'right', format: v => formatCurrency(v) },
    { label: 'Cost Price',     key: 'prod_cost_price',   align: 'right', format: v => formatCurrency(v) },
    { label: 'Stock',          key: 'prod_stock_qty',    align: 'center' },
    { label: 'Unit',           key: 'unit',              align: 'center' },
    { label: 'Status',         key: '_status',           align: 'center', format: (_, row) => {
        const isOut  = row.prod_stock_qty === 0
        const isLow  = !isOut && row.prod_stock_qty <= row.prod_low_stock_alert
        const color  = isOut ? '#EF4444' : isLow ? '#F59E0B' : '#10B981'
        const label  = isOut ? 'Out' : isLow ? 'Low' : 'OK'
        return `<span style="font-size:10px;font-weight:700;color:${color};background:${color}18;padding:2px 8px;border-radius:4px;">${label}</span>`
      }
    },
  ]

  return `
    ${buildPrintWatermark()}
    ${buildPrintHeader(business)}

    <!-- Category name -->
    <div style="margin-bottom:20px;">
      <div style="font-size:24px;font-weight:900;color:#111827;letter-spacing:-0.5px;line-height:1.1;">${category.category_name}</div>
      <div style="font-size:11.5px;color:#9ca3af;margin-top:5px;">Category Report</div>
    </div>

    ${buildPrintSectionTitle('Activity')}
    ${buildPrintMetaGrid(activityFields, 4)}

    ${buildPrintSectionTitle('Summary')}
    ${buildPrintMetaGrid(metaFields, 4)}

    ${buildPrintSectionTitle(`Products (${products.length})`)}
    ${buildPrintTable(prodCols, products, 'No products in this category.')}

    ${buildPrintFooter()}
  `
}

export default function CategoryDetailDrawer({ category, onClose }) {
  const [printHovered, setPrintHovered] = useState(false)
  const { data, isLoading, isError } = useQuery({
    queryKey: ['category', category?.category_id],
    queryFn:  () => fetchCategory(category.category_id),
    enabled:  !!category?.category_id,
    staleTime: 2 * 60 * 1000,
  })

  // Backend wraps in { success, data }
  const detail   = data?.data ?? data
  const summary  = detail?.summary  ?? {}
  const products = detail?.products ?? []

  function handlePrint() {
    if (!category) return
    const business = useAuthStore.getState().business
    const html = buildCategoryPrintHTML(business, category, detail, summary, products)
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
              <TagIcon style={{ width: 22, height: 22, color: '#fff' }} />
            </div>
            <div>
              <h2 style={{ fontSize: 15, fontWeight: 700, color: 'var(--text-primary)', margin: 0, lineHeight: 1.3 }}>
                {category.category_name}
              </h2>
              <p style={{ fontSize: 12, color: 'var(--text-muted)', margin: '3px 0 0' }}>
                Category · Products
              </p>
            </div>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <button
              onClick={handlePrint}
              disabled={isLoading || !!isError}
              title="Print category report"
              onMouseEnter={() => setPrintHovered(true)}
              onMouseLeave={() => setPrintHovered(false)}
              style={{
                display: 'flex', alignItems: 'center', gap: 5,
                background: printHovered && !isLoading && !isError ? 'var(--bg-hover)' : 'var(--bg-page)',
                border: '1px solid var(--border)',
                cursor: isLoading || isError ? 'not-allowed' : 'pointer',
                padding: '6px 12px', borderRadius: 8,
                color: isLoading || isError ? 'var(--text-muted)' : 'var(--text-secondary)',
                fontSize: 12.5, fontWeight: 600,
                fontFamily: 'inherit', opacity: isLoading || isError ? 0.5 : 1,
                transition: 'background 0.12s',
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

        {/* Body */}
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
              ⚠️ Could not load category details. Close and try again.
            </div>
          ) : (
            <>
              {/* ── Activity (created / updated metadata) ──────────────────── */}
              <div style={{
                background: 'var(--bg-page)',
                border: '1px solid var(--border)',
                borderRadius: 12,
                padding: '14px 16px',
                marginBottom: 20,
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
                    {detail?.created_at ? formatDate(detail.created_at) : '—'}
                  </div>
                </div>

                {/* Created By */}
                <div>
                  <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.07em', marginBottom: 4 }}>
                    Created By
                  </div>
                  <div style={{ fontSize: 12.5, fontWeight: 600, color: 'var(--text-primary)' }}>
                    {detail?.created_by_name || '—'}
                  </div>
                </div>

                {/* Last Updated On */}
                <div>
                  <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.07em', marginBottom: 4 }}>
                    Last Updated On
                  </div>
                  <div style={{ fontSize: 12.5, fontWeight: 600, color: 'var(--text-primary)' }}>
                    {detail?.updated_at ? formatDate(detail.updated_at) : '—'}
                  </div>
                </div>

                {/* Last Updated By */}
                <div>
                  <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.07em', marginBottom: 4 }}>
                    Last Updated By
                  </div>
                  <div style={{ fontSize: 12.5, fontWeight: 600, color: 'var(--text-primary)' }}>
                    {detail?.last_updated_by || '—'}
                  </div>
                </div>
              </div>

              {/* Summary stats */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 24 }}>
                <StatCard label="Total Products"   value={summary.total_products     ?? 0} />
                <StatCard label="Stock Value"      value={formatCurrency(summary.total_stock_value ?? 0)} color="var(--accent-600)" />
                <StatCard label="Low Stock Items"  value={summary.low_stock_count    ?? 0} color={summary.low_stock_count > 0 ? '#F59E0B' : 'var(--text-primary)'} />
                <StatCard label="Out of Stock"     value={summary.out_of_stock_count ?? 0} color={summary.out_of_stock_count > 0 ? '#EF4444' : 'var(--text-primary)'} />
              </div>

              {/* Product list */}
              <div>
                <p style={{
                  fontSize: 10.5, fontWeight: 700, textTransform: 'uppercase',
                  letterSpacing: '0.08em', color: 'var(--text-muted)', margin: '0 0 10px',
                }}>
                  Products ({products.length})
                </p>

                {products.length === 0 ? (
                  <div style={{
                    background: 'var(--bg-page)', border: '1px solid var(--border)',
                    borderRadius: 12, padding: '32px 16px',
                    textAlign: 'center', color: 'var(--text-muted)', fontSize: 13,
                  }}>
                    No products in this category.
                  </div>
                ) : (
                  <div style={{
                    background: 'var(--bg-page)', border: '1px solid var(--border)',
                    borderRadius: 12, overflow: 'hidden',
                  }}>
                    {products.map((prod, idx) => (
                      <div key={prod.prod_id} style={{
                        padding: '12px 14px',
                        borderBottom: idx === products.length - 1 ? 'none' : '1px solid var(--border)',
                        display: 'flex', justifyContent: 'space-between',
                        alignItems: 'center', gap: 12,
                      }}>
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-primary)', marginBottom: 2, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                            {prod.prod_name}
                          </div>
                          <div style={{ fontSize: 11.5, color: 'var(--text-muted)' }}>
                            {formatCurrency(prod.prod_sell_price)} · Stock: {prod.prod_stock_qty} {prod.unit || 'pcs'}
                          </div>
                        </div>
                        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 4, flexShrink: 0 }}>
                          <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-primary)' }}>
                            {formatCurrency(prod.prod_sell_price)}
                          </span>
                          <StockBadge qty={prod.prod_stock_qty} lowAlert={prod.prod_low_stock_alert} />
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </>
          )}
        </div>
      </div>
    </>
  )
}