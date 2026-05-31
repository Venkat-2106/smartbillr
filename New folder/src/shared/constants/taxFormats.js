/**
 * Maps country codes to their tax system details.
 * Used across invoice displays, forms, and reports.
 */
export const TAX_FORMATS = {
  IN: {
    label: 'GST',
    breakdown: true,       // shows CGST / SGST / IGST
    symbol: '₹',
    locale: 'en-IN',
    currency: 'INR',
  },
  US: {
    label: 'Sales Tax',
    breakdown: false,
    symbol: '$',
    locale: 'en-US',
    currency: 'USD',
  },
  GB: {
    label: 'VAT',
    breakdown: false,
    symbol: '£',
    locale: 'en-GB',
    currency: 'GBP',
  },
  AE: {
    label: 'VAT',
    breakdown: false,
    symbol: 'AED',
    locale: 'ar-AE',
    currency: 'AED',
  },
  SG: {
    label: 'GST',
    breakdown: false,
    symbol: 'S$',
    locale: 'en-SG',
    currency: 'SGD',
  },
  AU: {
    label: 'GST',
    breakdown: false,
    symbol: 'A$',
    locale: 'en-AU',
    currency: 'AUD',
  },
}

/**
 * Returns tax format config for a country.
 * Falls back to IN if unknown.
 */
export function getTaxFormat(countryCode = 'IN') {
  return TAX_FORMATS[countryCode] || TAX_FORMATS['IN']
}