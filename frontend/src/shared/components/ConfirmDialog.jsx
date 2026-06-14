import { useEffect, useCallback } from 'react'
import Button from './Button'

export default function ConfirmDialog({
  open,
  onClose,
  onConfirm,
  title = 'Are you sure?',
  message,
  confirmText = 'Confirm',
  cancelText = 'Cancel',
  variant = 'danger',
  loading = false,
}) {
  const handleKeyDown = useCallback((e) => {
    if (e.key === 'Escape') onClose?.()
  }, [onClose])

  useEffect(() => {
    if (open) {
      document.addEventListener('keydown', handleKeyDown)
    }
    return () => {
      document.removeEventListener('keydown', handleKeyDown)
    }
  }, [open, handleKeyDown])

  if (!open) return null

  const iconMap = { danger: '🗑️', warning: '⚠️' }
  const icon = iconMap[variant] || iconMap.danger

  const iconBg = variant === 'danger'
    ? 'linear-gradient(135deg, #EF4444, #DC2626)'
    : 'linear-gradient(135deg, #F59E0B, #F97316)'

  return (
    <>

      {/* Backdrop */}
      <div
        onClick={onClose}
        style={{
          position: 'fixed', inset: 0,
          background: 'rgba(0,0,0,0.45)',
          backdropFilter: 'blur(3px)',
          zIndex: 1100,
        }}
      />

      {/* Dialog */}
      <div style={{
        position: 'fixed', inset: 0,
        zIndex: 1101,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '20px 16px',
        pointerEvents: 'none',
      }}>
        <div
          onClick={e => e.stopPropagation()}
          style={{
            background: 'var(--bg-card)',
            border: '1px solid var(--border)',
            borderRadius: 18,
            boxShadow: 'var(--shadow-elevated, 0 20px 60px rgba(0,0,0,0.18))',
            width: '100%',
            maxWidth: 420,
            padding: '28px 28px 24px',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            textAlign: 'center',
            gap: 12,
            animation: 'confirm-in 0.2s cubic-bezier(0.34,1.26,0.64,1)',
            pointerEvents: 'auto',
            boxSizing: 'border-box',
          }}
        >
          {/* Icon */}
          <div style={{
            width: 52, height: 52,
            borderRadius: '50%',
            background: iconBg,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontSize: 22,
            marginBottom: 4,
            flexShrink: 0,
            boxShadow: variant === 'danger'
              ? '0 4px 14px rgba(239,68,68,0.3)'
              : '0 4px 14px rgba(245,158,11,0.3)',
          }}>
            {icon}
          </div>

          {/* Title */}
          <h3 style={{
            margin: 0,
            fontSize: 16,
            fontWeight: 700,
            color: 'var(--text-primary)',
            letterSpacing: '-0.3px',
            fontFamily: 'var(--font-sans, "Plus Jakarta Sans", sans-serif)',
            wordBreak: 'break-word',
          }}>
            {title}
          </h3>

          {/* Message */}
          {message && (
            <p style={{
              margin: 0,
              fontSize: 13.5,
              color: 'var(--text-muted)',
              fontWeight: 400,
              lineHeight: 1.55,
              fontFamily: 'var(--font-sans, "Plus Jakarta Sans", sans-serif)',
            }}>
              {message}
            </p>
          )}

          {/* Buttons */}
          <div style={{
            display: 'flex',
            gap: 10,
            marginTop: 8,
            width: '100%',
            boxSizing: 'border-box',
          }}>
            <Button
              variant="secondary"
              onClick={onClose}
              disabled={loading}
              style={{ flex: 1, minWidth: 0 }}
            >
              {cancelText}
            </Button>
            <Button
              variant={variant === 'warning' ? 'primary' : 'danger'}
              onClick={onConfirm}
              loading={loading}
              style={{ flex: 1, minWidth: 0 }}
            >
              {confirmText}
            </Button>
          </div>

        </div>
      </div>
    </>
  )
}