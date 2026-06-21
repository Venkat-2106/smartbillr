// src/shared/components/DateRangeFilter.jsx
//
// Shared date range filter bar used across Categories, Customers,
// and all future list pages. Extracted from CategoriesPage + CustomersPage
// to avoid duplicating the same component in every feature.
//
// Usage:
//   <DateRangeFilter
//     label="Created"        ← column label shown before the inputs
//     from={dateFrom}
//     to={dateTo}
//     onChange={handleDateChange}
//   />
//   function handleDateChange(field, value) {
//     if (field === 'from') setDateFrom(value)
//     else setDateTo(value)
//   }

export default function DateRangeFilter({ label = 'Date', from, to, onChange }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
      <span style={{
        fontSize: 12, fontWeight: 600, color: 'var(--text-muted)',
        letterSpacing: '0.04em', textTransform: 'uppercase', whiteSpace: 'nowrap',
      }}>
        {label}
      </span>
      <input
        type="date"
        value={from}
        onChange={e => onChange('from', e.target.value)}
        style={dateInputStyle}
      />
      <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>to</span>
      <input
        type="date"
        value={to}
        onChange={e => onChange('to', e.target.value)}
        style={dateInputStyle}
      />
    </div>
  )
}

const dateInputStyle = {
  padding: '6px 10px',
  background: 'var(--bg-card)',
  border: '1.5px solid var(--border)',
  borderRadius: 8,
  fontSize: 13,
  color: 'var(--text-primary)',
  fontFamily: "var(--font-sans, 'Plus Jakarta Sans', sans-serif)",
  outline: 'none',
  cursor: 'pointer',
}