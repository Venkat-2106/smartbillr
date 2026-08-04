// src/shared/hooks/useEscapeToClose.js
//
// Adds Escape-key-to-close behavior to a drawer. Modals (Modal.jsx) already
// have this built in via their own focus-trap effect — this hook brings
// detail/create drawers up to the same standard, since drawers are custom
// per-feature components rather than going through the shared Modal shell.
//
// Overlay stacking — Escape must close only the TOPMOST layer:
//   1. Modal on top of a drawer (e.g. clicking "Edit" inside
//      CustomerDetailDrawer opens AddCustomerModal while the drawer stays
//      mounted underneath). Modal.jsx always renders its panel with
//      role="dialog" aria-modal="true", so checking for that in the DOM is a
//      reliable, low-effort way to detect "a modal is stacked on me".
//   2. Drawer on top of drawer (CreateSalesReturnDrawer opens inside
//      SaleDetailDrawer; CreatePurchaseReturnDrawer inside
//      PurchaseDetailDrawer). Drawers portal to <body> but render no
//      role=dialog, so the DOM check above can't see them — handled with a
//      module-scoped mount-order registry: only the most recently mounted
//      drawer handles Escape; the one underneath defers until the top drawer
//      closes and unregisters.

import { useEffect } from 'react'

// Module-scoped stack of mounted drawers (mount order = stacking order).
const drawerStack = []

export default function useEscapeToClose(onClose, active = true) {
  useEffect(() => {
    if (!active || !onClose) return

    const entry = { onClose }
    drawerStack.push(entry)

    function handleKeyDown(e) {
      if (e.key !== 'Escape') return
      // A modal is always the topmost layer when present — let its own
      // Escape handler close it instead.
      if (document.querySelector('[role="dialog"][aria-modal="true"]')) return
      // A drawer opened after me is stacked on top — it handles Escape; I defer.
      if (drawerStack[drawerStack.length - 1] !== entry) return
      onClose()
    }

    document.addEventListener('keydown', handleKeyDown)
    return () => {
      document.removeEventListener('keydown', handleKeyDown)
      const i = drawerStack.indexOf(entry)
      if (i !== -1) drawerStack.splice(i, 1)
    }
  }, [onClose, active])
}
