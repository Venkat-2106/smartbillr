import { useState, useEffect, useRef, useMemo, useCallback } from 'react'
import { createPortal } from 'react-dom'
import { useNavigate } from 'react-router-dom'

const PAGES = [
  { label: 'Dashboard',   path: '/dashboard',   icon: 'M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6', category: 'Navigation' },
  { label: 'Sales',       path: '/sales',       icon: 'M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z', category: 'Sales' },
  { label: 'New Invoice', path: '/sales/new',   icon: 'M12 4v16m8-8H4', category: 'Sales' },
  { label: 'Customers',   path: '/customers',   icon: 'M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656-.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z', category: 'People' },
  { label: 'Suppliers',   path: '/suppliers',   icon: 'M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4', category: 'People' },
  { label: 'Products',    path: '/products',    icon: 'M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4', category: 'Inventory' },
  { label: 'Stock',       path: '/stock',       icon: 'M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z', category: 'Inventory' },
  { label: 'Expenses',    path: '/expenses',    icon: 'M17 9V7a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2m2 4h10a2 2 0 002-2v-6a2 2 0 00-2-2H9a2 2 0 00-2 2v6a2 2 0 002 2zm7-5a2 2 0 11-4 0 2 2 0 014 0z', category: 'Finance' },
  { label: 'Reports',     path: '/reports',     icon: 'M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z', category: 'Reports' },
  { label: 'Settings',    path: '/settings',    icon: 'M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z M15 12a3 3 0 11-6 0 3 3 0 016 0z', category: 'System' },
  { label: 'User Guide',  path: '/user-guide', icon: 'M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253', category: 'Help' },
]

function fuzzyMatch(text, query) {
  if (!query) return true
  const lower = text.toLowerCase()
  const q = query.toLowerCase()
  let qi = 0
  for (let i = 0; i < lower.length && qi < q.length; i++) {
    if (lower[i] === q[qi]) qi++
  }
  return qi === q.length
}

function Kbd({ children }) {
  return <span style={{
    fontFamily: 'monospace', fontSize: 10, fontWeight: 700,
    padding: '2px 5px', borderRadius: 4,
    border: '1px solid var(--border)',
    background: 'var(--bg-subtle)',
    color: 'var(--text-muted)',
    lineHeight: 1.4,
  }}>{children}</span>
}

export default function CommandPalette({ open, onClose }) {
  const navigate = useNavigate()
  const [query, setQuery] = useState('')
  const [activeIdx, setActiveIdx] = useState(0)
  const inputRef = useRef(null)
  const listRef = useRef(null)
  const prevOpenRef = useRef(false)

  useEffect(() => {
    if (open && !prevOpenRef.current) {
      prevOpenRef.current = true
      requestAnimationFrame(() => inputRef.current?.focus())
    }
    if (!open) {
      prevOpenRef.current = false
    }
  }, [open])

  const filtered = useMemo(() => {
    if (!query) return PAGES
    return PAGES.filter(p => fuzzyMatch(p.label, query) || fuzzyMatch(p.category, query))
  }, [query])

  const handleSelect = useCallback((page) => {
    navigate(page.path)
    onClose()
  }, [navigate, onClose])

  useEffect(() => {
    if (!open) return
    const handler = (e) => {
      if (e.key === 'ArrowDown') { e.preventDefault(); setActiveIdx(i => Math.min(i + 1, filtered.length - 1)); return }
      if (e.key === 'ArrowUp') { e.preventDefault(); setActiveIdx(i => Math.max(i - 1, 0)); return }
      if (e.key === 'Enter' && filtered[activeIdx]) { e.preventDefault(); handleSelect(filtered[activeIdx]); return }
      if (e.key === 'Escape') { e.preventDefault(); onClose(); return }
    }
    document.addEventListener('keydown', handler)
    return () => document.removeEventListener('keydown', handler)
  }, [open, filtered, activeIdx, handleSelect, onClose])

  useEffect(() => {
    if (listRef.current) {
      const el = listRef.current.children[activeIdx]
      el?.scrollIntoView?.({ block: 'nearest' })
    }
  }, [activeIdx])

  if (!open) return null

  return createPortal(
    <>
      <div
        onClick={onClose}
        role="presentation"
        aria-hidden={true}
        style={{
          position: 'fixed', inset: 0, zIndex: 9999,
          background: 'rgba(0,0,0,0.5)',
          backdropFilter: 'blur(4px)',
          animation: 'fadeIn 0.12s ease',
        }}
      />
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Command palette"
        style={{
          position: 'fixed', inset: 0, zIndex: 10000,
          display: 'flex',
          alignItems: 'flex-start',
          justifyContent: 'center',
          padding: '64px 16px 16px',
          pointerEvents: 'none',
        }}
      >
      <div
        style={{
          width: 'min(540px, calc(100vw - 32px))',
          maxHeight: 'min(480px, calc(100vh - 80px))',
          background: 'var(--bg-card)',
          border: '1px solid var(--border)',
          borderRadius: 16,
          boxShadow: 'var(--shadow-elevated)',
          display: 'flex', flexDirection: 'column',
          animation: 'scaleIn 0.15s var(--ease-spring) both',
          overflow: 'hidden',
          pointerEvents: 'auto',
        }}
      >
        <div style={{ padding: '12px 14px', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', gap: 10 }}>
          <svg width="16" height="16" fill="none" viewBox="0 0 20 20" stroke="var(--text-muted)" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0 }}>
            <circle cx="9" cy="9" r="6" /><path d="m16 16-3.5-3.5" />
          </svg>
          <input
            ref={inputRef}
            value={query}
            onChange={e => { setQuery(e.target.value); setActiveIdx(0) }}
            placeholder="Search pages and actions…"
            aria-label="Search pages"
            role="combobox"
            aria-expanded={true}
            aria-autocomplete="list"
            aria-activedescendant={filtered[activeIdx] ? `cmd-item-${activeIdx}` : undefined}
            aria-controls="cmd-results-list"
            className="sb-focusable"
            style={{
              flex: 1, border: 'none',
              fontSize: 14, color: 'var(--text-primary)',
              background: 'transparent', fontFamily: 'inherit',
            }}
          />
          <span style={{ fontSize: 10, color: 'var(--text-muted)', background: 'var(--bg-subtle)', border: '1px solid var(--border)', borderRadius: 4, padding: '1px 5px', fontFamily: 'monospace' }}>Esc</span>
        </div>

        <div ref={listRef} id="cmd-results-list" role="listbox" aria-label="Search results" style={{ flex: 1, overflowY: 'auto', padding: '4px 6px' }}>
          {filtered.length === 0 ? (
            <div style={{ padding: '24px 14px', textAlign: 'center', color: 'var(--text-muted)', fontSize: 13 }}>
              No results for "{query}"
            </div>
          ) : (
            filtered.map((page, i) => {
              const isActive = i === activeIdx
              return (
                <button
                  key={page.path}
                  id={`cmd-item-${i}`}
                  role="option"
                  aria-selected={isActive}
                  onClick={() => handleSelect(page)}
                  onMouseEnter={() => setActiveIdx(i)}
                  style={{
                    display: 'flex', alignItems: 'center', gap: 10,
                    width: '100%', padding: '8px 10px',
                    background: isActive ? 'var(--bg-hover)' : 'transparent',
                    border: 'none', borderRadius: 8,
                    cursor: 'pointer', fontFamily: 'inherit',
                    textAlign: 'left', transition: 'background 0.08s',
                  }}
                >
                  <span style={{
                    width: 28, height: 28, borderRadius: 7,
                    background: isActive ? 'var(--accent-600)' : 'var(--bg-subtle)',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    color: isActive ? '#fff' : 'var(--text-secondary)',
                    flexShrink: 0,
                  }}>
                    <svg width="14" height="14" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round">
                      <path d={page.icon} />
                    </svg>
                  </span>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 13, fontWeight: isActive ? 650 : 500, color: 'var(--text-primary)' }}>{page.label}</div>
                    <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>{page.category}</div>
                  </div>
                  <Kbd>{page.path}</Kbd>
                </button>
              )
            })
          )}
        </div>

        <div style={{
          padding: '8px 14px', borderTop: '1px solid var(--border)',
          display: 'flex', alignItems: 'center', gap: 14,
          fontSize: 11, color: 'var(--text-muted)',
        }}>
          <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
            <Kbd>↑↓</Kbd> Navigate
          </span>
          <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
            <Kbd>↵</Kbd> Open
          </span>
          <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
            <Kbd>Esc</Kbd> Close
          </span>
        </div>
      </div>
      </div>
    </>,
    document.body
  )
}
