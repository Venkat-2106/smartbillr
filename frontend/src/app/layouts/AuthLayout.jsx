export default function AuthLayout({ children }) {
  return (
    <div className="auth-layout" style={{
      minHeight: '100vh',
      display: 'grid',
      gridTemplateColumns: '1fr 1fr',
    }}>

      {/* LEFT — Dark hero panel */}
      <div className="auth-hero" style={{
        background: 'linear-gradient(135deg, #0F172A 0%, #1E293B 100%)',
        padding: '3.5rem',
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'center',
        gap: '2.5rem',
        position: 'relative',
        overflow: 'hidden',
      }}>

        {/* Glow blobs */}
        <div style={{
          position: 'absolute', width: '460px', height: '460px',
          background: 'radial-gradient(circle, rgba(79,70,229,0.22) 0%, transparent 65%)',
          filter: 'blur(80px)', top: '0%', left: '-8%', pointerEvents: 'none',
        }} />
        <div style={{
          position: 'absolute', width: '300px', height: '300px',
          background: 'radial-gradient(circle, rgba(99,102,241,0.16) 0%, transparent 65%)',
          filter: 'blur(60px)', bottom: '5%', right: '-4%', pointerEvents: 'none',
        }} />
        <div style={{
          position: 'absolute', width: '200px', height: '200px',
          background: 'radial-gradient(circle, rgba(129,140,248,0.10) 0%, transparent 65%)',
          filter: 'blur(50px)', bottom: '40%', right: '20%', pointerEvents: 'none',
        }} />

        {/* Subtle dot-grid overlay */}
        <div style={{
          position: 'absolute', inset: 0, pointerEvents: 'none',
          backgroundImage: 'radial-gradient(rgba(255,255,255,0.08) 1px, transparent 1px)',
          backgroundSize: '28px 28px',
          maskImage: 'radial-gradient(ellipse 80% 80% at 50% 50%, black 40%, transparent 100%)',
          WebkitMaskImage: 'radial-gradient(ellipse 80% 80% at 50% 50%, black 40%, transparent 100%)',
        }} />

        {/* Logo */}
        <div style={{ position: 'relative', zIndex: 1 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 13, marginBottom: 12 }}>
              <div style={{
                width: 38, height: 38, borderRadius: 11,
                background: 'linear-gradient(135deg, var(--accent-600, #4F46E5), var(--accent-400, #818CF8))',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                boxShadow: '0 4px 16px rgba(79,70,229,0.5)',
              }}>
              <svg width="19" height="19" fill="none" viewBox="0 0 24 24" stroke="white" strokeWidth={2.2}>
                <path strokeLinecap="round" strokeLinejoin="round"
                  d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
              </svg>
            </div>
            <span style={{ fontSize: '1.65rem', fontWeight: 800, letterSpacing: '-1px' }}>
              <span style={{ color: 'var(--sb-text-primary, #F8FAFC)' }}>Smart</span>
              <span style={{ color: 'var(--accent-400, #818CF8)' }}>Billr</span>
            </span>
          </div>
          <p style={{
            fontSize: '11px', color: 'var(--text-muted, #94A3B8)',
            letterSpacing: '0.25em', fontWeight: '600',
            textTransform: 'uppercase', marginTop: '6px',
          }}>
            Billing · Inventory · Growth
          </p>
        </div>

        {/* Hero text */}
        <div style={{ position: 'relative', zIndex: 1 }}>
          <h2 style={{
            fontSize: '2.3rem', fontWeight: 800,
            color: 'var(--sb-text-primary, #F8FAFC)', lineHeight: 1,
            letterSpacing: '-0.8px', margin: 0,
          }}>
            Run your business<br />
            <span style={{
              background: 'linear-gradient(135deg, var(--accent-400, #818CF8), var(--accent-sidebar-text, #A5B4FC))',
              WebkitBackgroundClip: 'text',
              WebkitTextFillColor: 'transparent',
              backgroundClip: 'text',
            }}>smarter.</span>
          </h2>
          <p style={{
            fontSize: '1rem', color: 'var(--text-secondary, #CBD5E1)',fontWeight: 800,
            lineHeight: 1.65, marginTop: 14, margin: 0, marginTop: 14,
          }}>
            Billing, inventory &amp; analytics —<br />all in one place.
          </p>
        </div>

        {/* Features */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem', position: 'relative', zIndex: 1 }}>
          {[
            { icon: '🧾', text: 'GST / VAT ready invoicing' },
            { icon: '📦', text: 'Real-time inventory tracking' },
            { icon: '💳', text: 'Multi-mode payment collection' },
            { icon: '📊', text: 'Business analytics & reports' },
            { icon: '🔐', text: 'Role-based access control' },
          ].map((item) => (
            <div key={item.text} style={{ display: 'flex', alignItems: 'center', gap: '0.8rem' }}>
              <div style={{
                width: 32, height: 32, borderRadius: 9,
                background: 'rgba(79,70,229,0.12)',
                border: '1px solid rgba(99,102,241,0.2)',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontSize: '0.85rem', flexShrink: 0,
              }}>
                {item.icon}
              </div>
              <span style={{ fontSize: '0.8rem', color: 'var(--text-muted, #94A3B8)', fontWeight: '500' }}>
                {item.text}
              </span>
            </div>
          ))}
        </div>

        {/* Trust badge */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, position: 'relative', zIndex: 1 }}>
          <div style={{ width: 7, height: 7, borderRadius: '50%', background: 'var(--success, #22C55E)', flexShrink: 0 }} />
          <span style={{ fontSize: '0.7rem', color: 'var(--success, #22C55E)', fontWeight: 800 }}>
            SmartBillr v1.0 · Available Worldwide
          </span>
        </div>
      </div>

      {/* RIGHT — Form area */}
      <div className="auth-form" style={{
        background: 'var(--bg-page)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '2.5rem',
      }}>
        {/* Card */}
        <div style={{
          width: '100%',
          maxWidth: '400px',
          background: 'var(--bg-card)',
          border: '1px solid var(--border)',
          borderRadius: '18px',
          padding: '2rem',
          boxShadow: 'var(--shadow-elevated)',
          transition: 'transform 0.25s ease',
        }}>
          {children}
        </div>
      </div>

    </div>
  )
}
