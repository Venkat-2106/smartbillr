export function DropdownMenu({ children, style, ...props }) {
  return (
    <div
      style={{
        background: 'var(--bg-card)',
        border: '1px solid var(--border)',
        borderRadius: 12,
        boxShadow: '0 12px 40px rgba(0,0,0,0.15), 0 4px 12px rgba(0,0,0,0.06)',
        overflow: 'hidden',
        ...style,
      }}
      {...props}
    >
      {children}
    </div>
  )
}

export function DropdownMenuScroll({ children, maxHeight = 220, style, ...props }) {
  return (
    <div
      style={{
        maxHeight,
        overflowY: 'auto',
        ...style,
      }}
      {...props}
    >
      {children}
    </div>
  )
}

export function DropdownMenuItem({
  highlighted,
  onMouseDown,
  onMouseEnter,
  style,
  children,
  ...props
}) {
  return (
    <div
      onMouseDown={onMouseDown}
      onMouseEnter={onMouseEnter}
      style={{
        position: 'relative',
        padding: '10px 16px',
        cursor: 'pointer',
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        borderBottom: '1px solid var(--border)',
        transition: 'background 0.12s ease',
        background: highlighted ? 'var(--bg-subtle)' : 'transparent',
        ...style,
      }}
      {...props}
    >
      {highlighted && (
        <span
          style={{
            position: 'absolute',
            left: 0,
            top: 3,
            bottom: 3,
            width: 3,
            background: 'var(--accent-500)',
            borderRadius: '0 3px 3px 0',
          }}
        />
      )}
      {children}
    </div>
  )
}

export function DropdownMenuEmpty({ children, style, ...props }) {
  return (
    <div
      style={{
        padding: '20px 24px',
        textAlign: 'center',
        fontSize: 13,
        color: 'var(--text-muted)',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        gap: 6,
        ...style,
      }}
      {...props}
    >
      {children}
    </div>
  )
}

export function DropdownMenuHint({ children, style, ...props }) {
  return (
    <div
      style={{
        padding: '14px 20px',
        textAlign: 'center',
        fontSize: 12,
        color: 'var(--text-muted)',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        gap: 4,
        ...style,
      }}
      {...props}
    >
      {children}
    </div>
  )
}
