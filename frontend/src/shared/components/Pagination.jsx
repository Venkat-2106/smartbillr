// src/shared/components/Pagination.jsx
//
// FIX APPLIED:
//   NavBtn and page buttons were using onMouseEnter/Leave to mutate
//   e.currentTarget.style.background directly (same DOM mutation bug fixed
//   in Modal.jsx, Table.jsx, DashboardLayout.jsx). When the parent re-renders
//   (e.g. page changes), React resets all inline styles and the hover snaps off.
//
//   Fix: NavBtn now has its own useState(false) for hover — it is already a
//   function component so this is a natural, minimal change. Page buttons use
//   a single hoveredPage state at the outer component level (same approach
//   as Table.jsx's row hover tracking).
//
//   No visual change — identical appearance and transition.

import { useState, memo } from 'react'

function Pagination({ pagination, onPageChange }) {
  if (!pagination) return null

  // Backend sends: { page, total_pages, total, has_next, has_prev }
  const current = pagination.page        ?? 1
  const total   = pagination.total_pages ?? pagination.pages ?? 1   // fallback for safety
  const hasNext = pagination.has_next    ?? (current < total)
  const hasPrev = pagination.has_prev    ?? (current > 1)

  if (total <= 1) return null

  // Build page numbers to show: always show first, last, current ±1, and ellipsis
  function buildPages(current, total) {
    if (total <= 7) return Array.from({ length: total }, (_, i) => i + 1)

    const pages = new Set([1, total, current, current - 1, current + 1].filter(p => p >= 1 && p <= total))
    const sorted = [...pages].sort((a, b) => a - b)

    // Insert '...' where gaps > 1
    const result = []
    for (let i = 0; i < sorted.length; i++) {
      if (i > 0 && sorted[i] - sorted[i - 1] > 1) result.push('...')
      result.push(sorted[i])
    }
    return result
  }

  const pages = buildPages(current, total)

  const btnBase = {
    width: 34,
    height: 34,
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 9,
    border: '1px solid var(--border)',
    background: 'var(--bg-card)',
    fontSize: 13,
    fontWeight: 500,
    cursor: 'pointer',
    color: 'var(--text-secondary)',
    fontFamily: 'var(--font-sans, "Plus Jakarta Sans", sans-serif)',
    transition: 'all 0.14s var(--ease-out)',
    userSelect: 'none',
    flexShrink: 0,
  }

  const activeStyle = {
    background: 'linear-gradient(135deg, var(--accent-600), var(--accent-500))',
    color: '#fff',
    borderColor: 'transparent',
    boxShadow: '0 2px 8px var(--accent-glow, rgba(79,70,229,0.3))',
    fontWeight: 700,
  }

  const disabledStyle = {
    opacity: 0.4,
    cursor: 'not-allowed',
    pointerEvents: 'none',
  }

  // FIX: NavBtn has its own hover state — no DOM mutation
  function NavBtn({ direction }) {
    const [hovered, setHovered] = useState(false)
    const isDisabled = direction === 'prev' ? !hasPrev : !hasNext
    const label = direction === 'prev' ? '←' : '→'
    return (
      <button
        onClick={() => onPageChange(direction === 'prev' ? current - 1 : current + 1)}
        disabled={isDisabled}
        onMouseEnter={() => !isDisabled && setHovered(true)}
        onMouseLeave={() => setHovered(false)}
        style={{
          ...btnBase,
          ...(isDisabled ? disabledStyle : {}),
          ...(!isDisabled && hovered ? { background: 'var(--bg-hover)' } : {}),
          fontSize: 16,
        }}
      >
        {label}
      </button>
    )
  }

  return (
    <PaginationInner
      current={current}
      total={total}
      pages={pages}
      pagination={pagination}
      onPageChange={onPageChange}
      btnBase={btnBase}
      activeStyle={activeStyle}
      NavBtn={NavBtn}
    />
  )
}

// FIX: extracted inner component so useState (hoveredPage) works correctly —
// hooks cannot be called conditionally, and the early `if (total <= 1) return null`
// above means we need state below that guard. This inner component always renders.
function PaginationInner({ current, total, pages, pagination, onPageChange, btnBase, activeStyle, NavBtn }) {
  // FIX: single state tracks which page button is hovered — no DOM mutation needed
  const [hoveredPage, setHoveredPage] = useState(null)

  return (
    <div style={{
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'space-between',
      flexWrap: 'wrap',
      gap: 12,
      marginTop: 20,
      padding: '4px 0',
    }}>
      {/* Info text */}
      <span style={{
        fontSize: 12.5,
        color: 'var(--text-muted)',
        fontFamily: 'var(--font-sans, "Plus Jakarta Sans", sans-serif)',
        fontWeight: 500,
      }}>
        Page {current} of {total}
        {pagination.total != null && (
          <span style={{ color: 'var(--text-disabled)' }}>
            {' · '}<span style={{ fontWeight: 600, color: 'var(--text-muted)' }}>{pagination.total.toLocaleString()}</span> records
          </span>
        )}
      </span>

      {/* Controls */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
        <NavBtn direction="prev" />

        {pages.map((p, i) =>
          p === '...' ? (
            <span key={`ellipsis-${i}`} style={{
              ...btnBase,
              cursor: 'default',
              border: 'none',
              background: 'transparent',
              color: 'var(--text-muted)',
            }}>
              ···
            </span>
          ) : (
            // FIX: onMouseEnter/Leave set hoveredPage state — no e.currentTarget.style mutation
            <button
              key={p}
              onClick={() => onPageChange(p)}
              onMouseEnter={() => p !== current && setHoveredPage(p)}
              onMouseLeave={() => setHoveredPage(null)}
              style={{
                ...btnBase,
                ...(p === current ? activeStyle : {}),
                ...(hoveredPage === p && p !== current ? { background: 'var(--bg-hover)' } : {}),
              }}
            >
              {p}
            </button>
          )
        )}

        <NavBtn direction="next" />
      </div>
    </div>
  )
}

export default memo(Pagination)