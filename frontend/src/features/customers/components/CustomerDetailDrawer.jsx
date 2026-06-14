// src/features/customers/components/CustomerDetailDrawer.jsx
//
// PRINT FIX:
//   The old approach used @media print CSS to make the fixed-position drawer
//   visible. This produced a blank page in all browsers because:
//     1. position:fixed elements don't reflow to the document flow at print time
//     2. overflowY:auto clips content — print only captured the visible viewport
//     3. The CSS selector `body > * { display: none }` hid everything including
//        the drawer itself in some browsers
//
//   NEW APPROACH — Dedicated hidden print node:
//     1. A <div id="sb-print-root"> sits in the normal document flow,
//        hidden via CSS (display:none) at all times except @media print
//     2. When the user clicks Print, we write plain HTML (no fixed positioning,
//        no overflow) directly into that div
//     3. window.print() then renders that plain content — no React, no CSS vars,
//        just literal inline styles that the print engine can read
//     4. After printing, we clear the div so it's invisible again
//
//   WHY plain innerHTML instead of React portals:
//     ReactDOM.createPortal still inherits the parent's CSS context.
//     CSS variables (--accent-600 etc.) don't resolve in print stylesheets
//     reliably across browsers. Writing literal hex colors and px values
//     into the print node guarantees the output looks correct.

import { memo, useState } from 'react'
import { Button, Spinner, EmptyState } from '../../../shared/components'
import { useCustomer } from '../hooks/useCustomers'
import { formatDate }     from '../../../shared/utils/formatDate'
import { formatCurrency } from '../../../shared/utils/formatCurrency'
import { COUNTRY_MAP }    from './CustomerForm'
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

// ── Helpers ───────────────────────────────────────────────────────────────────
function getInitials(name = '') {
  return name.split(' ').slice(0, 2).map(w => w[0]?.toUpperCase() ?? '').join('')
}

function paymentStatusColor(status) {
  if (status === 'paid')    return '#10B981'
  if (status === 'partial') return '#F59E0B'
  if (status === 'unpaid')  return '#EF4444'
  return '#6B7280'
}

// ── InfoRow ───────────────────────────────────────────────────────────────────
function InfoRow({ label, value }) {
  return (
    <div>
      <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 2 }}>
        {label}
      </div>
      <div style={{ fontSize: 13, color: 'var(--text-primary)', fontWeight: 500, wordBreak: 'break-word' }}>
        {value}
      </div>
    </div>
  )
}

// ── StatCard ──────────────────────────────────────────────────────────────────
function StatCard({ label, value, color }) {
  return (
    <div style={{ background: 'var(--bg-page)', border: '1.5px solid var(--border)', borderRadius: 12, padding: '14px 16px', display: 'flex', flexDirection: 'column', gap: 4 }}>
      <span style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
        {label}
      </span>
      <span style={{ fontSize: 18, fontWeight: 700, color: color || 'var(--text-primary)' }}>
        {value}
      </span>
    </div>
  )
}

// ── SaleCard ──────────────────────────────────────────────────────────────────
const SaleCard = memo(function SaleCard({ sale }) {
  const statusColor = paymentStatusColor(sale.payment_summary?.current_status)
  return (
    <div style={{ background: 'var(--bg-page)', border: '1.5px solid var(--border)', borderRadius: 12, padding: 14 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
        <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-primary)' }}>
          {sale.invoice_no}
        </span>
        <span style={{ fontSize: 11, fontWeight: 600, textTransform: 'capitalize', color: statusColor, background: statusColor + '18', padding: '2px 8px', borderRadius: 6 }}>
          {sale.payment_summary?.current_status || '—'}
        </span>
      </div>
      <div style={{ display: 'flex', gap: 16, fontSize: 12, color: 'var(--text-muted)', flexWrap: 'wrap' }}>
        <span>{formatDate(sale.sales_created_at)}</span>
        <span style={{ fontWeight: 600, color: 'var(--text-primary)' }}>
          {formatCurrency(sale.sales_final_amount)}
        </span>
        {sale.payment_summary?.remaining_balance > 0 && (
          <span style={{ color: '#EF4444' }}>
            Due: {formatCurrency(sale.payment_summary.remaining_balance)}
          </span>
        )}
      </div>
      {sale.items?.length > 0 && (
        <div style={{ marginTop: 8, display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
          <span style={{ fontSize: 10.5, fontWeight: 700, background: 'var(--accent-50)', color: 'var(--accent-600)', padding: '2px 7px', borderRadius: 5, letterSpacing: '0.04em' }}>
            {sale.items.length} item{sale.items.length !== 1 ? 's' : ''}
          </span>
          <span style={{ fontSize: 11.5, color: 'var(--text-muted)' }}>
            {sale.items.map(i => i.prod_name).slice(0, 3).join(', ')}
            {sale.items.length > 3 && ` +${sale.items.length - 3} more`}
          </span>
        </div>
      )}
    </div>
  )
})

// ── Overlay ───────────────────────────────────────────────────────────────────
export function DrawerOverlay({ open, onClick }) {
  return (
    <div
      onClick={open ? onClick : undefined}
      style={{
        position: 'fixed', inset: 0,
        background: 'rgba(0,0,0,0.32)',
        zIndex: 499,
        opacity: open ? 1 : 0,
        pointerEvents: open ? 'auto' : 'none',
        transition: 'opacity 0.2s ease',
      }}
    />
  )
}

// ── Print helpers ─────────────────────────────────────────────────────────────
// Uses the shared printUtils framework — no duplication of getPrintRoot().
// All print sections now include the store header, watermark, and footer.

function buildCustomerPrintHTML(business, customer, summary, salesHistory) {
  const country = COUNTRY_MAP[customer.cust_country_code] || customer.cust_country_code || '—'

  const metaFields = [
    { label: 'Phone',           value: customer.cust_phone || '—' },
    { label: 'Email',           value: customer.cust_email || '—' },
    { label: 'State',           value: customer.cust_state || '—' },
    { label: 'Country',         value: country },
    { label: 'GSTIN / Tax No.', value: customer.cust_tax_number || '—' },
    { label: 'Customer Since',  value: formatDate(customer.cust_created_at) },
  ]
  if (customer.cust_address) {
    metaFields.push({ label: 'Address', value: customer.cust_address })
  }

  const totalSales    = summary ? summary.total_sales    : 0
  const totalSpent    = summary ? summary.total_spent    : 0
  const totalPaid     = summary ? summary.total_paid     : 0
  const outstanding   = summary ? summary.outstanding_balance : 0
  const outColor      = outstanding > 0 ? '#EF4444' : '#10B981'

  const summaryRows = summary ? `
    ${buildPrintSectionTitle('Financial Summary')}
    <div style="display:grid;grid-template-columns:repeat(4,1fr);gap:12px;margin-bottom:22px;">
      <div style="border:1.5px solid #e5e7eb;border-radius:8px;padding:12px;text-align:center;">
        <div style="font-size:10px;font-weight:700;color:#9ca3af;text-transform:uppercase;letter-spacing:0.06em;margin-bottom:4px;">Total Sales</div>
        <div style="font-size:22px;font-weight:800;color:#111827;">${totalSales}</div>
      </div>
      <div style="border:1.5px solid #e5e7eb;border-radius:8px;padding:12px;text-align:center;">
        <div style="font-size:10px;font-weight:700;color:#9ca3af;text-transform:uppercase;letter-spacing:0.06em;margin-bottom:4px;">Total Spent</div>
        <div style="font-size:22px;font-weight:800;color:#4F46E5;">${formatCurrency(totalSpent)}</div>
      </div>
      <div style="border:1.5px solid #e5e7eb;border-radius:8px;padding:12px;text-align:center;">
        <div style="font-size:10px;font-weight:700;color:#9ca3af;text-transform:uppercase;letter-spacing:0.06em;margin-bottom:4px;">Total Paid</div>
        <div style="font-size:22px;font-weight:800;color:#10B981;">${formatCurrency(totalPaid)}</div>
      </div>
      <div style="border:1.5px solid #e5e7eb;border-radius:8px;padding:12px;text-align:center;">
        <div style="font-size:10px;font-weight:700;color:#9ca3af;text-transform:uppercase;letter-spacing:0.06em;margin-bottom:4px;">Outstanding</div>
        <div style="font-size:22px;font-weight:800;color:${outColor};">${formatCurrency(outstanding)}</div>
      </div>
    </div>
  ` : ''

  // Build sales rows manually to avoid nested template literal issues
  const salesRowsHTML = salesHistory.map((row, i) => {
    const paid      = row.payment_summary?.total_paid || 0
    const due       = row.payment_summary?.remaining_balance || 0
    const status    = row.payment_summary?.current_status || '—'
    const sColor    = paymentStatusColor(status)
    const bg        = i % 2 === 0 ? '#ffffff' : '#f9fafb'
    const dateStr   = formatDate(row.sales_created_at)
    return `<tr style="background:${bg};">
      <td style="padding:7px 8px;font-size:12px;color:#111827;text-align:left;">${row.invoice_no || '—'}</td>
      <td style="padding:7px 8px;font-size:12px;color:#374151;text-align:left;">${dateStr}</td>
      <td style="padding:7px 8px;font-size:12px;color:#111827;text-align:right;font-weight:600;">${formatCurrency(row.sales_final_amount)}</td>
      <td style="padding:7px 8px;font-size:12px;color:#10B981;text-align:right;">${formatCurrency(paid)}</td>
      <td style="padding:7px 8px;font-size:12px;color:#EF4444;text-align:right;">${formatCurrency(due)}</td>
      <td style="padding:7px 8px;text-align:center;"><span style="font-size:10px;font-weight:700;text-transform:capitalize;color:${sColor};background:${sColor}18;padding:2px 8px;border-radius:4px;">${status}</span></td>
    </tr>`
  }).join('')

  const salesTableHTML = salesHistory.length === 0
    ? '<p style="font-size:12.5px;color:#9ca3af;padding:16px 0;">No sales history for this customer.</p>'
    : `<table style="width:100%;border-collapse:collapse;margin-bottom:16px;">
        <thead>
          <tr>
            <th style="text-align:left;padding:8px;font-size:10.5px;font-weight:800;color:#374151;text-transform:uppercase;letter-spacing:0.05em;border-bottom:2px solid #e5e7eb;">Invoice</th>
            <th style="text-align:left;padding:8px;font-size:10.5px;font-weight:800;color:#374151;text-transform:uppercase;letter-spacing:0.05em;border-bottom:2px solid #e5e7eb;">Date</th>
            <th style="text-align:right;padding:8px;font-size:10.5px;font-weight:800;color:#374151;text-transform:uppercase;letter-spacing:0.05em;border-bottom:2px solid #e5e7eb;">Amount</th>
            <th style="text-align:right;padding:8px;font-size:10.5px;font-weight:800;color:#374151;text-transform:uppercase;letter-spacing:0.05em;border-bottom:2px solid #e5e7eb;">Paid</th>
            <th style="text-align:right;padding:8px;font-size:10.5px;font-weight:800;color:#374151;text-transform:uppercase;letter-spacing:0.05em;border-bottom:2px solid #e5e7eb;">Due</th>
            <th style="text-align:center;padding:8px;font-size:10.5px;font-weight:800;color:#374151;text-transform:uppercase;letter-spacing:0.05em;border-bottom:2px solid #e5e7eb;">Status</th>
          </tr>
        </thead>
        <tbody>${salesRowsHTML}</tbody>
      </table>`

  return `
    ${buildPrintWatermark()}
    ${buildPrintHeader(business)}

    <div style="margin-bottom:20px;">
      <div style="font-size:24px;font-weight:900;color:#111827;letter-spacing:-0.5px;line-height:1.1;">${customer.cust_name}</div>
      <div style="font-size:11.5px;color:#9ca3af;margin-top:5px;">Customer Report</div>
    </div>

    ${buildPrintSectionTitle('Contact Information')}
    ${buildPrintMetaGrid(metaFields, 3)}

    ${summaryRows}

    ${buildPrintSectionTitle('Sales History (' + salesHistory.length + ' records)')}
    ${salesTableHTML}

    ${buildPrintFooter()}
  `
}

// ── Main Drawer ───────────────────────────────────────────────────────────────
export default function CustomerDetailDrawer({ custId, onClose, onEdit, canManage }) {
  const { data, isLoading, isError } = useCustomer(custId)
  const [printHovered, setPrintHovered] = useState(false)

  const customer     = data
  const summary      = data?.summary
  const salesHistory = data?.sales_history ?? []

  function handlePrint() {
    if (!customer) return
    const business = useAuthStore.getState().business
    const html = buildCustomerPrintHTML(business, customer, summary, salesHistory)
    triggerPrint(html)
  }

  return (
    <div style={{
      position: 'fixed', top: 0, right: 0, bottom: 0,
      height: '100dvh',
      width: 540,
      background: 'var(--bg-card)',
      borderLeft: '1.5px solid var(--border)',
      boxShadow: '-8px 0 32px rgba(0,0,0,0.12)',
      zIndex: 500,
      display: 'flex', flexDirection: 'column',
      overflow: 'hidden',
      animation: 'drawer-slide-in 0.25s cubic-bezier(0.16, 1, 0.3, 1)',
    }}>
      {/* Header */}
      <div style={{
        padding: '20px 24px',
        borderBottom: '1.5px solid var(--border)',
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        position: 'sticky', top: 0,
        background: 'var(--bg-card)', zIndex: 10, gap: 12,
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          {isLoading ? (
            <div style={{ width: 40, height: 40, borderRadius: '50%', background: 'var(--bg-hover)' }} />
          ) : customer ? (
            <div style={{
              width: 40, height: 40, borderRadius: '50%',
              background: 'linear-gradient(135deg, var(--accent-500), var(--accent-700))',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontSize: 15, fontWeight: 700, color: '#fff', flexShrink: 0, letterSpacing: '-0.5px',
            }}>
              {getInitials(customer.cust_name)}
            </div>
          ) : null}
          <div>
            <div style={{ fontSize: 15, fontWeight: 700, color: 'var(--text-primary)', letterSpacing: '-0.2px' }}>
              {isLoading ? 'Loading…' : customer?.cust_name}
            </div>
            <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 2 }}>Customer Details</div>
          </div>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          {canManage && customer && (
            <Button variant="secondary" size="sm" onClick={() => onEdit(customer)}>Edit</Button>
          )}
          {/* Print button — only shown when data is loaded */}
          {customer && (
            <button
              onClick={handlePrint}
              title="Print customer report"
              onMouseEnter={() => setPrintHovered(true)}
              onMouseLeave={() => setPrintHovered(false)}
              style={{
                background: 'none',
                border: `1.5px solid ${printHovered ? 'var(--accent-500)' : 'var(--border)'}`,
                borderRadius: 8,
                width: 32, height: 32,
                cursor: 'pointer',
                fontSize: 14,
                color: printHovered ? 'var(--accent-600)' : 'var(--text-muted)',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                transition: 'border-color 0.13s, color 0.13s',
              }}
            >
              🖨️
            </button>
          )}
          <button
            onClick={onClose}
            style={{
              background: 'none', border: '1.5px solid var(--border)',
              borderRadius: 8, width: 32, height: 32,
              cursor: 'pointer', fontSize: 15, color: 'var(--text-muted)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}
          >✕</button>
        </div>
      </div>

      {/* Body wrapper — fills remaining height below sticky header, scrolls independently */}
      <div style={{ flex: 1, minHeight: 0, overflowY: 'auto' }}>
      {isLoading && (
        <div style={{ display: 'flex', justifyContent: 'center', padding: 48 }}>
          <Spinner size={28} />
        </div>
      )}

      {isError && (
        <div style={{ padding: 24, color: 'var(--danger-text)', fontSize: 13.5 }}>
          ⚠️ Could not load customer details.
        </div>
      )}

      {customer && !isLoading && (
        <div style={{ padding: 24, display: 'flex', flexDirection: 'column', gap: 24 }}>
          {/* Contact info */}
          <div style={{ background: 'var(--bg-page)', border: '1.5px solid var(--border)', borderRadius: 14, padding: 16, display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <InfoRow label="Phone"   value={customer.cust_phone || '—'} />
            <InfoRow label="Email"   value={customer.cust_email || '—'} />
            <InfoRow label="State"   value={customer.cust_state || '—'} />
            <InfoRow label="Country" value={COUNTRY_MAP[customer.cust_country_code] || customer.cust_country_code || '—'} />
            <InfoRow label="GSTIN / Tax No."  value={customer.cust_tax_number || '—'} />
            <InfoRow label="Customer Since"   value={formatDate(customer.cust_created_at)} />
            {customer.cust_address && (
              <div style={{ gridColumn: '1 / -1' }}>
                <InfoRow label="Address" value={customer.cust_address} />
              </div>
            )}
          </div>

          {/* Summary stats */}
          {summary && (
            <>
              <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
                Summary
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                <StatCard label="Total Sales"  value={summary.total_sales} />
                <StatCard label="Total Spent"  value={formatCurrency(summary.total_spent)}  color="var(--accent-600)" />
                <StatCard label="Total Paid"   value={formatCurrency(summary.total_paid)}   color="#10B981" />
                <StatCard
                  label="Outstanding"
                  value={formatCurrency(summary.outstanding_balance)}
                  color={summary.outstanding_balance > 0 ? '#EF4444' : '#10B981'}
                />
              </div>
            </>
          )}

          {/* Sales history */}
          {salesHistory.length > 0 && (
            <>
              <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
                Sales History
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                {salesHistory.map(sale => (
                  <SaleCard key={sale.sales_id} sale={sale} />
                ))}
              </div>
            </>
          )}

          {salesHistory.length === 0 && (
            <EmptyState title="No sales yet" description="This customer has no sales history." />
          )}
        </div>
      )}
      </div>
    </div>
  )
}