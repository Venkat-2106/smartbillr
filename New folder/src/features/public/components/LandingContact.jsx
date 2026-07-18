const contacts = [
  {
    icon: (
      <svg width="22" height="22" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
      </svg>
    ),
    label: 'Email',
    value: 'smartbillr.support@gmail.com',
    href: 'mailto:smartbillr.support@gmail.com',
    accent: '#818CF8',
    badge: 'We reply within 4 hrs',
  },
  {
    icon: (
      <svg width="22" height="22" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z" />
      </svg>
    ),
    label: 'Phone / WhatsApp',
    value: '+91 8754120458',
    href: 'https://wa.me/918754120458',
    accent: '#22C55E',
    badge: '24/7 Support',
  },
  {
    icon: (
      <svg width="22" height="22" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
        <path strokeLinecap="round" strokeLinejoin="round" d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
      </svg>
    ),
    label: 'Location',
    value: 'Chennai, Tamil Nadu, India',
    accent: '#F59E0B',
  },
]

export default function LandingContact() {
  return (
    <section
      id="contact"
      style={{
        padding: '96px 24px',
        background: 'var(--bg-page)',
      }}
    >
      <div style={{ maxWidth: 1200, margin: '0 auto' }}>
        {/* Motivational banner */}
        <div
          style={{
            maxWidth: 800,
            margin: '0 auto 56px',
            textAlign: 'center',
          }}
        >
          <div
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 8,
              padding: '6px 16px',
              borderRadius: 99,
              background: 'color-mix(in srgb, var(--accent-500) 10%, transparent)',
              border: '1px solid color-mix(in srgb, var(--accent-500) 18%, transparent)',
              marginBottom: 20,
            }}
          >
            <svg width="14" height="14" fill="none" viewBox="0 0 24 24" stroke="var(--accent-500)" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            <span
              style={{
                fontSize: '0.72rem',
                color: 'var(--accent-500)',
                fontWeight: 700,
                letterSpacing: '0.04em',
              }}
            >
              24/7 Support &middot; WhatsApp Enabled
            </span>
          </div>

          <h2
            style={{
              fontSize: '2.2rem',
              fontWeight: 800,
              color: 'var(--text-primary)',
              letterSpacing: '-0.8px',
              margin: '0 0 16px',
            }}
          >
            Ready to transform your business?
          </h2>
          <p
            style={{
              fontSize: '1rem',
              color: 'var(--text-secondary)',
              maxWidth: 560,
              margin: '0 auto 8px',
              lineHeight: 1.7,
            }}
          >
            SmartBillr is a premium paid platform built for serious businesses. Reach out to us and we'll help you get started with a personalized onboarding experience.
          </p>
          <p
            style={{
              fontSize: '0.88rem',
              color: 'var(--text-muted)',
              maxWidth: 500,
              margin: '0 auto',
              lineHeight: 1.6,
            }}
          >
            Whether you have questions about pricing, features, or need a custom demo &mdash; our team is just one message away.
          </p>
        </div>

        {/* Contact cards */}
        <div
          className="landing-contact-grid"
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(3, 1fr)',
            gap: 20,
            maxWidth: 900,
            margin: '0 auto',
          }}
        >
          {contacts.map((item) => (
            <div
              key={item.label}
              className="card-hover"
              style={{
                background: 'var(--bg-card)',
                border: '1px solid var(--border)',
                borderRadius: 18,
                padding: 32,
                textAlign: 'center',
                transition: 'all 0.25s cubic-bezier(0.16,1,0.3,1)',
              }}
            >
              <div
                style={{
                  width: 52,
                  height: 52,
                  borderRadius: 16,
                  background: `color-mix(in srgb, ${item.accent} 12%, transparent)`,
                  color: item.accent,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  margin: '0 auto 18px',
                }}
              >
                {item.icon}
              </div>
              <h3
                style={{
                  fontSize: '0.85rem',
                  fontWeight: 700,
                  color: 'var(--text-primary)',
                  margin: '0 0 6px',
                }}
              >
                {item.label}
              </h3>
              {item.href ? (
                <a
                  href={item.href}
                  target={item.href.startsWith('http') ? '_blank' : undefined}
                  rel={item.href.startsWith('http') ? 'noopener noreferrer' : undefined}
                  style={{
                    fontSize: '0.82rem',
                    color: 'var(--accent-500)',
                    textDecoration: 'none',
                    fontWeight: 500,
                    wordBreak: 'break-all',
                    transition: 'color 0.16s ease',
                  }}
                  onMouseEnter={(e) => { e.currentTarget.style.color = 'var(--accent-700)' }}
                  onMouseLeave={(e) => { e.currentTarget.style.color = 'var(--accent-500)' }}
                >
                  {item.value}
                </a>
              ) : (
                <p style={{ fontSize: '0.82rem', color: 'var(--text-secondary)', margin: 0 }}>
                  {item.value}
                </p>
              )}
              {item.badge && (
                <div
                  style={{
                    display: 'inline-block',
                    marginTop: 10,
                    padding: '3px 10px',
                    borderRadius: 99,
                    background: `color-mix(in srgb, ${item.accent} 10%, transparent)`,
                    color: item.accent,
                    fontSize: '0.65rem',
                    fontWeight: 600,
                    letterSpacing: '0.02em',
                  }}
                >
                  {item.badge}
                </div>
              )}
            </div>
          ))}
        </div>
      </div>
    </section>
  )
}
