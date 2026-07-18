// shared/components/LockedCell.jsx
//
// Inline table-cell placeholder for tier-locked values (e.g. cost price,
// profit). Shows a small lock icon + message in amber/warning colour.
//
// Extracted from ProductsPage.jsx (2026-07-18) to share across Products
// and Stock pages. CategoryDetailDrawer intentionally omits cost price
// from its compact read-only view rather than showing this treatment.
//
// Usage:
//   <LockedCell message="Upgrade to view" />

export default function LockedCell({ message }) {
  return (
    <span
      title={message}
      style={{ fontSize: 12, color: 'var(--warning)', cursor: 'help', display: 'inline-flex', alignItems: 'center', gap: 4 }}
    >
      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
        <path d="M7 11V7a5 5 0 0 1 10 0v4" />
      </svg>
      {message}
    </span>
  )
}
