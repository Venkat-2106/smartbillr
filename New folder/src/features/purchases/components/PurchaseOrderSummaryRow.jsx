// src/features/purchases/components/PurchaseOrderSummaryRow.jsx
//
// A single label/value row used in the Order Summary panel.
// Purely presentational — no state, no imports beyond React.
//
// Props:
//   label — string
//   value — string or JSX
//   bold  — boolean: makes value 16px / 700 weight
//   muted — boolean: makes label var(--text-muted) instead of var(--text-secondary)
//
// Extracted from CreatePurchasePage.jsx (Step 5.16 refactor) — zero behaviour change.

export default function PurchaseOrderSummaryRow({ label, value, bold, muted }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
      <span style={{ fontSize: 13, color: muted ? 'var(--text-muted)' : 'var(--text-secondary)' }}>
        {label}
      </span>
      <span style={{
        fontSize: bold ? 16 : 13.5,
        fontWeight: bold ? 700 : 500,
        color: bold ? 'var(--text-primary)' : 'var(--text-secondary)',
      }}>
        {value}
      </span>
    </div>
  )
}