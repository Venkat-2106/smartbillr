// src/features/purchases/components/PurchaseDetailDrawer.jsx
//
// Slide-in drawer showing full purchase detail:
//   1. Header — supplier, date, payment status + status updater
//   2. Financial summary — subtotal, discount, tax, final total
//   3. Line items table — product, qty, unit price, subtotal
//   4. Returns list (if any)
//
// Data via usePurchaseDetail(purId) → GET /purchases/{id}
// Status update calls updateStatus from parent hook.

import { useState }               from 'react'
import { XMarkIcon, DocumentTextIcon } from '@heroicons/react/24/outline'
import { usePurchaseDetail }       from '../hooks/usePurchases'
import { Badge, Button, Spinner }  from '../../../shared/components'
import { selectStyle }             from '../../../shared/components/FormField'
import { formatCurrency }          from '../../../shared/utils/formatCurrency'
import { formatDate }              from '../../../shared/utils/formatDate'
import { usePermissions }          from '../../../shared/hooks/usePermissions'
import { getTaxLabel, detectTaxType } from '../../../shared/utils/formatTax'  // FIX: added detectTaxType to prevent double-counted tax rows
import useAuthStore                from '../../../store/authStore'
import CreatePurchaseReturnDrawer  from '../../purchaseReturns/components/CreatePurchaseReturnDrawer'

const STATUS_VARIANT = { paid: 'success', partial: 'warning', pending: 'danger' }
const STATUS_LABEL   = { paid: 'Paid',    partial: 'Partial', pending: 'Unpaid' }

export function DrawerOverlay({ open, onClick }) {
  if (!open) return null
  return (
    <div
      onClick={onClick}
      style={{
        position: 'fixed', inset: 0,
        background: 'rgba(0,0,0,0.35)',
        backdropFilter: 'blur(2px)',
        zIndex: 1000,
        animation: 'fadeIn 0.18s ease both',
      }}
    />
  )
}

// ── Section label ─────────────────────────────────────────────────────────────
function SectionLabel({ children }) {
  return (
    <div style={{
      fontSize: 11, fontWeight: 700, color: 'var(--text-muted)',
      textTransform: 'uppercase', letterSpacing: '0.07em',
      marginBottom: 10, marginTop: 20,
    }}>
      {children}
    </div>
  )
}

// ── Summary row ───────────────────────────────────────────────────────────────
function SummaryRow({ label, value, bold, danger }) {
  return (
    <div style={{
      display: 'flex', justifyContent: 'space-between',
      fontSize: 13, padding: '4px 0',
      borderTop: bold ? '1px solid var(--border)' : 'none',
      marginTop: bold ? 6 : 0,
    }}>
      <span style={{ color: 'var(--text-muted)' }}>{label}</span>
      <span style={{
        fontWeight: bold ? 700 : 500,
        color: danger ? 'var(--danger-text, #EF4444)' : 'var(--text-primary)',
        fontSize: bold ? 14 : 13,
      }}>
        {value}
      </span>
    </div>
  )
}

export default function PurchaseDetailDrawer({ purId, onClose, onUpdateStatus, isUpdatingStatus, canEdit, onDelete, onRecordPayment, isRecordingPayment }) {
  const { data, isLoading } = usePurchaseDetail(purId)
  const [editingStatus, setEditingStatus] = useState(false)
  const [newStatus,     setNewStatus]     = useState('')
  const [paymentAmount, setPaymentAmount] = useState('')
  const [showReturnDrawer, setShowReturnDrawer] = useState(false)
  const business  = useAuthStore(s => s.business)
  const country   = business?.business_country_code || 'IN'
  const isGstRegistered = business?.is_gst_registered || false

  const { can } = usePermissions()

  function handleStatusSave() {
    if (!newStatus) return
    if (newStatus === 'partial' && paymentAmount) {
      // Record a partial payment directly
      onRecordPayment(purId, {
        payment_amount: parseFloat(paymentAmount),
        payment_method: 'cash',
      }, {
        onSuccess: () => {
          setEditingStatus(false)
          setPaymentAmount('')
        },
      })
    } else if (newStatus === 'paid') {
      // Record full payment — compute remaining from current data.
      // ── REFUND-AWARE REMAINING (2026-07) ──────────────────────────────────
      // Approved purchase returns reduce the amount still owed.  The
      // remaining is used both to determine whether to fire onRecordPayment
      // vs onUpdateStatus, and as the payment_amount sent to the backend.
      const finalAmount = data.pur_final_amount || 0
      const alreadyPaid = data.total_paid || 0
      const totalRefunded = data.total_refunded || 0
      const remaining = Math.max(0, finalAmount - alreadyPaid - totalRefunded)
      if (remaining > 0) {
        onRecordPayment(purId, {
          payment_amount: remaining,
          payment_method: 'cash',
        }, {
          onSuccess: () => {
            setEditingStatus(false)
            setPaymentAmount('')
          },
        })
      } else {
        // Already fully paid, just update the status
        onUpdateStatus(purId, newStatus, {
          onSuccess: () => {
            setEditingStatus(false)
            setPaymentAmount('')
          },
        })
      }
    } else {
      onUpdateStatus(purId, newStatus, {
        onSuccess: () => {
          setEditingStatus(false)
          setPaymentAmount('')
        },
      })
    }
  }

  const hasTax = data && (
    (data.pur_cgst_total || 0) > 0 ||
    (data.pur_sgst_total || 0) > 0 ||
    (data.pur_igst_total || 0) > 0 ||
    (data.pur_tax_total  || 0) > 0
  )

  return (
    <div style={{
      position: 'fixed', top: 0, right: 0,
      width: 500, height: '100vh',
      background: 'var(--bg-card)',
      borderLeft: '1px solid var(--border)',
      boxShadow: '-4px 0 32px rgba(0,0,0,0.12)',
      zIndex: 1001,
      display: 'flex', flexDirection: 'column',
      animation: 'slideInRight 0.22s cubic-bezier(0.22,1,0.36,1) both',
    }}>
      <style>{`
        @keyframes slideInRight {
          from { transform: translateX(100%); opacity: 0; }
          to   { transform: translateX(0);    opacity: 1; }
        }
        @keyframes fadeIn {
          from { opacity: 0; } to { opacity: 1; }
        }
      `}</style>

      {/* Header */}
      <div style={{
        padding: '22px 24px',
        borderBottom: '1px solid var(--border)',
        display: 'flex', alignItems: 'flex-start',
        justifyContent: 'space-between', gap: 16,
        flexShrink: 0,
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
          <div style={{
            width: 48, height: 48, borderRadius: 14, flexShrink: 0,
            background: 'linear-gradient(135deg, var(--accent-600), var(--accent-500))',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}>
            <DocumentTextIcon style={{ width: 24, height: 24, color: '#fff' }} />
          </div>
          <div>
            <h2 style={{ fontSize: 16, fontWeight: 700, color: 'var(--text-primary)', margin: 0, lineHeight: 1.3 }}>
              {data?.pur_invoice_no || 'Purchase'}
            </h2>
            <p style={{ fontSize: 12, color: 'var(--text-muted)', margin: '3px 0 0' }}>
              Purchase Invoice
            </p>
          </div>
        </div>
        <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
          {onDelete && data && (
            <button
              onClick={() => onDelete(data)}
              style={{
                background: 'none', border: '1.5px solid var(--danger-border, #FECACA)',
                cursor: 'pointer', color: 'var(--danger-text, #DC2626)',
                padding: '4px 10px', borderRadius: 8,
                fontSize: 12, fontWeight: 600,
                display: 'flex', alignItems: 'center', gap: 4,
              }}
              title="Delete purchase"
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <polyline points="3 6 5 6 21 6" />
                <path d="M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6m3 0V4a2 2 0 012-2h4a2 2 0 012 2v2" />
              </svg>
              Delete
            </button>
          )}
          {data && can('purchase_returns.manage') && (
            <button
              onClick={() => setShowReturnDrawer(true)}
              disabled={isLoading}
              style={{
                background: 'var(--bg-page)', border: '1px solid var(--border)',
                cursor: isLoading ? 'not-allowed' : 'pointer',
                padding: '4px 10px', borderRadius: 8,
                color: isLoading ? 'var(--text-muted)' : 'var(--text-secondary)',
                fontSize: 12, fontWeight: 600,
                display: 'flex', alignItems: 'center', gap: 4,
                fontFamily: 'inherit',
                opacity: isLoading ? 0.5 : 1,
              }}
            >
              Process Return
            </button>
          )}
          <button
            onClick={onClose}
            style={{
              background: 'none', border: 'none', cursor: 'pointer',
              color: 'var(--text-muted)', padding: 6, borderRadius: 8,
              display: 'flex', alignItems: 'center',
            }}
          >
            <XMarkIcon style={{ width: 20, height: 20 }} />
          </button>
        </div>
      </div>

      {/* Body */}
      <div style={{ flex: 1, overflowY: 'auto', padding: '20px 24px' }}>

        {isLoading && (
          <div style={{ display: 'flex', justifyContent: 'center', padding: 40 }}>
            <Spinner size={28} />
          </div>
        )}

        {!isLoading && data && (
          <>
            {/* Status row */}
            <div style={{
              background: 'var(--bg-subtle)',
              border: '1px solid var(--border)',
              borderRadius: 12, padding: '14px 16px',
              display: 'flex', alignItems: 'center',
              justifyContent: 'space-between', gap: 12,
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <span style={{ fontSize: 13, color: 'var(--text-muted)' }}>Payment Status</span>
                <Badge
                  variant={STATUS_VARIANT[data.pur_payment_status] || 'neutral'}
                  label={STATUS_LABEL[data.pur_payment_status]    || data.pur_payment_status || '—'}
                  dot
                />
              </div>
              {canEdit && !editingStatus && data.pur_payment_status !== 'paid' && (
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={() => { setNewStatus(data.pur_payment_status); setEditingStatus(true) }}
                >
                  Update Status
                </Button>
              )}
            </div>

            {/* Inline status editor */}
            {canEdit && editingStatus && (
              <div style={{
                background: 'var(--bg-subtle)',
                border: '1px solid var(--accent-ring, var(--border))',
                borderRadius: 'var(--r-md)', padding: '12px 14px',
                marginTop: 10,
              }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <select
                    value={newStatus}
                    onChange={e => setNewStatus(e.target.value)}
                    className="sb-select"
                    style={{ ...selectStyle, flex: 1 }}
                  >
                    <option value="pending">Unpaid (Pending)</option>
                    <option value="partial">Partial</option>
                    <option value="paid">Paid</option>
                  </select>
                  <Button
                    variant="primary"
                    size="sm"
                    loading={isUpdatingStatus || isRecordingPayment}
                    disabled={newStatus === 'partial' && (!paymentAmount || parseFloat(paymentAmount) <= 0)}
                    onClick={handleStatusSave}
                  >
                    Save
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => { setEditingStatus(false); setPaymentAmount('') }}
                    disabled={isUpdatingStatus || isRecordingPayment}
                  >
                    Cancel
                  </Button>
                </div>

                {/* Partial payment amount input */}
                {newStatus === 'partial' && (
                  <div style={{ marginTop: 10 }}>
                    <label style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-muted)', display: 'block', marginBottom: 4 }}>
                      Payment Amount
                    </label>
                    <input
                      type="number"
                      min="0.01"
                      step="0.01"
                      placeholder="Enter amount being paid now"
                      value={paymentAmount}
                      onChange={e => setPaymentAmount(e.target.value)}
                      style={{
                        width: '100%', padding: '8px 10px',
                        border: '1px solid var(--border)',
                        borderRadius: 'var(--r-sm, 6px)',
                        fontSize: 13, fontFamily: 'inherit',
                        background: 'var(--bg-card)',
                        color: 'var(--text-primary)',
                        boxSizing: 'border-box',
                      }}
                    />
                    {paymentAmount && parseFloat(paymentAmount) > 0 && (
                      <div style={{ fontSize: 11.5, color: 'var(--text-muted)', marginTop: 4 }}>
                        Remaining after payment: {formatCurrency(
                          Math.max(0, (data.pur_final_amount || 0) - (data.total_paid || 0) - parseFloat(paymentAmount)),
                          country
                        )}
                      </div>
                    )}
                  </div>
                )}
              </div>
            )}

            {/* Financial Summary */}
            <SectionLabel>Summary</SectionLabel>
            <div style={{
              background: 'var(--bg-subtle)',
              border: '1px solid var(--border)',
              borderRadius: 12, padding: '14px 16px',
            }}>
              <SummaryRow label="Subtotal"         value={formatCurrency(data.pur_total_amount || 0, country)} />
              {(data.pur_discount || 0) > 0 && (
                <SummaryRow label="Discount"       value={`− ${formatCurrency(data.pur_discount, country)}`} danger />
              )}
              {/* FIX: Use detectTaxType() for mutually exclusive tax rows —
                  previously CGST+SGST+generic all rendered simultaneously,
                  double-counting tax for India purchases. */}
              {hasTax && (() => {
                const tt = detectTaxType(data)
                if (tt === 'cgst_sgst') {
                  return <>
                    <SummaryRow label="CGST" value={formatCurrency(data.pur_cgst_total || 0, country)} />
                    <SummaryRow label="SGST" value={formatCurrency(data.pur_sgst_total || 0, country)} />
                  </>
                }
                if (tt === 'igst') {
                  return <SummaryRow label="IGST" value={formatCurrency(data.pur_igst_total || 0, country)} />
                }
                return <SummaryRow label={getTaxLabel(country, isGstRegistered)} value={formatCurrency(data.pur_tax_total || 0, country)} />
              })()}
              <SummaryRow label="Total"            value={formatCurrency(data.pur_final_amount || 0, country)} bold />
              {data.total_paid > 0 && (
                <SummaryRow label="Paid Amount"     value={formatCurrency(data.total_paid, country)} />
              )}
              {/* REFUND ROW (2026-07): Shows total approved purchase return
                  amount.  Displayed in red with a minus sign to indicate
                  credit back to the business.  The backend adjusts
                  remaining_balance using this value. */}
              {(data.total_refunded || 0) > 0 && (
                <SummaryRow label="Refunded"         value={`− ${formatCurrency(data.total_refunded, country)}`} danger />
              )}
              {data.remaining_balance > 0 && (
                <SummaryRow label="Due Amount"      value={formatCurrency(data.remaining_balance, country)} danger />
              )}
            </div>

            {/* Line Items */}
            <SectionLabel>Items ({data.items?.length ?? 0})</SectionLabel>
            <div style={{
              border: '1px solid var(--border)',
              borderRadius: 12, overflow: 'hidden',
            }}>
              {/* Table header */}
              <div style={{
                display: 'grid',
                gridTemplateColumns: '1fr 60px 90px 90px',
                background: 'var(--bg-subtle)',
                borderBottom: '1px solid var(--border)',
                padding: '8px 14px',
                fontSize: 11, fontWeight: 600,
                color: 'var(--text-muted)', textTransform: 'uppercase',
                letterSpacing: '0.05em',
              }}>
                <span>Product</span>
                <span style={{ textAlign: 'center' }}>Qty</span>
                <span style={{ textAlign: 'right' }}>Unit Price</span>
                <span style={{ textAlign: 'right' }}>Subtotal</span>
              </div>

              {data.items?.length === 0 && (
                <div style={{ padding: '20px 14px', fontSize: 13, color: 'var(--text-muted)', textAlign: 'center' }}>
                  No items
                </div>
              )}

              {data.items?.map((item, i) => (
                <div
                  key={item.item_id}
                  style={{
                    display: 'grid',
                    gridTemplateColumns: '1fr 60px 90px 90px',
                    padding: '10px 14px',
                    borderBottom: i < data.items.length - 1 ? '1px solid var(--border)' : 'none',
                    fontSize: 13,
                  }}
                >
                  <div>
                    <div style={{ fontWeight: 600, color: 'var(--text-primary)' }}>
                      {item.prod_name || '—'}
                    </div>
                    {(item.gst_rate || 0) > 0 && (
                      <div style={{ fontSize: 11.5, color: 'var(--text-muted)', marginTop: 2 }}>
                        {getTaxLabel(country, isGstRegistered)} {item.gst_rate}%
                      </div>
                    )}
                  </div>
                  <div style={{ textAlign: 'center', color: 'var(--text-secondary)', fontWeight: 600 }}>
                    {item.pur_item_qty}
                  </div>
                  <div style={{ textAlign: 'right', color: 'var(--text-secondary)' }}>
                    {formatCurrency(item.item_unit_price, country)}
                  </div>
                  <div style={{ textAlign: 'right', fontWeight: 600, color: 'var(--text-primary)' }}>
                    {formatCurrency(item.item_total_with_tax || item.item_subtotal || 0, country)}
                  </div>
                </div>
              ))}
            </div>

            {/* Returns */}
            {(data.returns?.length ?? 0) > 0 && (
              <>
                <SectionLabel>Returns ({data.total_returns})</SectionLabel>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  {data.returns.map(ret => (
                    <div
                      key={ret.return_id}
                      style={{
                        background: 'var(--bg-subtle)',
                        border: '1px solid var(--border)',
                        borderRadius: 'var(--r-md)', padding: '12px 14px',
                      }}
                    >
                      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
                        <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-primary)' }}>
                          Return — {formatCurrency(ret.total_refund_amount, country)}
                        </span>
                        <Badge
                          variant={
                            ret.return_status === 'approved' ? 'success'
                            : ret.return_status === 'rejected' ? 'danger'
                            : 'warning'
                          }
                          label={ret.return_status?.charAt(0).toUpperCase() + ret.return_status?.slice(1) || '—'}
                        />
                      </div>
                      {ret.return_reason && (
                        <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>
                          Reason: {ret.return_reason}
                        </div>
                      )}
                      <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 4 }}>
                        {ret.return_created_at ? formatDate(ret.return_created_at) : '—'}
                      </div>
                    </div>
                  ))}
                </div>
              </>
            )}
          </>
        )}
      </div>

      {showReturnDrawer && (
        <CreatePurchaseReturnDrawer
          purchaseId={purId}
          onClose={() => setShowReturnDrawer(false)}
        />
      )}
    </div>
  )
}