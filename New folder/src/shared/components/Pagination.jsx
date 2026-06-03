// src/shared/components/Pagination.jsx
//
// Page number controls that match your backend's pagination format:
//   { items: [...], pagination: { page, pages, total, size } }
//
// Props:
//   pagination  → the pagination object from API response
//   onPageChange → function(newPage) — called when user clicks a page
//
// Usage:
//   const [page, setPage] = useState(1)
//   // pass page to your useQuery hook
//   // in JSX:
//   <Pagination pagination={data?.pagination} onPageChange={setPage} />

export default function Pagination({ pagination, onPageChange }) {
  if (!pagination) return null

  const { page: current, pages: total } = pagination
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
    borderRadius: 8,
    border: '1px solid var(--border)',
    background: 'var(--bg-card)',
    fontSize: 13,
    fontWeight: 500,
    cursor: 'pointer',
    color: 'var(--text-secondary)',
    fontFamily: 'var(--font-sans, "Plus Jakarta Sans", sans-serif)',
    transition: 'all 0.14s',
    userSelect: 'none',
    flexShrink: 0,
  }

  const activeStyle = {
    background: 'linear-gradient(135deg, var(--accent-600), var(--accent-500))',
    color: '#fff',
    borderColor: 'var(--accent-600)',
    boxShadow: '0 2px 8px var(--accent-glow, rgba(79,70,229,0.25))',
    fontWeight: 700,
  }

  const disabledStyle = {
    opacity: 0.4,
    cursor: 'not-allowed',
    pointerEvents: 'none',
  }

  function NavBtn({ direction }) {
    const isDisabled = direction === 'prev' ? current <= 1 : current >= total
    const label = direction === 'prev' ? '←' : '→'
    return (
      <button
        onClick={() => onPageChange(direction === 'prev' ? current - 1 : current + 1)}
        style={{
          ...btnBase,
          ...(isDisabled ? disabledStyle : {}),
          fontSize: 16,
        }}
        disabled={isDisabled}
        onMouseEnter={e => {
          if (!isDisabled) e.currentTarget.style.background = 'var(--bg-hover)'
        }}
        onMouseLeave={e => {
          if (!isDisabled) e.currentTarget.style.background = 'var(--bg-card)'
        }}
      >
        {label}
      </button>
    )
  }

  return (
    <div style={{
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'space-between',
      flexWrap: 'wrap',
      gap: 12,
      marginTop: 20,
    }}>
      {/* Info text */}
      <span style={{
        fontSize: 12.5,
        color: 'var(--text-muted)',
        fontFamily: 'var(--font-sans, "Plus Jakarta Sans", sans-serif)',
      }}>
        Page {current} of {total}
        {pagination.total != null && ` · ${pagination.total} records`}
      </span>

      {/* Controls */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
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
            <button
              key={p}
              onClick={() => onPageChange(p)}
              style={{
                ...btnBase,
                ...(p === current ? activeStyle : {}),
              }}
              onMouseEnter={e => {
                if (p !== current) e.currentTarget.style.background = 'var(--bg-hover)'
              }}
              onMouseLeave={e => {
                if (p !== current) e.currentTarget.style.background = 'var(--bg-card)'
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
