import { useNavigate } from 'react-router-dom'

const linkHov = {
  fontSize: '0.78rem',
  color: '#64748B',
  cursor: 'pointer',
  background: 'none',
  border: 'none',
  fontFamily: 'inherit',
  padding: '3px 0',
  transition: 'color 0.16s ease',
  textAlign: 'left',
}

export default function LandingFooter() {
  const navigate = useNavigate()

  return (
    <footer
      style={{
        background: '#0B0F1A',
        borderTop: '1px solid rgba(255,255,255,0.05)',
      }}
    >
      <div
        className="landing-footer-grid"
        style={{
          maxWidth: 1200,
          margin: '0 auto',
          padding: '64px 24px 40px',
          display: 'grid',
          gridTemplateColumns: '2fr 1fr 1fr 1.5fr',
          gap: 40,
        }}
      >
        {/* Brand column */}
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 11, marginBottom: 16 }}>
            <div
              style={{
                width: 32,
                height: 32,
                borderRadius: 9,
                background: 'linear-gradient(135deg, var(--accent-600, #4F46E5), var(--accent-500, #6366F1))',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                boxShadow: '0 3px 12px rgba(79,70,229,0.4)',
                flexShrink: 0,
              }}
            >
              <svg width="15" height="15" fill="none" viewBox="0 0 24 24" stroke="white" strokeWidth={2.2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
              </svg>
            </div>
            <span style={{ fontSize: '1.15rem', fontWeight: 800, letterSpacing: '-0.6px', color: '#F8FAFC' }}>
              Smart<span style={{ color: 'var(--accent-400, #818CF8)' }}>Billr</span>
            </span>
          </div>
          <p style={{ fontSize: '0.78rem', color: '#64748B', lineHeight: 1.7, maxWidth: 300, margin: 0 }}>
            All-in-one billing, inventory, and business management platform designed for modern businesses.
          </p>
        </div>

        {/* Quick Links */}
        <div>
          <h4 style={{ fontSize: '0.72rem', fontWeight: 700, color: '#94A3B8', letterSpacing: '0.08em', textTransform: 'uppercase', margin: '0 0 16px' }}>
            Quick Links
          </h4>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {[
              { label: 'Features', target: 'features' },
              { label: 'About', target: 'about' },
              { label: 'Contact', target: 'contact' },
            ].map((item) => (
              <button
                key={item.label}
                onClick={() => {
                  const el = document.getElementById(item.target)
                  if (el) el.scrollIntoView({ behavior: 'smooth' })
                }}
                style={linkHov}
                onMouseEnter={(e) => { e.currentTarget.style.color = '#CBD5E1' }}
                onMouseLeave={(e) => { e.currentTarget.style.color = '#64748B' }}
              >
                {item.label}
              </button>
            ))}
          </div>
        </div>

        {/* Product */}
        <div>
          <h4 style={{ fontSize: '0.72rem', fontWeight: 700, color: '#94A3B8', letterSpacing: '0.08em', textTransform: 'uppercase', margin: '0 0 16px' }}>
            Product
          </h4>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {['Invoicing', 'Inventory', 'Dashboard', 'Analytics'].map((label) => (
              <button
                key={label}
                onClick={() => {
                  const el = document.getElementById('features')
                  if (el) el.scrollIntoView({ behavior: 'smooth' })
                }}
                style={linkHov}
                onMouseEnter={(e) => { e.currentTarget.style.color = '#CBD5E1' }}
                onMouseLeave={(e) => { e.currentTarget.style.color = '#64748B' }}
              >
                {label}
              </button>
            ))}
          </div>
        </div>

        {/* Contact */}
        <div>
          <h4 style={{ fontSize: '0.72rem', fontWeight: 700, color: '#94A3B8', letterSpacing: '0.08em', textTransform: 'uppercase', margin: '0 0 16px' }}>
            Contact
          </h4>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            <p style={{ fontSize: '0.78rem', color: '#64748B', margin: 0, lineHeight: 1.6 }}>
              <span style={{ color: '#94A3B8' }}>Email:</span><br />
              smartbillr.support@gmail.com
            </p>
            <p style={{ fontSize: '0.78rem', color: '#64748B', margin: 0, lineHeight: 1.6 }}>
              <span style={{ color: '#94A3B8' }}>Phone:</span><br />
              +91 8754120458
            </p>
            <p style={{ fontSize: '0.78rem', color: '#64748B', margin: 0, lineHeight: 1.6 }}>
              <span style={{ color: '#94A3B8' }}>Location:</span><br />
              Chennai, Tamil Nadu, India
            </p>
          </div>
        </div>
      </div>

      {/* Copyright bar */}
      <div
        style={{
          borderTop: '1px solid rgba(255,255,255,0.05)',
          padding: '20px 24px',
          textAlign: 'center',
        }}
      >
        <p style={{ fontSize: '0.72rem', color: '#475569', margin: 0 }}>
          &copy; 2026 SmartBillr. All Rights Reserved.
        </p>
      </div>
    </footer>
  )
}
