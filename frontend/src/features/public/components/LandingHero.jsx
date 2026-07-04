import { useState } from 'react'
import { useNavigate } from 'react-router-dom'

export default function LandingHero() {
  const navigate = useNavigate()
  const [ctaHovered, setCtaHovered] = useState(false)
  const [pricingHovered, setPricingHovered] = useState(false)
  const [contactHovered, setContactHovered] = useState(false)

  function scrollToContact() {
    const el = document.getElementById('contact')
    if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }

  return (
    <section
      id="hero"
      style={{
        minHeight: '100vh',
        display: 'flex',
        alignItems: 'center',
        position: 'relative',
        overflow: 'hidden',
        background: 'linear-gradient(135deg, #0F172A 0%, #1E293B 100%)',
      }}
    >
      {/* Glow blobs */}
      <div style={{ position: 'absolute', width: '600px', height: '600px', background: 'radial-gradient(circle, rgba(79,70,229,0.2) 0%, transparent 65%)', filter: 'blur(100px)', top: '-15%', left: '-8%', pointerEvents: 'none' }} />
      <div style={{ position: 'absolute', width: '400px', height: '400px', background: 'radial-gradient(circle, rgba(99,102,241,0.14) 0%, transparent 65%)', filter: 'blur(80px)', bottom: '5%', right: '10%', pointerEvents: 'none' }} />
      <div style={{ position: 'absolute', width: '250px', height: '250px', background: 'radial-gradient(circle, rgba(129,140,248,0.08) 0%, transparent 65%)', filter: 'blur(60px)', top: '40%', right: '30%', pointerEvents: 'none' }} />

      {/* Dot grid overlay */}
      <div style={{ position: 'absolute', inset: 0, pointerEvents: 'none', backgroundImage: 'radial-gradient(rgba(255,255,255,0.06) 1px, transparent 1px)', backgroundSize: '30px 30px', maskImage: 'radial-gradient(ellipse 70% 70% at 50% 50%, black 35%, transparent 100%)', WebkitMaskImage: 'radial-gradient(ellipse 70% 70% at 50% 50%, black 35%, transparent 100%)' }} />

      <div
        className="landing-hero-inner"
        style={{
          maxWidth: 1200,
          margin: '0 auto',
          padding: '120px 24px 80px',
          display: 'grid',
          gridTemplateColumns: '1fr 1fr',
          gap: 60,
          alignItems: 'center',
          position: 'relative',
          zIndex: 1,
          width: '100%',
        }}
      >
        {/* Text side */}
        <div style={{ animation: 'fadeUp 0.6s cubic-bezier(0.16,1,0.3,1) both' }}>
          <div
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 6,
              padding: '5px 12px',
              borderRadius: 99,
              background: 'rgba(99,102,241,0.12)',
              border: '1px solid rgba(99,102,241,0.2)',
              marginBottom: 24,
            }}
          >
            <div style={{ width: 6, height: 6, borderRadius: '50%', background: '#22C55E', flexShrink: 0 }} />
            <span style={{ fontSize: '0.7rem', color: '#A5B4FC', fontWeight: 700, letterSpacing: '0.02em' }}>
              Now Available Worldwide
            </span>
          </div>

          <h1
            style={{
              fontSize: '3.2rem',
              fontWeight: 800,
              color: '#F8FAFC',
              lineHeight: 1.1,
              letterSpacing: '-1.2px',
              margin: '0 0 20px',
            }}
          >
            Smart Billing &amp; Inventory<br />
            <span
              style={{
                background: 'linear-gradient(135deg, #818CF8, #A5B4FC)',
                WebkitBackgroundClip: 'text',
                WebkitTextFillColor: 'transparent',
                backgroundClip: 'text',
              }}
            >
              Management Made Simple
            </span>
          </h1>

          <p
            style={{
              fontSize: '1.05rem',
              color: '#94A3B8',
              lineHeight: 1.7,
              margin: '0 0 36px',
              maxWidth: 500,
            }}
          >
            Manage invoices, inventory, customers, suppliers, expenses, and business insights from one powerful platform.
          </p>

          <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
            <button
              onClick={() => navigate('/signup')}
              onMouseEnter={() => setCtaHovered(true)}
              onMouseLeave={() => setCtaHovered(false)}
              style={{
                padding: '14px 32px',
                borderRadius: 12,
                border: 'none',
                background: ctaHovered
                  ? 'linear-gradient(135deg, var(--accent-700, #4338CA), var(--accent-600, #4F46E5))'
                  : 'linear-gradient(135deg, var(--accent-600, #4F46E5), var(--accent-500, #6366F1))',
                boxShadow: ctaHovered
                  ? '0 8px 28px rgba(79,70,229,0.45), 0 0 0 1px rgba(99,102,241,0.3)'
                  : '0 4px 16px rgba(79,70,229,0.3), 0 0 0 1px rgba(99,102,241,0.2)',
                color: '#fff',
                fontSize: '0.9rem',
                fontWeight: 700,
                cursor: 'pointer',
                fontFamily: 'inherit',
                transition: 'all 0.2s cubic-bezier(0.16,1,0.3,1)',
                transform: ctaHovered ? 'translateY(-2px)' : 'translateY(0)',
              }}
            >
              Get Started &rarr;
            </button>
            <button
              onClick={() => navigate('/subscription')}
              onMouseEnter={() => setPricingHovered(true)}
              onMouseLeave={() => setPricingHovered(false)}
              style={{
                padding: '14px 28px',
                borderRadius: 12,
                border: '1px solid rgba(255,255,255,0.12)',
                background: pricingHovered ? 'rgba(255,255,255,0.06)' : 'transparent',
                color: '#E2E8F0',
                fontSize: '0.9rem',
                fontWeight: 600,
                cursor: 'pointer',
                fontFamily: 'inherit',
                transition: 'all 0.2s cubic-bezier(0.16,1,0.3,1)',
                transform: pricingHovered ? 'translateY(-2px)' : 'translateY(0)',
                boxShadow: pricingHovered ? '0 4px 20px rgba(0,0,0,0.2)' : 'none',
              }}
            >
              View Plans &rarr;
            </button>
            <button
              onClick={() => scrollToContact()}
              onMouseEnter={() => setContactHovered(true)}
              onMouseLeave={() => setContactHovered(false)}
              style={{
                padding: '14px 28px',
                borderRadius: 12,
                border: '1px solid rgba(255,255,255,0.12)',
                background: contactHovered ? 'rgba(255,255,255,0.06)' : 'transparent',
                color: '#E2E8F0',
                fontSize: '0.9rem',
                fontWeight: 600,
                cursor: 'pointer',
                fontFamily: 'inherit',
                transition: 'all 0.2s cubic-bezier(0.16,1,0.3,1)',
                transform: contactHovered ? 'translateY(-2px)' : 'translateY(0)',
                boxShadow: contactHovered ? '0 4px 20px rgba(0,0,0,0.2)' : 'none',
              }}
            >
              Contact Us &rarr;
            </button>
          </div>
        </div>

        {/* Dashboard preview / illustration */}
        <div
          className="landing-hero-visual"
          style={{
            animation: 'fadeUp 0.6s cubic-bezier(0.16,1,0.3,1) both',
            animationDelay: '0.15s',
          }}
        >
          <DashboardPreview />
        </div>
      </div>
    </section>
  )
}

function DashboardPreview() {
  return (
    <div
      style={{
        background: 'rgba(30,41,59,0.6)',
        border: '1px solid rgba(255,255,255,0.08)',
        borderRadius: 20,
        padding: 24,
        backdropFilter: 'blur(20px)',
        WebkitBackdropFilter: 'blur(20px)',
        boxShadow: '0 25px 60px rgba(0,0,0,0.4), 0 0 0 1px rgba(255,255,255,0.04)',
        position: 'relative',
      }}
    >
      {/* Window dots */}
      <div style={{ display: 'flex', gap: 7, marginBottom: 20 }}>
        <div style={{ width: 10, height: 10, borderRadius: '50%', background: '#EF4444' }} />
        <div style={{ width: 10, height: 10, borderRadius: '50%', background: '#F59E0B' }} />
        <div style={{ width: 10, height: 10, borderRadius: '50%', background: '#10B981' }} />
      </div>

      {/* Top bar mockup */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 20, paddingBottom: 16, borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
        <div style={{ width: 20, height: 20, borderRadius: 6, background: 'linear-gradient(135deg, #4F46E5, #818CF8)' }} />
        <span style={{ fontSize: '0.75rem', fontWeight: 700, color: '#CBD5E1' }}>SmartBillr</span>
        <div style={{ flex: 1 }} />
        <div style={{ width: 60, height: 6, borderRadius: 3, background: 'rgba(255,255,255,0.06)' }} />
        <div style={{ width: 40, height: 6, borderRadius: 3, background: 'rgba(255,255,255,0.06)' }} />
      </div>

      {/* Stats row */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 10, marginBottom: 16 }}>
        {[
          { label: 'Revenue', value: '₹2,84,500', color: '#22C55E' },
          { label: 'Invoices', value: '143', color: '#818CF8' },
          { label: 'Low Stock', value: '8', color: '#F59E0B' },
        ].map((stat) => (
          <div key={stat.label} style={{ padding: 14, background: 'rgba(0,0,0,0.2)', borderRadius: 12, border: '1px solid rgba(255,255,255,0.04)' }}>
            <p style={{ fontSize: '0.6rem', color: '#64748B', fontWeight: 600, letterSpacing: '0.06em', textTransform: 'uppercase', margin: '0 0 6px' }}>{stat.label}</p>
            <p style={{ fontSize: '0.95rem', fontWeight: 800, color: stat.color, margin: 0 }}>{stat.value}</p>
          </div>
        ))}
      </div>

      {/* Chart area */}
      <div style={{ padding: 16, background: 'rgba(0,0,0,0.2)', borderRadius: 12, border: '1px solid rgba(255,255,255,0.04)', marginBottom: 16 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 14 }}>
          <span style={{ fontSize: '0.68rem', fontWeight: 600, color: '#94A3B8' }}>Monthly Revenue</span>
          <div style={{ display: 'flex', gap: 6 }}>
            {['1W', '1M', '3M', '1Y'].map((t) => (
              <span key={t} style={{ fontSize: '0.6rem', padding: '2px 8px', borderRadius: 6, background: t === '1M' ? 'rgba(99,102,241,0.2)' : 'transparent', color: t === '1M' ? '#A5B4FC' : '#64748B', fontWeight: 600 }}>{t}</span>
            ))}
          </div>
        </div>
        {/* Mini bar chart */}
        <div style={{ display: 'flex', alignItems: 'flex-end', gap: 6, height: 60 }}>
          {[35, 45, 30, 55, 50, 65, 75, 60, 80, 70, 90, 85].map((h, i) => (
            <div key={i} style={{ flex: 1, height: `${h}%`, borderRadius: 4, background: i > 7 ? 'linear-gradient(180deg, #818CF8, #4F46E5)' : 'rgba(99,102,241,0.25)', transition: 'height 0.3s ease' }} />
          ))}
        </div>
      </div>

      {/* Bottom row */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
        <div style={{ padding: 14, background: 'rgba(0,0,0,0.2)', borderRadius: 12, border: '1px solid rgba(255,255,255,0.04)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
            <svg width="14" height="14" fill="none" viewBox="0 0 24 24" stroke="#818CF8" strokeWidth={1.5}><path strokeLinecap="round" strokeLinejoin="round" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" /></svg>
            <span style={{ fontSize: '0.65rem', color: '#94A3B8', fontWeight: 600 }}>Recent Invoices</span>
          </div>
          {['INV-024', 'INV-025', 'INV-026'].map((inv, i) => (
            <div key={inv} style={{ display: 'flex', justifyContent: 'space-between', padding: '4px 0', borderTop: i > 0 ? '1px solid rgba(255,255,255,0.04)' : 'none' }}>
              <span style={{ fontSize: '0.65rem', color: '#CBD5E1' }}>{inv}</span>
              <span style={{ fontSize: '0.65rem', color: '#22C55E', fontWeight: 600 }}>₹{['12,500', '8,200', '15,000'][i]}</span>
            </div>
          ))}
        </div>
        <div style={{ padding: 14, background: 'rgba(0,0,0,0.2)', borderRadius: 12, border: '1px solid rgba(255,255,255,0.04)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
            <svg width="14" height="14" fill="none" viewBox="0 0 24 24" stroke="#22C55E" strokeWidth={1.5}><path strokeLinecap="round" strokeLinejoin="round" d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4" /></svg>
            <span style={{ fontSize: '0.65rem', color: '#94A3B8', fontWeight: 600 }}>Stock Alerts</span>
          </div>
          {['Wireless Mouse', 'USB Hub', 'Desk Lamp'].map((item, i) => (
            <div key={item} style={{ display: 'flex', justifyContent: 'space-between', padding: '4px 0', borderTop: i > 0 ? '1px solid rgba(255,255,255,0.04)' : 'none' }}>
              <span style={{ fontSize: '0.65rem', color: '#CBD5E1' }}>{item}</span>
              <span style={{ fontSize: '0.65rem', color: '#F59E0B', fontWeight: 600 }}>{[3, 5, 2][i]} left</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
