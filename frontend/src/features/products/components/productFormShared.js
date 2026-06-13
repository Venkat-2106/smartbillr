// src/features/products/components/productFormShared.js
//
// Shared between AddProductModal.jsx and EditProductModal.jsx.
// Extracted from ProductsPage.jsx (Task 4 — modal extraction) with no
// behaviour changes — same Zod schemas, same UNITS list as before.

import { z } from 'zod'

// ── Unit options ───────────────────────────────────────────────────────────────
export const UNITS = ['pcs', 'kg', 'g', 'litre', 'ml', 'box', 'pack', 'pair', 'set', 'dozen']

// ── Zod schema (create) ───────────────────────────────────────────────────────
// .trim() is first so whitespace-only names ("   ") fail the .min(1) check.
export const createSchema = z.object({
  prod_name:            z.string().trim().min(1, 'Product name is required').max(100),
  prod_sell_price:      z.coerce.number({ invalid_type_error: 'Enter a valid price' }).min(0, 'Cannot be negative'),
  prod_cost_price:      z.coerce.number({ invalid_type_error: 'Enter a valid price' }).min(0, 'Cannot be negative'),
  // MRP FEATURE: optional — coerce '' or 0 to null in buildPayload
  prod_mrp:             z.coerce.number().min(0, 'Cannot be negative').default(0),
  prod_stock_qty:       z.coerce.number().int().min(0, 'Cannot be negative').default(0),
  prod_low_stock_alert: z.coerce.number().int().min(0, 'Cannot be negative').default(10),
  tax_rate:             z.coerce.number().min(0, 'Cannot be negative').max(100, 'Max 100%').default(0),
  tax_code:             z.string().max(50).optional().or(z.literal('')),
  barcode:              z.string().max(100).optional().or(z.literal('')),
  unit:                 z.string().default('pcs'),
  category_id:          z.string().optional().or(z.literal('')),
})

// ── Zod schema (edit — stock qty excluded) ────────────────────────────────────
export const editSchema = z.object({
  prod_name:            z.string().trim().min(1, 'Product name is required').max(100),
  prod_sell_price:      z.coerce.number({ invalid_type_error: 'Enter a valid price' }).min(0, 'Cannot be negative'),
  prod_cost_price:      z.coerce.number({ invalid_type_error: 'Enter a valid price' }).min(0, 'Cannot be negative'),
  // MRP FEATURE: optional — coerce '' or 0 to null in buildPayload
  prod_mrp:             z.coerce.number().min(0, 'Cannot be negative').default(0),
  prod_low_stock_alert: z.coerce.number().int().min(0, 'Cannot be negative').default(10),
  tax_rate:             z.coerce.number().min(0, 'Cannot be negative').max(100, 'Max 100%').default(0),
  tax_code:             z.string().max(50).optional().or(z.literal('')),
  barcode:              z.string().max(100).optional().or(z.literal('')),
  unit:                 z.string().default('pcs'),
  category_id:          z.string().optional().or(z.literal('')),
})

// ── Barcode: generate EAN-13 barcode ────────────────────────────────────────
// Shared by AddProductForm and EditProductForm (identical logic in both).
export function generateEAN13() {
  const digits = Array.from({ length: 12 }, () => Math.floor(Math.random() * 10))
  const sum = digits.reduce((acc, d, i) => acc + d * (i % 2 === 0 ? 1 : 3), 0)
  const check = (10 - (sum % 10)) % 10
  return [...digits, check].join('')
}

// ── Barcode: USB scanner sends Enter after digits — prevent form submit ──────
export function handleBarcodeKeyUp(e) {
  if (e.key === 'Enter') e.preventDefault()
}