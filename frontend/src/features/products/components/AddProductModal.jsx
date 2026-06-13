// src/features/products/components/AddProductModal.jsx
//
// Extracted from ProductsPage.jsx (Task 4 — modal extraction, no behaviour
// change). Contains the Modal wrapper + AddProductForm previously defined
// inline in ProductsPage.jsx.
//
// BARCODE CHANGES (2026-06-06) — retained:
//   - "Generate" button creates a 13-digit EAN-style barcode (12 random + check digit)
//   - onBlur fires checkBarcode() — shows inline duplicate error if barcode taken
//   - USB scanner support: handleBarcodeKeyUp prevents form submission on Enter
//   - barcodeError + onBarcodeErrorClear props mirror the nameError pattern
//
// VALIDATION CHANGES (2026-06-06) — retained:
//   Feature 2: server-side "name already exists" error is shown inside the
//   Product Name FormField (nameError / onNameErrorClear), not just a toast.

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
import { UNITS, createSchema, generateEAN13, handleBarcodeKeyUp } from './productFormShared'

// ── Add Product Form ──────────────────────────────────────────────────────────
// Props:
//   nameError        — string | null  — server-side "name already exists" error
//   onNameErrorClear — () => void     — called on first keystroke in Name field
//                                       so the red error banner disappears
function AddProductForm({ onSubmit, onClose, isPending, categories, canViewProfit, nameError, onNameErrorClear, barcodeError, onBarcodeErrorClear }) {
  const { register, handleSubmit, setValue, formState: { errors } } = useForm({
    resolver: zodResolver(createSchema),
    defaultValues: {
      prod_stock_qty:       0,
      prod_low_stock_alert: 10,
      tax_rate:             0,
      unit:                 'pcs',
      prod_cost_price:      0,
    },
  })

  // Combine Zod client-side error with server-side name error.
  // Zod error takes priority (runs first). Server error shows only after a
  // successful Zod pass but a failed API call.
  const nameFieldError    = errors.prod_name || (nameError    ? { message: nameError    } : undefined)
  const barcodeFieldError = errors.barcode   || (barcodeError ? { message: barcodeError } : undefined)

  function generateBarcode() {
    setValue('barcode', generateEAN13(), { shouldValidate: true })
    onBarcodeErrorClear?.(null)
  }

  // ── Barcode: async duplicate check on blur ───────────────────────────────────
  async function handleBarcodeBlur(e) {
    const val = e.target.value?.trim()
    if (!val) return
    try {
      const taken = await checkBarcode(val)
      if (taken) onBarcodeErrorClear?.('A product with this barcode already exists.')
    } catch { /* backend will validate on submit */ }
  }

  return (
    <form onSubmit={handleSubmit(onSubmit)}>
      {/* ── Product Name — shows BOTH Zod errors and server duplicate errors ── */}
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
          <input type="hidden" value={0} {...register('prod_cost_price')} />
        )}
      </div>

      {/* MRP FEATURE: optional Maximum Retail Price field */}
      <FormField
        label="MRP (Maximum Retail Price)"
        error={errors.prod_mrp}
        helper="Printed price on the product — discount = MRP minus selling price, shown on invoices"
        style={{ marginBottom: 16 }}
      >
        <Input
          type="number" step="0.01" min="0"
          placeholder="0.00 — leave blank if not applicable"
          {...register('prod_mrp')}
        />
      </FormField>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 16 }}>
        <FormField label="Opening Stock Qty" error={errors.prod_stock_qty}>
          <Input type="number" step="1" placeholder="0" {...register('prod_stock_qty')} />
        </FormField>
        <FormField label="Low Stock Alert" error={errors.prod_low_stock_alert} helper="Alert when stock falls below this">
          <Input type="number" step="1" placeholder="10" {...register('prod_low_stock_alert')} />
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
        <FormField label="Unit" error={errors.unit}>
          <select className="sb-select" {...register('unit')} style={selectStyle}>
            {UNITS.map(u => <option key={u} value={u}>{u}</option>)}
          </select>
        </FormField>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 16 }}>
        <FormField label="Tax Rate (%)" error={errors.tax_rate} helper="e.g. 0, 5, 7.5, 10, 18, 20">
          <Input type="number" step="0.01" min="0" max="100" placeholder="e.g. 18" {...register('tax_rate')} />
        </FormField>
        <FormField label="Tax Code (HSN / SAC)" error={errors.tax_code} helper="Optional">
          <Input placeholder="e.g. 1006" {...register('tax_code')} />
        </FormField>
      </div>

      {/* BARCODE FIX: Generate button + scanner support + inline duplicate error */}
      <FormField label="Barcode" error={barcodeFieldError} helper="Scan, type, or generate" style={{ marginBottom: 8 }}>
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

      <Modal.Footer>
        <Button variant="ghost" onClick={onClose} disabled={isPending}>Cancel</Button>
        <Button type="submit" variant="primary" loading={isPending}>Create Product</Button>
      </Modal.Footer>
    </form>
  )
}

// ── Add Product Modal ─────────────────────────────────────────────────────────
// Wraps AddProductForm in the shared Modal. Props mirror what ProductsPage
// previously passed directly to <Modal> + <AddProductForm>.
export default function AddProductModal({
  open,
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
      open={open}
      onClose={onClose}
      title="Add Product"
      subtitle="Add a new product to your catalogue"
      size="lg"
    >
      <AddProductForm
        onSubmit={onSubmit}
        onClose={onClose}
        isPending={isPending}
        categories={categories}
        canViewProfit={canViewProfit}
        nameError={nameError}
        onNameErrorClear={onNameErrorClear}
        barcodeError={barcodeError}
        onBarcodeErrorClear={onBarcodeErrorClear}
      />
    </Modal>
  )
}