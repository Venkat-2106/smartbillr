import { Modal, Button, EmptyState } from '../../../shared/components'
import { formatDateTime } from '../../../shared/utils/formatDate'

function formatValue(val) {
  if (val === null || val === undefined) return '—'
  // Resolved FK: backend sends { id: "...", name: "Product Name" }
  if (typeof val === 'object' && val !== null && 'id' in val && 'name' in val) {
    return (
      <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
        <span style={{ fontWeight: 600, color: 'var(--text-primary)' }}>{val.name}</span>
        <span style={{ fontSize: 11, color: 'var(--text-muted)', fontFamily: 'var(--font-mono, monospace)' }}>
          ({String(val.id).slice(0, 8)}…)
        </span>
      </span>
    )
  }
  if (typeof val === 'object') return JSON.stringify(val, null, 2)
  return String(val)
}

function buildDiffRows(oldData, newData) {
  const old = oldData || {}
  const nw = newData || {}
  const allKeys = [...new Set([...Object.keys(old), ...Object.keys(nw)])]

  return allKeys.filter(key => {
    const oldVal = old[key] !== undefined ? JSON.stringify(old[key]) : null
    const newVal = nw[key] !== undefined ? JSON.stringify(nw[key]) : null
    return oldVal !== newVal
  }).map(key => ({
    field: key,
    old: old[key],
    new: nw[key],
  }))
}

const thStyle = {
  textAlign: 'left',
  padding: '12px 16px',
  fontSize: 11,
  fontWeight: 700,
  color: 'var(--text-muted)',
  textTransform: 'uppercase',
  letterSpacing: '0.04em',
  borderBottom: '2px solid var(--border)',
  whiteSpace: 'nowrap',
}

const tdBase = {
  padding: '12px 16px',
  fontWeight: 500,
  borderBottom: '1px solid var(--border)',
  verticalAlign: 'top',
}

const fieldStyle = {
  ...tdBase,
  color: 'var(--text-primary)',
  fontWeight: 600,
  whiteSpace: 'nowrap',
}

const FIELD_LABELS = {
  product_id: 'Product',
  customer_id: 'Customer',
  category_id: 'Category',
  supp_id: 'Supplier',
  business_id: 'Business',
  sale_id: 'Sale',
  pur_id: 'Purchase',
  created_by: 'Created By',
  updated_by: 'Updated By',
  user_id: 'User',
}

export default function ChangeDiffModal({ open, onClose, record }) {
  if (!record) return null

  const rows = buildDiffRows(record.old_data, record.new_data)
  const actionLabel = record.action_type.charAt(0).toUpperCase() + record.action_type.slice(1)

  const afterColor = record.action_type === 'delete'
    ? 'var(--danger-text)'
    : 'var(--accent-600)'

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={`${record.table_name} — ${actionLabel}`}
      subtitle={formatDateTime(record.created_at)}
      size="lg"
    >
      {rows.length === 0 ? (
        <EmptyState title="No field-level changes detected" description="All fields are identical between the old and new record." />
      ) : (
        <div className="premium-table-wrap" style={{ overflowX: 'auto' }}>
          <table className="premium-table" style={{ width: '100%' }}>
            <thead>
              <tr>
                <th style={thStyle}>Field</th>
                <th style={thStyle}>Before</th>
                <th style={thStyle}>After</th>
              </tr>
            </thead>
            <tbody>
              {rows.map(r => (
                <tr key={r.field}>
                  <td style={fieldStyle}>{FIELD_LABELS[r.field] || r.field}</td>
                  <td style={{ ...tdBase, color: record.action_type === 'delete' ? afterColor : 'var(--text-secondary)', fontFamily: 'var(--font-mono, monospace)', fontSize: 13 }}>
                    {formatValue(r.old)}
                  </td>
                  <td style={{ ...tdBase, color: record.action_type === 'delete' ? 'var(--text-secondary)' : afterColor, fontFamily: 'var(--font-mono, monospace)', fontSize: 13 }}>
                    {formatValue(r.new)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <Modal.Footer>
        <Button variant="secondary" onClick={onClose}>Close</Button>
      </Modal.Footer>
    </Modal>
  )
}
