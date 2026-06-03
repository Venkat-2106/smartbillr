// src/shared/components/SkeletonTable.jsx
//
// Animated skeleton placeholder for table loading states.
// Renders rows of shimmering gray bars that match the rough
// shape of the real table — prevents layout shift and looks
// more polished than a spinner.
//
// Props:
//   rows    → number of skeleton rows to show (default: 5)
//   columns → number of columns to render (default: 6)

export default function SkeletonTable({ rows = 5, columns = 6 }) {
  // Column width distribution: first col wider (name/ID), last col narrower (date/action)
  const colWidths = Array.from({ length: columns }, (_, i) => {
    if (i === 0) return '15%';
    if (i === columns - 1) return '10%';
    return `${Math.floor(75 / (columns - 2))}%`;
  });

  return (
    <div style={{ padding: '0 0 8px 0', overflowX: 'auto' }}>
      <table style={{ width: '100%', borderCollapse: 'collapse' }}>
        {/* Fake header row */}
        <thead>
          <tr>
            {colWidths.map((w, ci) => (
              <th
                key={ci}
                style={{
                  padding: '14px 16px',
                  width: w,
                  textAlign: 'left',
                  background: 'var(--bg-page)',
                  borderBottom: '1px solid var(--border)',
                }}
              >
                <div style={{
                  height: 11,
                  width: '55%',
                  borderRadius: 6,
                  background: 'var(--border)',
                  animation: 'skeleton-pulse 1.4s ease-in-out infinite',
                }} />
              </th>
            ))}
          </tr>
        </thead>

        {/* Fake data rows */}
        <tbody>
          {Array.from({ length: rows }, (_, ri) => (
            <tr key={ri} style={{ borderBottom: '1px solid var(--border)' }}>
              {colWidths.map((w, ci) => (
                <td key={ci} style={{ padding: '15px 16px', width: w }}>
                  <div style={{
                    height: 13,
                    // Vary width slightly per cell so it looks natural
                    width: `${55 + ((ri * 7 + ci * 13) % 35)}%`,
                    borderRadius: 7,
                    background: 'var(--border)',
                    opacity: 0.7 + (ci % 3) * 0.1,
                    // Stagger animation delay per row so rows pulse in a wave
                    animation: `skeleton-pulse 1.4s ease-in-out ${ri * 80}ms infinite`,
                  }} />
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>

      {/* Keyframe lives here so no global CSS change needed */}
      <style>{`
        @keyframes skeleton-pulse {
          0%, 100% { opacity: 0.5; }
          50%       { opacity: 1;   }
        }
      `}</style>
    </div>
  );
}
