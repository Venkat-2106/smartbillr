// src/shared/components/Modal.jsx
//
// FIX APPLIED (Close button hover):
//   Close button was using onMouseEnter/Leave to mutate e.currentTarget.style
//   directly (same DOM mutation bug that was already fixed in Table.jsx,
//   DashboardLayout.jsx, and StatCard). When any state inside the Modal changes
//   (e.g. typing in a form field causes a parent re-render), React wipes all
//   inline styles and the hover effect snaps off while the mouse is still over
//   the button. Fixed by tracking hover in a single useState variable inside
//   the Modal component — the same pattern used everywhere else in the project.
//   No visual change at all — identical appearance and animation.
//
// FIX APPLIED (Viewport-centering / portal):
//   The backdrop + centering wrapper now render through <ModalPortal>, which
//   portals them to document.body and locks background scroll while open.
//   This fixes the Modal being centered relative to the page's total content
//   height (via the .fade-up transform containing-block) instead of the
//   visible viewport. See ModalPortal.jsx for the full root-cause writeup.
//   The dialog panel itself (markup, styling, animation, sizes) is unchanged.

import { useState, Children, isValidElement, useRef, useEffect } from 'react'
import ModalPortal from './ModalPortal'

const SIZE_MAP = {
  sm: 400,
  md: 520,
  lg: 680,
  xl: 860,
}

function ModalFooter({ children }) {
  return (
    <div style={{
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'flex-end',
      gap: 10,
      padding: '16px 24px',
      borderTop: '1px solid var(--border)',
      background: 'var(--bg-subtle)',
      borderRadius: '0 0 var(--r-xl)',
      flexShrink: 0,
    }}>
      {children}
    </div>
  )
}

export default function Modal({
  open,
  onClose,
  title,
  subtitle,
  children,
  footer,
  size = 'md',
  hideClose = false,
}) {
  const maxW = SIZE_MAP[size] || SIZE_MAP.md

  // FIX: single boolean tracks close-button hover — no DOM mutation needed
  const [closeBtnHovered, setCloseBtnHovered] = useState(false)

  // ── Focus trap ──────────────────────────────────────────────────────────────
  const panelRef      = useRef(null)
  const onCloseRef    = useRef(onClose)
  useEffect(() => { onCloseRef.current = onClose }, [onClose])

  useEffect(() => {
    if (!open) return
    const prev = document.activeElement

    const panel = panelRef.current
    if (panel) {
      const focusable = panel.querySelectorAll('button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])')
      if (focusable.length > 0) {
        focusable[0].focus()
      } else {
        panel.focus()
      }
    }

    function handleKeyDown(e) {
      if (e.key === 'Escape') {
        onCloseRef.current?.()
        return
      }
      if (e.key === 'Tab') {
        const focusable = panel.querySelectorAll('button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])')
        if (focusable.length < 2) return
        const first = focusable[0]
        const last  = focusable[focusable.length - 1]
        if (e.shiftKey && document.activeElement === first) {
          e.preventDefault()
          last.focus()
        } else if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault()
          first.focus()
        }
      }
    }

    document.addEventListener('keydown', handleKeyDown)
    return () => {
      document.removeEventListener('keydown', handleKeyDown)
      if (prev && typeof prev.focus === 'function') prev.focus()
    }
  }, [open])

  if (!open) return null

  // Separate Modal.Footer children from body children so the footer
  // always renders in the sticky slot — never inside the scrollable body.
  // This means forms can keep <Modal.Footer> at the bottom of the form JSX
  // without it scrolling away with the content.
  const bodyChildren = []
  const footerChildren = []
  Children.forEach(children, (child) => {
    if (isValidElement(child) && child.type === ModalFooter) {
      footerChildren.push(child)
    } else {
      bodyChildren.push(child)
    }
  })
  const stickyFooter = footerChildren.length > 0 ? footerChildren : null

  return (
    <ModalPortal open={open} onClose={onClose} zIndex={1000}>
      {/* Panel */}
      <div
        ref={panelRef}
        tabIndex={-1}
        role="dialog"
        aria-modal="true"
        aria-labelledby="modal-title"
        onClick={e => e.stopPropagation()}
        style={{
          background: 'var(--bg-card)',
          border: '1px solid var(--border)',
          borderRadius: 'var(--r-xl)',
          boxShadow: 'var(--shadow-elevated, 0 20px 60px rgba(0,0,0,0.18))',
          width: '100%',
          maxWidth: maxW,
          maxHeight: 'calc(100vh - 80px)',
          display: 'flex',
          flexDirection: 'column',
          animation: 'modal-in 0.22s cubic-bezier(0.34,1.26,0.64,1)',
          pointerEvents: 'auto',
          overflow: 'hidden',
        }}
      >
        {/* Header */}
        {(title || !hideClose) && (
          <div style={{
            display: 'flex',
            alignItems: 'flex-start',
            justifyContent: 'space-between',
            padding: '20px 24px 16px',
            borderBottom: '1px solid var(--border)',
            flexShrink: 0,
            gap: 12,
          }}>
            <div>
              {title && (
                <h2
                  id="modal-title"
                  style={{
                    margin: 0,
                    fontSize: 16,
                    fontWeight: 700,
                    color: 'var(--text-primary)',
                    letterSpacing: '-0.3px',
                    lineHeight: 1.2,
                  }}
                >
                  {title}
                </h2>
              )}
              {subtitle && (
                <p style={{
                  margin: '4px 0 0',
                  fontSize: 13,
                  color: 'var(--text-muted)',
                  fontWeight: 400,
                }}>
                  {subtitle}
                </p>
              )}
            </div>

            {!hideClose && (
              // FIX: onMouseEnter/Leave now set React state instead of mutating
              // e.currentTarget.style directly. The computed style is derived
              // from closeBtnHovered — same visual result, no DOM mutation.
              <button
                onClick={onClose}
                aria-label="Close modal"
                onMouseEnter={() => setCloseBtnHovered(true)}
                onMouseLeave={() => setCloseBtnHovered(false)}
                style={{
                  width: 32, height: 32,
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  background: closeBtnHovered ? 'var(--bg-hover)' : 'var(--bg-subtle)',
                  border: '1px solid var(--border)',
                  borderRadius: 'var(--r-md)',
                  cursor: 'pointer',
                  color: closeBtnHovered ? 'var(--text-primary)' : 'var(--text-muted)',
                  fontSize: 16,
                  lineHeight: 1,
                  flexShrink: 0,
                  transition: 'background 0.14s, color 0.14s',
                }}
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <line x1="18" y1="6" x2="6" y2="18" />
                  <line x1="6" y1="6" x2="18" y2="18" />
                </svg>
              </button>
            )}
          </div>
        )}

        {/* Body — scrollable */}
        <div style={{
          flex: 1,
          overflowY: 'auto',
          padding: '20px 24px',
          overscrollBehavior: 'contain',
        }}>
          <div aria-live="polite" aria-atomic="true">
            {bodyChildren}
          </div>
        </div>

        {/* Footer — sticky at bottom. Renders Modal.Footer children OR the footer prop */}
        {stickyFooter || footer}
      </div>
    </ModalPortal>
  )
}

// Attach sub-component for convenience
Modal.Footer = ModalFooter