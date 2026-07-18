import { memo } from 'react'

function Skeleton({ w = '60%', h = 13 }) {
  return (
    <div style={{
      height: h,
      width: w,
      background: 'var(--bg-hover)',
      borderRadius: 6,
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
      <svg width="7" height="5" viewBox="0 0 7 5" fill="none" aria-hidden="true">
        <path
          d="M3.5 0.5L6.5 4.5H0.5L3.5 0.5Z"
          fill={up ? 'var(--accent-600)' : 'var(--text-muted)'}
        />
      </svg>
      <svg width="7" height="5" viewBox="0 0 7 5" fill="none" aria-hidden="true">
        <path
          d="M3.5 4.5L0.5 0.5H6.5L3.5 4.5Z"
          fill={down ? 'var(--accent-600)' : 'var(--text-muted)'}
        />
      </svg>
    </span>
  )
}

function Table({
  columns = [],
  rows = [],
  loading = false,
  emptyText = 'No records found.',
  rowKey = 'id',
  onRowClick,
  sortKey,
  sortDir,
  onSort,
  selectedIndex,
  onSelectedIndexChange,
}) {
  const SKELETON_ROWS = 8

  // Hover highlight is now pure CSS (:hover), so no React state is needed.
  // Sort-highlight stays state-driven via the `sorted` class on <th>.

  return (
    <>

      <div style={{
        background: 'var(--bg-card)',
        border: '1px solid var(--border)',
        borderRadius: 16,
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
                  const isSorted = sortKey === col.key
                  const canSort  = col.sortable && onSort

                  return (
                      <th
                        key={col.key}
                        onClick={() => canSort && onSort(col.key)}
                        onKeyDown={e => { if ((e.key === 'Enter' || e.key === ' ') && canSort) { e.preventDefault(); onSort(col.key); } }}
                        data-sortable={canSort ? '' : undefined}
                        tabIndex={canSort ? 0 : -1}
                        role={canSort ? 'columnheader button' : 'columnheader'}
                        aria-sort={isSorted ? (sortDir === 'asc' ? 'ascending' : 'descending') : 'none'}
                        className={`table-header-cell${isSorted ? ' sorted' : ''}`}
                        style={{
                          padding: '12px 20px',
                          textAlign: col.align === 'right'  ? 'right'
                                   : col.align === 'center' ? 'center' : 'left',
                          fontSize: 11,
                          fontWeight: 700,
                          letterSpacing: '0.08em',
                          textTransform: 'uppercase',
                          whiteSpace: 'nowrap',
                          width: col.width || 'auto',
                          fontFamily: 'var(--font-sans, "Inter", sans-serif)',
                          cursor: canSort ? 'pointer' : 'default',
                          userSelect: 'none',
                          transition: 'color 0.14s',
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
                          <td key={j} style={{ padding: '12px 20px' }}>
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
                      padding: '48px 24px',
                      textAlign: 'center',
                      color: 'var(--text-muted)',
                      fontSize: 13,
                      fontFamily: 'var(--font-sans, "Inter", sans-serif)',
                    }}
                  >
                    <div style={{
                      display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 12,
                    }}>
                      <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="var(--text-disabled)" strokeWidth={1.2} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                        <path d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                      </svg>
                      {emptyText}
                    </div>
                  </td>
                </tr>
              ) : (
                rows.map((row, i) => {
                  const rowId = row[rowKey] ?? i
                  const isSelected = selectedIndex != null && i === selectedIndex
                  const delay = Math.min(i * 30, 300)
                  return (
                  <tr
                    key={rowId}
                    className={`table-row${isSelected ? ' selected' : ''}`}
                    onClick={() => {
                      onSelectedIndexChange?.(i)
                      onRowClick?.(row)
                    }}
                    style={{
                      borderBottom: i < rows.length - 1 ? '1px solid var(--border)' : 'none',
                      cursor: onRowClick ? 'pointer' : 'default',
                      transition: 'background 0.15s',
                      background: isSelected ? 'var(--accent-glow)' : undefined,
                      boxShadow: isSelected
                        ? 'inset 2px 0 0 var(--accent-500)'
                        : 'none',
                      animation: `row-in 0.25s var(--ease-out) both`,
                      animationDelay: `${delay}ms`,
                    }}
                  >
                    {columns.map((col, ci) => (
                      <td
                        key={col.key}
                        style={{
                          padding: '12px 20px',
                          fontSize: 13,
                          color: 'var(--text-primary)',
                          fontFamily: 'var(--font-sans, "Inter", sans-serif)',
                          whiteSpace: col.wrap ? 'normal' : 'nowrap',
                          textAlign: col.align === 'right'  ? 'right'
                                   : col.align === 'center' ? 'center' : 'left',
                          verticalAlign: 'middle',
                          transition: 'background 0.15s',
                        }}
                      >
                        {col.render ? col.render(row) : (row[col.key] ?? '—')}
                      </td>
                    ))}
                  </tr>
                  )
                })
              )}
            </tbody>
          </table>
        </div>
      </div>
    </>
  )
}

// FIX: Wrap with React.memo so Table only re-renders when its own props change.
// Without memo, every keystroke in a SearchBar (which updates parent state) caused
// Table to re-render even when rows and columns were identical — noticeable lag on
// large datasets. memo eliminates those redundant renders.
export default memo(Table)