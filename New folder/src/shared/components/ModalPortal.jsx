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

import { useEffect, useCallback } from 'react'
import { createPortal } from 'react-dom'
import { lockScroll, unlockScroll } from '../utils/scrollLock'

export default function ModalPortal({ open, onClose, zIndex = 1000, children }) {
  const handleKeyDown = useCallback((e) => {
    if (e.key === 'Escape') onClose?.()
  }, [onClose])

  useEffect(() => {
    if (!open) return

    document.addEventListener('keydown', handleKeyDown)
    lockScroll()

    return () => {
      document.removeEventListener('keydown', handleKeyDown)
      unlockScroll()
    }
  }, [open, handleKeyDown])

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