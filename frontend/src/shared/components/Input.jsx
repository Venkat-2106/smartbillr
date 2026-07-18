// src/shared/components/Input.jsx
//
// A single-line text input with label, error, helper text, and left/right icon slots.
// Designed to be used standalone OR inside FormField (React Hook Form).
//
// Props:
//   label       → string shown above the field
//   error       → string; if present, border turns red + message shown below
//   helper      → string; shown below in muted text (hidden if error present)
//   leftIcon    → JSX node shown inside left side (e.g. search icon)
//   rightIcon   → JSX node shown inside right side (e.g. clear button)
//   disabled    → grays out the field
//   ...rest     → all standard <input> props (value, onChange, placeholder, type, etc.)

import { forwardRef, useState } from 'react'

const Input = forwardRef(function Input(
  {
    label,
    error,
    helper,
    leftIcon,
    rightIcon,
    disabled = false,
    style: extraStyle = {},
    id,
    ...rest
  },
  ref
) {
  const [focused, setFocused] = useState(false)
  const fieldId = id || `input-${label?.replace(/\s+/g, '-').toLowerCase() || Math.random()}`

  const hasError = Boolean(error)

  const wrapperStyle = {
    position: 'relative',
    display: 'flex',
    alignItems: 'center',
    background: disabled ? 'var(--bg-subtle)' : 'var(--bg-card)',
    border: `1.5px solid ${
      hasError  ? 'var(--danger-border, #F87171)' :
      focused   ? 'var(--accent-600)'             :
                  'var(--border)'
    }`,
    borderRadius: 10,
    transition: 'border-color 0.16s, box-shadow 0.16s',
    boxShadow: focused && !hasError
      ? '0 0 0 3px var(--accent-glow, rgba(79,70,229,0.16))'
      : focused && hasError
      ? '0 0 0 3px rgba(239,68,68,0.14)'
      : 'none',
    cursor: disabled ? 'not-allowed' : 'text',
  }

  const inputStyle = {
    flex: 1,
    background: 'transparent',
    border: 'none',
    fontFamily: 'var(--font-sans, "Plus Jakarta Sans", sans-serif)',
    fontSize: 13,
    fontWeight: 400,
    color: disabled ? 'var(--text-muted)' : 'var(--text-primary)',
    padding: leftIcon ? '9px 12px 9px 0' : '9px 12px',
    paddingRight: rightIcon ? 0 : 12,
    lineHeight: 1.4,
    cursor: disabled ? 'not-allowed' : 'text',
    minWidth: 0,
  }

  const iconStyle = {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    color: hasError ? 'var(--danger-text, #EF4444)' : 'var(--text-muted)',
    flexShrink: 0,
    padding: '0 10px',
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 6, ...extraStyle }}>
      {label && (
        <label
          htmlFor={fieldId}
          style={{
            fontSize: 13,
            fontWeight: 600,
            color: hasError ? 'var(--danger-text, #EF4444)' : 'var(--text-secondary)',
            letterSpacing: '0.02em',
            cursor: 'pointer',
          }}
        >
          {label}
        </label>
      )}

      <div style={wrapperStyle}>
        {leftIcon && <span style={iconStyle}>{leftIcon}</span>}

        <input
          ref={ref}
          id={fieldId}
          disabled={disabled}
          className="sb-focusable"
          style={inputStyle}
          onFocus={() => setFocused(true)}
          onBlur={() => setFocused(false)}
          {...rest}
        />

        {rightIcon && <span style={{ ...iconStyle, padding: '0 10px' }}>{rightIcon}</span>}
      </div>

      {(error || helper) && (
        <p style={{
          fontSize: 12,
          fontWeight: 400,
          margin: 0,
          color: hasError ? 'var(--danger-text, #EF4444)' : 'var(--text-muted)',
          lineHeight: 1.4,
        }}>
          {error || helper}
        </p>
      )}
    </div>
  )
})

export default Input
