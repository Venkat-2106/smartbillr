// src/features/public/components/LandingDemo.jsx
//
// Animated product-demo section for the landing page (#demo).
//
// SELF-CONTAINED — no API calls, no auth, no tenant-app imports. This is a
// visual replica of the real SmartBillr screens built with the real design
// tokens, copy, and field labels, driven by a pure JS timeline.
//
// FULL LOOP (6 steps, ~40s):
//   1. Customers (0–11s)      → create "Ravi Kumar" via the real field order
//   2. Products (11–23.5s)    → create "Basmati Rice 5kg" via the real field order
//   3. Create Sale (23.5–31s) → line item for the new product, qty bump,
//      live running totals + tax breakdown, Paid marker, save → toast
//   4. Stock sync (31–34s)    → counts tick down for what was sold, low-stock alert
//   5. Dashboard (34–37.6s)   → revenue metric ticks up + SVG chart draws itself
//   6. Loop-out (37.6–39.8s)  → app frame zooms out ("camera pull-back"), then
//      a quick content cross-fade masks the seam and the loop restarts
//
// Reduced motion → static summary panel (no animation). The animated stage
// scales to fit every viewport, so it also plays on small screens.
// No new runtime dependencies — plain React + CSS keyframes.

import { useEffect, useRef, useState } from 'react'
import './LandingDemo.css'

/* ═══════════════════════════════════════════════════════════════
   Design tokens — SmartBillr light theme (index.css values).
   Hardcoded as literals so the replica always renders the light
   tenant-app surface, regardless of the visitor's stored theme
   (the hero hardcodes its palette the same way).
   Accents stay on var(--accent-*) and the section forces purple via
   data-accent="purple" (the theme already used on the hero).
   ═══════════════════════════════════════════════════════════════ */
const C = {
  bgPage:        '#F8FAFC',
  bgCard:        '#FFFFFF',
  bgSubtle:      '#F1F5F9',
  bgInput:       '#F8FAFC',
  border:        '#E2E8F0',
  borderHover:   '#CBD5E1',
  textPrimary:   '#0F172A',
  textSecondary: '#475569',
  textMuted:     '#94A3B8',
  shadowCard:    '0 1px 3px rgba(0,0,0,0.04), 0 0 0 1px rgba(0,0,0,0.04)',
  shadowElevated:'0 8px 30px rgba(0,0,0,0.08), 0 4px 10px rgba(0,0,0,0.04)',
  success:       '#16A34A',
  successBg:     '#F0FDF4',
  successBorder: '#BBF7D0',
  successText:   '#15803D',
  danger:        '#DC2626',
  dangerBg:      '#FEF2F2',
  dangerBorder:  '#FECACA',
  dangerText:    '#B91C1C',
}

/* App shell — the real app has a dark sidebar + light content area. */
const SB = {
  bg:        '#0F172A',
  border:    'rgba(255,255,255,0.06)',
  muted:     '#8697AC',
  hover:     'rgba(255,255,255,0.05)',
  hoverText: '#94A3B8',
}

const EASE = 'cubic-bezier(0.16,1,0.3,1)'
const TYPING_SPEED = 38            // ms per character (snappy loop pacing)
const TYPING_START_DELAY = 200     // ms after a press before the first char
const PRESS_DELAY = 350            // ms after a waypoint that a click "lands"
const STAGE_W = 1060
const CHROME_H = 30
const APP_H = 500

/* ═══════════════════════════════════════════════════════════════
   Demo data — matches the placeholders / copy used in the real forms
   ═══════════════════════════════════════════════════════════════ */
const CUSTOMER_SEED = [
  { key: 'c1', name: 'Aswin selvan Rajan', phone: '+91 98401 23456', email: 'aswin@srstores.in', location: 'Tamil Nadu, India', updated: '12 Aug', tax: '33AABCU9603R1ZM' },
  { key: 'c2', name: 'Priya Sharma', phone: '+91 98765 11122', email: 'priya@sharmagrocers.in', location: 'Delhi, India', updated: '11 Aug' },
  { key: 'c3', name: 'Amit Patel', phone: '+91 99887 33445', email: 'amit@pateltraders.in', location: 'Gujarat, India', updated: '10 Aug', tax: '24AABCP1234R1ZP' },
  { key: 'c4', name: 'Sneha Reddy', phone: '+91 90909 87654', email: 'sneha@reddyfresh.in', location: 'Telangana, India', updated: '09 Aug' },
]
const NEW_CUSTOMER = { key: 'new-customer', name: 'Ravi Kumar', phone: '+91 98765 43210', email: 'ravi@example.com', location: 'Karnataka, India', updated: 'Today', tax: '29ABCDE1234F1Z5' }

const CUSTOMER_METRICS = [
  { label: 'Total Customers', value: '124' },
  { label: 'Active Customers', value: '118' },
  { label: 'Outstanding Balance', value: '₹12,400' },
  { label: 'New This Month', value: '14' },
]

const PRODUCT_SEED = [
  { key: 'p1', name: 'Sunflower Oil 1L', barcode: '8901234567890', category: 'Groceries', stock: '38 ltr', low: false, sell: '₹115', mrp: '₹125', tax: '5%' },
  { key: 'p2', name: 'Wheat Flour 5kg', barcode: '8901112223330', category: 'Groceries', stock: '22 kg', low: false, sell: '₹240', mrp: '₹260', tax: '5%' },
  { key: 'p3', name: 'Toothpaste 150g', barcode: '8904445556667', category: 'Personal Care', stock: '60 pcs', low: false, sell: '₹65', mrp: '₹75', tax: '18%' },
  { key: 'p4', name: 'Detergent 2kg', barcode: '8907778889990', category: 'Household', stock: '2 pcs', low: true, sell: '₹310', mrp: '₹340', tax: '18%' },
]
const NEW_PRODUCT = { key: 'new-product', name: 'Basmati Rice 5kg', barcode: '8904222333446', category: 'Groceries', stock: '50 kg', low: false, sell: '₹620', mrp: '₹680', tax: '5%' }

const PRODUCT_METRICS = [
  { label: 'Total Products', value: '86' },
  { label: 'Stock Value', value: '₹4.2L' },
  { label: 'Low Stock', value: '5', sub: 'Below alert threshold' },
  { label: 'Out of Stock', value: '2' },
]

const COUNTRIES = ['India', 'United States', 'United Arab Emirates', 'Nepal', 'Sri Lanka']
const STATES = ['Karnataka', 'Maharashtra', 'Delhi', 'Tamil Nadu', 'Kerala']
const CATEGORIES = ['Groceries', 'Personal Care', 'Household', 'Dairy', 'Beverages']
const UNITS = ['kg', 'pcs', 'ltr', 'box', 'pack']

/* Step 3 — Create Sale. Base line items (two seeded rows) plus the new
   Basmati Rice row appended by the scripted "+ Add Item" click. */
const SALE_BASE_ROWS = [
  { key: 's1', name: 'Sunflower Oil 1L', qty: 2, price: 115 },
  { key: 's2', name: 'Wheat Flour 5kg', qty: 1, price: 240 },
]
const SALE_NEW_PRICE = 620

/* Step 4 — Stock sync. `from` → `to` are the animated tick-down values. */
const STOCK_ROWS = [
  { key: 'st1', name: 'Basmati Rice 5kg', from: 50, to: 48, unit: 'kg', delta: -2, low: false },
  { key: 'st2', name: 'Sunflower Oil 1L', from: 38, to: 36, unit: 'ltr', delta: -2, low: false },
  { key: 'st3', name: 'Wheat Flour 5kg', from: 22, to: 21, unit: 'kg', delta: -1, low: false },
  { key: 'st4', name: 'Detergent 2kg', from: 2, to: 2, unit: 'pcs', delta: 0, low: true },
]

/* Step 5 — Dashboard metrics. Animated ones count up when revealed. */
const DASHBOARD_METRICS = [
  { key: 'rev', label: "Today's Revenue", value: '₹30,246', valueStyle: { color: '#16A34A' }, animate: { from: 28450, to: 30246, delay: 500 }, sub: '+₹1,796 today', subDelay: 1200 },
  { key: 'inv', label: 'Invoices Today', value: '44', animate: { from: 43, to: 44, delay: 500 }, sub: '+1 this hour', subDelay: 1200 },
  { key: 'profit', label: 'Profit Margin', value: '32%', sub: '4.1% above target', subDelay: 1400 },
  { key: 'bal', label: 'Outstanding', value: '₹12,400', sub: '118 active customers', subDelay: 1400 },
]
const DASHBOARD_MONEY = (v) => '₹' + v.toLocaleString('en-IN')

/* ═══════════════════════════════════════════════════════════════
   Hooks
   ═══════════════════════════════════════════════════════════════ */
function useReducedMotion() {
  const [reduced, setReduced] = useState(() => {
    if (typeof window === 'undefined' || !window.matchMedia) return false
    return window.matchMedia('(prefers-reduced-motion: reduce)').matches
  })

  useEffect(() => {
    if (!window.matchMedia) return
    const mq = window.matchMedia('(prefers-reduced-motion: reduce)')
    const onChange = (e) => setReduced(e.matches)
    if (mq.addEventListener) mq.addEventListener('change', onChange)
    else if (mq.addListener) mq.addListener(onChange)
    return () => {
      if (mq.removeEventListener) mq.removeEventListener('change', onChange)
      else if (mq.removeListener) mq.removeListener(onChange)
    }
  }, [])

  return reduced
}

function useViewportWidth() {
  const [vw, setVw] = useState(() => (typeof window !== 'undefined' ? window.innerWidth : 1280))

  useEffect(() => {
    const onResize = () => setVw(window.innerWidth)
    window.addEventListener('resize', onResize)
    return () => window.removeEventListener('resize', onResize)
  }, [])

  return vw
}

/* Master loop: runs a requestAnimationFrame clock, flips `step` at each
   duration boundary and bumps `cycle` when the full loop wraps.
   `started` gates the clock until the section's first scroll-into-view (an
   IntersectionObserver in the main component drives it) and `paused` halts
   it while the section is scrolled out of view. The accumulated elapsed
   time survives both, so resuming never restarts the timeline mid-story. */
function useDemoLoop(steps, started, paused) {
  const [state, setState] = useState({ step: 0, cycle: 0 })
  const stateRef = useRef(state)
  const elapsedAtPauseRef = useRef(0)
  const stepElapsedRef = useRef(0)

  useEffect(() => {
    stateRef.current = state
  }, [state])

  useEffect(() => {
    if (!started || paused) return

    const durations = steps.map((s) => s.duration)
    const total = durations.reduce((a, b) => a + b, 0)
    const boundaries = []
    let acc = 0
    durations.forEach((d) => { boundaries.push(acc); acc += d })

    let elapsed = elapsedAtPauseRef.current
    let raf
    let last = performance.now()

    const tick = (now) => {
      elapsed += (now - last) / 1000
      last = now

      if (elapsed >= total) {
        elapsed -= total
        const next = { step: 0, cycle: stateRef.current.cycle + 1 }
        stateRef.current = next
        setState(next)
      } else {
        let step = 0
        for (let i = 0; i < boundaries.length; i++) {
          if (elapsed >= boundaries[i]) step = i
        }
        if (step !== stateRef.current.step) {
          const next = { ...stateRef.current, step }
          stateRef.current = next
          setState(next)
        }
      }

      stepElapsedRef.current = elapsed - boundaries[stateRef.current.step]
      raf = requestAnimationFrame(tick)
    }

    raf = requestAnimationFrame(tick)
    return () => {
      cancelAnimationFrame(raf)
      elapsedAtPauseRef.current = elapsed
    }
  }, [steps, started, paused])

  return { ...state, stepElapsedRef }
}

/* Scripted cursor: each waypoint positions the cursor (by DOM target id or
   % of stage), sets hover state, and optionally fires a press. Positions are
   computed from getBoundingClientRect so they survive the stage's scale.
   While the section is off-screen (`paused`) no timers run; on resume the
   cursor is placed at the furthest waypoint already reached and only the
   remaining ones are scheduled (`stepElapsedRef` carries the current step
   position across the pause). */
function useDemoCursor(path, stepKey, stageRef, paused, stepElapsedRef) {
  const [pos, setPos] = useState(null)
  const [hoverId, setHoverId] = useState(null)
  const [pressId, setPressId] = useState(null)

  useEffect(() => {
    if (!path || path.length === 0) return
    if (paused) return

    const timers = []
    const t = stepElapsedRef.current

    const moveTo = (p) => {
      const stage = stageRef.current
      if (!stage) return
      const sRect = stage.getBoundingClientRect()
      const scaleX = stage.offsetWidth ? sRect.width / stage.offsetWidth : 1
      const scaleY = stage.offsetHeight ? sRect.height / stage.offsetHeight : 1
      let px = null
      let py = null

      if (p.target) {
        const el = stage.querySelector(`[data-demo-target="${p.target}"]`)
        if (el) {
          const elRect = el.getBoundingClientRect()
          px = (elRect.left - sRect.left) / scaleX + elRect.width / 2
          py = (elRect.top - sRect.top) / scaleY + Math.min(elRect.height * 0.85, 14)
        }
      } else if (p.x != null && p.y != null) {
        px = (p.x / 100) * (sRect.width / scaleX)
        py = (p.y / 100) * (sRect.height / scaleY)
      }

      if (px != null && py != null) setPos({ x: px, y: py })
    }

    let reached = null
    for (let i = 0; i < path.length; i++) {
      if (path[i].at <= t) reached = path[i]
      else break
    }
    const seed = reached || path[0]
    timers.push(window.setTimeout(() => {
      moveTo(seed)
      setHoverId(seed.hover || null)
      setPressId(null)
    }, 60))

    path.forEach((p) => {
      if (p.at <= t) return
      timers.push(window.setTimeout(() => {
        const stage = stageRef.current
        if (p.target && stage) {
          stage.dispatchEvent(new CustomEvent('demo:reveal', { bubbles: true, detail: { id: p.target } }))
        }
        moveTo(p)
        setHoverId(p.hover || null)
        if (p.click) {
          // Land the press after the cursor's travel transition finishes, so
          // the click reads as happening on the element, not in mid-air.
          timers.push(window.setTimeout(() => {
            setPressId(p.click)
            timers.push(window.setTimeout(() => setPressId(null), 200))
          }, PRESS_DELAY))
        }
      }, (p.at - t) * 1000))
    })

    return () => timers.forEach(clearTimeout)
  }, [stepKey, path, stageRef, paused, stepElapsedRef])

  return { pos, hoverId, pressId }
}

/* ═══════════════════════════════════════════════════════════════
   Shared form primitives (replicas — display only, no real inputs)
   ═══════════════════════════════════════════════════════════════ */
function Field({ id, label, required, helper, children, style }) {
  return (
    <div data-demo-target={id} style={style}>
      <label style={{ display: 'block', fontSize: 11.5, fontWeight: 600, color: C.textSecondary, marginBottom: 5 }}>
        {label}
        {required && <span style={{ color: C.danger }}>*</span>}
      </label>
      {children}
      {helper && <p style={{ fontSize: 10.5, color: C.textMuted, margin: '3px 0 0', lineHeight: 1.4 }}>{helper}</p>}
    </div>
  )
}

function TypedField({ id, label, value, placeholder, required, helper, cursor, speed = TYPING_SPEED, textarea, suffix, style }) {
  const [typed, setTyped] = useState('')
  const [started, setStarted] = useState(false)
  const done = typed.length === value.length
  const typing = started && !done

  // Latched typewriter: once clicked it types to completion even if the
  // cursor moves on (pressId clears ~200ms after a click, so typing must
  // not depend on it). The timer chain owns itself — no cleanup, so it
  // survives re-renders; unmount simply discards it.
  useEffect(() => {
    if (cursor.pressId !== id || started) return
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setStarted(true)
    let i = 0
    const next = () => {
      i += 1
      setTyped(value.slice(0, i))
      if (i < value.length) setTimeout(next, speed)
    }
    setTimeout(next, TYPING_START_DELAY)
  }, [cursor.pressId, id, value, speed, started])

  return (
    <Field id={id} label={label} required={required} helper={helper} style={style}>
      <div className="demo-input" style={{
        minHeight: 36,
        height: textarea ? 'auto' : 36,
        borderRadius: 8,
        padding: textarea ? '8px 11px' : '0 11px',
        background: C.bgInput,
        display: 'flex',
        alignItems: textarea ? 'flex-start' : 'center',
        gap: 3,
        lineHeight: textarea ? 1.5 : 'inherit',
        border: `1px solid ${typing ? 'var(--accent-600)' : C.border}`,
        boxShadow: typing ? '0 0 0 3px var(--accent-ring)' : 'none',
        transition: 'border-color 0.15s ease, box-shadow 0.15s ease',
      }}>
        {typed.length > 0 && (
          <span style={{ color: C.textPrimary, fontSize: 13, fontWeight: 500, whiteSpace: textarea ? 'normal' : 'nowrap', overflow: 'hidden' }}>{typed}</span>
        )}
        {typed.length === 0 && !typing && placeholder && (
          <span style={{ color: C.textMuted, fontSize: 12.5, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{placeholder}</span>
        )}
        {typing && <span className="demo-caret" />}
        {suffix}
      </div>
    </Field>
  )
}

function DemoSelect({ id, label, options, value, placeholder, required, cursor, style }) {
  const [phase, setPhase] = useState('idle')
  const startedRef = useRef(false)
  const open = phase === 'open' || phase === 'selecting'
  const chosen = phase === 'done'

  useEffect(() => {
    if (cursor.pressId !== id || startedRef.current) return
    startedRef.current = true
    setPhase('open')
    // Fire-and-forget short phases — latched by startedRef, safe to leave
    // running if the cursor moves on before the dropdown completes.
    setTimeout(() => setPhase('selecting'), 450)
    setTimeout(() => setPhase('done'), 800)
  }, [cursor.pressId, id])

  return (
    <Field id={id} label={label} required={required} style={style}>
      <div style={{ position: 'relative' }}>
        <div className="demo-select" style={{
          height: 36,
          borderRadius: 8,
          padding: '0 11px',
          background: C.bgInput,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          border: `1px solid ${open || chosen ? 'var(--accent-600)' : C.border}`,
          boxShadow: open || chosen ? '0 0 0 3px var(--accent-ring)' : 'none',
          transition: 'border-color 0.15s ease, box-shadow 0.15s ease',
        }}>
          <span style={{ color: chosen ? C.textPrimary : C.textMuted, fontSize: 13, fontWeight: chosen ? 500 : 400, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
            {chosen ? value : placeholder}
          </span>
          <svg width="12" height="12" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2} style={{ color: C.textMuted, transform: open ? 'rotate(180deg)' : 'none', transition: 'transform 0.18s ease', flexShrink: 0 }}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
          </svg>
        </div>
        {open && (
          <div className="demo-dropdown" style={{
            position: 'absolute', top: 40, left: 0, right: 0, zIndex: 40,
            background: C.bgCard, border: `1px solid ${C.border}`, borderRadius: 10,
            boxShadow: C.shadowElevated, padding: 4,
            animation: `demo-dropdown-in 0.18s ${EASE} both`,
          }}>
            {options.map((o, i) => {
              const isSel = o === value
              const active = phase === 'selecting' && isSel
              return (
                <div key={o} style={{
                  display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                  padding: '6px 10px', borderRadius: 7, fontSize: 12.5,
                  background: active ? 'var(--accent-50)' : 'transparent',
                  color: active ? 'var(--accent-700)' : C.textSecondary,
                  fontWeight: active ? 600 : 500,
                  opacity: 0, animation: `fadeIn 0.15s ease ${i * 0.025}s both`,
                  transition: 'background 0.15s ease',
                }}>
                  <span>{o}</span>
                  {active && (
                    <svg width="12" height="12" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5} style={{ color: 'var(--accent-600)' }}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                    </svg>
                  )}
                </div>
              )
            })}
          </div>
        )}
      </div>
    </Field>
  )
}

/* Modal overlay that auto-scrolls the active field into view inside its
   scroll container (fires on the demo:reveal event dispatched by the cursor). */
function DemoModal({ title, subtitle, children, width = 500 }) {
  const scrollRef = useRef(null)

  useEffect(() => {
    const onReveal = (e) => {
      const id = e.detail && e.detail.id
      const c = scrollRef.current
      const el = c && id ? c.querySelector(`[data-demo-target="${id}"]`) : null
      if (c && el) {
        const elRect = el.getBoundingClientRect()
        const cRect = c.getBoundingClientRect()
        const target = c.scrollTop + (elRect.top - cRect.top) - c.clientHeight / 2 + elRect.height / 2
        c.scrollTo({ top: Math.max(0, target), behavior: 'smooth' })
      }
    }
    document.addEventListener('demo:reveal', onReveal)
    return () => document.removeEventListener('demo:reveal', onReveal)
  }, [])

  return (
    <div style={{
      position: 'absolute', inset: 0, zIndex: 30,
      background: 'rgba(15, 23, 42, 0.34)',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      animation: 'backdrop-in 0.2s ease-out both',
    }}>
      <div ref={scrollRef} style={{
        width, maxWidth: '94%', maxHeight: '94%', overflowY: 'auto',
        background: C.bgCard, border: `1px solid ${C.border}`, borderRadius: 16,
        boxShadow: C.shadowElevated, padding: '18px 20px',
        animation: `modal-in 0.3s ${EASE} both`,
      }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 14 }}>
          <div>
            <p style={{ fontSize: 15, fontWeight: 700, color: C.textPrimary, margin: 0, letterSpacing: '-0.2px' }}>{title}</p>
            {subtitle && <p style={{ fontSize: 11.5, color: C.textMuted, margin: '2px 0 0' }}>{subtitle}</p>}
          </div>
          <div style={{ width: 24, height: 24, borderRadius: 7, background: C.bgSubtle, display: 'flex', alignItems: 'center', justifyContent: 'center', color: C.textMuted, flexShrink: 0 }}>
            <svg width="11" height="11" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5} strokeLinecap="round">
              <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </div>
        </div>
        {children}
      </div>
    </div>
  )
}

function Toast({ message }) {
  return (
    <div style={{
      position: 'absolute', top: 12, right: 12, zIndex: 45,
      display: 'flex', alignItems: 'center', gap: 8,
      background: C.bgCard, border: `1px solid ${C.successBorder}`, borderRadius: 10,
      boxShadow: C.shadowElevated, padding: '9px 14px', pointerEvents: 'none',
      animation: `demo-toast-in 0.35s ${EASE} both, demo-toast-out 0.3s ease-in 2.3s forwards`,
    }}>
      <span style={{ width: 18, height: 18, borderRadius: '50%', background: C.successBg, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
        <svg width="10" height="10" fill="none" viewBox="0 0 24 24" stroke={C.success} strokeWidth={3} strokeLinecap="round" strokeLinejoin="round">
          <path d="M5 13l4 4L19 7" />
        </svg>
      </span>
      <span style={{ fontSize: 12, fontWeight: 600, color: C.textPrimary }}>{message}</span>
    </div>
  )
}

/* Counts toward (or away from) `to` when mounted or when `to` changes —
   used for the sale running totals, stock tick-downs and dashboard ticks. */
function AnimatedNumber({ to, from, delay = 0, duration = 550, format, style }) {
  const [value, setValue] = useState(() => (from != null ? from : to))
  const lastRef = useRef(from != null ? from : to)

  useEffect(() => {
    const startFrom = lastRef.current
    if (startFrom === to) return
    let cancelled = false
    const timer = setTimeout(() => {
      const t0 = performance.now()
      const tick = (now) => {
        if (cancelled) return
        const p = Math.min(1, (now - t0) / duration)
        const eased = 1 - Math.pow(1 - p, 3)
        setValue(Math.round(startFrom + (to - startFrom) * eased))
        if (p < 1) {
          requestAnimationFrame(tick)
        } else {
          lastRef.current = to
        }
      }
      requestAnimationFrame(tick)
    }, delay)
    return () => { cancelled = true; clearTimeout(timer) }
  }, [to, from, delay, duration])

  return <span style={style}>{format ? format(value) : value}</span>
}

function Metric({ label, value, sub, delay, target, animate, subDelay, valueStyle }) {
  return (
    <div data-demo-target={target} style={{
      background: C.bgCard, border: `1px solid ${C.border}`, borderRadius: 12,
      padding: '10px 12px', boxShadow: C.shadowCard,
      animation: `demo-page-in 0.45s ${EASE} ${delay}s both`,
    }}>
      <p style={{ fontSize: 9.5, fontWeight: 600, letterSpacing: '0.05em', textTransform: 'uppercase', color: C.textMuted, margin: '0 0 4px' }}>{label}</p>
      <p style={{ fontSize: 15, fontWeight: 800, color: C.textPrimary, margin: 0, letterSpacing: '-0.3px', ...valueStyle }}>
        {animate
          ? <AnimatedNumber to={animate.to} from={animate.from} delay={animate.delay} duration={animate.duration} format={animate.format} />
          : value}
      </p>
      {sub && <p style={{ fontSize: 9.5, color: C.textMuted, margin: '1px 0 0', animation: subDelay != null ? `fadeIn 0.3s ease ${subDelay}ms both` : undefined }}>{sub}</p>}
    </div>
  )
}

/* SVG polyline that draws itself (stroke-dashoffset animation) — "no fake UI",
   just a chart drawing the week's revenue. */
function RevenueChart({ drawDelay = 0 }) {
  const [drawn, setDrawn] = useState(false)
  const [pointIn, setPointIn] = useState(false)

  useEffect(() => {
    const t1 = setTimeout(() => setDrawn(true), drawDelay)
    const t2 = setTimeout(() => setPointIn(true), drawDelay + 1450)
    return () => { clearTimeout(t1); clearTimeout(t2) }
  }, [drawDelay])

  const points = '0,86 40,70 80,76 120,54 160,60 200,40 240,46 280,24'
  const dots = points.split(' ').map((pt) => pt.split(',').map(Number))

  return (
    <svg viewBox="0 0 280 100" style={{ width: '100%', height: '100%', display: 'block' }} aria-hidden="true">
      <defs>
        <linearGradient id="demo-chart-fill" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="var(--accent-600)" stopOpacity="0.16" />
          <stop offset="100%" stopColor="var(--accent-600)" stopOpacity="0" />
        </linearGradient>
        <linearGradient id="demo-chart-line" x1="0" y1="0" x2="1" y2="0">
          <stop offset="0%" stopColor="var(--accent-400)" />
          <stop offset="100%" stopColor="var(--accent-600)" />
        </linearGradient>
      </defs>
      {[20, 40, 60, 80].map((y) => (
        <line key={y} x1="0" y1={y} x2="280" y2={y} stroke={C.border} strokeWidth="1" strokeDasharray="3 4" />
      ))}
      <path d={`${points} L280 100 L0 100 Z`} fill="url(#demo-chart-fill)" style={{ opacity: drawn ? 1 : 0, transition: 'opacity 0.6s ease 1.2s' }} />
      <polyline
        points={points}
        fill="none"
        stroke="url(#demo-chart-line)"
        strokeWidth="2.5"
        strokeLinecap="round"
        strokeLinejoin="round"
        pathLength={1}
        style={{ strokeDasharray: 1, strokeDashoffset: drawn ? 0 : 1, transition: 'stroke-dashoffset 1.4s cubic-bezier(0.4, 0, 0.2, 1)' }}
      />
      {dots.slice(0, -1).map(([x, y], i) => (
        <circle key={i} cx={x} cy={y} r="2" fill="#fff" stroke="var(--accent-500)" strokeWidth="1.5" style={{ opacity: drawn ? 1 : 0, transition: `opacity 0.3s ease ${0.25 + i * 0.14}s` }} />
      ))}
      <circle
        cx="280" cy="24" r="4.5" fill="#fff" stroke="var(--accent-600)" strokeWidth="2.5"
        style={{
          opacity: pointIn ? 1 : 0,
          transform: pointIn ? 'scale(1)' : 'scale(0.3)',
          transformOrigin: '280px 24px',
          transition: 'opacity 0.25s ease, transform 0.35s cubic-bezier(0.34, 1.56, 0.64, 1)',
        }}
      />
    </svg>
  )
}

function MiniTable({ columns, rows, newKey, newTarget }) {
  return (
    <div style={{
      background: C.bgCard, border: `1px solid ${C.border}`, borderRadius: 14,
      overflow: 'hidden', boxShadow: C.shadowCard,
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '8px 14px', borderBottom: `1px solid ${C.border}` }}>
        {columns.map((c) => (
          <div key={c.key} style={{ width: c.width, flex: c.flex || (c.width ? '0 0 auto' : 1), fontSize: 10, fontWeight: 600, letterSpacing: '0.05em', textTransform: 'uppercase', color: C.textMuted, whiteSpace: 'nowrap' }}>
            {c.label}
          </div>
        ))}
      </div>
      {rows.map((row, i) => {
        const isNew = newKey != null && row.key === newKey
        return (
          <div
            key={row.key}
            {...(isNew && newTarget ? { 'data-demo-target': newTarget } : {})}
            className={isNew ? 'demo-row-new' : undefined}
            style={{
              display: 'flex', alignItems: 'center', gap: 12, padding: '7px 14px',
              borderBottom: i < rows.length - 1 ? `1px solid ${C.border}` : 'none',
              background: 'transparent', position: 'relative',
              animation: isNew ? undefined : `demo-page-in 0.4s ${EASE} ${0.4 + i * 0.06}s both`,
            }}
          >
            {columns.map((c) => (
              <div key={c.key} style={{ width: c.width, flex: c.flex || (c.width ? '0 0 auto' : 1), fontSize: 11.5, color: C.textPrimary, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                {c.render ? c.render(row, isNew) : row[c.key]}
              </div>
            ))}
          </div>
        )
      })}
    </div>
  )
}

const MINI_EDIT = { fontSize: 10.5, fontWeight: 600, padding: '3px 10px', borderRadius: 6, border: `1px solid ${C.border}`, background: C.bgCard, color: C.textSecondary }
const MINI_DELETE = { fontSize: 10.5, fontWeight: 600, padding: '3px 10px', borderRadius: 6, border: `1px solid ${C.dangerBorder}`, background: C.dangerBg, color: C.dangerText }
const MINI_ACTIONS = () => (
  <div style={{ display: 'flex', gap: 6, justifyContent: 'flex-end' }}>
    <span style={MINI_EDIT}>Edit</span>
    <span style={MINI_DELETE}>Delete</span>
  </div>
)

const CUSTOMER_COLUMNS = [
  { key: 'name', label: 'Customer', flex: 1, render: (r) => (
    <div>
      <div style={{ fontWeight: 600, fontSize: 11.5, color: C.textPrimary }}>{r.name}</div>
      {r.tax && <div style={{ fontSize: 10, color: C.textMuted, fontFamily: 'monospace', marginTop: 1 }}>{r.tax}</div>}
    </div>
  ) },
  { key: 'phone', label: 'Phone', width: 122, render: (r) => <span style={{ color: C.textSecondary, fontSize: 11.5 }}>{r.phone}</span> },
  { key: 'email', label: 'Email', width: 176, render: (r) => <span style={{ color: C.textSecondary, fontSize: 11.5 }}>{r.email}</span> },
  { key: 'location', label: 'Location', width: 126, render: (r) => <span style={{ color: C.textSecondary, fontSize: 11.5 }}>{r.location}</span> },
  { key: 'updated', label: 'Last Updated', width: 74, render: (r) => <span style={{ color: C.textMuted, fontSize: 11 }}>{r.updated}</span> },
  { key: 'actions', label: '', width: 118, render: MINI_ACTIONS },
]

const PRODUCT_COLUMNS = [
  { key: 'name', label: 'Product', flex: 1, render: (r) => (
    <div>
      <div style={{ fontWeight: 600, fontSize: 11.5, color: C.textPrimary }}>{r.name}</div>
      {r.barcode && <div style={{ fontSize: 10, color: C.textMuted, marginTop: 1 }}>Barcode: {r.barcode}</div>}
    </div>
  ) },
  { key: 'category', label: 'Category', width: 88, render: (r) => (
    <span style={{ fontSize: 10.5, fontWeight: 600, color: C.textSecondary, background: C.bgSubtle, border: `1px solid ${C.border}`, borderRadius: 99, padding: '2px 8px' }}>{r.category}</span>
  ) },
  { key: 'stock', label: 'Stock', width: 88, render: (r, isNew) => (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }}>
      {isNew ? (
        <span className="demo-stock-pop" style={{ fontWeight: 700, color: 'var(--accent-700)', fontSize: 12 }}>{r.stock}</span>
      ) : (
        <span style={{ fontWeight: 700, fontSize: 11.5, color: r.low ? C.dangerText : C.textPrimary }}>{r.stock}</span>
      )}
      {r.low && !isNew && (
        <span style={{ fontSize: 9, fontWeight: 700, color: C.dangerText, background: C.dangerBg, border: `1px solid ${C.dangerBorder}`, borderRadius: 99, padding: '0 5px' }}>Low</span>
      )}
    </span>
  ) },
  { key: 'sell', label: 'Sell Price', width: 82, render: (r) => <span style={{ fontWeight: 600, fontSize: 11.5 }}>{r.sell}</span> },
  { key: 'mrp', label: 'MRP', width: 70, render: (r) => <span style={{ fontSize: 11, color: C.textMuted, textDecoration: 'line-through' }}>{r.mrp}</span> },
  { key: 'tax', label: 'Tax', width: 50, render: (r) => <span style={{ fontSize: 11, color: C.textMuted }}>{r.tax}</span> },
  { key: 'actions', label: '', width: 110, render: MINI_ACTIONS },
]

/* ═══════════════════════════════════════════════════════════════
   App shell — browser chrome + dark sidebar + topbar
   ═══════════════════════════════════════════════════════════════ */
const SIDEBAR_SECTIONS = [
  { label: 'Overview', items: [
    { label: 'Dashboard', id: 'nav-dashboard', icon: 'M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6' },
  ]},
  { label: 'Commerce', items: [
    { label: 'Sales', id: 'nav-sales', icon: 'M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z' },
    { label: 'Purchases', id: 'nav-purchases', icon: 'M3 3h2l.4 2M7 13h10l4-8H5.4M7 13L5.4 5M7 13l-2.293 2.293c-.63.63-.184 1.707.707 1.707H17m0 0a2 2 0 100 4 2 2 0 000-4zm-8 2a2 2 0 11-4 0 2 2 0 014 0z' },
  ]},
  { label: 'People', items: [
    { label: 'Customers', id: 'nav-customers', icon: 'M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z' },
    { label: 'Suppliers', id: 'nav-suppliers', icon: 'M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4' },
  ]},
  { label: 'Inventory', items: [
    { label: 'Products', id: 'nav-products', icon: 'M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4' },
    { label: 'Stock', id: 'nav-stock', icon: 'M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z' },
  ]},
]

function BrowserChrome() {
  return (
    <div style={{
      height: CHROME_H, background: C.bgCard, borderBottom: `1px solid ${C.border}`,
      borderRadius: '16px 16px 0 0', display: 'flex', alignItems: 'center',
      padding: '0 14px', gap: 6, flexShrink: 0,
    }}>
      <span style={{ width: 9, height: 9, borderRadius: '50%', background: '#EF4444' }} />
      <span style={{ width: 9, height: 9, borderRadius: '50%', background: '#F59E0B' }} />
      <span style={{ width: 9, height: 9, borderRadius: '50%', background: '#10B981' }} />
      <div style={{
        marginLeft: 12, width: 300, height: 19, borderRadius: 99,
        background: C.bgSubtle, border: `1px solid ${C.border}`,
        display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 5,
      }}>
        <svg width="9" height="9" fill="none" viewBox="0 0 24 24" stroke="#94A3B8" strokeWidth={2}>
          <rect x="5" y="11" width="14" height="9" rx="2" /><path d="M8 11V8a4 4 0 118 0v3" />
        </svg>
        <span style={{ fontSize: 9.5, color: C.textMuted, fontWeight: 500 }}>app.smartbillr.com</span>
      </div>
      <span style={{ marginLeft: 'auto', fontSize: 9.5, color: C.textMuted, fontWeight: 600 }}>SmartBillr</span>
    </div>
  )
}

function DemoSidebar({ active, cursor }) {
  return (
    <aside style={{
      width: 200, background: SB.bg, borderRight: `1px solid ${SB.border}`,
      display: 'flex', flexDirection: 'column', flexShrink: 0, position: 'relative', height: '100%',
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 9, padding: '14px 16px 10px' }}>
        <div style={{ width: 27, height: 27, borderRadius: 8, background: 'linear-gradient(135deg, #4F46E5, #818CF8)', display: 'flex', alignItems: 'center', justifyContent: 'center', boxShadow: '0 3px 10px rgba(79,70,229,0.4)' }}>
          <svg width="14" height="14" fill="none" viewBox="0 0 24 24" stroke="#fff" strokeWidth={2.2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
          </svg>
        </div>
        <span style={{ fontSize: 15, fontWeight: 800, letterSpacing: '-0.5px', color: '#F8FAFC' }}>
          Smart<span style={{ color: 'var(--accent-400)' }}>Billr</span>
        </span>
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: 8, margin: '4px 12px 12px', padding: '8px 10px', borderRadius: 10, background: 'rgba(255,255,255,0.04)', border: `1px solid ${SB.border}` }}>
        <span style={{ width: 22, height: 22, borderRadius: 7, background: 'var(--accent-500)', color: '#fff', fontSize: 11, fontWeight: 700, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>M</span>
        <span style={{ overflow: 'hidden', flex: 1 }}>
          <span style={{ display: 'block', fontSize: 11, fontWeight: 600, color: '#E2E8F0', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>MG Trading Co.</span>
          <span style={{ display: 'block', fontSize: 9, color: '#8697AC' }}>Workspace</span>
        </span>
        <span style={{ width: 6, height: 6, borderRadius: '50%', background: '#22C55E' }} />
      </div>

      <nav style={{ flex: 1, overflowY: 'auto', padding: '0 8px', scrollbarWidth: 'thin' }}>
        {SIDEBAR_SECTIONS.map((section) => (
          <div key={section.label}>
            <p style={{ fontSize: 9, fontWeight: 600, letterSpacing: '0.08em', textTransform: 'uppercase', color: '#64748B', padding: '8px 10px 4px', margin: 0 }}>{section.label}</p>
            {section.items.map((item) => {
              const isActive = active === item.id.replace('nav-', '')
              const hovered = cursor.hoverId === item.id
              const pressed = cursor.pressId === item.id
              return (
                <div key={item.id} data-demo-target={item.id} style={{
                  display: 'flex', alignItems: 'center', gap: 9, padding: '6px 10px', borderRadius: 8, marginBottom: 1,
                  fontSize: 12, fontWeight: hovered || isActive ? 600 : 500,
                  color: isActive ? 'var(--accent-sidebar-text)' : hovered ? SB.hoverText : SB.muted,
                  background: isActive ? 'var(--accent-sidebar-active)' : hovered ? SB.hover : 'transparent',
                  transform: pressed ? 'scale(0.98)' : 'scale(1)',
                  transition: 'all 0.15s ease', cursor: 'default', position: 'relative',
                }}>
                  {isActive && <span style={{ position: 'absolute', left: 0, top: '18%', bottom: '18%', width: 3, borderRadius: 3, background: 'var(--accent-400)' }} />}
                  <svg width="14" height="14" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8} style={{ flexShrink: 0 }}>
                    <path strokeLinecap="round" strokeLinejoin="round" d={item.icon} />
                  </svg>
                  <span>{item.label}</span>
                </div>
              )
            })}
          </div>
        ))}
      </nav>

      <div style={{ padding: '10px 12px', borderTop: `1px solid ${SB.border}`, display: 'flex', alignItems: 'center', gap: 8 }}>
        <span style={{ width: 24, height: 24, borderRadius: '50%', background: 'linear-gradient(135deg, #6366F1, #818CF8)', color: '#fff', fontSize: 10, fontWeight: 700, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>MK</span>
        <span style={{ flex: 1, overflow: 'hidden' }}>
          <span style={{ display: 'block', fontSize: 11, fontWeight: 600, color: '#E2E8F0' }}>Meera Krishnan</span>
          <span style={{ display: 'block', fontSize: 9, color: '#8697AC' }}>Owner · Pro</span>
        </span>
        <span style={{ fontSize: 10, color: '#64748B' }}>?</span>
      </div>
    </aside>
  )
}

function DemoTopbar({ title }) {
  return (
    <header style={{
      height: 44, background: C.bgCard, borderBottom: `1px solid ${C.border}`,
      display: 'flex', alignItems: 'center', justifyContent: 'space-between',
      padding: '0 16px', flexShrink: 0,
    }}>
      <p style={{ fontSize: 13.5, fontWeight: 700, color: C.textPrimary, letterSpacing: '-0.2px', margin: 0 }}>{title}</p>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        <div style={{ width: 150, height: 26, borderRadius: 99, background: C.bgSubtle, border: `1px solid ${C.border}`, display: 'flex', alignItems: 'center', gap: 6, padding: '0 10px' }}>
          <svg width="11" height="11" fill="none" viewBox="0 0 24 24" stroke="#94A3B8" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-4.35-4.35M17 11a6 6 0 11-12 0 6 6 0 0112 0z" />
          </svg>
          <span style={{ fontSize: 10.5, color: C.textMuted }}>Search…</span>
        </div>
        <span style={{ width: 26, height: 26, borderRadius: '50%', background: C.bgSubtle, display: 'flex', alignItems: 'center', justifyContent: 'center', color: C.textMuted }}>
          <svg width="12" height="12" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M20.354 15.354A4 4 0 018.646 6.646 7 7 0 0020.354 15.354z" />
          </svg>
        </span>
        <span style={{ width: 26, height: 26, borderRadius: '50%', background: 'linear-gradient(135deg, #6366F1, #818CF8)', color: '#fff', fontSize: 10, fontWeight: 700, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>MK</span>
      </div>
    </header>
  )
}

function DemoCursor({ pos, pressId, hidden }) {
  if (!pos) return null
  return (
    <div style={{
      position: 'absolute', left: pos.x, top: pos.y, zIndex: 60, pointerEvents: 'none',
      transform: 'translate(-2px, -2px)',
      opacity: hidden ? 0 : 1,
      transition: `left 0.45s ${EASE}, top 0.45s ${EASE}, opacity 0.4s ease`,
    }}>
      <svg width="17" height="20" viewBox="0 0 17 20" style={{ transform: pressId ? 'scale(0.8)' : 'scale(1)', transformOrigin: '0 0', transition: 'transform 0.12s ease' }}>
        <path d="M1.5 1.5 L12.5 11.5 L7.9 12 L9.6 16 L7.9 16.7 L6.2 12.6 L1.5 15.5 Z" fill="#FFFFFF" stroke="#0F172A" strokeWidth="1.1" strokeLinejoin="round" />
      </svg>
    </div>
  )
}

/* ═══════════════════════════════════════════════════════════════
   Pages
   ═══════════════════════════════════════════════════════════════ */
const BTN_PRIMARY = {
  display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 6,
  height: 34, padding: '0 14px', borderRadius: 8, border: 'none',
  background: 'linear-gradient(135deg, var(--accent-700), var(--accent-600))',
  color: '#fff', fontSize: 12.5, fontWeight: 600, fontFamily: 'inherit',
  cursor: 'default', transition: `all 0.18s ${EASE}`,
}
const BTN_SECONDARY = {
  display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 6,
  height: 32, padding: '0 12px', borderRadius: 8,
  background: C.bgCard, color: C.textPrimary, border: `1px solid ${C.border}`,
  fontSize: 12, fontWeight: 600, fontFamily: 'inherit', cursor: 'default',
  transition: `all 0.18s ${EASE}`,
}

function CustomersDemoPage({ cursor }) {
  const [modalOpen, setModalOpen] = useState(false)
  const [saving, setSaving] = useState(false)
  const [created, setCreated] = useState(false)

  useEffect(() => {
    if (cursor.pressId !== 'btn-add-customer' || modalOpen) return
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setModalOpen(true)
  }, [cursor.pressId, modalOpen])

  useEffect(() => {
    if (cursor.pressId !== 'btn-save-customer' || created) return
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setSaving(true)
    // Fire-and-forget: pressId clears shortly after the click; the
    // completion timer must survive that so the save always finishes.
    setTimeout(() => {
      setSaving(false)
      setCreated(true)
    }, 600)
  }, [cursor.pressId, created])

  const rows = created ? [NEW_CUSTOMER, ...CUSTOMER_SEED] : CUSTOMER_SEED
  const addHovered = cursor.hoverId === 'btn-add-customer'
  const addPressed = cursor.pressId === 'btn-add-customer'
  const saveHovered = cursor.hoverId === 'btn-save-customer'
  const savePressed = cursor.pressId === 'btn-save-customer'

  return (
    <div style={{ position: 'relative', padding: 16, animation: `demo-page-in 0.45s ${EASE} both` }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 12 }}>
        <div>
          <p style={{ fontSize: 16, fontWeight: 800, color: C.textPrimary, letterSpacing: '-0.4px', margin: 0, lineHeight: 1.2 }}>Customers</p>
          <p style={{ fontSize: 11, color: C.textMuted, margin: '1px 0 0' }}>Manage your customer list, contacts, and billing details</p>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <button data-demo-target="btn-export-customer" style={BTN_SECONDARY}>Export</button>
          <button
            data-demo-target="btn-add-customer"
            style={{
              ...BTN_PRIMARY,
              boxShadow: addHovered ? '0 4px 14px rgba(79,70,229,0.35)' : '0 2px 8px rgba(79,70,229,0.25)',
              transform: addPressed ? 'scale(0.96)' : addHovered ? 'translateY(-1px)' : 'translateY(0)',
            }}
          >
            <span style={{ fontSize: 15, lineHeight: 1 }}>+</span> Add Customer
          </button>
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr 1fr', gap: 10, marginBottom: 12 }}>
        {CUSTOMER_METRICS.map((m, i) => (
          <Metric key={m.label} {...m} target={i === 0 ? 'customers-metric' : undefined} delay={0.15 + i * 0.06} />
        ))}
      </div>

      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
        <div data-demo-target="customers-search" style={{
          display: 'flex', alignItems: 'center', gap: 6, width: 250, height: 32, borderRadius: 8,
          background: C.bgCard, border: `1px solid ${C.border}`, padding: '0 10px',
          animation: `demo-page-in 0.4s ${EASE} 0.3s both`,
        }}>
          <svg width="12" height="12" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2} style={{ color: C.textMuted, flexShrink: 0 }}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-4.35-4.35M17 11a6 6 0 11-12 0 6 6 0 0112 0z" />
          </svg>
          <span style={{ fontSize: 11.5, color: C.textMuted }}>Search by name, phone, email…</span>
        </div>
        <span style={{ fontSize: 11.5, color: C.textMuted, fontWeight: 500, animation: `demo-page-in 0.4s ${EASE} 0.35s both` }}>
          {124 + (created ? 1 : 0)} customers
        </span>
      </div>

      <div style={{ animation: `demo-page-in 0.4s ${EASE} 0.4s both` }}>
        <MiniTable columns={CUSTOMER_COLUMNS} rows={rows} newKey={created ? NEW_CUSTOMER.key : null} newTarget="new-customer-row" />
      </div>

      {created && <Toast message="Customer created successfully" />}

      {modalOpen && !created && (
        <DemoModal title="Add Customer" subtitle="Add a new customer to your list" width={520}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <TypedField id="customer-name" label="Customer Name" required value="Ravi Kumar" placeholder="e.g. Ravi Kumar" cursor={cursor} style={{ gridColumn: '1 / -1' }} />
            <TypedField id="customer-phone" label="Phone" value="+91 98765 43210" placeholder="e.g. +91 98765 43210" cursor={cursor} />
            <TypedField id="customer-email" label="Email" value="ravi@example.com" placeholder="e.g. ravi@example.com" cursor={cursor} />
            <DemoSelect id="customer-country" label="Country" options={COUNTRIES} value="India" placeholder="Select country" cursor={cursor} />
            <DemoSelect id="customer-state" label="State / Province" options={STATES} value="Karnataka" placeholder="Select state / province" cursor={cursor} />
            <TypedField id="customer-tax" label="Tax Number (GSTIN / VAT / TIN)" value="29ABCDE1234F1Z5" placeholder="e.g. 29ABCDE1234F1Z5" cursor={cursor} style={{ gridColumn: '1 / -1' }} />
            <TypedField id="customer-address" label="Address" textarea value="14, MG Road, Bengaluru 560001" placeholder="Street address, area, city..." cursor={cursor} speed={64} style={{ gridColumn: '1 / -1' }} />
          </div>
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 14, paddingTop: 12, borderTop: `1px solid ${C.border}` }}>
            <span style={BTN_SECONDARY}>Cancel</span>
            <button
              data-demo-target="btn-save-customer"
              style={{
                ...BTN_PRIMARY,
                boxShadow: saveHovered ? '0 4px 14px rgba(79,70,229,0.35)' : '0 2px 8px rgba(79,70,229,0.25)',
                transform: savePressed ? 'scale(0.96)' : saveHovered ? 'translateY(-1px)' : 'translateY(0)',
              }}
            >
              {saving ? (
                <span style={{ width: 13, height: 13, borderRadius: '50%', border: '2px solid rgba(255,255,255,0.35)', borderTopColor: '#fff', animation: 'spin 0.7s linear infinite' }} />
              ) : (
                <svg width="12" height="12" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                </svg>
              )}
              {saving ? 'Saving…' : 'Save'}
            </button>
          </div>
        </DemoModal>
      )}
    </div>
  )
}

function ProductsDemoPage({ cursor }) {
  const [modalOpen, setModalOpen] = useState(false)
  const [saving, setSaving] = useState(false)
  const [created, setCreated] = useState(false)

  useEffect(() => {
    if (cursor.pressId !== 'btn-add-product' || modalOpen) return
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setModalOpen(true)
  }, [cursor.pressId, modalOpen])

  useEffect(() => {
    if (cursor.pressId !== 'btn-create-product' || created) return
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setSaving(true)
    // Fire-and-forget: pressId clears shortly after the click; the
    // completion timer must survive that so the save always finishes.
    setTimeout(() => {
      setSaving(false)
      setCreated(true)
    }, 600)
  }, [cursor.pressId, created])

  const rows = created ? [NEW_PRODUCT, ...PRODUCT_SEED] : PRODUCT_SEED
  const addHovered = cursor.hoverId === 'btn-add-product'
  const addPressed = cursor.pressId === 'btn-add-product'
  const saveHovered = cursor.hoverId === 'btn-create-product'
  const savePressed = cursor.pressId === 'btn-create-product'

  return (
    <div style={{ position: 'relative', padding: 16, animation: `demo-page-in 0.45s ${EASE} both` }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 12 }}>
        <div>
          <p style={{ fontSize: 16, fontWeight: 800, color: C.textPrimary, letterSpacing: '-0.4px', margin: 0, lineHeight: 1.2 }}>Products</p>
          <p style={{ fontSize: 11, color: C.textMuted, margin: '1px 0 0' }}>Manage your product catalogue, prices, and stock alerts</p>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <button data-demo-target="btn-export-product" style={BTN_SECONDARY}>Export</button>
          <button
            data-demo-target="btn-add-product"
            style={{
              ...BTN_PRIMARY,
              boxShadow: addHovered ? '0 4px 14px rgba(79,70,229,0.35)' : '0 2px 8px rgba(79,70,229,0.25)',
              transform: addPressed ? 'scale(0.96)' : addHovered ? 'translateY(-1px)' : 'translateY(0)',
            }}
          >
            <span style={{ fontSize: 15, lineHeight: 1 }}>+</span> Add Product
          </button>
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr 1fr', gap: 10, marginBottom: 12 }}>
        {PRODUCT_METRICS.map((m, i) => (
          <Metric key={m.label} {...m} target={i === 0 ? 'products-metric' : undefined} delay={0.15 + i * 0.06} />
        ))}
      </div>

      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
        <div data-demo-target="products-search" style={{
          display: 'flex', alignItems: 'center', gap: 6, width: 250, height: 32, borderRadius: 8,
          background: C.bgCard, border: `1px solid ${C.border}`, padding: '0 10px',
          animation: `demo-page-in 0.4s ${EASE} 0.3s both`,
        }}>
          <svg width="12" height="12" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2} style={{ color: C.textMuted, flexShrink: 0 }}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-4.35-4.35M17 11a6 6 0 11-12 0 6 6 0 0112 0z" />
          </svg>
          <span style={{ fontSize: 11.5, color: C.textMuted }}>Search by product, category or barcode…</span>
        </div>
        <span style={{ fontSize: 11.5, color: C.textMuted, fontWeight: 500, animation: `demo-page-in 0.4s ${EASE} 0.35s both` }}>
          {86 + (created ? 1 : 0)} products
        </span>
      </div>

      <div style={{ animation: `demo-page-in 0.4s ${EASE} 0.4s both` }}>
        <MiniTable columns={PRODUCT_COLUMNS} rows={rows} newKey={created ? NEW_PRODUCT.key : null} newTarget="new-product-row" />
      </div>

      {created && <Toast message="Product created successfully" />}

      {modalOpen && !created && (
        <DemoModal title="Add Product" subtitle="Add a new product to your catalogue" width={560}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <TypedField id="product-name" label="Product Name" required value="Basmati Rice 5kg" placeholder="e.g. Basmati Rice 5kg" cursor={cursor} style={{ gridColumn: '1 / -1' }} />
            <TypedField id="product-sell" label="Selling Price" required value="620" placeholder="0.00" cursor={cursor} />
            <TypedField id="product-cost" label="Cost Price" required value="540" placeholder="0.00" cursor={cursor} />
            <TypedField id="product-mrp" label="MRP (Maximum Retail Price)" value="680" placeholder="0.00 — leave blank if not applicable" cursor={cursor} helper="Printed price on the product — discount shown on invoices" style={{ gridColumn: '1 / -1' }} />
            <TypedField id="product-stock" label="Opening Stock Qty" value="50" placeholder="0" cursor={cursor} style={{ gridColumn: '1 / -1' }} />
            <DemoSelect id="product-category" label="Category" required options={CATEGORIES} value="Groceries" placeholder="— Select category —" cursor={cursor} />
            <DemoSelect id="product-unit" label="Unit" options={UNITS} value="kg" placeholder="Select unit" cursor={cursor} />
            <TypedField id="product-tax" label="Tax Rate (%)" value="5" placeholder="e.g. 18" cursor={cursor} helper="e.g. 0, 5, 7.5, 10, 18, 20" />
            <TypedField id="product-taxcode" label="Tax Code (HSN / SAC)" value="1006" placeholder="e.g. 1006" cursor={cursor} helper="Optional" />
            <TypedField
              id="product-barcode"
              label="Barcode"
              value={NEW_PRODUCT.barcode}
              placeholder="e.g. 8901234567890"
              cursor={cursor}
              speed={64}
              helper="Scan, type, or generate"
              style={{ gridColumn: '1 / -1' }}
              suffix={<span style={{ fontSize: 11, fontWeight: 600, color: C.textSecondary, background: C.bgCard, border: `1px solid ${C.border}`, borderRadius: 6, padding: '3px 9px', flexShrink: 0 }}>Generate</span>}
            />
          </div>
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 14, paddingTop: 12, borderTop: `1px solid ${C.border}` }}>
            <span style={BTN_SECONDARY}>Cancel</span>
            <button
              data-demo-target="btn-create-product"
              style={{
                ...BTN_PRIMARY,
                boxShadow: saveHovered ? '0 4px 14px rgba(79,70,229,0.35)' : '0 2px 8px rgba(79,70,229,0.25)',
                transform: savePressed ? 'scale(0.96)' : saveHovered ? 'translateY(-1px)' : 'translateY(0)',
              }}
            >
              {saving ? (
                <span style={{ width: 13, height: 13, borderRadius: '50%', border: '2px solid rgba(255,255,255,0.35)', borderTopColor: '#fff', animation: 'spin 0.7s linear infinite' }} />
              ) : (
                <svg width="12" height="12" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                </svg>
              )}
              {saving ? 'Creating…' : 'Create Product'}
            </button>
          </div>
        </DemoModal>
      )}
    </div>
  )
}

/* ═══════════════════════════════════════════════════════════════
   Steps 3–5 — Create Sale, Stock sync, Dashboard
   ═══════════════════════════════════════════════════════════════ */
function SaleDemoPage({ cursor }) {
  const [itemAdded, setItemAdded] = useState(false)
  const [qty, setQty] = useState(1)
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)

  useEffect(() => {
    if (cursor.pressId !== 'btn-add-item' || itemAdded) return
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setItemAdded(true)
  }, [cursor.pressId, itemAdded])

  useEffect(() => {
    if (cursor.pressId !== 'sale-qty-plus' || qty > 1) return
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setQty(2)
  }, [cursor.pressId, qty])

  useEffect(() => {
    if (cursor.pressId !== 'btn-save-invoice' || saved) return
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setSaving(true)
    setTimeout(() => { setSaving(false); setSaved(true) }, 600)
  }, [cursor.pressId, saved])

  const newAmount = qty * SALE_NEW_PRICE
  const subtotal = 470 + (itemAdded ? newAmount : 0)
  const tax = Math.round(subtotal * 0.05 * 10) / 10
  const total = Math.round(subtotal + tax)

  const addHovered = cursor.hoverId === 'btn-add-item'
  const addPressed = cursor.pressId === 'btn-add-item'
  const qtyHovered = cursor.hoverId === 'sale-qty-plus'
  const qtyPressed = cursor.pressId === 'sale-qty-plus'
  const saveHovered = cursor.hoverId === 'btn-save-invoice'
  const savePressed = cursor.pressId === 'btn-save-invoice'
  const money = (v) => '₹' + v.toLocaleString('en-IN')

  return (
    <div style={{ position: 'relative', padding: 16, animation: `demo-page-in 0.45s ${EASE} both` }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 12 }}>
        <div>
          <p style={{ fontSize: 16, fontWeight: 800, color: C.textPrimary, letterSpacing: '-0.4px', margin: 0, lineHeight: 1.2 }}>Create Sale</p>
          <p style={{ fontSize: 11, color: C.textMuted, margin: '1px 0 0' }}>Bill a customer in seconds</p>
        </div>
        <button
          data-demo-target="btn-save-invoice"
          style={{
            ...BTN_PRIMARY,
            boxShadow: saveHovered ? '0 4px 14px rgba(79,70,229,0.35)' : '0 2px 8px rgba(79,70,229,0.25)',
            transform: savePressed ? 'scale(0.96)' : saveHovered ? 'translateY(-1px)' : 'translateY(0)',
          }}
        >
          {saving ? (
            <span style={{ width: 13, height: 13, borderRadius: '50%', border: '2px solid rgba(255,255,255,0.35)', borderTopColor: '#fff', animation: 'spin 0.7s linear infinite' }} />
          ) : (
            <svg width="12" height="12" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
            </svg>
          )}
          {saving ? 'Saving…' : 'Save Invoice'}
        </button>
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: 9, background: C.bgCard, border: `1px solid ${C.border}`, borderRadius: 12, padding: '7px 12px', marginBottom: 12, boxShadow: C.shadowCard, animation: `demo-page-in 0.4s ${EASE} 0.1s both` }}>
        <span style={{ width: 22, height: 22, borderRadius: '50%', background: 'var(--accent-100)', color: 'var(--accent-700)', fontSize: 10, fontWeight: 700, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>RK</span>
        <span style={{ flex: 1 }}>
          <span style={{ display: 'block', fontSize: 11.5, fontWeight: 600, color: C.textPrimary }}>Ravi Kumar</span>
          <span style={{ display: 'block', fontSize: 9.5, color: C.textMuted, fontFamily: 'monospace' }}>GSTIN 29ABCDE1234F1Z5</span>
        </span>
        <span style={{ fontSize: 10, fontWeight: 600, color: C.successText, background: C.successBg, border: `1px solid ${C.successBorder}`, borderRadius: 99, padding: '2px 8px' }}>Paying via UPI</span>
      </div>

      <div style={{ background: C.bgCard, border: `1px solid ${C.border}`, borderRadius: 14, overflow: 'hidden', boxShadow: C.shadowCard, marginBottom: 12, animation: `demo-page-in 0.4s ${EASE} 0.16s both` }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '8px 14px', borderBottom: `1px solid ${C.border}` }}>
          <span style={{ fontSize: 10, fontWeight: 600, letterSpacing: '0.05em', textTransform: 'uppercase', color: C.textMuted }}>Items</span>
          <button
            data-demo-target="btn-add-item"
            style={{
              display: 'inline-flex', alignItems: 'center', gap: 5,
              height: 26, padding: '0 11px', borderRadius: 7, fontSize: 11, fontWeight: 600, fontFamily: 'inherit',
              color: 'var(--accent-700)', background: 'var(--accent-50)', border: `1px dashed var(--accent-300)`,
              cursor: 'default', transition: 'all 0.15s ease',
              transform: addPressed ? 'scale(0.96)' : addHovered ? 'translateY(-1px)' : 'translateY(0)',
            }}
          >
            <span style={{ fontSize: 13, lineHeight: 1 }}>+</span> Add Item
          </button>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '7px 14px', borderBottom: `1px solid ${C.border}` }}>
          {[{ key: 'i-name', label: 'Item', flex: 1 }, { key: 'i-qty', label: 'Qty', width: 74 }, { key: 'i-price', label: 'Price', width: 70 }, { key: 'i-amt', label: 'Amount', width: 86 }].map((c) => (
            <div key={c.key} style={{ width: c.width, flex: c.flex || (c.width ? '0 0 auto' : 1), fontSize: 10, fontWeight: 600, letterSpacing: '0.05em', textTransform: 'uppercase', color: C.textMuted, whiteSpace: 'nowrap' }}>{c.label}</div>
          ))}
        </div>
        {SALE_BASE_ROWS.map((r, i) => (
          <div key={r.key} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '7px 14px', borderBottom: `1px solid ${C.border}`, animation: `demo-page-in 0.4s ${EASE} ${0.2 + i * 0.06}s both` }}>
            <div style={{ flex: 1, fontSize: 11.5, fontWeight: 600, color: C.textPrimary, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{r.name}</div>
            <div style={{ width: 74, fontSize: 11.5, color: C.textSecondary }}>×{r.qty}</div>
            <div style={{ width: 70, fontSize: 11.5, color: C.textSecondary }}>{money(r.price)}</div>
            <div style={{ width: 86, fontSize: 11.5, fontWeight: 600, color: C.textPrimary, textAlign: 'right' }}>{money(r.qty * r.price)}</div>
          </div>
        ))}
        {itemAdded && (
          <div className="demo-row-new" style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '7px 14px' }}>
            <div style={{ flex: 1, fontSize: 11.5, fontWeight: 700, color: 'var(--accent-700)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>Basmati Rice 5kg</div>
            <div style={{ width: 74, display: 'flex', alignItems: 'center', gap: 6 }}>
              <span key={qty} className="demo-qty-pop" style={{ fontSize: 11.5, fontWeight: 700 }}>×{qty}</span>
              <button
                data-demo-target="sale-qty-plus"
                style={{
                  width: 20, height: 20, borderRadius: 6, fontSize: 13, lineHeight: 1, fontFamily: 'inherit',
                  display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                  color: 'var(--accent-700)', background: qtyHovered ? 'var(--accent-100)' : 'var(--accent-50)',
                  border: `1px solid ${qtyHovered ? 'var(--accent-300)' : 'var(--accent-200)'}`, cursor: 'default',
                  transform: qtyPressed ? 'scale(0.92)' : 'scale(1)', transition: 'all 0.12s ease',
                }}
              >+</button>
            </div>
            <div style={{ width: 70, fontSize: 11.5, color: C.textSecondary }}>{money(SALE_NEW_PRICE)}</div>
            <div style={{ width: 86, fontSize: 11.5, fontWeight: 700, color: C.textPrimary, textAlign: 'right' }}>
              <AnimatedNumber to={newAmount} format={money} />
            </div>
          </div>
        )}
      </div>

      <div data-demo-target="sale-totals" style={{ background: C.bgCard, border: `1px solid ${C.border}`, borderRadius: 14, padding: '10px 14px', boxShadow: C.shadowCard, animation: `demo-page-in 0.4s ${EASE} 0.28s both` }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6, fontSize: 11.5, color: C.textSecondary }}>
          <span>Subtotal</span>
          <span style={{ fontWeight: 600, color: C.textPrimary }}><AnimatedNumber to={subtotal} format={money} /></span>
        </div>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8, fontSize: 11.5, color: C.textSecondary }}>
          <span>Tax · GST 5%</span>
          <span style={{ fontWeight: 600, color: C.textPrimary }}><AnimatedNumber to={tax} format={(v) => '₹' + v.toFixed(1)} /></span>
        </div>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', paddingTop: 8, borderTop: `1px solid ${C.border}` }}>
          <span style={{ fontSize: 12, fontWeight: 700, color: C.textPrimary }}>Total</span>
          <span style={{ fontSize: 16, fontWeight: 800, color: C.textPrimary, letterSpacing: '-0.3px' }}><AnimatedNumber to={total} format={money} /></span>
        </div>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 8 }}>
          <span style={{ fontSize: 10.5, color: C.textMuted }}>Invoice will be <strong style={{ color: C.textSecondary }}>#INV-1043</strong></span>
          <span style={{
            display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: 10.5, fontWeight: 700,
            padding: '3px 9px', borderRadius: 99,
            background: saved ? C.successBg : C.bgSubtle, color: saved ? C.successText : C.textMuted,
            border: `1px solid ${saved ? C.successBorder : C.border}`,
            animation: saved ? 'demo-pulse 1.6s ease-out 0.15s infinite' : undefined,
            transition: 'all 0.25s ease',
          }}>
            <span style={{ width: 5, height: 5, borderRadius: '50%', background: saved ? C.success : C.textMuted }} />
            {saved ? 'Paid' : 'Draft'}
          </span>
        </div>
      </div>

      {saved && <Toast message="Invoice #INV-1043 saved · marked Paid" />}
    </div>
  )
}

function StockDemoPage() {
  return (
    <div style={{ position: 'relative', padding: 16, animation: `demo-page-in 0.45s ${EASE} both` }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 12 }}>
        <div>
          <p style={{ fontSize: 16, fontWeight: 800, color: C.textPrimary, letterSpacing: '-0.4px', margin: 0, lineHeight: 1.2 }}>Stock</p>
          <p style={{ fontSize: 11, color: C.textMuted, margin: '1px 0 0' }}>Live inventory — auto-synced with every sale</p>
        </div>
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 10.5, fontWeight: 600, color: C.successText, background: C.successBg, border: `1px solid ${C.successBorder}`, borderRadius: 99, padding: '4px 10px', animation: 'fadeIn 0.3s ease 0.2s both' }}>
          <span style={{ width: 6, height: 6, borderRadius: '50%', background: C.success, animation: 'demo-pulse 1.8s ease-out infinite' }} />
          Synced just now
        </span>
      </div>

      <div data-demo-target="stock-table" style={{ background: C.bgCard, border: `1px solid ${C.border}`, borderRadius: 14, overflow: 'hidden', boxShadow: C.shadowCard, animation: `demo-page-in 0.4s ${EASE} 0.12s both` }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '8px 14px', borderBottom: `1px solid ${C.border}` }}>
          <div style={{ flex: 1, fontSize: 10, fontWeight: 600, letterSpacing: '0.05em', textTransform: 'uppercase', color: C.textMuted }}>Product</div>
          <div style={{ width: 96, fontSize: 10, fontWeight: 600, letterSpacing: '0.05em', textTransform: 'uppercase', color: C.textMuted }}>In Stock</div>
          <div style={{ width: 70, fontSize: 10, fontWeight: 600, letterSpacing: '0.05em', textTransform: 'uppercase', color: C.textMuted }}>Change</div>
          <div style={{ width: 92, fontSize: 10, fontWeight: 600, letterSpacing: '0.05em', textTransform: 'uppercase', color: C.textMuted, textAlign: 'right' }}>Status</div>
        </div>
        {STOCK_ROWS.map((r, i) => {
          const delta = r.to - r.from
          return (
            <div key={r.key} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '8px 14px', borderBottom: i < STOCK_ROWS.length - 1 ? `1px solid ${C.border}` : 'none', animation: `demo-page-in 0.35s ${EASE} ${0.16 + i * 0.08}s both` }}>
              <div style={{ flex: 1, fontSize: 11.5, fontWeight: 600, color: C.textPrimary, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{r.name}</div>
              <div style={{ width: 96, fontSize: 11.5, fontWeight: 700, color: r.low ? C.dangerText : C.textPrimary }}>
                {r.low
                  ? <span>{r.to} {r.unit}</span>
                  : <span><AnimatedNumber from={r.from} to={r.to} delay={350 + i * 160} /> {r.unit}</span>}
              </div>
              <div style={{ width: 70, fontSize: 10.5, fontWeight: 700, color: delta ? C.dangerText : C.textMuted, animation: `fadeIn 0.3s ease ${550 + i * 160}ms both` }}>
                {delta ? `${delta}` : '—'}
              </div>
              <div style={{ width: 92, textAlign: 'right' }}>
                {r.low ? (
                  <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: 10, fontWeight: 700, color: C.dangerText, background: C.dangerBg, border: `1px solid ${C.dangerBorder}`, borderRadius: 99, padding: '2px 8px', animation: `fadeIn 0.3s ease ${550 + i * 160}ms both, demo-pulse-danger 1.6s ease-out 1.1s infinite` }}>
                    <span style={{ width: 5, height: 5, borderRadius: '50%', background: C.danger }} /> Low
                  </span>
                ) : (
                  <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: 10, fontWeight: 600, color: C.successText, background: C.successBg, border: `1px solid ${C.successBorder}`, borderRadius: 99, padding: '2px 8px', animation: `fadeIn 0.3s ease ${550 + i * 160}ms both` }}>
                    <svg width="8" height="8" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}><path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" /></svg>
                    Synced
                  </span>
                )}
              </div>
            </div>
          )
        })}
      </div>

      <p style={{ fontSize: 10.5, color: C.textMuted, margin: '10px 2px 0', animation: 'fadeIn 0.3s ease 0.9s both' }}>
        <strong style={{ color: C.dangerText }}>3</strong> of 86 products below alert threshold
      </p>
    </div>
  )
}

function DashboardPage() {
  return (
    <div style={{ position: 'relative', padding: 16, animation: `demo-page-in 0.45s ${EASE} both` }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 12 }}>
        <div>
          <p style={{ fontSize: 16, fontWeight: 800, color: C.textPrimary, letterSpacing: '-0.4px', margin: 0, lineHeight: 1.2 }}>Dashboard</p>
          <p style={{ fontSize: 11, color: C.textMuted, margin: '1px 0 0' }}>Overview of your business today</p>
        </div>
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 10.5, fontWeight: 600, color: C.textSecondary, background: C.bgCard, border: `1px solid ${C.border}`, borderRadius: 99, padding: '4px 10px', animation: 'fadeIn 0.3s ease 0.15s both' }}>
          <svg width="10" height="10" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M9 17V7m0 10a2 2 0 01-2 2H5a2 2 0 01-2-2V7a2 2 0 012-2h2a2 2 0 012 2m0 10a2 2 0 002 2h2a2 2 0 002-2M9 7a2 2 0 012-2h2a2 2 0 012 2m0 10V5m0 12a2 2 0 002 2h2a2 2 0 002-2v-6a2 2 0 00-2-2h-2a2 2 0 00-2 2" /></svg>
          Today · 13 Aug
        </span>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr 1fr', gap: 10, marginBottom: 12 }}>
        {DASHBOARD_METRICS.map((m, i) => (
          <Metric
            key={m.key}
            label={m.label}
            value={m.value}
            valueStyle={m.valueStyle}
            animate={m.animate ? { ...m.animate, format: m.key === 'rev' ? DASHBOARD_MONEY : undefined } : undefined}
            sub={m.sub}
            subDelay={m.subDelay}
            target={i === 0 ? 'dashboard-revenue' : undefined}
            delay={0.1 + i * 0.05}
          />
        ))}
      </div>

      <div data-demo-target="dashboard-chart" style={{ background: C.bgCard, border: `1px solid ${C.border}`, borderRadius: 14, padding: '12px 14px 10px', boxShadow: C.shadowCard, animation: `demo-page-in 0.4s ${EASE} 0.24s both` }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
          <span style={{ fontSize: 10.5, fontWeight: 700, color: C.textPrimary }}>Revenue · Last 7 Days</span>
          <span style={{ fontSize: 10, fontWeight: 600, color: C.successText, background: C.successBg, border: `1px solid ${C.successBorder}`, borderRadius: 99, padding: '2px 8px', animation: 'fadeIn 0.3s ease 0.5s both' }}>+8.2% vs last week</span>
        </div>
        <div style={{ height: 92 }}>
          <RevenueChart drawDelay={700} />
        </div>
        <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 6, fontSize: 9, color: C.textMuted, fontWeight: 500 }}>
          {['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].map((d) => <span key={d}>{d}</span>)}
        </div>
      </div>

      <div style={{ display: 'flex', gap: 10, marginTop: 12 }}>
        <div style={{ flex: 1, display: 'flex', alignItems: 'center', gap: 8, background: C.bgCard, border: `1px solid ${C.border}`, borderRadius: 12, padding: '8px 12px', boxShadow: C.shadowCard, animation: `demo-page-in 0.4s ${EASE} 0.32s both` }}>
          <svg width="13" height="13" fill="none" viewBox="0 0 24 24" stroke="var(--accent-600)" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M11.049 2.927c.3-.921 1.603-.921 1.902 0l1.519 4.674a1 1 0 00.95.69h4.915c.969 0 1.371 1.24.588 1.81l-3.976 2.888a1 1 0 00-.363 1.118l1.518 4.674c.3.922-.755 1.688-1.538 1.118l-3.976-2.888a1 1 0 00-1.176 0l-3.976 2.888c-.783.57-1.838-.196-1.538-1.118l1.518-4.674a1 1 0 00-.363-1.118L3.977 10.1c-.783-.57-.38-1.81.588-1.81h4.914a1 1 0 00.951-.69l1.519-4.674z" /></svg>
          <span style={{ fontSize: 11, color: C.textSecondary }}><strong style={{ color: C.textPrimary }}>Sunflower Oil 1L</strong> · top seller</span>
        </div>
        <div style={{ flex: 1, display: 'flex', alignItems: 'center', gap: 8, background: C.bgCard, border: `1px solid ${C.border}`, borderRadius: 12, padding: '8px 12px', boxShadow: C.shadowCard, animation: `demo-page-in 0.4s ${EASE} 0.38s both` }}>
          <svg width="13" height="13" fill="none" viewBox="0 0 24 24" stroke={C.dangerText} strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M12 9v2m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
          <span style={{ fontSize: 11, color: C.textSecondary }}><strong style={{ color: C.dangerText }}>5 low-stock</strong> alerts · review stock</span>
        </div>
      </div>
    </div>
  )
}

/* ═══════════════════════════════════════════════════════════════
   Scripted cursor paths (times in seconds, relative to each step start)
   ═══════════════════════════════════════════════════════════════ */
const CUSTOMER_CURSOR = [
  { at: 0.3, target: 'customers-metric' },
  { at: 0.9, target: 'btn-add-customer', hover: 'btn-add-customer' },
  { at: 1.3, target: 'btn-add-customer', click: 'btn-add-customer' },
  { at: 2.0, target: 'customer-name', click: 'customer-name' },
  { at: 2.7, target: 'customer-phone', click: 'customer-phone' },
  { at: 3.4, target: 'customer-email', click: 'customer-email' },
  { at: 4.1, target: 'customer-country', click: 'customer-country' },
  { at: 5.0, target: 'customer-state', click: 'customer-state' },
  { at: 5.7, target: 'customer-tax', click: 'customer-tax' },
  { at: 6.4, target: 'customer-address', click: 'customer-address' },
  { at: 7.5, target: 'btn-save-customer', hover: 'btn-save-customer' },
  { at: 8.0, target: 'btn-save-customer', click: 'btn-save-customer' },
  { at: 9.3, target: 'new-customer-row' },
]

const PRODUCT_CURSOR = [
  { at: 0.35, target: 'nav-products', click: 'nav-products' },
  { at: 0.9, target: 'btn-add-product', hover: 'btn-add-product' },
  { at: 1.4, target: 'btn-add-product', click: 'btn-add-product' },
  { at: 2.1, target: 'product-name', click: 'product-name' },
  { at: 2.8, target: 'product-sell', click: 'product-sell' },
  { at: 3.5, target: 'product-cost', click: 'product-cost' },
  { at: 4.2, target: 'product-mrp', click: 'product-mrp' },
  { at: 4.9, target: 'product-stock', click: 'product-stock' },
  { at: 5.6, target: 'product-category', click: 'product-category' },
  { at: 6.4, target: 'product-unit', click: 'product-unit' },
  { at: 7.1, target: 'product-tax', click: 'product-tax' },
  { at: 7.8, target: 'product-taxcode', click: 'product-taxcode' },
  { at: 8.5, target: 'product-barcode', click: 'product-barcode' },
  { at: 9.55, target: 'btn-create-product', hover: 'btn-create-product' },
  { at: 10.0, target: 'btn-create-product', click: 'btn-create-product' },
  { at: 11.2, target: 'new-product-row' },
]

const SALE_CURSOR = [
  { at: 0.4, target: 'sale-totals' },
  { at: 0.95, target: 'btn-add-item', hover: 'btn-add-item' },
  { at: 1.4, target: 'btn-add-item', click: 'btn-add-item' },
  { at: 2.3, target: 'sale-qty-plus', hover: 'sale-qty-plus' },
  { at: 2.85, target: 'sale-qty-plus', click: 'sale-qty-plus' },
  { at: 3.95, target: 'btn-save-invoice', hover: 'btn-save-invoice' },
  { at: 4.45, target: 'btn-save-invoice', click: 'btn-save-invoice' },
]

const STOCK_CURSOR = [
  { at: 0.6, target: 'stock-table' },
]

const DASHBOARD_CURSOR = [
  { at: 0.5, target: 'dashboard-revenue' },
  { at: 1.3, target: 'dashboard-chart' },
]

/* ═══════════════════════════════════════════════════════════════
   Timeline — the full 6-step loop (~40s). Additive: each step is a
   page + a scripted cursor path.
   ═══════════════════════════════════════════════════════════════ */
const DEMO_STEPS = [
  { id: 'customers', duration: 11.0, nav: 'customers', pageTitle: 'Customers', Page: CustomersDemoPage, cursor: CUSTOMER_CURSOR },
  { id: 'products', duration: 12.5, nav: 'products', pageTitle: 'Products', Page: ProductsDemoPage, cursor: PRODUCT_CURSOR },
  { id: 'sale', duration: 7.5, nav: 'sales', pageTitle: 'Create Sale', Page: SaleDemoPage, cursor: SALE_CURSOR },
  { id: 'stock', duration: 3.0, nav: 'stock', pageTitle: 'Stock', Page: StockDemoPage, cursor: STOCK_CURSOR },
  { id: 'dashboard', duration: 3.6, nav: 'dashboard', pageTitle: 'Dashboard', Page: DashboardPage, cursor: DASHBOARD_CURSOR },
  { id: 'loop-out', duration: 2.2, nav: 'dashboard', pageTitle: 'Dashboard', Page: DashboardPage, cursor: [] },
]

const EYEBROW = {
  display: 'inline-block', fontSize: '0.7rem', fontWeight: 700,
  color: 'var(--accent-600)', letterSpacing: '0.08em', textTransform: 'uppercase',
  padding: '4px 12px', borderRadius: 99,
  background: 'var(--accent-50)', border: '1px solid var(--accent-100)',
}

/* Static fallback — reduced-motion users. */
function StaticPanel() {
  return (
    <section id="demo" data-accent="purple" style={{ padding: '92px 24px 104px', background: 'var(--bg-page)' }}>
      <div style={{ maxWidth: 1100, margin: '0 auto' }}>
        <div style={{ textAlign: 'center', marginBottom: 44 }}>
          <span style={EYEBROW}>See SmartBillr in Action</span>
        </div>
        <div style={{
          background: C.bgCard, border: `1px solid ${C.border}`, borderRadius: 20,
          boxShadow: C.shadowElevated, padding: 28, maxWidth: 860, margin: '0 auto',
        }}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 14, marginBottom: 18 }}>
            {[
              { label: "Today's Revenue", value: '₹30,246', color: '#16A34A' },
              { label: 'Invoices Today', value: '44', color: '#4F46E5' },
              { label: 'Profit Margin', value: '32%', color: '#D97706' },
            ].map((s) => (
              <div key={s.label} style={{ background: C.bgSubtle, border: `1px solid ${C.border}`, borderRadius: 12, padding: '14px 16px' }}>
                <p style={{ fontSize: 10, fontWeight: 600, letterSpacing: '0.06em', textTransform: 'uppercase', color: C.textSecondary, margin: '0 0 6px' }}>{s.label}</p>
                <p style={{ fontSize: 20, fontWeight: 800, color: s.color, margin: 0, letterSpacing: '-0.5px' }}>{s.value}</p>
              </div>
            ))}
          </div>
          <div style={{ background: C.bgSubtle, border: `1px solid ${C.border}`, borderRadius: 12, padding: 16 }}>
            <p style={{ fontSize: 10, fontWeight: 600, letterSpacing: '0.06em', textTransform: 'uppercase', color: C.textSecondary, margin: '0 0 12px' }}>Revenue (This Week)</p>
            <div style={{ display: 'flex', alignItems: 'flex-end', gap: 6, height: 60 }}>
              {[35, 45, 30, 55, 50, 65, 75].map((h, i) => (
                <div key={i} style={{ flex: 1, height: `${h}%`, borderRadius: 4, background: i === 6 ? 'linear-gradient(180deg, #818CF8, #4F46E5)' : 'rgba(99,102,241,0.25)' }} />
              ))}
            </div>
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, marginTop: 16, flexWrap: 'wrap' }}>
            <p style={{ fontSize: 12, color: C.textSecondary, margin: 0 }}><strong style={{ color: C.textPrimary }}>Ravi Kumar</strong> added as a customer</p>
            <p style={{ fontSize: 12, color: C.textSecondary, margin: 0 }}><strong style={{ color: C.textPrimary }}>Basmati Rice 5kg</strong> added · 50 units in stock</p>
            <p style={{ fontSize: 12, color: C.textSecondary, margin: 0 }}>Invoice <strong style={{ color: C.textPrimary }}>#INV-1043</strong> marked Paid · stock synced</p>
          </div>
        </div>
      </div>
    </section>
  )
}

/* ═══════════════════════════════════════════════════════════════
   Main export
   ═══════════════════════════════════════════════════════════════ */
export default function LandingDemo() {
  const reduced = useReducedMotion()
  const vw = useViewportWidth()
  const sectionRef = useRef(null)
  const stageRef = useRef(null)
  const [revealed, setRevealed] = useState(false)
  const [inView, setInView] = useState(false)

  const scale = reduced ? null : Math.min(1, (vw - 48) / 1100)
  const animated = scale !== null
  const started = revealed && animated
  const paused = !inView

  // Start the timeline (from step 0) the first time the section enters the
  // viewport, and pause/resume the RAF loop while it scrolls in and out.
  // Mirrors the IntersectionObserver pattern used in LandingPreview.jsx.
  useEffect(() => {
    if (!animated) return
    const el = sectionRef.current
    if (!el) return
    const observer = new IntersectionObserver(
      (entries) => {
        const entry = entries[0]
        setInView(entry.isIntersecting)
        if (entry.isIntersecting) setRevealed(true)
      },
      { threshold: 0 }
    )
    observer.observe(el)
    return () => observer.disconnect()
  }, [animated])

  const loop = useDemoLoop(DEMO_STEPS, started, paused)

  const step = reduced ? 0 : loop.step
  const cycle = reduced ? 0 : loop.cycle
  const S = DEMO_STEPS[step]
  const stepKey = `${step}-${cycle}`
  const cursor = useDemoCursor(S.cursor, stepKey, stageRef, paused, loop.stepElapsedRef)

  if (scale === null) return <StaticPanel />

  // Loop seam: on the loop-out step the app frame fades out (masking the
  // wrap), then fades back in at the top of the Customers step. Skipped on
  // the first-ever reveal (cycle 0, step 0) so no dark/empty stage ever
  // shows before a visitor has seen any content.
  const frameAnim =
    S.id === 'loop-out'
      ? `demo-frame-out ${S.duration}s ease-in-out forwards`
      : cycle > 0 && step === 0
        ? 'demo-frame-in 0.4s ease-out both'
        : undefined

  return (
    <section id="demo" data-accent="purple" ref={sectionRef} style={{ padding: '92px 24px 104px', background: 'var(--bg-page)' }}>
      <div style={{ maxWidth: 1100, margin: '0 auto' }}>
        <div style={{ textAlign: 'center', marginBottom: 44 }}>
          <span style={EYEBROW}>See SmartBillr in Action</span>
          <p className="sr-only">A scripted, looping walkthrough of SmartBillr: add a customer, add a product, create a sale with live totals, watch inventory sync, then see the dashboard update.</p>
        </div>

        <div style={{ height: (CHROME_H + APP_H) * scale, position: 'relative', margin: '0 auto', maxWidth: 1100 }}>
          <div
            ref={stageRef}
            aria-hidden="true"
            style={{
              position: 'absolute', left: '50%', top: 0, marginLeft: -STAGE_W / 2,
              width: STAGE_W, height: CHROME_H + APP_H,
              transform: `scale(${scale})`, transformOrigin: 'top center',
              background: C.bgCard, borderRadius: 16, border: `1px solid ${C.border}`,
              boxShadow: C.shadowElevated, overflow: 'hidden',
            }}
          >
            {S.id === 'loop-out' && (
              <div style={{ position: 'absolute', inset: 0, zIndex: 5, background: '#0F172A', borderRadius: 16, opacity: 0, animation: 'demo-loopout-bg 2.2s ease-out forwards' }} />
            )}
            <div style={{
              position: 'relative', height: '100%', zIndex: 6,
              transform: S.id === 'loop-out' ? 'scale(0.58)' : 'scale(1)',
              transformOrigin: 'center 62%',
              transition: `transform 1.4s ${EASE}`,
              ...(frameAnim ? { animation: frameAnim } : {}),
            }}>
              <BrowserChrome />
              <div style={{ display: 'flex', height: APP_H }}>
                <DemoSidebar active={S.nav} cursor={cursor} />
                <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', background: C.bgPage, position: 'relative' }}>
                  <DemoTopbar title={S.pageTitle} />
                  <div style={{ flex: 1, minHeight: 0, overflow: 'hidden', position: 'relative' }}>
                    <S.Page key={stepKey} cursor={cursor} />
                  </div>
                </div>
              </div>
            </div>
            <DemoCursor pos={cursor.pos} pressId={cursor.pressId} hidden={S.id === 'loop-out'} />
            {S.id === 'loop-out' && (
              <div style={{ position: 'absolute', inset: 0, zIndex: 8, display: 'flex', alignItems: 'flex-end', justifyContent: 'center', paddingBottom: 42, pointerEvents: 'none', animation: 'demo-loopout-brand 2.2s ease-out forwards' }}>
                <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--accent-300)', letterSpacing: '-0.3px' }}>SmartBillr — billing, inventory &amp; reports in one app</span>
              </div>
            )}
          </div>
        </div>
      </div>
    </section>
  )
}
