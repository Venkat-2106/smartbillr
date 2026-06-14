// shared/utils/formatTax.js
//
// ─────────────────────────────────────────────────────────────────────────────
// FRONTEND TAX DISPLAY UTILITIES
//
// These are display-only helpers. They do NOT determine tax amounts —
// that is done server-side. These functions translate server tax columns
// into human-readable labels for UI components.
//
// KEY PRINCIPLE: The UI reads tax amounts from the server response columns
// (cgst_total, sgst_total, igst_total, tax_total) and only uses these
// functions to decide what LABEL to show next to those amounts.
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Returns the correct tax label for a given country code.
 *
 * Examples:
 *   getTaxLabel('IN')  → 'GST'
 *   getTaxLabel('US')  → 'Sales Tax'
 *   getTaxLabel('GB')  → 'VAT'
 *   getTaxLabel('AE')  → 'VAT'
 *   getTaxLabel('XX')  → 'Tax'  ← unknown country, safe generic fallback
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
 * Given a sale/purchase response from the server, determines whether
 * the transaction used CGST+SGST or IGST (or generic tax).
 *
 * Use this to decide which tax breakdown labels to show in drawers and invoices.
 *
 * Returns: "cgst_sgst" | "igst" | "generic"
 *
 * Usage:
 *   const taxType = detectTaxType(saleDetail)
 *   if (taxType === 'cgst_sgst') → show CGST and SGST rows
 *   if (taxType === 'igst')      → show IGST row
 *   if (taxType === 'generic')   → show single "Tax" row
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
 * Returns tax breakdown labels for India (CGST + SGST or IGST).
 * For non-India countries, returns a single 'Tax' label.
 *
 * Usage:
 *   getTaxBreakdown('IN', 'intrastate') → ['CGST', 'SGST']
 *   getTaxBreakdown('IN', 'interstate') → ['IGST']
 *   getTaxBreakdown('US')              → ['Tax']
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
 * Example:
 *   formatTaxAmount(90, 'IN') → 'GST: ₹90.00'
 */
export function formatTaxAmount(amount, countryCode = '') {
  if (amount === null || amount === undefined || isNaN(amount)) return '—'
  const label = getTaxLabel(countryCode)
  return `${label}: ${Number(amount).toFixed(2)}`
}