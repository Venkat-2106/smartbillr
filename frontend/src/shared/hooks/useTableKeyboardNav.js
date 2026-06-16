import { useState, useCallback } from 'react'
import { useShortcut } from './useShortcut'

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
  }, [rowCount])

  const getSelectedRow = useCallback(() => {
    if (selectedIndex == null || selectedIndex >= rows.length) return null
    return rows[selectedIndex]
  }, [selectedIndex, rows])

  useShortcut('down', (e) => { e.preventDefault(); selectNext() }, { ignoreWhenTyping: false })
  useShortcut('up', (e) => { e.preventDefault(); selectPrev() }, { ignoreWhenTyping: false })

  useShortcut('enter', (e) => {
    e.preventDefault()
    const row = getSelectedRow()
    if (row) onEnterRow?.(row)
  }, { ignoreWhenTyping: false })

  useShortcut('e', (e) => {
    if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA' || e.target.tagName === 'SELECT') return
    e.preventDefault()
    const row = getSelectedRow()
    if (row) onEditRow?.(row)
  }, { ignoreWhenTyping: false })

  useShortcut('delete', (e) => {
    e.preventDefault()
    const row = getSelectedRow()
    if (row) onDeleteRow?.(row)
  }, { ignoreWhenTyping: false })

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
  }, { ignoreWhenTyping: false })

  useShortcut('shift+down', (e) => {
    e.preventDefault()
    selectNext()
  }, { ignoreWhenTyping: false })

  useShortcut('shift+up', (e) => {
    e.preventDefault()
    selectPrev()
  }, { ignoreWhenTyping: false })

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
