// src/shared/components/Spinner.jsx
//
// A centered loading spinner.
// Used as a full-page loader OR inline inside cards/tables while data loads.
//
// Props:
//   size      → number (px). Default 32.
//   center    → if true, wraps in a centered flex container (for full-page use)
//   label     → optional text shown below the spinner
//   color     → CSS color string. Default: var(--accent-600)

export default function Spinner({
  size = 32,
  center = false,
  label,
  color = 'var(--accent-600)',
}) {
  const spinner = (
    <>
      <style>{`
        @keyframes spin-dash {
          0%   { stroke-dashoffset: 56; transform: rotate(0deg); }
          50%  { stroke-dashoffset: 14; }
          100% { stroke-dashoffset: 56; transform: rotate(360deg); }
        }
        @keyframes spin-rot {
          to { transform: rotate(360deg); }
        }
        .sb-spinner-ring {
          transform-origin: center;
          animation: spin-rot 0.9s linear infinite;
        }
        .sb-spinner-arc {
          transform-origin: center;
          animation: spin-dash 1.4s ease-in-out infinite;
        }
      `}</style>

      <svg
        width={size}
        height={size}
        viewBox="0 0 40 40"
        fill="none"
        aria-label="Loading"
        role="status"
      >
        {/* Track ring */}
        <circle
          cx="20" cy="20" r="16"
          stroke={color}
          strokeOpacity="0.15"
          strokeWidth="3.5"
        />
        {/* Animated arc */}
        <circle
          cx="20" cy="20" r="16"
          stroke={color}
          strokeWidth="3.5"
          strokeLinecap="round"
          strokeDasharray="56"
          strokeDashoffset="42"
          className="sb-spinner-ring"
        />
      </svg>

      {label && (
        <p style={{
          margin: '10px 0 0',
          fontSize: 13,
          fontWeight: 500,
          color: 'var(--text-muted)',
          fontFamily: 'var(--font-sans, "Plus Jakarta Sans", sans-serif)',
        }}>
          {label}
        </p>
      )}
    </>
  )

  if (center) {
    return (
      <div style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '64px 0',
        width: '100%',
      }}>
        {spinner}
      </div>
    )
  }

  return spinner
}
