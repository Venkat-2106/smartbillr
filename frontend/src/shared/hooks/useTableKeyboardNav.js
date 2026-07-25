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

  useShortcut('e', (e) => {
    if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA' || e.target.tagName === 'SELECT') return
    e.preventDefault()
    const row = getSelectedRow()
    if (row) onEditRow?.(row)
  }, { ignoreWhenTyping: true })

  useShortcut('delete', (e) => {
    e.preventDefault()
    const row = getSelectedRow()
    if (row) onDeleteRow?.(row)
  }, { ignoreWhenTyping: true })

  useShortcut('space', (e) => {
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
  }, { ignoreWhenTyping: true })

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
