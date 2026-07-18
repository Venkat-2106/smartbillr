// src/features/purchases/components/PurchaseSectionCard.jsx
//
// A simple card wrapper with optional title, border, and padding.
// Used for the Supplier, Line Items, Order Summary, and Payment sections
// in CreatePurchasePage.
//
// Props:
//   title    — string (optional)
//   children — ReactNode
//
// Extracted from CreatePurchasePage.jsx (Step 5.16 refactor) — zero behaviour change.

export default function PurchaseSectionCard({ title, children }) {
  return (
    <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 16, padding: 24 }}>
      {title && (
        <h3 style={{ margin: 0, fontSize: 15, fontWeight: 700, color: 'var(--text-primary)', marginBottom: 20 }}>
          {title}
        </h3>
      )}
      {children}
    </div>
  )
}