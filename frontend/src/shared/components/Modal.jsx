// src/shared/components/Modal.jsx
//
// A full overlay modal with header, scrollable body, and footer slot.
// Closes on backdrop click OR pressing Escape.
//
// Props:
//   open          → boolean — controls visibility
//   onClose       → function — called when user clicks backdrop or Escape
//   title         → string shown in modal header
//   subtitle      → optional subtitle below the title
//   children      → the modal body content
//   footer        → JSX for the footer (usually buttons)
//   size          → 'sm' | 'md' | 'lg' | 'xl'   (controls max-width)
//   hideClose     → hides the × button (for modals where close = cancel only)
//
// Usage:
//   <Modal open={show} onClose={() => setShow(false)} title="Add Category">
//     <p>body content here</p>
//     <Modal.Footer>
//       <Button variant="ghost" onClick={...}>Cancel</Button>
//       <Button variant="primary" onClick={...}>Save</Button>
//     </Modal.Footer>
//   </Modal>
//
// NOTE: Modal.Footer is a convenience sub-component — or pass footer prop directly.

import { useEffect, useCallback, Children, isValidElement } from 'react'

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
      borderRadius: '0 0 18px 18px',
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

  // Close on Escape key
  const handleKeyDown = useCallback((e) => {
    if (e.key === 'Escape') onClose?.()
  }, [onClose])

  useEffect(() => {
    if (open) {
      document.addEventListener('keydown', handleKeyDown)
      // Do NOT lock body scroll — the modal panel itself scrolls internally.
      // Locking body scroll prevented scrolling inside the modal on some browsers.
    }
    return () => {
      document.removeEventListener('keydown', handleKeyDown)
    }
  }, [open, handleKeyDown])

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
    <>
      <style>{`
        @keyframes modal-in {
          from { opacity: 0; transform: translateY(12px) scale(0.97); }
          to   { opacity: 1; transform: translateY(0)    scale(1);    }
        }
        @keyframes backdrop-in {
          from { opacity: 0 }
          to   { opacity: 1 }
        }
      `}</style>

      {/* Backdrop */}
      <div
        onClick={onClose}
        style={{
          position: 'fixed', inset: 0,
          background: 'rgba(0,0,0,0.45)',
          backdropFilter: 'blur(3px)',
          zIndex: 1000,
          animation: 'backdrop-in 0.18s ease',
        }}
      />

      {/* Panel */}
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="modal-title"
        style={{
          position: 'fixed',
          inset: 0,
          zIndex: 1001,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          padding: '20px 16px',
          pointerEvents: 'none',
        }}
      >
        <div
          onClick={e => e.stopPropagation()}
          style={{
            background: 'var(--bg-card)',
            border: '1px solid var(--border)',
            borderRadius: 18,
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
              padding: '20px 24px 18px',
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
                    fontSize: 12.5,
                    color: 'var(--text-muted)',
                    fontWeight: 400,
                  }}>
                    {subtitle}
                  </p>
                )}
              </div>

              {!hideClose && (
                <button
                  onClick={onClose}
                  aria-label="Close modal"
                  style={{
                    width: 30, height: 30,
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    background: 'var(--bg-subtle)',
                    border: '1px solid var(--border)',
                    borderRadius: 8,
                    cursor: 'pointer',
                    color: 'var(--text-muted)',
                    fontSize: 16,
                    lineHeight: 1,
                    flexShrink: 0,
                    transition: 'all 0.14s',
                  }}
                  onMouseEnter={e => {
                    e.currentTarget.style.background = 'var(--bg-hover)'
                    e.currentTarget.style.color = 'var(--text-primary)'
                  }}
                  onMouseLeave={e => {
                    e.currentTarget.style.background = 'var(--bg-subtle)'
                    e.currentTarget.style.color = 'var(--text-muted)'
                  }}
                >
                  ✕
                </button>
              )}
            </div>
          )}

          {/* Body — scrollable */}
          <div style={{
            flex: 1,
            overflowY: 'auto',
            padding: '20px 24px',
          }}>
            {bodyChildren}
          </div>

          {/* Footer — sticky at bottom. Renders Modal.Footer children OR the footer prop */}
          {stickyFooter || footer}
        </div>
      </div>
    </>
  )
}

// Attach sub-component for convenience
Modal.Footer = ModalFooter