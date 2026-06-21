// src/features/products/components/productFormShared.js
//
// Shared between AddProductModal.jsx and EditProductModal.jsx.
// Schemas live in ../schemas/productSchemas.js — re-exported here for
// backward compatibility with existing imports.

export { createSchema, editSchema } from '../schemas/productSchemas'

// ── Unit options ───────────────────────────────────────────────────────────────
export const UNITS = ['pcs', 'kg', 'g', 'litre', 'ml', 'box', 'pack', 'pair', 'set', 'dozen']

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