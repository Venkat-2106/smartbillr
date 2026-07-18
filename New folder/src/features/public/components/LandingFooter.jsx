import { useNavigate } from 'react-router-dom'

export default function LandingFooter() {
  const navigate = useNavigate()

  return (
    <footer style={{
      background: '#0B0F1A',
      borderTop: '1px solid rgba(255,255,255,0.05)',
    }}>
      <div className="landing-footer-grid" style={{
        maxWidth: 1200, margin: '0 auto',
        padding: '64px 24px 40px',
        display: 'grid',
        gridTemplateColumns: '2fr 1fr 1fr 1.5fr',
        gap: 40,
      }}>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 11, marginBottom: 16 }}>
            <div style={{
              width: 32, height: 32, borderRadius: 9,
              background: 'linear-gradient(135deg, var(--accent-600, #4F46E5), var(--accent-500, #6366F1))',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              boxShadow: '0 3px 12px rgba(79,70,229,0.4)',
              flexShrink: 0,
            }}>
              <svg width="15" height="15" fill="none" viewBox="0 0 24 24" stroke="white" strokeWidth={2.2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
              </svg>
            </div>
            <span style={{ fontSize: '1.15rem', fontWeight: 800, letterSpacing: '-0.6px', color: '#F8FAFC' }}>
              Smart<span style={{ color: 'var(--accent-400, #818CF8)' }}>Billr</span>
            </span>
          </div>
          <p style={{ fontSize: '0.78rem', color: '#64748B', lineHeight: 1.7, maxWidth: 300, margin: '0 0 20px' }}>
            All-in-one billing, inventory, and business management platform designed for modern businesses.
          </p>
          <div style={{ display: 'flex', gap: 12 }}>
            {[
              { path: 'M22 12c0-5.523-4.477-10-10-10S2 6.477 2 12c0 4.991 3.657 9.128 8.438 9.878v-6.987h-2.54V12h2.54V9.797c0-2.506 1.492-3.89 3.777-3.89 1.094 0 2.238.195 2.238.195v2.46h-1.26c-1.243 0-1.63.771-1.63 1.562V12h2.773l-.443 2.89h-2.33v6.988C18.343 21.128 22 16.991 22 12z', color: '#1877F2' },
              { path: 'M23 3a10.9 10.9 0 01-3.14 1.53 4.48 4.48 0 00-7.86 3v1A10.66 10.66 0 013 4s-4 9 5 13a11.64 11.64 0 01-7 2c9 5 20 0 20-11.5a4.5 4.5 0 00-.08-.83A7.72 7.72 0 0023 3z', color: '#1DA1F2' },
            ].map((social, i) => (
              <a key={i} href="#" aria-label="Social media"
                style={{ width: 34, height: 34, borderRadius: 8, background: 'rgba(255,255,255,0.06)', display: 'flex', alignItems: 'center', justifyContent: 'center', transition: 'background 0.16s' }}
                onMouseEnter={(e) => e.currentTarget.style.background = 'rgba(255,255,255,0.1)'}
                onMouseLeave={(e) => e.currentTarget.style.background = 'rgba(255,255,255,0.06)'}
              >
                <svg width="14" height="14" fill={social.color} viewBox="0 0 24 24">
                  <path d={social.path} />
                </svg>
              </a>
            ))}
          </div>
        </div>

        <div>
          <h4 style={{ fontSize: '0.72rem', fontWeight: 700, color: '#94A3B8', letterSpacing: '0.08em', textTransform: 'uppercase', margin: '0 0 16px' }}>
            Quick Links
          </h4>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {['Features', 'Pricing', 'FAQ', 'Contact'].map((label) => (
              <button key={label}
                onClick={() => {
                  const id = label.toLowerCase() === 'pricing' ? null : label.toLowerCase()
                  if (label === 'Pricing') navigate('/subscription')
                  else {
                    const el = document.getElementById(id)
                    if (el) el.scrollIntoView({ behavior: 'smooth' })
                  }
                }}
                style={{
                  fontSize: '0.78rem', color: '#64748B', cursor: 'pointer',
                  background: 'none', border: 'none', fontFamily: 'inherit',
                  padding: '3px 0', textAlign: 'left',
                  transition: 'color 0.16s ease',
                }}
                onMouseEnter={(e) => e.currentTarget.style.color = '#CBD5E1'}
                onMouseLeave={(e) => e.currentTarget.style.color = '#64748B'}
              >
                {label}
              </button>
            ))}
          </div>
        </div>

        <div>
          <h4 style={{ fontSize: '0.72rem', fontWeight: 700, color: '#94A3B8', letterSpacing: '0.08em', textTransform: 'uppercase', margin: '0 0 16px' }}>
            Product
          </h4>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {['Billing', 'Inventory', 'Dashboard', 'Reports'].map((label) => (
              <button key={label}
                onClick={() => { const el = document.getElementById('features-detail'); if (el) el.scrollIntoView({ behavior: 'smooth' }) }}
                style={{
                  fontSize: '0.78rem', color: '#64748B', cursor: 'pointer',
                  background: 'none', border: 'none', fontFamily: 'inherit',
                  padding: '3px 0', textAlign: 'left',
                  transition: 'color 0.16s ease',
                }}
                onMouseEnter={(e) => e.currentTarget.style.color = '#CBD5E1'}
                onMouseLeave={(e) => e.currentTarget.style.color = '#64748B'}
              >
                {label}
              </button>
            ))}
          </div>
        </div>

        <div id="footer-contact">
          <h4 style={{ fontSize: '0.72rem', fontWeight: 700, color: '#94A3B8', letterSpacing: '0.08em', textTransform: 'uppercase', margin: '0 0 16px' }}>
            Contact
          </h4>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            <p style={{ fontSize: '0.78rem', color: '#64748B', margin: 0, lineHeight: 1.6 }}>
              <span style={{ color: '#94A3B8' }}>Email:</span><br />
              <a href="mailto:smartbillr.support@gmail.com" style={{ color: '#64748B', textDecoration: 'none', transition: 'color 0.16s' }}
                onMouseEnter={(e) => e.currentTarget.style.color = '#CBD5E1'}
                onMouseLeave={(e) => e.currentTarget.style.color = '#64748B'}
              >
                smartbillr.support@gmail.com
              </a>
            </p>
            <p style={{ fontSize: '0.78rem', color: '#64748B', margin: 0, lineHeight: 1.6 }}>
              <span style={{ color: '#94A3B8' }}>Phone:</span><br />
              <a href="tel:+918754120458" style={{ color: '#64748B', textDecoration: 'none', transition: 'color 0.16s' }}
                onMouseEnter={(e) => e.currentTarget.style.color = '#CBD5E1'}
                onMouseLeave={(e) => e.currentTarget.style.color = '#64748B'}
              >
                +91 8754120458
              </a>
            </p>
            <p style={{ fontSize: '0.78rem', color: '#64748B', margin: 0, lineHeight: 1.6 }}>
              <span style={{ color: '#94A3B8' }}>Location:</span><br />
              Chennai, Tamil Nadu, India
            </p>
          </div>
        </div>
      </div>

      <div style={{ borderTop: '1px solid rgba(255,255,255,0.05)', padding: '20px 24px', textAlign: 'center' }}>
        <p style={{ fontSize: '0.72rem', color: '#475569', margin: 0 }}>
          &copy; 2026 SmartBillr. All Rights Reserved.
        </p>
      </div>
    </footer>
  )
}
