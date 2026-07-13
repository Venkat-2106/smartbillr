// src/features/payments/components/PaymentHistoryDrawer.jsx
//
// Slide-in drawer that shows:
//   1. Sale summary — invoice_no, customer, total amount, paid, remaining
//   2. Visual progress bar (paid / total)
//   3. Full payment history table (all installments, latest first)
//   4. "Record Payment" form (shown when status is pending or partial)
//
// Data comes from usePaymentHistory(saleId) → GET /payments/sale/{id}
// Recording a payment calls the recordPayment mutation from the parent hook.

import { useState }                 from 'react'
import { useForm }                  from 'react-hook-form'
import { zodResolver }              from '@hookform/resolvers/zod'
import { XMarkIcon }                from '@heroicons/react/24/outline'
import useAuthStore                 from '../../../store/authStore'
import { usePaymentHistory }        from '../hooks/usePayments'
import { Badge, Button, Spinner, FormField } from '../../../shared/components'
import { selectStyle }              from '../../../shared/components/FormField'
import { formatCurrency }           from '../../../shared/utils/formatCurrency'
import { formatDate }               from '../../../shared/utils/formatDate'
import { PAYMENT_METHODS }          from '../../../shared/constants/paymentMethods'
import { paymentSchema }            from '../schemas/paymentSchema'

const STATUS_VARIANT = { paid: 'success', partial: 'warning', pending: 'danger' }
const STATUS_LABEL   = { paid: 'Paid',    partial: 'Partial', pending: 'Unpaid' }

const METHOD_LABEL = Object.fromEntries(
  PAYMENT_METHODS.map(m => [m.value, m.label])
)

// ── Overlay backdrop ──────────────────────────────────────────────────────────
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

// ── Progress bar component ────────────────────────────────────────────────────
function PaymentProgressBar({ paid, total, country }) {
  const pct = total > 0 ? Math.min(100, (paid / total) * 100) : 0
  const isComplete = pct >= 100

  return (
    <div>
      <div style={{
        display: 'flex', justifyContent: 'space-between',
        fontSize: 12, color: 'var(--text-muted)', marginBottom: 6,
      }}>
        <span>Paid: <strong style={{ color: 'var(--text-primary)' }}>{formatCurrency(paid, country)}</strong></span>
        <span>Total: <strong style={{ color: 'var(--text-primary)' }}>{formatCurrency(total, country)}</strong></span>
      </div>
      <div style={{
        height: 8, borderRadius: 99,
        background: 'var(--bg-subtle)',
        border: '1px solid var(--border)',
        overflow: 'hidden',
      }}>
        <div style={{
          height: '100%',
          width: `${pct}%`,
          background: isComplete
            ? 'linear-gradient(90deg, #10B981, #059669)'
            : 'linear-gradient(90deg, var(--accent-500), var(--accent-600))',
          borderRadius: 99,
          transition: 'width 0.4s ease',
        }} />
      </div>
      <div style={{
        fontSize: 11.5, color: 'var(--text-muted)',
        marginTop: 4, textAlign: 'right',
      }}>
        {pct.toFixed(0)}% paid
      </div>
    </div>
  )
}

// ── Main Drawer ───────────────────────────────────────────────────────────────
export default function PaymentHistoryDrawer({ saleId, onClose, onRecorded, isRecording }) {
  const { data, isLoading } = usePaymentHistory(saleId)
  const [showForm, setShowForm]   = useState(false)
  const business  = useAuthStore(s => s.business)
  const country   = business?.business_country_code || 'IN'

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm({
    resolver:      zodResolver(paymentSchema),
    defaultValues: { payment_amount: '', payment_method: 'cash' },
  })

  const canRecord = data?.current_status === 'pending' || data?.current_status === 'partial'

  function onSubmit(formData) {
    onRecorded(
      {
        sale_id:        saleId,
        payment_amount: Number(formData.payment_amount),
        payment_method: formData.payment_method,
      },
      {
        onSuccess: () => {
          reset()
          setShowForm(false)
        },
      }
    )
  }

  return (
    <div style={{
      position: 'fixed', top: 0, right: 0,
      width: 460, height: '100vh',
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
        padding: '20px 24px',
        borderBottom: '1px solid var(--border)',
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        flexShrink: 0,
      }}>
        <div>
          <h3 style={{ margin: 0, fontSize: 16, fontWeight: 700, color: 'var(--text-primary)' }}>
            Payment History
          </h3>
          {data?.invoice_no && (
            <p style={{ margin: '2px 0 0', fontSize: 13, color: 'var(--text-muted)' }}>
              {data.invoice_no} · {data.customer_name}
            </p>
          )}
        </div>
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

      {/* Scrollable body */}
      <div style={{ flex: 1, overflowY: 'auto', padding: '20px 24px' }}>

        {isLoading && (
          <div style={{ display: 'flex', justifyContent: 'center', padding: 40 }}>
            <Spinner size={28} />
          </div>
        )}

        {!isLoading && data && (
          <>
            {/* Summary card */}
            <div style={{
              background: 'var(--bg-subtle)',
              border: '1px solid var(--border)',
              borderRadius: 12, padding: '16px 18px', marginBottom: 20,
            }}>
              <div style={{
                display: 'flex', justifyContent: 'space-between',
                alignItems: 'center', marginBottom: 14,
              }}>
                <span style={{ fontSize: 13, color: 'var(--text-muted)' }}>Payment Status</span>
                <Badge
                  variant={STATUS_VARIANT[data.current_status] || 'neutral'}
                  label={STATUS_LABEL[data.current_status] || data.current_status}
                  dot
                />
              </div>

              <PaymentProgressBar paid={data.total_paid} total={data.sale_final_amount} country={country} />

              {data.remaining_balance > 0 && (
                <div style={{
                  marginTop: 12, padding: '8px 12px',
                  background: 'var(--bg-card)',
                  border: '1px solid var(--border)',
                  borderRadius: 8,
                  display: 'flex', justifyContent: 'space-between',
                  fontSize: 13,
                }}>
                  <span style={{ color: 'var(--text-muted)' }}>Remaining Balance</span>
                  <span style={{ fontWeight: 700, color: 'var(--danger-text, #EF4444)' }}>
                    {formatCurrency(data.remaining_balance, country)}
                  </span>
                </div>
              )}
            </div>

            {/* Record Payment form */}
            {canRecord && (
              <div style={{ marginBottom: 20 }}>
                {!showForm ? (
                  <Button
                    variant="primary"
                    style={{ width: '100%' }}
                    onClick={() => setShowForm(true)}
                  >
                    + Record Payment
                  </Button>
                ) : (
                  <div style={{
                    background: 'var(--bg-subtle)',
                    border: '1px solid var(--accent-ring, var(--border))',
                    borderRadius: 12, padding: '16px 18px',
                  }}>
                    <h4 style={{ margin: '0 0 14px', fontSize: 14, fontWeight: 600, color: 'var(--text-primary)' }}>
                      Record New Payment
                    </h4>
                    <form onSubmit={handleSubmit(onSubmit)} noValidate>

                      <FormField label="Amount" error={errors.payment_amount?.message} required style={{ marginBottom: 12 }}>
                        <input
                          {...register('payment_amount')}
                          type="number"
                          step="0.01"
                          min="0.01"
                          max={data.remaining_balance}
                          placeholder={`Max ${formatCurrency(data.remaining_balance, country)}`}
                          style={{
                            width: '100%', padding: '9px 12px',
                            border: '1px solid var(--border)',
                            borderRadius: 8, fontSize: 14,
                            background: 'var(--bg-card)',
                            color: 'var(--text-primary)',
                            outline: 'none', boxSizing: 'border-box',
                          }}
                          autoFocus
                        />
                      </FormField>

                      <FormField label="Payment Method" error={errors.payment_method?.message} style={{ marginBottom: 16 }}>
                        <select {...register('payment_method')} style={selectStyle}>
                          {PAYMENT_METHODS.map(m => (
                            <option key={m.value} value={m.value}>{m.label}</option>
                          ))}
                        </select>
                      </FormField>

                      <div style={{ display: 'flex', gap: 8 }}>
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          onClick={() => { setShowForm(false); reset() }}
                          disabled={isRecording}
                          style={{ flex: 1 }}
                        >
                          Cancel
                        </Button>
                        <Button
                          type="submit"
                          variant="primary"
                          size="sm"
                          loading={isRecording}
                          style={{ flex: 1 }}
                        >
                          Save Payment
                        </Button>
                      </div>

                    </form>
                  </div>
                )}
              </div>
            )}

            {/* Payment history list */}
            <div>
              <h4 style={{
                margin: '0 0 12px', fontSize: 13, fontWeight: 600,
                color: 'var(--text-secondary)', textTransform: 'uppercase',
                letterSpacing: '0.06em',
              }}>
                History ({data.payment_history?.length ?? 0} installment{data.payment_history?.length !== 1 ? 's' : ''})
              </h4>

              {data.payment_history?.length === 0 && (
                <div style={{ fontSize: 13, color: 'var(--text-muted)', padding: '20px 0', textAlign: 'center' }}>
                  No payments recorded yet.
                </div>
              )}

              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {data.payment_history?.map((p, i) => (
                  <div
                    key={p.payment_id}
                    style={{
                      background: p.is_active ? 'var(--bg-subtle)' : 'var(--bg-card)',
                      border: `1px solid ${p.is_active ? 'var(--accent-ring, var(--border))' : 'var(--border)'}`,
                      borderRadius: 'var(--r-md)', padding: '12px 14px',
                      opacity: p.is_active ? 1 : 0.75,
                    }}
                  >
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <span style={{ fontSize: 15, fontWeight: 700, color: 'var(--text-primary)' }}>
                          {formatCurrency(p.payment_amount, country)}
                        </span>
                        {p.is_active && (
                          <span style={{
                            fontSize: 10, fontWeight: 700,
                            background: 'var(--accent-100, var(--bg-subtle))',
                            color: 'var(--accent-600)',
                            padding: '2px 7px', borderRadius: 99,
                            textTransform: 'uppercase', letterSpacing: '0.05em',
                          }}>
                            Latest
                          </span>
                        )}
                      </div>
                      <Badge
                        variant={STATUS_VARIANT[p.payment_status] || 'neutral'}
                        label={STATUS_LABEL[p.payment_status] || p.payment_status}
                      />
                    </div>

                    <div style={{
                      display: 'flex', justifyContent: 'space-between',
                      fontSize: 12, color: 'var(--text-muted)',
                    }}>
                      <span>{METHOD_LABEL[p.payment_method] || p.payment_method?.toUpperCase() || '—'}</span>
                      <span>{p.payment_paid_at ? formatDate(p.payment_paid_at) : '—'}</span>
                    </div>

                    <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 4 }}>
                      Cumulative paid: {formatCurrency(p.cumulative_paid, country)}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  )
}