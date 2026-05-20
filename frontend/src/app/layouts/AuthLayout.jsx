export default function AuthLayout({ children }) {
  return (
    <div style={{
      minHeight: '100vh',
      display: 'grid',
      gridTemplateColumns: '1fr 1fr',
      fontFamily: 'Inter, sans-serif',
    }}>

      {/* LEFT — Dark hero panel */}
      <div style={{
        background: 'linear-gradient(135deg, #0F172A 0%, #1E293B 100%)',
        padding: '3rem',
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'center',
        gap: '2rem',
        position: 'relative',
        overflow: 'hidden',
      }}>

        {/* Glow blobs */}
        <div style={{
          position: 'absolute', width: '400px', height: '400px',
          background: 'radial-gradient(circle, rgba(59,130,246,0.25) 0%, transparent 70%)',
          filter: 'blur(80px)', top: '10%', left: '5%', pointerEvents: 'none',
        }} />
        <div style={{
          position: 'absolute', width: '250px', height: '250px',
          background: 'radial-gradient(circle, rgba(99,102,241,0.2) 0%, transparent 70%)',
          filter: 'blur(60px)', bottom: '10%', right: '0', pointerEvents: 'none',
        }} />

        {/* Logo */}
        <div style={{ position: 'relative', zIndex: 1 }}>
          <div style={{ fontSize: '2rem', fontWeight: '800', letterSpacing: '-1.5px' }}>
            <span style={{ color: '#F8FAFC' }}>Smart</span>
            <span style={{ color: '#3B82F6' }}>Billr</span>
          </div>
          <p style={{
            fontSize: '11px', color: '#94A3B8',
            letterSpacing: '0.25em', fontWeight: '600',
            textTransform: 'uppercase', marginTop: '6px',
          }}>
            Billing · Inventory · Growth
          </p>
        </div>

        {/* Hero text */}
        <div style={{ position: 'relative', zIndex: 1 }}>
          <h2 style={{
            fontSize: '2rem', fontWeight: '700',
            color: '#F8FAFC', lineHeight: '1.2',
            marginBottom: '0.5rem',
          }}>
            Run your business<br />smarter.
          </h2>
          <p style={{ fontSize: '1rem', color: '#CBD5E1', lineHeight: '1.6' }}>
            Billing, inventory &amp; analytics<br />all in one place.
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
            <div key={item.text} style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
              <div style={{
                width: '28px', height: '28px', borderRadius: '8px',
                background: 'rgba(59,130,246,0.15)',
                border: '1px solid rgba(59,130,246,0.2)',
                display: 'flex', alignItems: 'center',
                justifyContent: 'center', fontSize: '0.8rem', flexShrink: 0,
              }}>
                {item.icon}
              </div>
              <span style={{ fontSize: '0.8rem', color: '#94A3B8', fontWeight: '500' }}>
                {item.text}
              </span>
            </div>
          ))}
        </div>

        {/* Trust badge */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '6px', position: 'relative', zIndex: 1 }}>
          <div style={{ width: '6px', height: '6px', borderRadius: '50%', background: '#22C55E' }} />
          <span style={{ fontSize: '0.68rem', color: '#475569', fontWeight: '500' }}>
            SmartBillr v1.0 · Available Worldwide
          </span>
        </div>
      </div>

      {/* RIGHT — Light form area */}
      <div style={{
        background: '#F1F5F9',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '2.5rem',
      }}>
        {/* Glass card */}
        <div style={{
          width: '100%',
          maxWidth: '400px',
          background: 'rgba(255,255,255,0.9)',
          backdropFilter: 'blur(12px)',
          border: '1px solid #E5E7EB',
          borderRadius: '18px',
          padding: '2rem',
          boxShadow: '0 25px 50px rgba(0,0,0,0.08)',
          transition: 'transform 0.25s ease',
        }}
          onMouseEnter={(e) => e.currentTarget.style.transform = 'translateY(-3px)'}
          onMouseLeave={(e) => e.currentTarget.style.transform = 'translateY(0)'}
        >
          {children}
        </div>
      </div>

    </div>
  )
}