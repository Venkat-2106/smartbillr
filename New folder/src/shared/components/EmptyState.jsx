// src/shared/components/EmptyState.jsx
//
// A centered placeholder shown when a list has no data.
// Use inside Table (via emptyText) OR as a standalone full-section placeholder.
//
// Props:
//   icon        → emoji or JSX icon shown large (default: 📭)
//   title       → main heading (default: "Nothing here yet")
//   description → smaller subtext
//   action      → JSX — optional button/link shown below (e.g. "Create your first X")
//
// Usage:
//   <EmptyState
//     icon="📦"
//     title="No products yet"
//     description="Add your first product to start selling."
//     action={<Button onClick={...}>Add Product</Button>}
//   />

export default function EmptyState({
  icon = '📭',
  title = 'Nothing here yet',
  description,
  action,
}) {
  return (
    <div style={{
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      justifyContent: 'center',
      padding: '72px 24px',
      textAlign: 'center',
      gap: 14,
    }}>
      {/* Icon circle */}
      <div style={{
        width: 72,
        height: 72,
        borderRadius: '50%',
        background: 'var(--bg-subtle)',
        border: '1px solid var(--border)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        fontSize: 32,
        marginBottom: 4,
      }}>
        {icon}
      </div>

      {/* Title */}
      <p style={{
        margin: 0,
        fontSize: 15,
        fontWeight: 700,
        color: 'var(--text-primary)',
        fontFamily: 'var(--font-sans, "Plus Jakarta Sans", sans-serif)',
        letterSpacing: '-0.2px',
      }}>
        {title}
      </p>

      {/* Description */}
      {description && (
        <p style={{
          margin: 0,
          fontSize: 13,
          color: 'var(--text-muted)',
          fontWeight: 400,
          maxWidth: 320,
          lineHeight: 1.55,
          fontFamily: 'var(--font-sans, "Plus Jakarta Sans", sans-serif)',
        }}>
          {description}
        </p>
      )}

      {/* Action (button etc.) */}
      {action && (
        <div style={{ marginTop: 6 }}>
          {action}
        </div>
      )}
    </div>
  )
}
