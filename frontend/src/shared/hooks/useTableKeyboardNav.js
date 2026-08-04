import { useState, useCallback } from 'react'
import { useShortcut } from './useShortcut'

// UI/UX Audit (2026-07-18) — Finding #8:
//   Keyboard navigation hook for table pages. Supports ↑/↓ to move selection,
//   Enter to open/edit, Delete/Backspace to trigger delete confirmation.
//   Used by 7 list pages (Sales, Purchases, Payments, Expenses, Customers,
//   Suppliers, Staff). Pairs with Table.jsx's selectedIndex/onSelectedIndexChange.
//   See UI_UX_AUDIT_REPORT.md

export default function useTableKeyboardNav({
  rows = [],
  rowKey = 'id',
  onEnterRow,
  onEditRow,
  onDeleteRow,
  onSelectRow,
}) {
  const [selectedIndex, setSelectedIndex] = useState(null)
  const [selectedSet, setSelectedSet] = useState(new Set())

  const rowCount = rows.length

  const selectNext = useCallback(() => {
    setSelectedIndex(prev => {
      if (prev == null) return 0
      return Math.min(prev + 1, rowCount - 1)
    })
  }, [rowCount])

  const selectPrev = useCallback(() => {
    setSelectedIndex(prev => {
      if (prev == null) return 0
      return Math.max(prev - 1, 0)
    })
  }, [])

  const getSelectedRow = useCallback(() => {
    if (selectedIndex == null || selectedIndex >= rows.length) return null
    return rows[selectedIndex]
  }, [selectedIndex, rows])

  useShortcut('down', (e) => { e.preventDefault(); selectNext() }, { ignoreWhenTyping: true })
  useShortcut('up', (e) => { e.preventDefault(); selectPrev() }, { ignoreWhenTyping: true })

  useShortcut('enter', (e) => {
    e.preventDefault()
    const row = getSelectedRow()
    if (row) onEnterRow?.(row)
  }, { ignoreWhenTyping: true })

  // Fix (2026-08-04): previously passed { ignoreWhenTyping: true }, which made the
  // shortcut dispatcher call e.preventDefault() on every 'e' keypress BEFORE this
  // handler's own INPUT/TEXTAREA/SELECT guard below ever ran — silently blocking the
  // letter "e" from being typed in any text field on every page using this hook
  // (Sales, Purchases, Payments, Expenses, Customers, Suppliers, Staff). Removing the
  // flag lets the dispatcher's normal "skip while typing" check protect text fields,
  // as it does for every other shortcut that isn't explicitly opted out.
  useShortcut('e', (e) => {
    if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA' || e.target.tagName === 'SELECT') return
    e.preventDefault()
    const row = getSelectedRow()
    if (row) onEditRow?.(row)
  })

  useShortcut('delete', (e) => {
    e.preventDefault()
    const row = getSelectedRow()
    if (row) onDeleteRow?.(row)
  }, { ignoreWhenTyping: true })

  // Fix (2026-08-04): same class of bug as 'e' above — this handler had no
  // INPUT/TEXTAREA/SELECT guard at all, so with { ignoreWhenTyping: true } the
  // spacebar was unconditionally prevented in every text field on these pages.
  // Added the guard and removed the flag so typing a space works normally.
  useShortcut('space', (e) => {
    if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA' || e.target.tagName === 'SELECT') return
    e.preventDefault()
    const row = getSelectedRow()
    if (!row) return
    const id = row[rowKey]
    setSelectedSet(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
    onSelectRow?.(row)
  })

  useShortcut('shift+down', (e) => {
    e.preventDefault()
    selectNext()
  }, { ignoreWhenTyping: true })

  useShortcut('shift+up', (e) => {
    e.preventDefault()
    selectPrev()
  }, { ignoreWhenTyping: true })

  const clearSelection = useCallback(() => {
    setSelectedIndex(null)
    setSelectedSet(new Set())
  }, [])

  return {
    selectedIndex,
    setSelectedIndex,
    selectedSet,
    clearSelection,
    getSelectedRow,
  }
}