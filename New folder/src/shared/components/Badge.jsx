// src/shared/components/Badge.jsx
//
// A status pill badge. Supports preset variants AND custom color via `color` prop.
//
// Preset variants (pass as `variant` prop):
//   success  → green   (paid, active, approved, in_stock)
//   warning  → amber   (partial, pending, low_stock)
//   danger   → red     (unpaid, inactive, rejected, cancelled)
//   info     → blue    (draft, processing)
//   purple   → purple  (admin)
//   neutral  → gray    (default, unknown)
//
// Usage:
//   <Badge variant="success" label="Paid" />
//   <Badge variant="danger"  label="Unpaid" dot />
//   <Badge variant="warning" label="Partial" dot />
//
// Common alias shortcuts (pass `status` instead of `variant` + `label`):
//   <Badge status="paid" />       → green  "Paid"
//   <Badge status="unpaid" />     → red    "Unpaid"
//   <Badge status="partial" />    → amber  "Partial"
//   <Badge status="active" />     → green  "Active"
//   <Badge status="inactive" />   → red    "Inactive"
//   <Badge status="approved" />   → green  "Approved"
//   <Badge status="pending" />    → amber  "Pending"
//   <Badge status="cancelled" />  → red    "Cancelled"
//   <Badge status="draft" />      → blue   "Draft"
//   <Badge status="admin" />      → purple "Admin"
//   <Badge status="manager" />    → blue   "Manager"
//   <Badge status="staff" />      → neutral "Staff"

const VARIANTS = {
  success: {
    bg: 'var(--success-bg,  rgba(34,197,94,0.12))',
    color:  'var(--success-text,  #16A34A)',
    border: 'var(--success-border,rgba(34,197,94,0.25))',
    dot:    'var(--success-text)',
  },
  warning: {
    bg: 'var(--warning-bg,  rgba(245,158,11,0.12))',
    color:  'var(--warning-text,  #D97706)',
    border: 'var(--warning-border,rgba(245,158,11,0.25))',
    dot:    'var(--warning-text)',
  },
  danger: {
    bg: 'var(--danger-bg,   rgba(239,68,68,0.10))',
    color:  'var(--danger-text,   #DC2626)',
    border: 'var(--danger-border, rgba(239,68,68,0.22))',
    dot:    'var(--danger-text)',
  },
  info: {
    bg: 'var(--info-bg,  rgba(14,165,233,0.10))',
    color:  'var(--info-text,  #0284C7)',
    border: 'var(--info-border,rgba(14,165,233,0.22))',
    dot:    'var(--info-text)',
  },
  purple: {
    bg: 'color-mix(in srgb, var(--accent-600) 12%, transparent)',
    color:  'var(--accent-700)',
    border: 'color-mix(in srgb, var(--accent-600) 22%, transparent)',
    dot:    'var(--accent-600)',
  },
  neutral: {
    bg: 'var(--bg-subtle)',
    color:  'var(--text-secondary)',
    border: 'var(--border)',
    dot:    'var(--text-muted)',
  },
}

// Map status shortcut → { variant, label }
const STATUS_MAP = {
  paid:        { variant: 'success', label: 'Paid'      },
  unpaid:      { variant: 'danger',  label: 'Unpaid'    },
  partial:     { variant: 'warning', label: 'Partial'   },
  active:      { variant: 'success', label: 'Active'    },
  inactive:    { variant: 'danger',  label: 'Inactive'  },
  approved:    { variant: 'success', label: 'Approved'  },
  pending:     { variant: 'warning', label: 'Pending'   },
  cancelled:   { variant: 'danger',  label: 'Cancelled' },
  draft:       { variant: 'info',    label: 'Draft'     },
  processing:  { variant: 'info',    label: 'Processing'},
  admin:       { variant: 'purple',  label: 'Admin'     },
  manager:     { variant: 'info',    label: 'Manager'   },
  staff:       { variant: 'neutral', label: 'Staff'     },
  in_stock:    { variant: 'success', label: 'In Stock'  },
  low_stock:   { variant: 'warning', label: 'Low Stock' },
  out_of_stock:{ variant: 'danger',  label: 'Out of Stock' },
  rejected:    { variant: 'danger',  label: 'Rejected'  },
  unread:      { variant: 'warning', label: 'Unread'    },
  read:        { variant: 'neutral', label: 'Read'      },
}

export default function Badge({
  status,
  variant: variantProp,
  label: labelProp,
  dot = false,
  size = 'md',
  pulse = false,
}) {
  // Resolve from status shortcut OR explicit variant+label
  const resolved = status ? STATUS_MAP[status] : null
  const variant  = variantProp || resolved?.variant || 'neutral'
  const label    = labelProp   || resolved?.label   || status || '—'

  const c = VARIANTS[variant] || VARIANTS.neutral

  const sizeStyle = size === 'sm'
    ? { fontSize: 11, padding: '2px 8px',  gap: 4 }
    : { fontSize: 12, padding: '3px 10px', gap: 5 }

  return (
    <span
      title={label}
      style={{
      display: 'inline-flex',
      alignItems: 'center',
      background: c.bg,
      color: c.color,
      border: `1px solid ${c.border}`,
      borderRadius: 99,
      fontWeight: 600,
      fontFamily: 'var(--font-sans, "Plus Jakarta Sans", sans-serif)',
      whiteSpace: 'nowrap',
      lineHeight: 1,
      ...sizeStyle,
    }}>
      {dot && (
        <span style={{
          width: 5, height: 5,
          borderRadius: '50%',
          background: c.dot,
          flexShrink: 0,
          animation: pulse ? 'pulse-dot 1.8s ease-in-out infinite' : 'none',
        }} />
      )}
      {label}
    </span>
  )
}
