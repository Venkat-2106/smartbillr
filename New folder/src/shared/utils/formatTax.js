/**
 * Returns the correct tax label for a given country code.
 *
 * Examples:
 *   getTaxLabel('IN')  → 'GST'
 *   getTaxLabel('US')  → 'Sales Tax'
 *   getTaxLabel('GB')  → 'VAT'
 *   getTaxLabel('AE')  → 'VAT'
 */
export function getTaxLabel(countryCode = 'IN') {
  const map = {
    IN: 'GST',
    US: 'Sales Tax',
    GB: 'VAT',
    AE: 'VAT',
    SG: 'GST',
    AU: 'GST',
  }
  return map[countryCode] || 'Tax'
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
export function getTaxBreakdown(countryCode = 'IN', saleType = 'intrastate') {
  if (countryCode === 'IN') {
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
export function formatTaxAmount(amount, countryCode = 'IN') {
  if (amount === null || amount === undefined || isNaN(amount)) return '—'
  const label = getTaxLabel(countryCode)
  return `${label}: ${Number(amount).toFixed(2)}`
}