// src/shared/utils/formatDate.js
//
// ═══════════════════════════════════════════════════════════════
// SMARTBILLR — SINGLE SOURCE OF TRUTH FOR DATE/TIME DISPLAY
// ═══════════════════════════════════════════════════════════════
//
// ARCHITECTURE OVERVIEW:
//
//   Database  →  Backend (Python)  →  JSON  →  Frontend (JS)  →  Display
//   UTC wall    fmt_ts() adds Z      ISO Z     formatDate()      user's TZ
//   clock       unambiguous UTC      marker    uses browser TZ
//
// WHY THE OLD CODE HAD A BUG:
//   Python str(naive_datetime) produced:  "2026-06-05 03:00:00"
//   (space-separated, no timezone offset)
//
//   JavaScript's date parsing spec (ECMA-262) says:
//     Date-time string WITHOUT timezone offset → parsed as LOCAL time
//   So "2026-06-05 03:00:00" was treated as 3 AM in the user's local timezone,
//   not 3 AM UTC. For an EST user this shifted the date by -5 hours.
//   Near midnight UTC, this causes the displayed DATE to be wrong by a full day.
//
// THE FIX — TWO PARTS:
//
//   BACKEND FIX (app/utils/timestamp.py):
//     fmt_ts() now outputs "2026-06-05T03:00:00Z" — explicit UTC marker.
//     JavaScript ALWAYS treats the 'Z' suffix as UTC, regardless of browser timezone.
//
//   FRONTEND FIX (this file):
//     Removed hardcoded locale 'en-IN'.
//     Use undefined (browser's own locale) so dates display in the user's
//     language and regional format preference (set in their OS/browser settings).
//     The browser's local timezone is used automatically — no explicit timeZone
//     option needed, because that IS the correct behavior for a global SaaS app.
//
// WHY UNDEFINED LOCALE:
//   'en-IN' was hardcoded for the developer's locale (India).
//   A German user would see Indian date formatting. A US user would see the
//   same. By using undefined (the browser's locale), each user sees dates
//   in their own regional format:
//     - Indian user:   "05 Jun 2026"
//     - US user:       "Jun 5, 2026"
//     - German user:   "5. Juni 2026"
//   All are showing the SAME UTC moment, just in their own format preference.
//
// DATE-ONLY FIELDS (expense_date, invoice_date, due_date):
//   These are "YYYY-MM-DD" strings with NO time component.
//   They represent a calendar date the user chose (e.g. "expense on June 4").
//   There is NO timezone ambiguity — June 4 is June 4 everywhere.
//   formatDateOnly() displays them without any timezone conversion.
//
// WHAT YOU IMPORT FROM HERE:
//   formatDate(str)       → date-only display ("5 Jun 2026")    for timestamp fields
//   formatDateTime(str)   → date + time ("5 Jun 2026, 10:30 AM") for full timestamps
//   formatDateOnly(str)   → date-only ("5 Jun 2026")             for date-only fields
//   formatDateCSV(str)    → CSV-safe date string (same as formatDate, empty not —)
//   formatDatePrint(str)  → print-safe date string (same as formatDate)
//   formatGeneratedOn()   → "5 June 2026 | 10:30 PM"            for print footers
//   formatRelative(str)   → "Today" / "Yesterday" / "3 days ago" / "5 Jun 2026"
//
// RULES — NEVER BREAK THESE:
//   1. NEVER call toLocaleDateString() / toLocaleString() / toLocaleTimeString()
//      directly in any component, drawer, hook, or CSV column. Always import here.
//   2. NEVER hardcode a locale string like 'en-IN' or 'en-US'.
//      Use undefined (browser's locale) so each user gets their own format.
//   3. NEVER hardcode a timeZone option. Browser's local timezone IS correct.
//   4. For print footer timestamps, formatGeneratedOn() is the ONLY exception —
//      it uses { month: 'long' } intentionally for a more formal look.
// ═══════════════════════════════════════════════════════════════

// ── Internal constants ───────────────────────────────────────────────────────

/**
 * Locale: undefined = use the browser's own locale setting.
 *
 * This is the correct choice for a global SaaS application.
 * Do NOT hardcode 'en-IN' or any other locale here.
 */
const LOCALE = undefined;

/**
 * Options for date-only display (no time).
 * Produces (examples):
 *   en-IN browser: "05 Jun 2026"
 *   en-US browser: "Jun 5, 2026"
 *   de-DE browser: "5. Juni 2026"
 */
const DATE_OPTIONS = {
  day:   '2-digit',
  month: 'short',
  year:  'numeric',
};

/**
 * Options for date + time display.
 * Produces (examples):
 *   en-IN: "05 Jun 2026, 10:30 am"
 *   en-US: "Jun 5, 2026, 10:30 AM"
 */
const DATETIME_OPTIONS = {
  day:    '2-digit',
  month:  'short',
  year:   'numeric',
  hour:   '2-digit',
  minute: '2-digit',
  hour12: true,
};

// ── Exported formatters ──────────────────────────────────────────────────────

/**
 * Format a UTC timestamp string for date-only display in tables and drawers.
 *
 * Input: ISO 8601 string ending in 'Z' (from backend fmt_ts)
 *   e.g. "2026-06-05T03:00:00Z"
 *
 * Output: date in user's locale and local timezone
 *   e.g. "04 Jun 2026" (EST user), "05 Jun 2026" (IST user)
 *
 * Returns "—" for null / undefined / invalid dates.
 *
 * @param {string|Date|null|undefined} dateStr
 * @returns {string}
 */
export function formatDate(dateStr) {
  if (!dateStr) return '—';
  const date = new Date(dateStr);
  if (isNaN(date.getTime())) return '—';
  return date.toLocaleDateString(LOCALE, DATE_OPTIONS);
}

/**
 * Format a UTC timestamp string for date + time display.
 *
 * Use for fields like: created_at, updated_at, payment_paid_at, approved_at.
 *
 * Input: "2026-06-05T03:00:00Z"
 * Output: "04 Jun 2026, 10:30 PM" (EST user) / "05 Jun 2026, 08:30 AM" (IST user)
 *
 * Returns "—" for null / undefined / invalid dates.
 *
 * @param {string|Date|null|undefined} dateStr
 * @returns {string}
 */
export function formatDateTime(dateStr) {
  if (!dateStr) return '—';
  const date = new Date(dateStr);
  if (isNaN(date.getTime())) return '—';
  return date.toLocaleString(LOCALE, DATETIME_OPTIONS);
}

/**
 * Format a DATE-ONLY string (no time, no timezone) for display.
 *
 * Use for fields like: expense_date, invoice_date, due_date.
 * These are "YYYY-MM-DD" strings — there is NO timezone ambiguity.
 * The value "2026-06-05" means June 5 everywhere in the world.
 *
 * IMPORTANT: JavaScript parses date-only strings as UTC midnight.
 * This file displays them in the user's locale but treats them as calendar
 * dates, not moments in time.
 *
 * Input: "2026-06-05"
 * Output: "05 Jun 2026" (or locale-equivalent)
 *
 * Returns "—" for null / undefined / invalid.
 *
 * @param {string|Date|null|undefined} dateStr
 * @returns {string}
 */
export function formatDateOnly(dateStr) {
  if (!dateStr) return '—';
  // For date-only strings (YYYY-MM-DD), JS parses them as UTC midnight.
  // We display them with timeZone:'UTC' so "2026-06-05" always shows as June 5
  // regardless of the user's timezone (otherwise a US user at UTC-5 might see June 4).
  const date = new Date(dateStr);
  if (isNaN(date.getTime())) return '—';
  return date.toLocaleDateString(LOCALE, { ...DATE_OPTIONS, timeZone: 'UTC' });
}

/**
 * Format a timestamp for CSV / Excel export.
 *
 * Uses the same format as formatDate() so exported files match on-screen tables.
 * Returns empty string (not "—") for null — empty cells look better in spreadsheets.
 *
 * @param {string|Date|null|undefined} dateStr
 * @returns {string}
 */
export function formatDateCSV(dateStr) {
  if (!dateStr) return '';
  const date = new Date(dateStr);
  if (isNaN(date.getTime())) return '';
  return date.toLocaleDateString(LOCALE, DATE_OPTIONS);
}

/**
 * Format a date-only string for CSV export.
 * (expense_date, invoice_date, etc. — no timezone conversion)
 *
 * @param {string|null|undefined} dateStr
 * @returns {string}
 */
export function formatDateOnlyCSV(dateStr) {
  if (!dateStr) return '';
  const date = new Date(dateStr);
  if (isNaN(date.getTime())) return '';
  return date.toLocaleDateString(LOCALE, { ...DATE_OPTIONS, timeZone: 'UTC' });
}

/**
 * Format a timestamp for print layouts.
 *
 * Identical to formatDate() — print layouts must match on-screen views.
 * Returns "—" for null (em-dash reads better on paper than blank).
 *
 * @param {string|Date|null|undefined} dateStr
 * @returns {string}
 */
export function formatDatePrint(dateStr) {
  if (!dateStr) return '—';
  const date = new Date(dateStr);
  if (isNaN(date.getTime())) return '—';
  return date.toLocaleDateString(LOCALE, DATE_OPTIONS);
}

/**
 * Returns the "Generated On" string used in print footers.
 *
 * This is INTENTIONALLY different from formatDate():
 *   - month: 'long'  (June, not Jun) — more formal for printed documents
 *   - includes time  — so the reader knows exactly when the document was printed
 *   - uses browser locale and local timezone (the user generating the print)
 *
 * Example: "5 June 2026 | 10:30 PM"
 *
 * @returns {string}
 */
export function formatGeneratedOn() {
  const now = new Date();
  const datePart = now.toLocaleDateString(LOCALE, {
    day:   '2-digit',
    month: 'long',
    year:  'numeric',
  });
  const timePart = now.toLocaleTimeString(LOCALE, {
    hour:   '2-digit',
    minute: '2-digit',
    hour12: true,
  }).toUpperCase();
  return `${datePart} | ${timePart}`;
}

/**
 * Format a date as a relative string.
 *
 * Returns "Today" / "Yesterday" / "N days ago" / "N weeks ago" for recent dates.
 * Falls back to formatDate() for dates older than 30 days.
 *
 * Note: "days ago" is calculated in the user's local timezone (via Date arithmetic),
 * so "Today" correctly reflects today in the user's timezone.
 *
 * @param {string|Date|null|undefined} dateStr
 * @returns {string}
 */
export function formatRelative(dateStr) {
  if (!dateStr) return '—';
  const date = new Date(dateStr);
  if (isNaN(date.getTime())) return '—';

  const now = new Date();
  // Compare calendar days in local timezone
  const localDate = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  const localNow  = new Date(now.getFullYear(),  now.getMonth(),  now.getDate());
  const diffMs   = localNow - localDate;
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

  if (diffDays === 0) return 'Today';
  if (diffDays === 1) return 'Yesterday';
  if (diffDays < 7)  return `${diffDays} days ago`;
  if (diffDays < 30) return `${Math.floor(diffDays / 7)} week${Math.floor(diffDays / 7) > 1 ? 's' : ''} ago`;
  return formatDate(dateStr);
}