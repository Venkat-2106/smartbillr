// src/shared/components/PageHeader.jsx
//
// The consistent top section of every feature page.
// Shows title + subtitle on the left, an optional action slot on the right.
//
// Props:
//   title       → main page heading (e.g. "Categories")
//   subtitle    → smaller text below (e.g. "Manage your product categories")
//   action      → JSX shown on the right side (usually a <Button> to open a create modal)
//   back        → if true, shows a ← Back link (use with onBack prop)
//   onBack      → function — called when back link is clicked
//
// Usage:
//   <PageHeader
//     title="Categories"
//     subtitle="Organise products into groups"
//     action={
//       <Button leftIcon="+" onClick={() => setShowAdd(true)}>
//         Add Category
//       </Button>
//     }
//   />

export default function PageHeader({
  title,
  subtitle,
  action,
  back = false,
  onBack,
}) {
  return (
    <div style={{ marginBottom: 32 }}>
      {back && (
        <button
          onClick={onBack}
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: 6,
            background: 'none',
            border: 'none',
            cursor: 'pointer',
            color: 'var(--text-muted)',
            fontSize: 12.5,
            fontWeight: 500,
            fontFamily: 'var(--font-sans, "Plus Jakarta Sans", sans-serif)',
            padding: '0 0 10px',
            transition: 'color 0.14s',
          }}
          onMouseEnter={e => e.currentTarget.style.color = 'var(--text-primary)'}
          onMouseLeave={e => e.currentTarget.style.color = 'var(--text-muted)'}
        >
          ← Back
        </button>
      )}

      <div style={{
        display: 'flex',
        alignItems: 'flex-start',
        justifyContent: 'space-between',
        gap: 16,
        flexWrap: 'wrap',
      }}>
        {/* Left: title + subtitle */}
        <div>
          <h1 style={{
            margin: '0 0 5px',
            fontSize: 22,
            fontWeight: 800,
            color: 'var(--text-primary)',
            letterSpacing: '-0.5px',
            lineHeight: 1.15,
            fontFamily: 'var(--font-sans, "Plus Jakarta Sans", sans-serif)',
          }}>
            {title}
          </h1>
          {subtitle && (
            <p style={{
              margin: 0,
              fontSize: 13,
              color: 'var(--text-muted)',
              fontWeight: 400,
              lineHeight: 1.5,
              fontFamily: 'var(--font-sans, "Plus Jakarta Sans", sans-serif)',
            }}>
              {subtitle}
            </p>
          )}
        </div>

        {/* Right: action slot */}
        {action && (
          <div style={{ flexShrink: 0 }}>
            {action}
          </div>
        )}
      </div>
    </div>
  )
}
