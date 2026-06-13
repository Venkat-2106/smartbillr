// src/shared/utils/preferences.js
//
// Simple localStorage-backed user preferences, following the same pattern
// as sb-theme / sb-accent in DashboardLayout.jsx.
//
// Currently used for:
//   sb-auto-print-invoice → whether to auto-open the print dialog
//                            after creating a sale (default: true,
//                            preserves existing behavior)

const AUTO_PRINT_KEY = 'sb-auto-print-invoice';

export function getAutoPrintInvoice() {
  const stored = localStorage.getItem(AUTO_PRINT_KEY);
  if (stored === null) return true;
  return stored === 'true';
}

export function setAutoPrintInvoice(value) {
  localStorage.setItem(AUTO_PRINT_KEY, value ? 'true' : 'false');
}