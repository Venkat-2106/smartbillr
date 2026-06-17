const previews = [
  {
    label: 'Sales Dashboard',
    gradient: 'linear-gradient(135deg, #4F46E5, #7C3AED)',
    icon: (
      <svg width="24" height="24" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
      </svg>
    ),
  },
  {
    label: 'Inventory Dashboard',
    gradient: 'linear-gradient(135deg, #059669, #10B981)',
    icon: (
      <svg width="24" height="24" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4" />
      </svg>
    ),
  },
  {
    label: 'Customer Management',
    gradient: 'linear-gradient(135deg, #D97706, #F59E0B)',
    icon: (
      <svg width="24" height="24" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197M13 7a4 4 0 11-8 0 4 4 0 018 0z" />
      </svg>
    ),
  },
  {
    label: 'Invoice Management',
    gradient: 'linear-gradient(135deg, #2563EB, #3B82F6)',
    icon: (
      <svg width="24" height="24" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
      </svg>
    ),
  },
]

export default function LandingPreview() {
  return (
    <section
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
            Product Preview
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
            Powerful dashboards at your fingertips
          </h2>
          <p
            style={{
              fontSize: '0.92rem',
              color: 'var(--text-secondary)',
              maxWidth: 520,
              margin: '0 auto',
              lineHeight: 1.7,
            }}
          >
            Beautiful, intuitive interfaces designed to give you complete control over every aspect of your business.
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
                    margin: '0 0 4px',
                  }}
                >
                  {item.label}
                </h3>
                <p
                  style={{
                    fontSize: '0.75rem',
                    color: 'var(--text-muted)',
                    margin: 0,
                  }}
                >
                  Real-time data &amp; insights
                </p>
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  )
}
