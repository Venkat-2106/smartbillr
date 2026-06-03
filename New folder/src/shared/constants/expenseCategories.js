// These MUST match the backend CHECK constraint exactly
// Backend allowed values: rent, salary, electricity, internet,
//   maintenance, marketing, other, purchase

export const EXPENSE_CATEGORIES = [
  { value: 'rent',        label: 'Rent' },
  { value: 'salary',      label: 'Salary' },
  { value: 'electricity', label: 'Electricity' },
  { value: 'internet',    label: 'Internet' },
  { value: 'maintenance', label: 'Maintenance' },
  { value: 'marketing',   label: 'Marketing' },
  { value: 'purchase',    label: 'Purchase' },
  { value: 'other',       label: 'Other' },
]

export const EXPENSE_CATEGORY_OPTIONS = EXPENSE_CATEGORIES.map(c => ({
  value: c.value,
  label: c.label,
}))