import { useState, useEffect, useMemo, useCallback } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { XMarkIcon } from '@heroicons/react/24/outline'
import { toast } from 'react-hot-toast'
import { fetchSale } from '../../sales/api/salesApi'
import { z } from 'zod'
import { createSalesReturn } from '../api/salesReturnsApi'
import { Button, Spinner } from '../../../shared/components'
import { textareaStyle } from '../../../shared/components/FormField'
import { formatCurrency } from '../../../shared/utils/formatCurrency'
import { formatDate } from '../../../shared/utils/formatDate'
import useAuthStore from '../../../store/authStore'

export default function CreateSalesReturnDrawer({ saleId, onClose }) {
  const queryClient = useQueryClient()
  const [reason, setReason] = useState('')
  const [restock, setRestock] = useState(true)
  const [items, setItems] = useState([])
  const [errors, setErrors] = useState({})
  const business  = useAuthStore(s => s.business)
  const country   = business?.business_country_code || 'IN'

  const { data: saleData, isLoading } = useQuery({
    queryKey: ['sale', saleId],
    queryFn: () => fetchSale(saleId),
    enabled: !!saleId,
    staleTime: 0,
  })

  const sale = saleData?.data ?? saleData

  useEffect(() => {
    if (sale?.items) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setItems(
        sale.items.map((item) => ({
          product_id: item.product_id,
          product_name: item.product_name,
          sale_item_unit_price: item.sale_item_unit_price,
          max_qty: item.sale_item_quantity,
          return_qty: '',
          refund_amount: '',
        }))
      )
    }
  }, [sale?.items])

  const returnSchema = useMemo(() =>
    z.object({
      items: z
        .array(
          z.object({
            product_id: z.string().uuid(),
            return_qty: z.coerce.number().int().positive(),
            refund_amount: z.coerce.number().positive(),
          })
        )
        .min(1, 'Select at least one item to return'),
    }),
  []
  )

  const mutation = useMutation({
    mutationFn: createSalesReturn,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['sales-returns'] })
      queryClient.invalidateQueries({ queryKey: ['sale', saleId] })
      queryClient.invalidateQueries({ queryKey: ['sales'] })
      toast.success('Return processed successfully')
      onClose()
    },
    onError: (err) => {
      const msg = err?.response?.data?.message || 'Failed to process return'
      toast.error(msg)
    },
  })

  const updateItem = useCallback((idx, field, value) => {
    setItems((prev) => {
      const next = [...prev]
      next[idx] = { ...next[idx], [field]: value }
      return next
    })
    setErrors((prev) => {
      const next = { ...prev }
      delete next[idx]
      return next
    })
  }, [])

  const totals = useMemo(() => {
    let refundTotal = 0
    let itemCount = 0
    items.forEach((item) => {
      const qty = Number(item.return_qty) || 0
      const amt = Number(item.refund_amount) || 0
      if (qty > 0 && amt > 0) {
        refundTotal += qty * amt
        itemCount++
      }
    })
    return { refundTotal, itemCount }
  }, [items])

  const handleSubmit = () => {
    const selected = items.filter(
      (item) => Number(item.return_qty) > 0 && Number(item.refund_amount) > 0
    )
    if (selected.length === 0) {
      toast.error('Select at least one item to return with a quantity and amount')
      return
    }

    const payload = {
      sale_id: saleId,
      return_reason: reason.trim() || null,
      restock,
      items: selected.map((item) => ({
        product_id: item.product_id,
        return_qty: Number(item.return_qty),
        refund_amount: Number(item.refund_amount),
      })),
    }

    const result = returnSchema.safeParse(payload)
    if (!result.success) {
      const fieldErrors = {}
      result.error.errors.forEach((err) => {
        const path = err.path.join('.')
        if (!fieldErrors[path]) fieldErrors[path] = err.message
      })
      setErrors(fieldErrors)
      toast.error('Please fix the highlighted errors')
      return
    }
    setErrors({})
    mutation.mutate(payload)
  }

  return (
    <div style={{
      position: 'fixed', top: 0, right: 0,
      width: 520, height: '100vh',
      background: 'var(--bg-card)',
      borderLeft: '1px solid var(--border)',
      boxShadow: '-8px 0 40px rgba(0,0,0,0.14)',
      zIndex: 1002,
      display: 'flex', flexDirection: 'column',
      animation: 'drawer-slide-in 0.25s cubic-bezier(0.16, 1, 0.3, 1)',
    }}>
      <style>{`
        @keyframes drawer-slide-in {
          from { transform: translateX(100%); opacity: 0; }
          to   { transform: translateX(0);    opacity: 1; }
        }
        input[type=number]::-webkit-inner-spin-button,
        input[type=number]::-webkit-outer-spin-button {
          -webkit-appearance: none; margin: 0;
        }
        input[type=number] { -moz-appearance: textfield; }
      `}</style>

      <div style={{
        padding: '22px 24px',
        borderBottom: '1px solid var(--border)',
        display: 'flex', alignItems: 'flex-start',
        justifyContent: 'space-between', gap: 16, flexShrink: 0,
      }}>
        <div>
          <h2 style={{ fontSize: 16, fontWeight: 700, color: 'var(--text-primary)', margin: 0 }}>
            Process Return
          </h2>
          {sale && (
            <p style={{ fontSize: 12, color: 'var(--text-muted)', margin: '3px 0 0' }}>
              {sale.invoice_no || 'Invoice'} · {sale.customer_name || ''}
              {sale.sales_created_at ? ` · ${formatDate(sale.sales_created_at)}` : ''}
            </p>
          )}
        </div>
        <button onClick={onClose} style={{
          background: 'var(--bg-page)', border: '1px solid var(--border)',
          cursor: 'pointer', padding: 6, borderRadius: 8,
          color: 'var(--text-muted)', display: 'flex',
        }}>
          <XMarkIcon style={{ width: 18, height: 18 }} />
        </button>
      </div>

      {isLoading ? (
        <div style={{ flex: 1, display: 'flex', justifyContent: 'center', padding: 48 }}>
          <Spinner size="md" />
        </div>
      ) : !sale ? (
        <div style={{ flex: 1, padding: 24, fontSize: 13, color: 'var(--text-muted)' }}>
          Sale not found
        </div>
      ) : (
        <div style={{ flex: 1, overflowY: 'auto', padding: 24 }}>
          <div style={{ marginBottom: 20 }}>
            <label style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.07em', color: 'var(--text-muted)', display: 'block', marginBottom: 6 }}>
              Return Reason <span style={{ fontWeight: 400, textTransform: 'none' }}>(optional)</span>
            </label>
            <textarea
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="Why is this being returned?"
              rows={2}
              style={textareaStyle}
            />
          </div>

          <label style={{
            display: 'flex', alignItems: 'center', gap: 8,
            fontSize: 13, fontWeight: 600, color: 'var(--text-primary)',
            marginBottom: 20, cursor: 'pointer',
          }}>
            <input
              type="checkbox"
              checked={restock}
              onChange={(e) => setRestock(e.target.checked)}
              style={{ accentColor: 'var(--accent-600)', cursor: 'pointer', width: 16, height: 16 }}
            />
            Restock returned items
          </label>

          <div style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.07em', color: 'var(--text-muted)', marginBottom: 10 }}>
            Items to Return
          </div>

          <div style={{
            border: '1px solid var(--border)',
            borderRadius: 12, overflow: 'hidden',
          }}>
            <div style={{
              display: 'grid',
              gridTemplateColumns: '1fr 70px 100px',
              gap: 8,
              background: 'var(--bg-subtle)',
              padding: '8px 14px',
              borderBottom: '1px solid var(--border)',
              fontSize: 11, fontWeight: 600, color: 'var(--text-muted)',
              textTransform: 'uppercase', letterSpacing: '0.05em',
            }}>
              <span>Product</span>
              <span style={{ textAlign: 'center' }}>Qty</span>
              <span style={{ textAlign: 'right' }}>Refund/Unit</span>
            </div>

            {items.map((item, idx) => {
              const qty = Number(item.return_qty) || 0
              const amt = Number(item.refund_amount) || 0
              const lineTotal = qty > 0 && amt > 0 ? qty * amt : 0
              const maxQty = item.max_qty || 0
              const maxPrice = Number(item.sale_item_unit_price) || 0
              return (
                <div
                  key={item.product_id}
                  style={{
                    display: 'grid',
                    gridTemplateColumns: '1fr 70px 100px',
                    gap: 8,
                    padding: '10px 14px',
                    borderBottom: idx < items.length - 1 ? '1px solid var(--border)' : 'none',
                    alignItems: 'center',
                  }}
                >
                  <div>
                    <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-primary)' }}>
                      {item.product_name}
                    </div>
                    <div style={{ fontSize: 11.5, color: 'var(--text-muted)', marginTop: 2 }}>
                      Max: {formatCurrency(maxPrice, country)} × {maxQty}
                    </div>
                    {lineTotal > 0 && (
                      <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--accent-600)', marginTop: 2 }}>
                        {formatCurrency(lineTotal, country)}
                      </div>
                    )}
                  </div>
                  <div>
                    <input
                      type="number"
                      min="0"
                      max={maxQty}
                      step="1"
                      value={item.return_qty}
                      onChange={(e) => updateItem(idx, 'return_qty', e.target.value)}
                      placeholder="0"
                      style={{
                        width: '100%', padding: '6px 8px', textAlign: 'center',
                        border: errors[`items.${idx}.return_qty`] ? '1.5px solid var(--danger-text)' : '1px solid var(--border)',
                        borderRadius: 6, fontSize: 13,
                        fontFamily: 'inherit', color: 'var(--text-primary)',
                        background: 'var(--bg-page)',
                        outline: 'none', boxSizing: 'border-box',
                      }}
                    />
                  </div>
                  <div>
                    <input
                      type="number"
                      min="0"
                      max={maxPrice}
                      step="0.01"
                      value={item.refund_amount}
                      onChange={(e) => updateItem(idx, 'refund_amount', e.target.value)}
                      placeholder="0.00"
                      style={{
                        width: '100%', padding: '6px 8px', textAlign: 'right',
                        border: errors[`items.${idx}.refund_amount`] ? '1.5px solid var(--danger-text)' : '1px solid var(--border)',
                        borderRadius: 6, fontSize: 13,
                        fontFamily: 'inherit', color: 'var(--text-primary)',
                        background: 'var(--bg-page)',
                        outline: 'none', boxSizing: 'border-box',
                      }}
                    />
                  </div>
                </div>
              )
            })}
          </div>

          {totals.itemCount > 0 && (
            <div style={{
              marginTop: 16, padding: '12px 16px',
              background: 'var(--bg-subtle)',
              border: '1px solid var(--border)', borderRadius: 12,
              display: 'flex', justifyContent: 'space-between',
              fontSize: 14, fontWeight: 700, color: 'var(--text-primary)',
            }}>
              <span>Total Refund</span>
              <span>{formatCurrency(totals.refundTotal, country)}</span>
            </div>
          )}
        </div>
      )}

      <div style={{
        padding: '16px 24px',
        borderTop: '1px solid var(--border)',
        display: 'flex', gap: 10, justifyContent: 'flex-end',
        flexShrink: 0,
      }}>
        <Button variant="ghost" onClick={onClose} disabled={mutation.isPending}>
          Cancel
        </Button>
        <Button
          variant="primary"
          onClick={handleSubmit}
          loading={mutation.isPending}
          disabled={isLoading || !sale}
        >
          Submit Return
        </Button>
      </div>
    </div>
  )
}
