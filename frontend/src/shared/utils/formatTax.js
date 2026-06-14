// shared/utils/formatTax.js
//
// ─────────────────────────────────────────────────────────────────────────────
// FRONTEND TAX DISPLAY UTILITIES
//
// Display-only helpers. Tax AMOUNTS are always computed server-side.
// These functions translate the server's tax columns into UI labels.
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Returns the tax label for a country code.
 *
 * getTaxLabel('IN') → 'GST'
 * getTaxLabel('US') → 'Sales Tax'
 * getTaxLabel('GB') → 'VAT'
 * getTaxLabel('XX') → 'Tax'   ← safe generic fallback for unknown countries
 */
export function getTaxLabel(countryCode = '') {
  const map = {
    IN: 'GST',
    US: 'Sales Tax',
    GB: 'VAT',
    AE: 'VAT',
    SG: 'GST',
    AU: 'GST',
    CA: 'HST/GST',
    NZ: 'GST',
    DE: 'MwSt',
    FR: 'TVA',
    JP: 'Consumption Tax',
    MY: 'SST',
    PH: 'VAT',
    ID: 'PPN',
    TH: 'VAT',
    BD: 'VAT',
  }
  return map[(countryCode || '').toUpperCase()] || 'Tax'
}

/**
 * Detects what tax type a server record used, by reading the tax columns.
 * Use this to decide which labels to show in drawers and invoices.
 *
 * Returns: "cgst_sgst" | "igst" | "generic"
 *
 * Works with both Sale records (cgst_total / sgst_total / igst_total)
 * and Purchase records (pur_cgst_total / pur_sgst_total / pur_igst_total).
 */
export function detectTaxType(record) {
  if (!record) return 'generic'

  const cgst = Number(record.cgst_total ?? record.pur_cgst_total ?? 0)
  const sgst = Number(record.sgst_total ?? record.pur_sgst_total ?? 0)
  const igst = Number(record.igst_total ?? record.pur_igst_total ?? 0)

  if (cgst > 0 || sgst > 0) return 'cgst_sgst'
  if (igst > 0)              return 'igst'
  return 'generic'
}

/**
 * Returns breakdown label array for a given country and sale type.
 *
 * getTaxBreakdown('IN', 'intrastate') → ['CGST', 'SGST']
 * getTaxBreakdown('IN', 'interstate') → ['IGST']
 * getTaxBreakdown('US')               → ['Tax']
 */
export function getTaxBreakdown(countryCode = '', saleType = 'intrastate') {
  if ((countryCode || '').toUpperCase() === 'IN') {
    return saleType === 'interstate' ? ['IGST'] : ['CGST', 'SGST']
  }
  return ['Tax']
}

/**
 * Formats a tax amount with its label.
 *
 * formatTaxAmount(90, 'IN') → 'GST: ₹90.00'
 */
export function formatTaxAmount(amount, countryCode = '') {
  if (amount === null || amount === undefined || isNaN(amount)) return '—'
  const label = getTaxLabel(countryCode)
  return `${label}: ${Number(amount).toFixed(2)}`
}