// src/shared/components/Spinner.jsx
//
// Replaces the generic rotating circle with the SmartBillr brand mark.
//
// SIZE HANDLING:
//   Numeric px  → used directly (e.g. size={28})
//   "sm"        → 20px
//   "md"        → 28px
//   "lg"        → 48px
//
// SMALL sizes (< 20px, e.g. inside Button loading state):
//   Shows three pulsing dots — logo mark would be illegible at that size.
//
// LARGE sizes (≥ 20px, e.g. page loader, drawer loader):
//   Shows the SB logo mark with a gentle breathing pulse.
//
// Props (unchanged — all existing callers work without modification):
//   size    → number or "sm" | "md" | "lg". Default 32.
//   center  → wraps in centered flex container for full-page use.
//   label   → optional text shown below the mark.
//   color   → unused (kept for API compatibility — mark always uses accent).

export default function Spinner({
  size  = 32,
  center = false,
  label,
  color,          // kept for API compat, not used in logo mark
}) {
  // Normalise string sizes to px numbers
  const SIZE_MAP = { sm: 20, md: 28, lg: 48 }
  const px = typeof size === 'string' ? (SIZE_MAP[size] ?? 32) : size

  const content = px < 20
    // ── Tiny inline loader (inside buttons) ──────────────────────────────
    ? <TinyDots size={px} />
    // ── Brand mark loader (page / drawer / card level) ───────────────────
    : <LogoMark px={px} label={label} />

  if (center) {
    return (
      <div style={{
        display:        'flex',
        flexDirection:  'column',
        alignItems:     'center',
        justifyContent: 'center',
        padding:        '64px 0',
        width:          '100%',
      }}>
        {content}
      </div>
    )
  }

  return content
}

/* ─── SmartBillr logo mark with breathing pulse ─────────────────────────── */
function LogoMark({ px, label }) {
  const radius   = Math.round(px * 0.26)     // corner radius scales with size
  const fontSize = Math.max(9, Math.round(px * 0.34))

  return (
    <>
      <style>{`
        @keyframes sb-breathe {
          0%, 100% { opacity: 1;   transform: scale(1);    }
          50%       { opacity: 0.55; transform: scale(0.91); }
        }
        .sb-logo-loader {
          animation: sb-breathe 1.7s ease-in-out infinite;
          transform-origin: center;
        }
      `}</style>

      <div
        className="sb-logo-loader"
        style={{
          width:           px,
          height:          px,
          borderRadius:    radius,
          background:      'var(--accent-600)',
          display:         'flex',
          alignItems:      'center',
          justifyContent:  'center',
          flexShrink:      0,
          userSelect:      'none',
        }}
      >
        <span style={{
          color:       '#fff',
          fontWeight:  800,
          fontSize:    fontSize,
          letterSpacing: '-0.5px',
          fontFamily:  "'Plus Jakarta Sans', sans-serif",
          lineHeight:  1,
        }}>
          SB
        </span>
      </div>

      {label && (
        <p style={{
          margin:     '12px 0 0',
          fontSize:   13,
          fontWeight: 500,
          color:      'var(--text-muted)',
          fontFamily: "'Plus Jakarta Sans', sans-serif",
        }}>
          {label}
        </p>
      )}
    </>
  )
}

/* ─── Three pulsing dots (used inside buttons at small sizes) ────────────── */
function TinyDots({ size }) {
  const dot = Math.max(3, Math.round(size * 0.28))
  return (
    <>
      <style>{`
        @keyframes sb-dot-pulse {
          0%, 80%, 100% { opacity: 0.2; transform: scale(0.7); }
          40%            { opacity: 1;   transform: scale(1);   }
        }
        .sb-dot { border-radius: 50%; background: currentColor; display: inline-block; }
        .sb-dot:nth-child(1) { animation: sb-dot-pulse 1.1s ease-in-out infinite 0s;    }
        .sb-dot:nth-child(2) { animation: sb-dot-pulse 1.1s ease-in-out infinite 0.18s; }
        .sb-dot:nth-child(3) { animation: sb-dot-pulse 1.1s ease-in-out infinite 0.36s; }
      `}</style>
      <span style={{ display: 'inline-flex', alignItems: 'center', gap: dot, lineHeight: 1 }}>
        <span className="sb-dot" style={{ width: dot, height: dot }} />
        <span className="sb-dot" style={{ width: dot, height: dot }} />
        <span className="sb-dot" style={{ width: dot, height: dot }} />
      </span>
    </>
  )
}