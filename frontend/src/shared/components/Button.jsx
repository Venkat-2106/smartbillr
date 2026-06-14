// src/shared/components/Button.jsx
//
// Variants: primary | secondary | danger | ghost
// Sizes:    sm | md | lg
// Props:    loading (shows spinner), disabled, leftIcon, rightIcon, fullWidth

import { clsx } from 'clsx'

const BASE = {
  display: 'inline-flex',
  alignItems: 'center',
  justifyContent: 'center',
  gap: 7,
  fontFamily: 'var(--font-sans, "Plus Jakarta Sans", sans-serif)',
  fontWeight: 600,
  borderRadius: 10,
  border: 'none',
  cursor: 'pointer',
  transition: 'all 0.16s var(--ease-out, cubic-bezier(0.34,1.26,0.64,1))',
  whiteSpace: 'nowrap',
  userSelect: 'none',
  lineHeight: 1,
  letterSpacing: '-0.01em',
  position: 'relative',
  overflow: 'hidden',
  flexShrink: 0,
}

const SIZE = {
  sm: { padding: '7px 14px',  fontSize: 12.5, height: 32, minWidth: 64  },
  md: { padding: '9px 18px',  fontSize: 13.5, height: 38, minWidth: 80  },
  lg: { padding: '11px 24px', fontSize: 14.5, height: 44, minWidth: 100 },
}

const VARIANT_STYLE = {
  primary: {
    background: 'linear-gradient(135deg, var(--accent-600), var(--accent-500))',
    color: '#fff',
    boxShadow: '0 2px 10px var(--accent-glow, rgba(79,70,229,0.28))',
  },
  secondary: {
    background: 'var(--bg-subtle)',
    color: 'var(--text-primary)',
    border: '1px solid var(--border)',
    boxShadow: 'none',
  },
  danger: {
    background: 'linear-gradient(135deg, #EF4444, #DC2626)',
    color: '#fff',
    boxShadow: '0 2px 10px rgba(239,68,68,0.28)',
  },
  ghost: {
    background: 'transparent',
    color: 'var(--text-secondary)',
    boxShadow: 'none',
  },
}

const VARIANT_HOVER = {
  primary:   { opacity: 0.88, transform: 'translateY(-1px)' },
  secondary: { background: 'var(--bg-hover)', borderColor: 'var(--border-hover)', transform: 'translateY(-1px)' },
  danger:    { opacity: 0.88, transform: 'translateY(-1px)' },
  ghost:     { background: 'var(--bg-hover)', color: 'var(--text-primary)' },
}

function Spinner({ size = 14 }) {
  return (
    <svg
      width={size} height={size}
      viewBox="0 0 16 16"
      style={{ animation: 'btn-spin 0.7s linear infinite', flexShrink: 0 }}
    >
      <circle
        cx="8" cy="8" r="6"
        fill="none"
        stroke="currentColor"
        strokeWidth="2.5"
        strokeDasharray="28"
        strokeDashoffset="10"
        strokeLinecap="round"
      />
    </svg>
  )
}

export default function Button({
  children,
  variant = 'primary',
  size = 'md',
  loading = false,
  disabled = false,
  leftIcon,
  rightIcon,
  fullWidth = false,
  onClick,
  type = 'button',
  style: extraStyle = {},
  ...rest
}) {
  const isDisabled = disabled || loading

  const variantStyle = VARIANT_STYLE[variant] || VARIANT_STYLE.primary
  const sizeStyle    = SIZE[size] || SIZE.md

  const merged = {
    ...BASE,
    ...sizeStyle,
    ...variantStyle,
    width: fullWidth ? '100%' : undefined,
    opacity: isDisabled ? 0.55 : 1,
    cursor: isDisabled ? 'not-allowed' : 'pointer',
    pointerEvents: isDisabled ? 'none' : 'auto',
    ...extraStyle,
  }

  return (
    <>
      <style>{`
        @keyframes btn-spin {
          to { transform: rotate(360deg) }
        }
      `}</style>

      <button
        type={type}
        onClick={onClick}
        disabled={isDisabled}
        style={merged}
        onMouseEnter={e => {
          if (isDisabled) return
          const h = VARIANT_HOVER[variant] || {}
          Object.assign(e.currentTarget.style, h)
        }}
        onMouseLeave={e => {
          if (isDisabled) return
          Object.assign(e.currentTarget.style, variantStyle)
          e.currentTarget.style.transform = 'translateY(0)'
          e.currentTarget.style.opacity = '1'
        }}
        onMouseDown={e => {
          if (!isDisabled) e.currentTarget.style.transform = 'scale(0.97)'
        }}
        onMouseUp={e => {
          if (!isDisabled) e.currentTarget.style.transform = 'translateY(-1px)'
        }}
        {...rest}
      >
        {loading
          ? <Spinner size={size === 'sm' ? 13 : size === 'lg' ? 16 : 14} />
          : leftIcon}
        {children}
        {!loading && rightIcon}
      </button>
    </>
  )
}