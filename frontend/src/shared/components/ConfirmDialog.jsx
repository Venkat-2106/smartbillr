// src/shared/components/ConfirmDialog.jsx
//
// FIX APPLIED (Viewport-centering / portal):
//   The backdrop + centering wrapper now render through <ModalPortal> — the
//   same shared portal used by Modal.jsx — instead of a duplicated
//   position:fixed/inset:0 implementation rendered inline in the page tree.
//
//   ROOT CAUSE: DashboardLayout wraps every page's <Outlet/> in a
//   <div className="fade-up">, whose `fadeUp` keyframe animation leaves a
//   persistent `transform: translateY(0)` on that div (animation-fill-mode:
//   both). A non-`none` transform on an ancestor makes that ancestor the
//   containing block for `position: fixed` descendants — so this dialog's
//   `inset: 0` was being measured against the page's full content height
//   instead of the real viewport. On long pages, "center" landed below the
//   visible viewport, forcing the user to scroll to reach Confirm/Cancel.
//
//   <ModalPortal> renders straight to document.body (outside `.fade-up`),
//   guaranteeing `position: fixed; inset: 0` always means the real viewport
//   — exactly like the Edit/Create modals. It also locks background scroll
//   and handles the Escape key, so that logic is no longer duplicated here.
//
//   Visual design (icon, title, message, button layout, animation) is 100%
//   unchanged.
//
// UI/UX AUDIT (2026-07-18):
//   JSDoc block added documenting all props, including the children slot.
//   See UI_UX_AUDIT_REPORT.md

import ModalPortal from './ModalPortal'
import Button from './Button'

/**
 * ConfirmDialog — modal confirmation prompt (danger / warning).
 *
 * @param {boolean}  open        – controls visibility
 * @param {Function} onClose     – called when the user dismisses (backdrop, Escape, Cancel)
 * @param {Function} onConfirm   – called when the user clicks the confirm button
 * @param {string}   [title]     – heading text (default: "Are you sure?")
 * @param {string}   [message]   – body text below the title
 * @param {string}   [confirmText]- label for the confirm button
 * @param {string}   [cancelText] – label for the cancel button
 * @param {'danger'|'warning'} [variant] – icon, colour scheme, and confirm-button style
 * @param {boolean}  [loading]   – shows a spinner on the confirm button and disables both buttons
 * @param {React.ReactNode} [children]
 *   Optional extra content rendered below the message and above the action
 *   buttons.  Useful for adding a checkbox, radio group, or extra warning
 *   text that the user must acknowledge before confirming.
 *
 *   Example — see PurchasesPage.jsx delete-confirmation dialog, where a
 *   "Reduce stock levels" checkbox is passed as children:
 *
 *     <ConfirmDialog …>
 *       <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13 }}>
 *         <input type="checkbox" checked={reduceStock} onChange={…} />
 *         Reduce stock levels
 *       </label>
 *     </ConfirmDialog>
 */
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
  children,
}) {
  if (!open) return null

  const iconMap = { danger: '🗑️', warning: '⚠️' }
  const icon = iconMap[variant] || iconMap.danger

  const iconBg = variant === 'danger'
    ? 'linear-gradient(135deg, var(--danger), var(--danger-text))'
    : 'linear-gradient(135deg, var(--warning), var(--warning-text))'

  return (
    <ModalPortal open={open} onClose={onClose} zIndex={1100}>
      {/* Dialog */}
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
            ? '0 4px 14px color-mix(in srgb, var(--danger) 30%, transparent)'
            : '0 4px 14px color-mix(in srgb, var(--warning) 30%, transparent)',
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
            fontSize: 13,
            color: 'var(--text-muted)',
            fontWeight: 400,
            lineHeight: 1.55,
            fontFamily: 'var(--font-sans, "Plus Jakarta Sans", sans-serif)',
          }}>
            {message}
          </p>
        )}

        {/* Children (e.g. checkbox) */}
        {children}

        {/* Buttons */}
        <div style={{
          display: 'flex',
          gap: 10,
          marginTop: children ? 8 : 8,
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
    </ModalPortal>
  )
}
