/**
 * Formats a number as currency based on country code.
 * 
 * Examples:
 *   formatCurrency(1500, 'IN') → ₹1,500.00
 *   formatCurrency(1500, 'US') → $1,500.00
 *   formatCurrency(1500, 'GB') → £1,500.00
 */
export function formatCurrency(amount, countryCode = 'IN') {
  if (amount === null || amount === undefined || isNaN(amount)) return '—'

  // Map country codes to locale + currency
  const currencyMap = {
    IN: { locale: 'en-IN', currency: 'INR' },
    US: { locale: 'en-US', currency: 'USD' },
    GB: { locale: 'en-GB', currency: 'GBP' },
    AE: { locale: 'ar-AE', currency: 'AED' },
    SG: { locale: 'en-SG', currency: 'SGD' },
    AU: { locale: 'en-AU', currency: 'AUD' },
  }

  const { locale, currency } = currencyMap[countryCode] || currencyMap['IN']

  return new Intl.NumberFormat(locale, {
    style: 'currency',
    currency,
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(amount)
}

/**
 * Formats a number with commas — no currency symbol.
 * Used for quantities, stock counts, etc.
 * 
 * Example: formatNumber(1234567) → "12,34,567" (Indian) or "1,234,567" (US)
 */
export function formatNumber(value, countryCode = 'IN') {
  if (value === null || value === undefined || isNaN(value)) return '0'
  const locale = countryCode === 'IN' ? 'en-IN' : 'en-US'
  return new Intl.NumberFormat(locale).format(value)
}