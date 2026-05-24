// src/shared/components/Table.jsx
//
// A responsive data table with consistent styling.
// Handles loading skeletons, empty state, and hover rows automatically.
//
// Props:
//   columns   → array of { key, label, width?, align?, render? }
//               render(row) → JSX for custom cell rendering
//   rows      → array of data objects
//   loading   → boolean — shows skeleton rows while true
//   emptyText → string shown when rows is empty (default message used if omitted)
//   rowKey    → string key to use as React key (default: 'id')
//   onRowClick → function(row) — makes rows clickable
//
// Usage:
//   <Table
//     columns={[
//       { key: 'name',   label: 'Name' },
//       { key: 'status', label: 'Status', render: row => <Badge status={row.status} dot /> },
//       { key: 'amount', label: 'Amount', align: 'right' },
//     ]}
//     rows={data}
//     loading={isLoading}
//     rowKey="sale_id"
//   />

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

export default function Table({
  columns = [],
  rows = [],
  loading = false,
  emptyText = 'No records found.',
  rowKey = 'id',
  onRowClick,
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
                {columns.map(col => (
                  <th
                    key={col.key}
                    style={{
                      padding: '11px 20px',
                      textAlign: col.align === 'right' ? 'right'
                               : col.align === 'center' ? 'center' : 'left',
                      fontSize: 10.5,
                      fontWeight: 700,
                      color: 'var(--text-muted)',
                      letterSpacing: '0.08em',
                      textTransform: 'uppercase',
                      whiteSpace: 'nowrap',
                      width: col.width || 'auto',
                      fontFamily: 'var(--font-sans, "Plus Jakarta Sans", sans-serif)',
                    }}
                  >
                    {col.label}
                  </th>
                ))}
              </tr>
            </thead>

            {/* Body */}
            <tbody>
              {loading ? (
                /* Skeleton rows */
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
                /* Empty state */
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
                /* Data rows */
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
