// src/shared/utils/scrollLock.js
//
// WHY THIS FILE EXISTS:
//   Modal and ConfirmDialog both need to disable background scrolling while
//   open. DashboardLayout's actual scroll container is the <main> element
//   (overflowY: 'auto'), not <body> — but AuthLayout-style pages can scroll
//   on <body>/<html> directly. Locking all three covers every layout.
//
//   Reference-counted so that if a ConfirmDialog opens while a Modal is
//   already open (e.g. delete confirmation launched from within an Edit
//   modal), scrolling only re-enables once BOTH are closed.

let lockCount = 0
let savedOverflow = null

function applyHidden(el) {
  if (!el) return null
  const prev = el.style.overflow
  el.style.overflow = 'hidden'
  return prev
}

export function lockScroll() {
  if (lockCount === 0) {
    const mainEl = document.querySelector('main')
    savedOverflow = {
      html: applyHidden(document.documentElement),
      body: applyHidden(document.body),
      main: applyHidden(mainEl),
      mainEl,
    }
  }
  lockCount += 1
}

export function unlockScroll() {
  lockCount = Math.max(0, lockCount - 1)
  if (lockCount === 0 && savedOverflow) {
    document.documentElement.style.overflow = savedOverflow.html ?? ''
    document.body.style.overflow = savedOverflow.body ?? ''
    if (savedOverflow.mainEl) {
      savedOverflow.mainEl.style.overflow = savedOverflow.main ?? ''
    }
    savedOverflow = null
  }
}