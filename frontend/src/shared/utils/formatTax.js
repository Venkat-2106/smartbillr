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
 * Returns the correct tax label for a given country code and GST registration status.
 *
 * For India: returns 'GST' only when isGstRegistered is strictly true;
 * otherwise returns 'Tax' (the business is not GST-registered).
 * For all other countries: the label is always driven by country code alone
 * (VAT, Sales Tax, etc.) regardless of registration status.
 *
 * @param {string} countryCode    - ISO 3166-1 alpha-2 country code
 * @param {boolean} isGstRegistered - whether the business is registered for GST
 *
 * Examples:
 *   getTaxLabel('IN', true)   → 'GST'
 *   getTaxLabel('IN', false)  → 'Tax'
 *   getTaxLabel('US', false)  → 'Sales Tax'
 *   getTaxLabel('GB', true)   → 'VAT'
 *   getTaxLabel('XX', false)  → 'Tax'  ← unknown country, safe generic fallback
 */
export function getTaxLabel(countryCode = '', isGstRegistered = false) {
  if ((countryCode || '').toUpperCase() === 'IN' && !isGstRegistered) {
    return 'Tax'
  }
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
 * For non-India countries or non-GST-registered Indian businesses,
 * returns a single 'Tax' label.
 *
 * @param {string} countryCode    - ISO 3166-1 alpha-2 country code
 * @param {string} saleType       - 'intrastate' or 'interstate'
 * @param {boolean} isGstRegistered - whether the business is registered for GST
 *
 * Usage:
 *   getTaxBreakdown('IN', 'intrastate', true) → ['CGST', 'SGST']
 *   getTaxBreakdown('IN', 'interstate', true) → ['IGST']
 *   getTaxBreakdown('IN', 'intrastate', false) → ['Tax']
 *   getTaxBreakdown('US', 'intrastate', false) → ['Tax']
 */
export function getTaxBreakdown(countryCode = '', saleType = 'intrastate', isGstRegistered = false) {
  if ((countryCode || '').toUpperCase() === 'IN' && isGstRegistered) {
    return saleType === 'interstate' ? ['IGST'] : ['CGST', 'SGST']
  }
  return ['Tax']
}

/**
 * Formats a tax amount with its label.
 *
 * @param {number} amount
 * @param {string} countryCode
 * @param {boolean} isGstRegistered
 *
 * Example:
 *   formatTaxAmount(90, 'IN', true)  → 'GST: ₹90.00'
 *   formatTaxAmount(90, 'IN', false) → 'Tax: ₹90.00'
 */
export function formatTaxAmount(amount, countryCode = '', isGstRegistered = false) {
  if (amount === null || amount === undefined || isNaN(amount)) return '—'
  const label = getTaxLabel(countryCode, isGstRegistered)
  return `${label}: ${Number(amount).toFixed(2)}`
}