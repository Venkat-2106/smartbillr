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

import { memo } from 'react'
import { Button, Spinner, EmptyState } from '../../../shared/components'
import { useCustomer } from '../hooks/useCustomers'
import { formatDate }     from '../../../shared/utils/formatDate'
import { formatCurrency } from '../../../shared/utils/formatCurrency'
import { COUNTRY_MAP }    from './CustomerForm'

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

// ── Print helper ──────────────────────────────────────────────────────────────
// Writes plain HTML (literal colors, no CSS vars) into a hidden print node
// that lives in normal document flow. The browser can print it correctly.
//
// IMPORTANT: This node must exist in index.html or be injected once.
// We inject it lazily on first print call so no HTML changes are needed.
function getPrintRoot() {
  let el = document.getElementById('sb-print-root')
  if (!el) {
    el = document.createElement('div')
    el.id = 'sb-print-root'

    // Hidden always — the @media print in index.css (or injected below) shows it
    const style = document.createElement('style')
    style.textContent = `
      #sb-print-root { display: none; }
      @media print {
        body > *:not(#sb-print-root) { display: none !important; }
        #sb-print-root {
          display: block !important;
          font-family: -apple-system, 'Plus Jakarta Sans', sans-serif;
          color: #111;
          background: #fff;
          padding: 32px;
          max-width: 700px;
          margin: 0 auto;
        }
      }
    `
    document.head.appendChild(style)
    document.body.appendChild(el)
  }
  return el
}

function buildPrintHTML(customer, summary, salesHistory) {
  const country = COUNTRY_MAP[customer.cust_country_code] || customer.cust_country_code || '—'

  const summaryRows = summary ? `
    <div style="display:grid;grid-template-columns:1fr 1fr 1fr 1fr;gap:12px;margin:20px 0;">
      <div style="border:1px solid #e5e7eb;border-radius:8px;padding:12px;">
        <div style="font-size:10px;font-weight:600;color:#6b7280;text-transform:uppercase;letter-spacing:0.05em;">Total Sales</div>
        <div style="font-size:20px;font-weight:700;color:#111;margin-top:4px;">${summary.total_sales}</div>
      </div>
      <div style="border:1px solid #e5e7eb;border-radius:8px;padding:12px;">
        <div style="font-size:10px;font-weight:600;color:#6b7280;text-transform:uppercase;letter-spacing:0.05em;">Total Spent</div>
        <div style="font-size:20px;font-weight:700;color:#4F46E5;margin-top:4px;">${formatCurrency(summary.total_spent)}</div>
      </div>
      <div style="border:1px solid #e5e7eb;border-radius:8px;padding:12px;">
        <div style="font-size:10px;font-weight:600;color:#6b7280;text-transform:uppercase;letter-spacing:0.05em;">Total Paid</div>
        <div style="font-size:20px;font-weight:700;color:#10B981;margin-top:4px;">${formatCurrency(summary.total_paid)}</div>
      </div>
      <div style="border:1px solid #e5e7eb;border-radius:8px;padding:12px;">
        <div style="font-size:10px;font-weight:600;color:#6b7280;text-transform:uppercase;letter-spacing:0.05em;">Outstanding</div>
        <div style="font-size:20px;font-weight:700;color:${summary.outstanding_balance > 0 ? '#EF4444' : '#10B981'};margin-top:4px;">${formatCurrency(summary.outstanding_balance)}</div>
      </div>
    </div>
  ` : ''

  const salesRows = salesHistory.length > 0 ? `
    <h3 style="font-size:13px;font-weight:700;color:#6b7280;text-transform:uppercase;letter-spacing:0.06em;margin:24px 0 12px;">Sales History</h3>
    <table style="width:100%;border-collapse:collapse;font-size:12px;">
      <thead>
        <tr style="border-bottom:2px solid #e5e7eb;">
          <th style="text-align:left;padding:8px 6px;font-weight:600;color:#374151;">Invoice</th>
          <th style="text-align:left;padding:8px 6px;font-weight:600;color:#374151;">Date</th>
          <th style="text-align:right;padding:8px 6px;font-weight:600;color:#374151;">Amount</th>
          <th style="text-align:right;padding:8px 6px;font-weight:600;color:#374151;">Paid</th>
          <th style="text-align:right;padding:8px 6px;font-weight:600;color:#374151;">Due</th>
          <th style="text-align:center;padding:8px 6px;font-weight:600;color:#374151;">Status</th>
        </tr>
      </thead>
      <tbody>
        ${salesHistory.map((sale, i) => {
          const statusColor = paymentStatusColor(sale.payment_summary?.current_status)
          const bgColor = i % 2 === 0 ? '#fff' : '#f9fafb'
          return `
          <tr style="border-bottom:1px solid #f3f4f6;background:${bgColor};">
            <td style="padding:7px 6px;font-weight:600;color:#111;">${sale.invoice_no || '—'}</td>
            <td style="padding:7px 6px;color:#6b7280;">${formatDate(sale.sales_created_at)}</td>
            <td style="padding:7px 6px;text-align:right;font-weight:600;color:#111;">${formatCurrency(sale.sales_final_amount)}</td>
            <td style="padding:7px 6px;text-align:right;color:#10B981;">${formatCurrency(sale.payment_summary?.total_paid || 0)}</td>
            <td style="padding:7px 6px;text-align:right;color:${sale.payment_summary?.remaining_balance > 0 ? '#EF4444' : '#10B981'};">${formatCurrency(sale.payment_summary?.remaining_balance || 0)}</td>
            <td style="padding:7px 6px;text-align:center;"><span style="font-size:10px;font-weight:600;text-transform:capitalize;color:${statusColor};background:${statusColor}18;padding:2px 8px;border-radius:4px;">${sale.payment_summary?.current_status || '—'}</span></td>
          </tr>`
        }).join('')}
      </tbody>
    </table>
  ` : '<p style="color:#6b7280;font-size:13px;">No sales history.</p>'

  return `
    <div style="border-bottom:2px solid #e5e7eb;padding-bottom:20px;margin-bottom:20px;">
      <div style="font-size:22px;font-weight:800;color:#111;letter-spacing:-0.5px;">${customer.cust_name}</div>
      <div style="font-size:12px;color:#6b7280;margin-top:4px;">Customer Report · Printed ${new Date().toLocaleDateString()}</div>
    </div>

    <div style="display:grid;grid-template-columns:1fr 1fr;gap:16px;margin-bottom:20px;">
      <div>
        <div style="font-size:10px;font-weight:600;color:#6b7280;text-transform:uppercase;letter-spacing:0.05em;margin-bottom:2px;">Phone</div>
        <div style="font-size:13px;color:#111;font-weight:500;">${customer.cust_phone || '—'}</div>
      </div>
      <div>
        <div style="font-size:10px;font-weight:600;color:#6b7280;text-transform:uppercase;letter-spacing:0.05em;margin-bottom:2px;">Email</div>
        <div style="font-size:13px;color:#111;font-weight:500;">${customer.cust_email || '—'}</div>
      </div>
      <div>
        <div style="font-size:10px;font-weight:600;color:#6b7280;text-transform:uppercase;letter-spacing:0.05em;margin-bottom:2px;">State</div>
        <div style="font-size:13px;color:#111;font-weight:500;">${customer.cust_state || '—'}</div>
      </div>
      <div>
        <div style="font-size:10px;font-weight:600;color:#6b7280;text-transform:uppercase;letter-spacing:0.05em;margin-bottom:2px;">Country</div>
        <div style="font-size:13px;color:#111;font-weight:500;">${country}</div>
      </div>
      <div>
        <div style="font-size:10px;font-weight:600;color:#6b7280;text-transform:uppercase;letter-spacing:0.05em;margin-bottom:2px;">GSTIN / Tax No.</div>
        <div style="font-size:13px;color:#111;font-weight:500;">${customer.cust_tax_number || '—'}</div>
      </div>
      <div>
        <div style="font-size:10px;font-weight:600;color:#6b7280;text-transform:uppercase;letter-spacing:0.05em;margin-bottom:2px;">Customer Since</div>
        <div style="font-size:13px;color:#111;font-weight:500;">${formatDate(customer.cust_created_at)}</div>
      </div>
      ${customer.cust_address ? `
      <div style="grid-column:1/-1;">
        <div style="font-size:10px;font-weight:600;color:#6b7280;text-transform:uppercase;letter-spacing:0.05em;margin-bottom:2px;">Address</div>
        <div style="font-size:13px;color:#111;font-weight:500;">${customer.cust_address}</div>
      </div>` : ''}
    </div>

    ${summaryRows}
    ${salesRows}
  `
}

// ── Main Drawer ───────────────────────────────────────────────────────────────
export default function CustomerDetailDrawer({ custId, onClose, onEdit, canManage }) {
  const { data, isLoading, isError } = useCustomer(custId)

  const customer     = data
  const summary      = data?.summary
  const salesHistory = data?.sales_history ?? []

  function handlePrint() {
    if (!customer) return

    // Get or create the dedicated print node in normal document flow
    const printRoot = getPrintRoot()

    // Write plain HTML with literal colors — no CSS vars, no React
    printRoot.innerHTML = buildPrintHTML(customer, summary, salesHistory)

    // Small delay to ensure DOM is painted before browser opens print dialog
    setTimeout(() => {
      window.print()
      // Clear after printing so the div stays invisible
      setTimeout(() => { printRoot.innerHTML = '' }, 500)
    }, 100)
  }

  return (
    <div style={{
      position: 'fixed', top: 0, right: 0, bottom: 0,
      width: 540,
      background: 'var(--bg-card)',
      borderLeft: '1.5px solid var(--border)',
      boxShadow: '-8px 0 32px rgba(0,0,0,0.12)',
      zIndex: 500,
      display: 'flex', flexDirection: 'column',
      overflowY: 'auto',
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
              style={{
                background: 'none',
                border: '1.5px solid var(--border)',
                borderRadius: 8,
                width: 32, height: 32,
                cursor: 'pointer',
                fontSize: 14,
                color: 'var(--text-muted)',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                transition: 'border-color 0.13s, color 0.13s',
              }}
              onMouseEnter={e => { e.currentTarget.style.borderColor = 'var(--accent-600)'; e.currentTarget.style.color = 'var(--accent-600)' }}
              onMouseLeave={e => { e.currentTarget.style.borderColor = 'var(--border)'; e.currentTarget.style.color = 'var(--text-muted)' }}
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

      {/* Body */}
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
  )
}