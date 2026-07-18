// These MUST match the backend CHECK constraint exactly
// Backend allowed values: cash, upi, card, bank, split, adjustment

export const PAYMENT_METHODS = [
  { value: 'cash',       label: 'Cash' },
  { value: 'upi',        label: 'UPI' },
  { value: 'card',       label: 'Card' },
  { value: 'bank',       label: 'Bank Transfer' },
  { value: 'split',      label: 'Split Payment' },
  { value: 'adjustment', label: 'Adjustment' },
]

// For dropdown options
export const PAYMENT_METHOD_OPTIONS = PAYMENT_METHODS.map(m => ({
  value: m.value,
  label: m.label,
}))