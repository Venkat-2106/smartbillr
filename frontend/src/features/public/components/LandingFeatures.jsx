const features = [
  {
    icon: (
      <svg width="22" height="22" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
      </svg>
    ),
    title: 'Invoice Management',
    desc: 'Create professional invoices instantly with GST/VAT support and automated numbering.',
    accent: '#818CF8',
  },
  {
    icon: (
      <svg width="22" height="22" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4" />
      </svg>
    ),
    title: 'Inventory Tracking',
    desc: 'Monitor stock levels across all warehouses with real-time low-stock alerts.',
    accent: '#22C55E',
  },
  {
    icon: (
      <svg width="22" height="22" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197M13 7a4 4 0 11-8 0 4 4 0 018 0z" />
      </svg>
    ),
    title: 'Customer Management',
    desc: 'Maintain detailed customer profiles with purchase history and communication logs.',
    accent: '#F59E0B',
  },
  {
    icon: (
      <svg width="22" height="22" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" />
      </svg>
    ),
    title: 'Supplier Management',
    desc: 'Organize supplier records, track purchase activities, and manage vendor relationships.',
    accent: '#10B981',
  },
  {
    icon: (
      <svg width="22" height="22" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
      </svg>
    ),
    title: 'Expense Tracking',
    desc: 'Track and categorize business expenses with detailed reports and tax-ready summaries.',
    accent: '#EF4444',
  },
  {
    icon: (
      <svg width="22" height="22" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
      </svg>
    ),
    title: 'Business Dashboard',
    desc: 'Real-time KPIs and business insights with interactive charts and revenue analytics.',
    accent: '#3B82F6',
  },
  {
    icon: (
      <svg width="22" height="22" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M3.055 11H5a2 2 0 012 2v1a2 2 0 002 2 2 2 0 012 2v2.945M8 3.935V5.5A2.5 2.5 0 0010.5 8h.5a2 2 0 012 2 2 2 0 104 0 2 2 0 012-2h1.064M15 20.488V18a2 2 0 012-2h3.064M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
      </svg>
    ),
    title: 'Multi-Tenant Architecture',
    desc: 'Secure data isolation for each business with dedicated database partitioning and encryption.',
    accent: '#8B5CF6',
  },
  {
    icon: (
      <svg width="22" height="22" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
      </svg>
    ),
    title: 'Role-Based Access Control',
    desc: 'Granular permissions for staff roles ensuring secure and controlled platform access.',
    accent: '#F472B6',
  },
]

export default function LandingFeatures() {
  return (
    <section
      id="features"
      style={{
        padding: '96px 24px',
        background: 'var(--bg-page)',
      }}
    >
      <div style={{ maxWidth: 1200, margin: '0 auto' }}>
        {/* Section header */}
        <div style={{ textAlign: 'center', marginBottom: 64 }}>
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
            Platform Features
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
            Everything you need to run your business
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
            From invoicing to inventory, SmartBillr provides all the tools to manage and grow your business efficiently.
          </p>
        </div>

        {/* Feature cards grid */}
        <div
          className="landing-features-grid"
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(4, 1fr)',
            gap: 20,
          }}
        >
          {features.map((feature, i) => (
            <div
              key={feature.title}
              className="card-hover"
              style={{
                background: 'var(--bg-card)',
                border: '1px solid var(--border)',
                borderRadius: 18,
                padding: 28,
                transition: 'all 0.25s cubic-bezier(0.16,1,0.3,1)',
                animation: 'fadeUp 0.5s cubic-bezier(0.16,1,0.3,1) both',
                animationDelay: `${i * 60}ms`,
              }}
            >
              <div
                style={{
                  width: 44,
                  height: 44,
                  borderRadius: 13,
                  background: `color-mix(in srgb, ${feature.accent} 12%, transparent)`,
                  color: feature.accent,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  marginBottom: 18,
                }}
              >
                {feature.icon}
              </div>
              <h3
                style={{
                  fontSize: '0.92rem',
                  fontWeight: 700,
                  color: 'var(--text-primary)',
                  margin: '0 0 8px',
                  letterSpacing: '-0.2px',
                }}
              >
                {feature.title}
              </h3>
              <p
                style={{
                  fontSize: '0.78rem',
                  color: 'var(--text-secondary)',
                  lineHeight: 1.6,
                  margin: 0,
                }}
              >
                {feature.desc}
              </p>
            </div>
          ))}
        </div>
      </div>
    </section>
  )
}
