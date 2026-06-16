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

import { useState } from 'react'

export default function PageHeader({
  title,
  subtitle,
  action,
  back = false,
  onBack,
}) {
  const [backHovered, setBackHovered] = useState(false)

  return (
    <div style={{ marginBottom: 32, animation: 'fadeUp 0.28s var(--ease-out) both' }}>
      {back && (
        <button
          onClick={onBack}
          onMouseEnter={() => setBackHovered(true)}
          onMouseLeave={() => setBackHovered(false)}
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: 6,
            background: 'none',
            border: 'none',
            cursor: 'pointer',
            color: backHovered ? 'var(--accent-600)' : 'var(--text-muted)',
            fontSize: 12.5,
            fontWeight: 500,
            fontFamily: 'var(--font-sans, "Plus Jakarta Sans", sans-serif)',
            padding: '0 0 10px',
            transition: 'color 0.14s',
          }}
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" style={{ marginRight: 2 }}>
            <path d="M19 12H5m7-7l-7 7 7 7"/>
          </svg>
          Back
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
          <h1 className="page-header-title" style={{
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
            <p className="page-header-subtitle" style={{
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
