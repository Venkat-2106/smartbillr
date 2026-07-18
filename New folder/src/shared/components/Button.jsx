// src/shared/components/Button.jsx
//
// Variants: primary | secondary | danger | ghost
// Sizes:    sm | md | lg
// Props:    loading (shows spinner), disabled, leftIcon, rightIcon, fullWidth

import { useState } from 'react'

const BASE = {
  display: 'inline-flex',
  alignItems: 'center',
  justifyContent: 'center',
  gap: 7,
  fontFamily: 'var(--font-sans, "Inter", sans-serif)',
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
  sm: { padding: '7px 14px',  fontSize: 13, height: 32, minWidth: 64  },
  md: { padding: '9px 18px',  fontSize: 13, height: 38, minWidth: 80  },
  lg: { padding: '11px 24px', fontSize: 14, height: 44, minWidth: 100 },
}

const VARIANT_STYLE = {
  primary: {
    background: 'linear-gradient(135deg, var(--accent-600), var(--accent-500))',
    color: '#fff',
    boxShadow: '0 2px 10px var(--accent-glow, rgba(79,70,229,0.28))',
    willChange: 'transform, box-shadow',
  },
  secondary: {
    background: 'var(--bg-subtle)',
    color: 'var(--text-primary)',
    border: '1px solid var(--border)',
    boxShadow: 'none',
  },
  danger: {
    background: 'linear-gradient(135deg, var(--danger), var(--danger-text))',
    color: '#fff',
    boxShadow: '0 2px 10px color-mix(in srgb, var(--danger) 28%, transparent)',
  },
  ghost: {
    background: 'transparent',
    color: 'var(--text-secondary)',
    boxShadow: 'none',
  },
}

const VARIANT_HOVER = {
  primary:   { opacity: 0.92, transform: 'translateY(-1px)', boxShadow: '0 6px 20px var(--accent-glow, rgba(79,70,229,0.35))' },
  secondary: { background: 'var(--bg-hover)', borderColor: 'var(--border-hover)', transform: 'translateY(-1px)' },
  danger:    { opacity: 0.92, transform: 'translateY(-1px)', boxShadow: '0 6px 20px color-mix(in srgb, var(--danger) 30%, transparent)' },
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
  const [hovered, setHovered] = useState(false)
  const [pressed, setPressed] = useState(false)

  const variantStyle = VARIANT_STYLE[variant] || VARIANT_STYLE.primary
  const sizeStyle    = SIZE[size] || SIZE.md
  const hoverStyle   = !isDisabled && hovered ? (VARIANT_HOVER[variant] || {}) : {}

  const merged = {
    ...BASE,
    ...sizeStyle,
    ...variantStyle,
    ...hoverStyle,
    width: fullWidth ? '100%' : undefined,
    opacity: isDisabled ? 0.55 : (hovered ? hoverStyle.opacity ?? 1 : 1),
    transform: pressed && !isDisabled ? 'scale(0.97)' : (hovered && !isDisabled ? hoverStyle.transform ?? 'translateY(0)' : 'translateY(0)'),
    cursor: isDisabled ? 'not-allowed' : 'pointer',
    pointerEvents: isDisabled ? 'none' : 'auto',
    ...extraStyle,
  }

  return (
    <>
      <button
        type={type}
        onClick={onClick}
        disabled={isDisabled}
        style={merged}
        onMouseEnter={() => setHovered(true)}
        onMouseLeave={() => { setHovered(false); setPressed(false) }}
        onMouseDown={() => !isDisabled && setPressed(true)}
        onMouseUp={() => !isDisabled && setPressed(false)}
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