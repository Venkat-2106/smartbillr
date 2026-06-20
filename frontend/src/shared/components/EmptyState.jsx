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
    <div className="empty-state-responsive" style={{
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      justifyContent: 'center',
      padding: '80px 24px',
      textAlign: 'center',
      gap: 16,
    }}>
      <div style={{
        width: 80,
        height: 80,
        borderRadius: '50%',
        background: 'var(--bg-subtle)',
        border: '1px solid var(--border)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        fontSize: 36,
        marginBottom: 4,
        transition: 'transform 0.2s var(--ease-out)',
      }}>
        {icon}
      </div>

      <p style={{
        margin: 0,
        fontSize: 16,
        fontWeight: 700,
        color: 'var(--text-primary)',
        fontFamily: 'var(--font-sans, "Plus Jakarta Sans", sans-serif)',
        letterSpacing: '-0.3px',
      }}>
        {title}
      </p>

      {description && (
        <p style={{
          margin: 0,
          fontSize: 13.5,
          color: 'var(--text-muted)',
          fontWeight: 400,
          maxWidth: 340,
          lineHeight: 1.6,
          fontFamily: 'var(--font-sans, "Plus Jakarta Sans", sans-serif)',
        }}>
          {description}
        </p>
      )}

      {action && (
        <div style={{ marginTop: 8 }}>
          {action}
        </div>
      )}
    </div>
  )
}
