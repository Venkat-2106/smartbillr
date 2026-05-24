// src/shared/components/SearchBar.jsx
//
// A search input with debounce built in.
// Uses your existing useDebounce hook from shared/hooks/useDebounce.js
//
// Props:
//   value         → controlled value (from parent state)
//   onChange      → called with the raw input value immediately (for controlled input)
//   onSearch      → called with the debounced value (use this to trigger API call)
//   placeholder   → input placeholder text (default: "Search...")
//   debounceMs    → debounce delay in ms (default: 400)
//   width         → CSS width string (default: '260px')
//   loading       → shows spinner inside the field while search is running
//
// Pattern:
//   const [q, setQ] = useState('')
//   <SearchBar value={q} onChange={setQ} onSearch={val => refetch with val} />

import { useEffect, useRef } from 'react'
import useDebounce from '../hooks/useDebounce'

// Magnifier icon (inline SVG — no heroicons dependency needed here)
function SearchIcon({ size = 15, color = 'currentColor' }) {
  return (
    <svg width={size} height={size} viewBox="0 0 20 20" fill="none" stroke={color} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="9" cy="9" r="6" />
      <path d="m16 16-3.5-3.5" />
    </svg>
  )
}

function MiniSpinner() {
  return (
    <>
      <style>{`@keyframes sb-spin { to { transform: rotate(360deg) } }`}</style>
      <svg width="14" height="14" viewBox="0 0 16 16" style={{ animation: 'sb-spin 0.7s linear infinite' }}>
        <circle cx="8" cy="8" r="6" fill="none" stroke="var(--accent-600)" strokeWidth="2.5" strokeDasharray="28" strokeDashoffset="10" strokeLinecap="round" />
      </svg>
    </>
  )
}

export default function SearchBar({
  value,
  onChange,
  onSearch,
  placeholder = 'Search…',
  debounceMs = 400,
  width = '260px',
  loading = false,
}) {
  const debouncedValue = useDebounce(value, debounceMs)
  const isFirstRender = useRef(true)

  // Call onSearch after the debounce delay (skip on first mount)
  useEffect(() => {
    if (isFirstRender.current) {
      isFirstRender.current = false
      return
    }
    onSearch?.(debouncedValue)
  }, [debouncedValue]) // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div style={{
      position: 'relative',
      display: 'flex',
      alignItems: 'center',
      width,
      flexShrink: 0,
    }}>
      {/* Left icon */}
      <span style={{
        position: 'absolute',
        left: 11,
        color: 'var(--text-muted)',
        display: 'flex',
        alignItems: 'center',
        pointerEvents: 'none',
        zIndex: 1,
      }}>
        <SearchIcon />
      </span>

      <input
        type="text"
        value={value}
        onChange={e => onChange?.(e.target.value)}
        placeholder={placeholder}
        style={{
          width: '100%',
          padding: '8px 36px 8px 34px',
          background: 'var(--bg-card)',
          border: '1.5px solid var(--border)',
          borderRadius: 10,
          fontSize: 13,
          fontWeight: 400,
          color: 'var(--text-primary)',
          fontFamily: 'var(--font-sans, "Plus Jakarta Sans", sans-serif)',
          outline: 'none',
          transition: 'border-color 0.15s, box-shadow 0.15s',
        }}
        onFocus={e => {
          e.currentTarget.style.borderColor = 'var(--accent-600)'
          e.currentTarget.style.boxShadow = '0 0 0 3px var(--accent-glow, rgba(79,70,229,0.14))'
        }}
        onBlur={e => {
          e.currentTarget.style.borderColor = 'var(--border)'
          e.currentTarget.style.boxShadow = 'none'
        }}
      />

      {/* Right side: spinner if loading, or clear button if value present */}
      {(loading || value) && (
        <span style={{
          position: 'absolute',
          right: 10,
          display: 'flex',
          alignItems: 'center',
          color: 'var(--text-muted)',
          cursor: value && !loading ? 'pointer' : 'default',
        }}
          onClick={() => {
            if (value && !loading) {
              onChange?.('')
              onSearch?.('')
            }
          }}
        >
          {loading
            ? <MiniSpinner />
            : (
              <svg width="13" height="13" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                <path d="M3 3l10 10M13 3L3 13" />
              </svg>
            )
          }
        </span>
      )}
    </div>
  )
}
