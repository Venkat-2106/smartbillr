// src/features/stock/components/AdjustStockModal.jsx
//
// Modal for adjusting product stock quantity.
// Permission required: stock.adjust (checked in StockPage before rendering).
//
// Three adjustment types (matches backend StockAdjustment schema):
//   "add"    → increases stock by qty  (e.g. received new delivery)
//   "remove" → decreases stock by qty  (e.g. damaged/expired/lost)
//   "set"    → fixes stock to exact qty (e.g. physical count correction)
//
// Follows project's Modal + React Hook Form + Zod pattern exactly
// (mirrors CategoriesPage CategoryForm / ProductsPage form patterns).

import { useEffect } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'

import {
  Modal,
  Button,
  FormField,
  Input,
} from '../../../shared/components'
import { selectStyle, textareaStyle } from '../../../shared/components/FormField'
import { useStockAdjust } from '../hooks/useStock'
import { adjustSchema } from '../schemas/adjustSchema'

// ── Type descriptions shown to user ────────────────────────────────────────────
const TYPE_INFO = {
  add:    { label: 'Add Stock',      desc: 'Increase stock (received goods, returned items)', icon: '↑', color: 'var(--success-text, #16A34A)' },
  remove: { label: 'Remove Stock',   desc: 'Decrease stock (damaged, expired, lost)',         icon: '↓', color: 'var(--danger-text, #DC2626)' },
  set:    { label: 'Set Exact Count',desc: 'Override to exact quantity (physical stock count)', icon: '=', color: '#0284C7' },
}

export default function AdjustStockModal({ open, onClose, product }) {
  const { doAdjust, isAdjusting } = useStockAdjust()

  const {
    register,
    handleSubmit,
    watch,
    reset,
    formState: { errors },
  } = useForm({
    resolver: zodResolver(adjustSchema),
    defaultValues: { adjustment_type: 'add', qty: '', move_notes: '' },
  })

  // Reset form every time a different product is opened
  useEffect(() => {
    if (open) {
      reset({ adjustment_type: 'add', qty: '', move_notes: '' })
    }
  }, [open, product?.prod_id, reset])

  const selectedType = watch('adjustment_type')
  const typeInfo     = TYPE_INFO[selectedType] ?? TYPE_INFO.add

  function onSubmit(values) {
    doAdjust(
      {
        product_id:      product.prod_id,
        adjustment_type: values.adjustment_type,
        qty:             values.qty,
        move_notes:      values.move_notes || undefined,
      },
      { onSuccess: () => onClose() }
    )
  }

  if (!product) return null

  return (
    <Modal
      key={product.prod_id}
      open={open}
      onClose={onClose}
      title="Adjust Stock"
      subtitle={product.prod_name}
      size="sm"
    >
      {/* Current stock display */}
      <div style={{
        background: 'var(--bg-subtle)',
        border: '1px solid var(--border)',
        borderRadius: 12,
        padding: '14px 16px',
        marginBottom: 20,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
      }}>
        <span style={{ fontSize: 13, color: 'var(--text-secondary)', fontWeight: 500 }}>
          Current Stock
        </span>
        <span style={{ fontSize: 20, fontWeight: 800, color: 'var(--text-primary)', letterSpacing: '-0.5px' }}>
          {product.prod_stock_qty}
          {product.unit && (
            <span style={{ fontSize: 12, fontWeight: 500, color: 'var(--text-muted)', marginLeft: 4 }}>
              {product.unit}
            </span>
          )}
        </span>
      </div>

      <form onSubmit={handleSubmit(onSubmit)}>
        {/* Adjustment type */}
        <FormField label="Adjustment Type" error={errors.adjustment_type} required style={{ marginBottom: 16 }}>
          <select
            {...register('adjustment_type')}
            className="sb-select"
            style={selectStyle}
          >
            {Object.entries(TYPE_INFO).map(([val, info]) => (
              <option key={val} value={val}>{info.icon} {info.label}</option>
            ))}
          </select>
        </FormField>

        {/* Type description pill */}
        {selectedType && (
          <div style={{
            fontSize: 12,
            color: typeInfo.color,
            background: 'var(--bg-subtle)',
            border: `1px solid ${typeInfo.color}33`,
            borderRadius: 8,
            padding: '6px 12px',
            marginBottom: 16,
            fontWeight: 500,
          }}>
            {typeInfo.desc}
          </div>
        )}

        {/* Quantity */}
        <FormField label="Quantity" error={errors.qty?.message} required style={{ marginBottom: 16 }}>
          <Input
            type="number"
            min="1"
            step="1"
            placeholder="e.g. 10"
            autoFocus
            error={errors.qty?.message}
            {...register('qty')}
          />
        </FormField>

        {/* Reason / notes */}
        <FormField label="Reason (optional)" error={errors.move_notes?.message} style={{ marginBottom: 0 }}>
          <textarea
            placeholder="e.g. Physical count correction, received from supplier…"
            rows={2}
            style={{ ...textareaStyle, minHeight: 64 }}
            {...register('move_notes')}
          />
        </FormField>

        <Modal.Footer>
          <Button variant="ghost" onClick={onClose} disabled={isAdjusting} type="button">
            Cancel
          </Button>
          <Button type="submit" variant="primary" loading={isAdjusting}>
            Apply Adjustment
          </Button>
        </Modal.Footer>
      </form>
    </Modal>
  )
}