// src/shared/components/DrawerPortal.jsx
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
//   descendants. So the detail drawers' `position: fixed; top: 0; right: 0`
//   was secretly being resolved against `.fade-up`'s full content box — i.e. the
//   entire page's height — instead of the real browser viewport. Scrolled far
//   down a long table, a drawer's `top: 0` meant the top of the *page*, forcing
//   the user to scroll back up to see it.
//
//   This is the exact same root cause ModalPortal.jsx fixes for modals; the
//   detail drawers were missed. FIX: portal the drawer straight to document.body,
//   completely outside `.fade-up` (and any future transformed ancestor), so
//   `position: fixed` always means the real viewport.
//
//   Background scroll is locked while open (html/body/main — the app's scroll
//   containers, reference-counted via scrollLock.js) so the page doesn't shift
//   behind the drawer. Behavior-neutral otherwise: each drawer keeps its own
//   backdrop, panel, animation, click-outside, ESC and focus handling.
//   This component only moves the mount point and locks background scroll.

import { useEffect } from 'react'
import { createPortal } from 'react-dom'
import { lockScroll, unlockScroll } from '../utils/scrollLock'

export default function DrawerPortal({ children }) {
  useEffect(() => {
    lockScroll()
    return () => unlockScroll()
  }, [])

  return createPortal(children, document.body)
}
