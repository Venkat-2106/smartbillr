const highlights = [
  { text: 'Fast and easy to use' },
  { text: 'Modern UI with dark mode' },
  { text: 'Secure authentication & RBAC' },
  { text: 'Interactive dashboards & 12 reports' },
  { text: 'Inventory automation & alerts' },
  { text: 'Scalable cloud architecture' },
  { text: 'Mobile-friendly experience' },
]

export default function LandingWhy() {
  return (
    <section
      id="about"
      style={{
        padding: '96px 24px',
        background: 'color-mix(in srgb, var(--accent-500) 4%, var(--bg-page))',
        borderTop: '1px solid var(--border)',
        borderBottom: '1px solid var(--border)',
      }}
    >
      <div
        className="landing-why-inner"
        style={{
          maxWidth: 1200,
          margin: '0 auto',
          display: 'grid',
          gridTemplateColumns: '1fr 1fr',
          gap: 60,
          alignItems: 'center',
        }}
      >
        {/* Left side */}
        <div>
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
            Why SmartBillr
          </span>
          <h2
            style={{
              fontSize: '2.2rem',
              fontWeight: 800,
              color: 'var(--text-primary)',
              letterSpacing: '-0.8px',
              margin: '0 0 16px',
              lineHeight: 1.15,
            }}
          >
            Built for modern<br />
            <span
              style={{
                background: 'linear-gradient(135deg, var(--accent-500), var(--accent-400))',
                WebkitBackgroundClip: 'text',
                WebkitTextFillColor: 'transparent',
                backgroundClip: 'text',
              }}
            >
              businesses of all sizes
            </span>
          </h2>
          <p
            style={{
              fontSize: '0.92rem',
              color: 'var(--text-secondary)',
              lineHeight: 1.7,
              margin: '0',
              maxWidth: 480,
            }}
          >
            SmartBillr combines powerful billing, inventory, and analytics tools into one seamless platform. Designed for efficiency, built for growth.
          </p>
        </div>

        {/* Right side - highlight list */}
        <div
          className="landing-why-list"
          style={{
            display: 'grid',
            gridTemplateColumns: '1fr 1fr',
            gap: 14,
          }}
        >
          {highlights.map((item, i) => (
            <div
              key={item.text}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 12,
                padding: '14px 18px',
                background: 'var(--bg-card)',
                border: '1px solid var(--border)',
                borderRadius: 14,
                animation: 'fadeUp 0.4s cubic-bezier(0.16,1,0.3,1) both',
                animationDelay: `${i * 60}ms`,
              }}
            >
              <div
                style={{
                  width: 24,
                  height: 24,
                  borderRadius: '50%',
                  background: 'color-mix(in srgb, var(--accent-500) 14%, transparent)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  flexShrink: 0,
                }}
              >
                <svg width="12" height="12" fill="none" viewBox="0 0 24 24" stroke="var(--accent-500)" strokeWidth={3} strokeLinecap="round" strokeLinejoin="round">
                  <path d="M20 6L9 17l-5-5" />
                </svg>
              </div>
              <span
                style={{
                  fontSize: '0.82rem',
                  fontWeight: 600,
                  color: 'var(--text-primary)',
                }}
              >
                {item.text}
              </span>
            </div>
          ))}
        </div>
      </div>
    </section>
  )
}
