// src/shared/components/ModalPortal.jsx
//
// ROOT CAUSE THIS FIXES:
//   DashboardLayout wraps every page's <Outlet/> in a <div className="fade-up">.
//   The .fade-up class runs the `fadeUp` keyframe animation
//   (transform: translateY(8px) -> translateY(0)) with `animation-fill-mode: both`,
//   so the *final* computed style of that div keeps `transform: translateY(0)`
//   permanently — even after the animation finishes.
//
//   Per the CSS spec, ANY non-`none` transform value on an element makes that
//   element the containing block for all `position: fixed` (and `absolute`)
//   descendants. So Modal/ConfirmDialog's `position: fixed; inset: 0` was
//   secretly being resolved against `.fade-up`'s full content box — i.e. the
//   entire page's height — instead of the real browser viewport. On long
//   pages, "center of inset:0" landed somewhere in the middle of the page's
//   total content, far below the visible viewport, forcing the user to scroll.
//
//   FIX: portal the backdrop + centering wrapper straight to `document.body`,
//   completely outside `.fade-up` (and any future transformed ancestor). This
//   guarantees `position: fixed; inset: 0` always means the real viewport,
//   exactly like the Edit/Create modals were intended to behave.
//
// Shared by Modal.jsx and ConfirmDialog.jsx so there is one single
// implementation of: portal target, backdrop, viewport-centering wrapper,
// Escape-to-close, and background scroll lock.

import { useEffect, useRef } from 'react'
import { createPortal } from 'react-dom'
import { lockScroll, unlockScroll } from '../utils/scrollLock'

// ── Escape-handling stack ─────────────────────────────────────────────────────
// Modal and ConfirmDialog can be open at the same time (e.g. the MRP/loss
// confirmation shown from inside the Add/Edit product modal). Each one mounts
// its own <ModalPortal>, and previously every portal registered its own
// document-level Escape listener — so pressing Escape fired ALL of them and
// closed every layer at once, including the modal underneath the dialog.
//
// This stack makes only the TOP-MOST open portal respond to Escape (standard
// modal-stack behaviour). Pressing Escape dismisses the dialog first and leaves
// the modal underneath it open; a second press then closes the modal.
const escapeStack = []

export default function ModalPortal({ open, onClose, zIndex = 1000, children }) {
  // Keep the latest onClose in a ref so stack membership only tracks `open`
  // (the parent passes inline arrow functions that change identity every
  // render — that must NOT re-order the stack).
  const onCloseRef = useRef(onClose)
  useEffect(() => { onCloseRef.current = onClose }, [onClose])

  useEffect(() => {
    if (!open) return

    const entry = { onCloseRef }
    escapeStack.push(entry)

    function handleKeyDown(e) {
      if (e.key !== 'Escape') return
      if (escapeStack[escapeStack.length - 1] !== entry) return
      e.stopPropagation()
      entry.onCloseRef.current?.()
    }

    document.addEventListener('keydown', handleKeyDown)
    lockScroll()

    return () => {
      document.removeEventListener('keydown', handleKeyDown)
      const idx = escapeStack.indexOf(entry)
      if (idx !== -1) escapeStack.splice(idx, 1)
      unlockScroll()
    }
  }, [open])

  if (!open) return null

  return createPortal(
    <>
      {/* Backdrop — always covers the full viewport */}
      <div
        onClick={onClose}
        style={{
          position: 'fixed', inset: 0,
          background: 'rgba(0,0,0,0.45)',
          backdropFilter: 'blur(3px)',
          zIndex,
          animation: 'backdrop-in 0.18s ease',
        }}
      />

      {/* Centering wrapper — always centers in the viewport */}
      <div
        style={{
          position: 'fixed',
          inset: 0,
          zIndex: zIndex + 1,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          padding: '20px 16px',
          pointerEvents: 'none',
        }}
      >
        {children}
      </div>
    </>,
    document.body
  )
}