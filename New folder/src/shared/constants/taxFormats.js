// shared/constants/taxFormats.js
//
// Maps country codes to their tax system display config.
// Used across invoice displays, forms, and reports.

export const TAX_FORMATS = {
  IN: {
    label: 'GST',
    breakdown: true,   // shows CGST / SGST / IGST rows
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
    symbol: 'د.إ',
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
  CA: {
    label: 'HST/GST',
    breakdown: false,
    symbol: 'C$',
    locale: 'en-CA',
    currency: 'CAD',
  },
  NZ: {
    label: 'GST',
    breakdown: false,
    symbol: 'NZ$',
    locale: 'en-NZ',
    currency: 'NZD',
  },
  DE: {
    label: 'MwSt',
    breakdown: false,
    symbol: '€',
    locale: 'de-DE',
    currency: 'EUR',
  },
  FR: {
    label: 'TVA',
    breakdown: false,
    symbol: '€',
    locale: 'fr-FR',
    currency: 'EUR',
  },
  JP: {
    label: 'Consumption Tax',
    breakdown: false,
    symbol: '¥',
    locale: 'ja-JP',
    currency: 'JPY',
  },
  MY: {
    label: 'SST',
    breakdown: false,
    symbol: 'RM',
    locale: 'ms-MY',
    currency: 'MYR',
  },
  BD: {
    label: 'VAT',
    breakdown: false,
    symbol: '৳',
    locale: 'bn-BD',
    currency: 'BDT',
  },
}

// Safe generic fallback — NOT India — for unknown country codes.
// A business in an unknown country must never accidentally see GST labels.
const GENERIC_TAX_FORMAT = {
  label: 'Tax',
  breakdown: false,
  symbol: '',
  locale: 'en-US',
  currency: 'USD',
}

/**
 * Returns tax format config for a country.
 * Falls back to generic (not India) for unknown codes.
 */
export function getTaxFormat(countryCode = '') {
  return TAX_FORMATS[(countryCode || '').toUpperCase()] || GENERIC_TAX_FORMAT
}