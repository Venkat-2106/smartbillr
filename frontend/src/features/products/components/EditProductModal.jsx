// src/features/products/components/EditProductModal.jsx
//
// Extracted from ProductsPage.jsx (Task 4 — modal extraction, no behaviour
// change). Contains the Modal wrapper + EditProductForm previously defined
// inline in ProductsPage.jsx.
//
// Same nameError / onNameErrorClear / barcodeError / onBarcodeErrorClear
// pattern as AddProductModal — see productFormShared.js for shared schema
// and barcode helpers.

import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'

import {
  Button,
  Modal,
  FormField,
  Input,
  selectStyle,
} from '../../../shared/components'

import { checkBarcode } from '../api/productsApi'
import { UNITS, editSchema, generateEAN13, handleBarcodeKeyUp } from './productFormShared'

// ── Edit Product Form ─────────────────────────────────────────────────────────
// Same nameError / onNameErrorClear pattern as AddProductForm.
function EditProductForm({ defaultValues, onSubmit, onClose, isPending, categories, canViewProfit, nameError, onNameErrorClear, barcodeError, onBarcodeErrorClear, excludeProdId }) {
  const { register, handleSubmit, setValue, formState: { errors } } = useForm({
    resolver: zodResolver(editSchema),
    defaultValues,
  })

  const nameFieldError    = errors.prod_name || (nameError    ? { message: nameError    } : undefined)
  const barcodeFieldError = errors.barcode   || (barcodeError ? { message: barcodeError } : undefined)

  function generateBarcode() {
    setValue('barcode', generateEAN13(), { shouldValidate: true })
    onBarcodeErrorClear?.(null)
  }

  async function handleBarcodeBlur(e) {
    const val = e.target.value?.trim()
    if (!val) return
    try {
      // excludeProdId: don't flag a product's own barcode as duplicate when editing
      const taken = await checkBarcode(val, excludeProdId)
      if (taken) onBarcodeErrorClear?.('A product with this barcode already exists.')
    } catch { /* backend will validate on submit */ }
  }

  return (
    <form onSubmit={handleSubmit(onSubmit)}>
      <div style={{
        background: 'var(--bg-page)',
        border: '1.5px solid var(--border)',
        borderRadius: 10,
        padding: '10px 14px',
        marginBottom: 16,
        fontSize: 12.5,
        color: 'var(--text-muted)',
        display: 'flex',
        alignItems: 'center',
        gap: 8,
      }}>
        <span>📦</span>
        <span>
          Current stock: <strong style={{ color: 'var(--text-primary)' }}>
            {defaultValues._stock_qty ?? '—'} {defaultValues.unit ?? 'pcs'}
          </strong>
          &nbsp;— to adjust stock, use the <strong>Stock</strong> page.
        </span>
      </div>

      <FormField label="Product Name" error={nameFieldError} required style={{ marginBottom: 16 }}>
        <Input
          placeholder="e.g. Basmati Rice 5kg"
          autoFocus
          {...register('prod_name')}
          onInput={() => { if (nameError) onNameErrorClear?.() }}
        />
      </FormField>

      <div style={{ display: 'grid', gridTemplateColumns: canViewProfit ? '1fr 1fr' : '1fr', gap: 12, marginBottom: 16 }}>
        <FormField label="Selling Price" error={errors.prod_sell_price} required>
          <Input type="number" step="0.01" placeholder="0.00" {...register('prod_sell_price')} />
        </FormField>
        {canViewProfit && (
          <FormField label="Cost Price" error={errors.prod_cost_price} required>
            <Input type="number" step="0.01" placeholder="0.00" {...register('prod_cost_price')} />
          </FormField>
        )}
        {!canViewProfit && (
          <input type="hidden" {...register('prod_cost_price')} />
        )}
      </div>

      {/* MRP FEATURE: optional Maximum Retail Price field */}
      <FormField
        label="MRP (Maximum Retail Price)"
        error={errors.prod_mrp}
        helper="Printed price on the product — set to 0 to clear. Discount shown on invoices = MRP − selling price."
        style={{ marginBottom: 16 }}
      >
        <Input
          type="number" step="0.01" min="0"
          placeholder="0.00 — leave blank if not applicable"
          {...register('prod_mrp')}
        />
      </FormField>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 16 }}>
        <FormField label="Low Stock Alert" error={errors.prod_low_stock_alert} helper="Alert when stock falls below this">
          <Input type="number" step="1" placeholder="10" {...register('prod_low_stock_alert')} />
        </FormField>
        <FormField label="Unit" error={errors.unit}>
          <select className="sb-select" {...register('unit')} style={selectStyle}>
            {UNITS.map(u => <option key={u} value={u}>{u}</option>)}
          </select>
        </FormField>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 16 }}>
        <FormField label="Category" error={errors.category_id}>
          <select className="sb-select" {...register('category_id')} style={selectStyle}>
            <option value="">— No category —</option>
            {categories.map(c => (
              <option key={c.category_id} value={c.category_id}>{c.category_name}</option>
            ))}
          </select>
        </FormField>
        <FormField label="Tax Rate (%)" error={errors.tax_rate} helper="e.g. 0, 5, 7.5, 10, 18, 20">
          <Input type="number" step="0.01" min="0" max="100" placeholder="e.g. 18" {...register('tax_rate')} />
        </FormField>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 8 }}>
        <FormField label="Tax Code (HSN / SAC)" error={errors.tax_code} helper="Optional">
          <Input placeholder="e.g. 1006" {...register('tax_code')} />
        </FormField>
        {/* BARCODE FIX: Generate button + scanner support + inline duplicate error */}
        <FormField label="Barcode" error={barcodeFieldError} helper="Scan, type, or generate">
          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            <Input
              placeholder="e.g. 8901234567890"
              {...register('barcode')}
              onKeyUp={handleBarcodeKeyUp}
              onBlur={handleBarcodeBlur}
              onInput={() => { if (barcodeError) onBarcodeErrorClear?.(null) }}
              style={{ flex: 1 }}
            />
            <Button
              type="button"
              variant="secondary"
              size="sm"
              onClick={generateBarcode}
              style={{ whiteSpace: 'nowrap', flexShrink: 0 }}
            >
              Generate
            </Button>
          </div>
        </FormField>
      </div>

      <Modal.Footer>
        <Button variant="ghost" onClick={onClose} disabled={isPending}>Cancel</Button>
        <Button type="submit" variant="primary" loading={isPending}>Save Changes</Button>
      </Modal.Footer>
    </form>
  )
}

// ── Edit Product Modal ────────────────────────────────────────────────────────
// Wraps EditProductForm in the shared Modal. ProductsPage passes editTarget
// (or null) — when null, the Modal renders closed and this component renders
// nothing inside it (same as the previous inline structure).
export default function EditProductModal({
  editTarget,
  onClose,
  onSubmit,
  isPending,
  categories,
  canViewProfit,
  nameError,
  onNameErrorClear,
  barcodeError,
  onBarcodeErrorClear,
}) {
  return (
    <Modal
      open={Boolean(editTarget)}
      onClose={onClose}
      title="Edit Product"
      subtitle={editTarget?.prod_name}
      size="lg"
    >
      {editTarget && (
        <EditProductForm
          key={editTarget.prod_id}
          defaultValues={{
            prod_name:            editTarget.prod_name,
            prod_sell_price:      editTarget.prod_sell_price,
            prod_cost_price:      editTarget.prod_cost_price ?? 0,
            // MRP FEATURE: show current MRP in the edit form (0 = "not set")
            prod_mrp:             editTarget.prod_mrp ?? 0,
            prod_low_stock_alert: editTarget.prod_low_stock_alert,
            tax_rate:             editTarget.tax_rate ?? 0,
            tax_code:             editTarget.tax_code  ?? '',
            barcode:              editTarget.barcode   ?? '',
            unit:                 editTarget.unit      ?? 'pcs',
            category_id:          editTarget.category_id ?? '',
            _stock_qty:           editTarget.prod_stock_qty,
          }}
          onSubmit={onSubmit}
          onClose={onClose}
          isPending={isPending}
          categories={categories}
          canViewProfit={canViewProfit}
          nameError={nameError}
          onNameErrorClear={onNameErrorClear}
          barcodeError={barcodeError}
          onBarcodeErrorClear={onBarcodeErrorClear}
          excludeProdId={editTarget?.prod_id}
        />
      )}
    </Modal>
  )
}