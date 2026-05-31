// src/shared/components/Table.jsx
//
// Responsive data table with:
//   - Sortable columns (pass sortable: true on column def)
//   - Loading skeleton rows
//   - Empty state
//   - Hover rows
//   - Optional row click
//
// Column def shape:
//   {
//     key,           → data key (also used as sort key)
//     label,         → header text
//     width?,        → CSS width
//     align?,        → 'left' | 'right' | 'center'
//     sortable?,     → true = clicking header triggers onSort
//     wrap?,         → true = allow text wrap
//     skeletonW?,    → skeleton width override e.g. '40%'
//     render?,       → (row) => JSX
//   }
//
// Sort props (controlled externally — parent owns sort state):
//   sortKey        → currently sorted column key (string)
//   sortDir        → 'asc' | 'desc'
//   onSort(key)    → called when a sortable header is clicked

function Skeleton({ w = '60%', h = 13 }) {
  return (
    <div style={{
      height: h,
      width: w,
      background: 'var(--bg-hover)',
      borderRadius: 5,
      animation: 'table-shimmer 1.5s ease-in-out infinite',
    }} />
  )
}

function SortIcon({ active, dir }) {
  const up   = active && dir === 'asc'
  const down = active && dir === 'desc'

  return (
    <span style={{
      display: 'inline-flex',
      flexDirection: 'column',
      gap: 1,
      marginLeft: 5,
      verticalAlign: 'middle',
      opacity: active ? 1 : 0.35,
      transition: 'opacity 0.14s',
    }}>
      {/* Up arrow */}
      <svg width="7" height="5" viewBox="0 0 7 5" fill="none">
        <path
          d="M3.5 0.5L6.5 4.5H0.5L3.5 0.5Z"
          fill={up ? 'var(--accent-600)' : 'var(--text-muted)'}
        />
      </svg>
      {/* Down arrow */}
      <svg width="7" height="5" viewBox="0 0 7 5" fill="none">
        <path
          d="M3.5 4.5L0.5 0.5H6.5L3.5 4.5Z"
          fill={down ? 'var(--accent-600)' : 'var(--text-muted)'}
        />
      </svg>
    </span>
  )
}

export default function Table({
  columns = [],
  rows = [],
  loading = false,
  emptyText = 'No records found.',
  rowKey = 'id',
  onRowClick,
  // Sort props (controlled by parent)
  sortKey,
  sortDir,
  onSort,
}) {
  const SKELETON_ROWS = 5

  return (
    <>
      <style>{`
        @keyframes table-shimmer {
          0%, 100% { opacity: 1 }
          50%       { opacity: 0.4 }
        }
      `}</style>

      <div style={{
        background: 'var(--bg-card)',
        border: '1px solid var(--border)',
        borderRadius: 18,
        boxShadow: 'var(--shadow-card)',
        overflow: 'hidden',
      }}>
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>

            {/* Header */}
            <thead>
              <tr style={{
                background: 'var(--bg-subtle)',
                borderBottom: '1px solid var(--border)',
              }}>
                {columns.map(col => {
                  const isSorted  = sortKey === col.key
                  const canSort   = col.sortable && onSort

                  return (
                    <th
                      key={col.key}
                      onClick={() => canSort && onSort(col.key)}
                      style={{
                        padding: '11px 20px',
                        textAlign: col.align === 'right'  ? 'right'
                                 : col.align === 'center' ? 'center' : 'left',
                        fontSize: 10.5,
                        fontWeight: 700,
                        color: isSorted ? 'var(--accent-600)' : 'var(--text-muted)',
                        letterSpacing: '0.08em',
                        textTransform: 'uppercase',
                        whiteSpace: 'nowrap',
                        width: col.width || 'auto',
                        fontFamily: 'var(--font-sans, "Plus Jakarta Sans", sans-serif)',
                        cursor: canSort ? 'pointer' : 'default',
                        userSelect: 'none',
                        transition: 'color 0.14s',
                      }}
                      onMouseEnter={e => {
                        if (canSort) e.currentTarget.style.color = 'var(--accent-600)'
                      }}
                      onMouseLeave={e => {
                        if (canSort && !isSorted)
                          e.currentTarget.style.color = 'var(--text-muted)'
                      }}
                    >
                      {col.label}
                      {col.sortable && (
                        <SortIcon active={isSorted} dir={sortDir} />
                      )}
                    </th>
                  )
                })}
              </tr>
            </thead>

            {/* Body */}
            <tbody>
              {loading ? (
                [...Array(SKELETON_ROWS)].map((_, i) => (
                  <tr key={i} style={{ borderBottom: '1px solid var(--border)' }}>
                    {columns.map((col, j) => (
                      <td key={j} style={{ padding: '15px 20px' }}>
                        <Skeleton w={col.skeletonW || '65%'} />
                      </td>
                    ))}
                  </tr>
                ))
              ) : rows.length === 0 ? (
                <tr>
                  <td
                    colSpan={columns.length}
                    style={{
                      padding: '56px 24px',
                      textAlign: 'center',
                      color: 'var(--text-muted)',
                      fontSize: 13.5,
                      fontFamily: 'var(--font-sans, "Plus Jakarta Sans", sans-serif)',
                    }}
                  >
                    {emptyText}
                  </td>
                </tr>
              ) : (
                rows.map((row, i) => (
                  <tr
                    key={row[rowKey] ?? i}
                    onClick={() => onRowClick?.(row)}
                    style={{
                      borderBottom: i < rows.length - 1 ? '1px solid var(--border)' : 'none',
                      cursor: onRowClick ? 'pointer' : 'default',
                      transition: 'background 0.12s',
                    }}
                    onMouseEnter={e => {
                      e.currentTarget.style.background = 'var(--bg-subtle)'
                    }}
                    onMouseLeave={e => {
                      e.currentTarget.style.background = 'transparent'
                    }}
                  >
                    {columns.map(col => (
                      <td
                        key={col.key}
                        style={{
                          padding: '14px 20px',
                          fontSize: 13.5,
                          color: 'var(--text-primary)',
                          fontFamily: 'var(--font-sans, "Plus Jakarta Sans", sans-serif)',
                          whiteSpace: col.wrap ? 'normal' : 'nowrap',
                          textAlign: col.align === 'right'  ? 'right'
                                   : col.align === 'center' ? 'center' : 'left',
                          verticalAlign: 'middle',
                        }}
                      >
                        {col.render ? col.render(row) : (row[col.key] ?? '—')}
                      </td>
                    ))}
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </>
  )
}