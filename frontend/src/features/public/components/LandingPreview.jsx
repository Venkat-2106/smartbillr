const previews = [
  {
    label: 'Interactive Reports',
    gradient: 'linear-gradient(135deg, #4F46E5, #7C3AED)',
    icon: (
      <svg width="24" height="24" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
      </svg>
    ),
    features: ['12 report categories', 'Sales, purchases, inventory & more', 'Server-side aggregation', 'Role-based data gating'],
  },
  {
    label: 'Rich Visualizations',
    gradient: 'linear-gradient(135deg, #059669, #10B981)',
    icon: (
      <svg width="24" height="24" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M7 12l3-3 3 3 4-4M8 21l4-4 4 4M3 4h18M4 4h16v12a1 1 0 01-1 1H5a1 1 0 01-1-1V4z" />
      </svg>
    ),
    features: ['SVG line, bar & donut charts', 'Gradient fills & glow effects', 'Responsive scaling', 'Zero-fill time series'],
  },
  {
    label: 'Date Range Filtering',
    gradient: 'linear-gradient(135deg, #D97706, #F59E0B)',
    icon: (
      <svg width="24" height="24" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
      </svg>
    ),
    features: ['Today, Week, Month, Quarter, Year', 'Custom date range picker', 'Period toggles (weekly/monthly/yearly)', 'All Time view'],
  },
  {
    label: 'Export & Print Ready',
    gradient: 'linear-gradient(135deg, #2563EB, #3B82F6)',
    icon: (
      <svg width="24" height="24" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
      </svg>
    ),
    features: ['PDF & Excel download', 'Print-optimized layouts', 'Live data snapshots', 'Cached for fast reloads'],
  },
]

export default function LandingPreview() {
  return (
    <section
      id="dashboards"
      style={{
        padding: '96px 24px',
        background: 'var(--bg-page)',
      }}
    >
      <div style={{ maxWidth: 1200, margin: '0 auto' }}>
        <div style={{ textAlign: 'center', marginBottom: 56 }}>
          <span
            style={{
              display: 'inline-block',
              padding: '4px 14px',
              borderRadius: 99,
              background: 'color-mix(in srgb, var(--accent-500) 10%, transparent)',
              color: 'var(--accent-500)',
              fontSize: '0.72rem',
              fontWeight: 700,
              letterSpacing: '0.06em',
              textTransform: 'uppercase',
              marginBottom: 16,
              border: '1px solid color-mix(in srgb, var(--accent-500) 18%, transparent)',
            }}
          >
            Interactive Dashboards
          </span>
          <h2
            style={{
              fontSize: '2.2rem',
              fontWeight: 800,
              color: 'var(--text-primary)',
              letterSpacing: '-0.8px',
              margin: '0 0 12px',
            }}
          >
            Real-time reporting at your fingertips
          </h2>
          <p
            style={{
              fontSize: '0.92rem',
              color: 'var(--text-secondary)',
              maxWidth: 560,
              margin: '0 auto',
              lineHeight: 1.7,
            }}
          >
            Explore 12 comprehensive report categories with interactive charts, smart date filters, and one-click export. Every metric is aggregated server-side for accuracy at any scale.
          </p>
        </div>

        <div
          className="landing-preview-grid"
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(4, 1fr)',
            gap: 20,
          }}
        >
          {previews.map((item, i) => (
            <div
              key={item.label}
              className="card-hover"
              style={{
                background: 'var(--bg-card)',
                border: '1px solid var(--border)',
                borderRadius: 18,
                overflow: 'hidden',
                animation: 'fadeUp 0.5s cubic-bezier(0.16,1,0.3,1) both',
                animationDelay: `${i * 80}ms`,
              }}
            >
              {/* Gradient header */}
              <div
                style={{
                  background: item.gradient,
                  padding: '32px 24px',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  minHeight: 140,
                }}
              >
                <div
                  style={{
                    width: 56,
                    height: 56,
                    borderRadius: 16,
                    background: 'rgba(255,255,255,0.15)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    color: '#fff',
                    backdropFilter: 'blur(4px)',
                  }}
                >
                  {item.icon}
                </div>
              </div>

              {/* Body */}
              <div style={{ padding: '18px 20px 20px' }}>
                <h3
                  style={{
                    fontSize: '0.92rem',
                    fontWeight: 700,
                    color: 'var(--text-primary)',
                    margin: '0 0 10px',
                  }}
                >
                  {item.label}
                </h3>
                <ul style={{ listStyle: 'none', margin: 0, padding: 0 }}>
                  {item.features.map((f, fi) => (
                    <li
                      key={fi}
                      style={{
                        fontSize: '0.75rem',
                        color: 'var(--text-muted)',
                        padding: '3px 0',
                        display: 'flex',
                        alignItems: 'center',
                        gap: 6,
                      }}
                    >
                      <span style={{ color: item.gradient.includes('4F46E5') ? '#818CF8' : item.gradient.includes('059669') ? '#34D399' : item.gradient.includes('D97706') ? '#FBBF24' : '#60A5FA', fontSize: '0.65rem' }}>●</span>
                      {f}
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  )
}
