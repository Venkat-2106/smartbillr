import { createContext, useContext, useEffect, useRef, useState, useCallback } from 'react'

const ShortcutContext = createContext(null)

function parseShortcut(s) {
  const parts = s.toLowerCase().split('+')

  if (parts.length > 1 &&
    !parts.some(p => p === 'ctrl' || p === 'alt' || p === 'shift' || p === 'meta')) {
    return { type: 'sequence', keys: parts.map(k => k.trim()), modifiers: {} }
  }

  const modifiers = { ctrl: false, alt: false, shift: false, meta: false }
  let key = ''
  for (const p of parts) {
    if (p === 'ctrl') { modifiers.ctrl = true; modifiers.meta = true }
    else if (p === 'alt') modifiers.alt = true
    else if (p === 'shift') modifiers.shift = true
    else if (p === 'meta') modifiers.meta = true
    else key = p
  }

  const keyMap = {
    escape: 'Escape', enter: 'Enter', tab: 'Tab',
    up: 'ArrowUp', down: 'ArrowDown', left: 'ArrowLeft', right: 'ArrowRight',
    delete: 'Delete', backspace: 'Backspace', space: ' ',
    f1: 'F1', f2: 'F2', f3: 'F3', f4: 'F4', f5: 'F5',
    f6: 'F6', f7: 'F7', f8: 'F8', f9: 'F9', f10: 'F10', f11: 'F11', f12: 'F12',
  }
  if (keyMap[key]) key = keyMap[key]

  return { type: 'normal', modifiers, key }
}

function matchEvent(matcher, e) {
  if (matcher.type === 'sequence') return false
  const { modifiers, key } = matcher

  const isQuestionSlash = key === '?' || key === '/'

  if (modifiers.ctrl && !(e.ctrlKey || e.metaKey)) return false
  if (!isQuestionSlash && !modifiers.ctrl && !modifiers.meta && (e.ctrlKey || e.metaKey)) return false
  if (modifiers.alt && !e.altKey) return false
  if (!isQuestionSlash && !modifiers.alt && e.altKey) return false
  if (modifiers.shift && !e.shiftKey) return false

  if (key === e.key) return true
  if (key === '/' && modifiers.shift && e.key === '?') return true
  if (key === '?' && e.key === '/') return true

  return false
}

export function ShortcutProvider({ children }) {
  const registryRef = useRef(new Map())
  const typingRef = useRef(false)
  const [typing, setTyping] = useState(false)
  const pendingSeqRef = useRef(null)
  const paletteRef = useRef(false)
  const [paletteOpen, setPaletteOpen] = useState(false)
  const helpRef = useRef(false)
  const [helpOpen, setHelpOpen] = useState(false)

  const closePalette = useCallback(() => { paletteRef.current = false; setPaletteOpen(false) }, [])
  const closeHelp = useCallback(() => { helpRef.current = false; setHelpOpen(false) }, [])

  useEffect(() => {
    const handler = (e) => {
      const tag = e.target.tagName
      const isEditable = tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || e.target.isContentEditable
      typingRef.current = isEditable
      setTyping(isEditable)
    }
    document.addEventListener('focusin', handler)
    return () => document.removeEventListener('focusin', handler)
  }, [])

  const handleKeyDown = useCallback((e) => {
    if (e.key === 'Escape') {
      if (paletteRef.current) { e.preventDefault(); closePalette(); return }
      if (helpRef.current) { e.preventDefault(); closeHelp(); return }
    }

    // 'g'-prefix sequence keys are always blocked while typing —
    // you don't want 'g'+letter firing while someone types a product name.
    if (typingRef.current) {
      if (pendingSeqRef.current) {
        pendingSeqRef.current = null
        return
      }
      if ((e.key === 'g' || e.key === 'G') && !e.ctrlKey && !e.altKey && !e.metaKey) return
    }

    if (pendingSeqRef.current) {
      const seq = pendingSeqRef.current
      pendingSeqRef.current = null
      const key2 = e.key.toLowerCase()
      const combo = seq + '+' + key2
      const handlers = registryRef.current.get(combo)
      if (handlers) {
        e.preventDefault()
        handlers.forEach(h => h.handler(e))
        return
      }
    }

    if ((e.key === 'g' || e.key === 'G') && !e.ctrlKey && !e.altKey && !e.metaKey) {
      const hasSeq = Array.from(registryRef.current.keys()).some(k => k.startsWith('g+'))
      if (hasSeq) {
        e.preventDefault()
        pendingSeqRef.current = 'g'
        setTimeout(() => { if (pendingSeqRef.current === 'g') pendingSeqRef.current = null }, 1000)
        return
      }
    }

    for (const [combo, handlers] of registryRef.current) {
      if (combo.startsWith('g+') && combo.length === 3) continue

      const matcher = parseShortcut(combo)
      if (matchEvent(matcher, e)) {
        const opts = handlers[0]?.options || {}
        if (typingRef.current && !opts.ignoreWhenTyping) continue
        if (opts.preventDefault !== false) e.preventDefault()
        handlers.forEach(h => h.handler(e))
        return
      }
    }
  }, [closePalette, closeHelp])

  useEffect(() => {
    document.addEventListener('keydown', handleKeyDown)
    return () => document.removeEventListener('keydown', handleKeyDown)
  }, [handleKeyDown])

  const registerShortcut = useCallback((combo, handler, options = {}) => {
    const existing = registryRef.current.get(combo) || []
    existing.push({ handler, options })
    registryRef.current.set(combo, existing)
    return () => {
      const items = registryRef.current.get(combo)
      if (!items) return
      const filtered = items.filter(h => h.handler !== handler)
      if (filtered.length === 0) registryRef.current.delete(combo)
      else registryRef.current.set(combo, filtered)
    }
  }, [])

  const value = {
    registerShortcut,
    paletteOpen,
    setPaletteOpen,
    closePalette,
    helpOpen,
    setHelpOpen: (v) => { helpRef.current = v; setHelpOpen(v) },
    closeHelp,
    typing,
  }

  return (
    <ShortcutContext.Provider value={value}>
      {children}
    </ShortcutContext.Provider>
  )
}

// eslint-disable-next-line react-refresh/only-export-components
export function useShortcut(combo, handler, options = {}) {
  const ctx = useContext(ShortcutContext)
  if (!ctx) throw new Error('useShortcut must be used within ShortcutProvider')
  const handlerRef = useRef(handler)

  useEffect(() => {
    handlerRef.current = handler
  })

  useEffect(() => {
    const stable = (e) => handlerRef.current(e)
    return ctx.registerShortcut(combo, stable, options)
  }, [combo, ctx]) // eslint-disable-line react-hooks/exhaustive-deps

  return ctx
}

// eslint-disable-next-line react-refresh/only-export-components
export function useShortcutContext() {
  const ctx = useContext(ShortcutContext)
  if (!ctx) throw new Error('useShortcutContext must be used within ShortcutProvider')
  return ctx
}
