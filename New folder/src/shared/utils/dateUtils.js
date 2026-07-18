// src/shared/utils/dateUtils.js
//
// WHY THIS FILE EXISTS:
//   Five hook files (useSales, useCustomers, useCategories, useProducts,
//   useSuppliers) all contained identical copies of localDayStartUTC and
//   localDayEndUTC. Any bug fix or timezone logic change had to be applied
//   in five places — a maintenance hazard.
//
//   This single source of truth replaces all five copies.
//
// WHAT THESE FUNCTIONS DO:
//   <input type="date"> returns "YYYY-MM-DD" in the user's LOCAL calendar.
//   Sending that bare string to the backend means PostgreSQL (UTC) treats it
//   as UTC midnight, silently excluding records from the local timezone's
//   early morning hours.
//
//   These helpers convert the local calendar date → UTC ISO strings that
//   represent the actual UTC boundaries of that local day, so the backend
//   comparison against a timestamptz column is always correct.
//
//   Example for IST (UTC+5:30) user selecting "2026-06-08":
//     localDayStartUTC("2026-06-08") → "2026-06-07T18:30:00.000Z"
//     localDayEndUTC("2026-06-08")   → "2026-06-08T18:29:59.999Z"
//
//   Example for US Pacific (UTC-7 in June) user selecting "2026-06-08":
//     localDayStartUTC("2026-06-08") → "2026-06-08T07:00:00.000Z"
//     localDayEndUTC("2026-06-08")   → "2026-06-09T06:59:59.999Z"
//
//   BUG FIX (2026-07-11): new Date("YYYY-MM-DD") is parsed as UTC midnight,
//   then setHours() operates in local time — shifting the date by one day
//   for negative-UTC-offset timezones. Parse via year/month/day args instead.

/**
 * Returns the UTC ISO string for the very start (00:00:00.000) of the given
 * date in the browser's local timezone.
 *
 * @param {string} dateStr - "YYYY-MM-DD" from an <input type="date">
 * @returns {string} Full UTC ISO timestamp string, e.g. "2026-06-07T18:30:00.000Z"
 */
function parseLocalDateOnly(dateStr) {
  const [year, month, day] = dateStr.split('-').map(Number)
  return new Date(year, month - 1, day)
}

export function localDayStartUTC(dateStr) {
  const d = parseLocalDateOnly(dateStr)
  d.setHours(0, 0, 0, 0)
  return d.toISOString()
}

/**
 * Returns the UTC ISO string for the very end (23:59:59.999) of the given
 * date in the browser's local timezone.
 *
 * @param {string} dateStr - "YYYY-MM-DD" from an <input type="date">
 * @returns {string} Full UTC ISO timestamp string, e.g. "2026-06-08T18:29:59.999Z"
 */
export function localDayEndUTC(dateStr) {
  const d = parseLocalDateOnly(dateStr)
  d.setHours(23, 59, 59, 999)
  return d.toISOString()
}
