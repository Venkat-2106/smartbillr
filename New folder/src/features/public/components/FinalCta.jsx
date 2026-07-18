import { useState } from 'react'
import { useNavigate } from 'react-router-dom'

export default function FinalCta() {
  const navigate = useNavigate()
  const [primaryHover, setPrimaryHover] = useState(false)
  const [secondaryHover, setSecondaryHover] = useState(false)

  return (
    <section style={{
      padding: '120px 24px',
      position: 'relative',
      overflow: 'hidden',
      background: 'linear-gradient(135deg, #0B0F1A 0%, #1E293B 100%)',
    }}>
      <div style={{
        position: 'absolute', width: '600px', height: '600px',
        background: 'radial-gradient(circle, rgba(79,70,229,0.12) 0%, transparent 65%)',
        filter: 'blur(100px)', top: '-30%', right: '-10%', pointerEvents: 'none',
      }} />
      <div style={{
        position: 'absolute', width: '400px', height: '400px',
        background: 'radial-gradient(circle, rgba(99,102,241,0.08) 0%, transparent 65%)',
        filter: 'blur(80px)', bottom: '-20%', left: '5%', pointerEvents: 'none',
      }} />
      <div style={{
        position: 'absolute', inset: 0, pointerEvents: 'none',
        backgroundImage: 'radial-gradient(rgba(255,255,255,0.04) 1px, transparent 1px)',
        backgroundSize: '30px 30px',
        maskImage: 'radial-gradient(ellipse 70% 70% at 50% 50%, black 35%, transparent 100%)',
        WebkitMaskImage: 'radial-gradient(ellipse 70% 70% at 50% 50%, black 35%, transparent 100%)',
      }} />

      <div style={{
        maxWidth: 700, margin: '0 auto',
        textAlign: 'center', position: 'relative', zIndex: 1,
      }}>
        <h2 style={{
          fontSize: '2.8rem', fontWeight: 800, color: '#F8FAFC',
          lineHeight: 1.15, letterSpacing: '-1.2px', margin: '0 0 20px',
        }}>
          Spend Less Time Managing.
          <br />
          <span style={{
            background: 'linear-gradient(135deg, #818CF8, #A5B4FC)',
            WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent',
            backgroundClip: 'text',
          }}>
            Spend More Time Growing.
          </span>
        </h2>

        <p style={{
          fontSize: '1rem', color: '#94A3B8', lineHeight: 1.7,
          maxWidth: 550, margin: '0 auto 40px',
        }}>
          Stop wasting valuable hours on manual billing, spreadsheets, and inventory headaches.
          Let SmartBillr handle the operations while you focus on serving customers and growing
          your business.
        </p>

        <div style={{ display: 'flex', gap: 12, justifyContent: 'center', flexWrap: 'wrap' }}>
          <button
            onClick={() => navigate('/signup')}
            onMouseEnter={() => setPrimaryHover(true)}
            onMouseLeave={() => setPrimaryHover(false)}
            style={{
              padding: '16px 36px', borderRadius: 12, border: 'none',
              background: primaryHover
                ? 'linear-gradient(135deg, var(--accent-700), var(--accent-600))'
                : 'linear-gradient(135deg, var(--accent-600), var(--accent-500))',
              boxShadow: primaryHover
                ? '0 8px 28px rgba(79,70,229,0.45)'
                : '0 4px 16px rgba(79,70,229,0.3)',
              color: '#fff', fontSize: '0.95rem', fontWeight: 700,
              cursor: 'pointer', fontFamily: 'inherit',
              transition: 'all 0.2s cubic-bezier(0.16,1,0.3,1)',
              transform: primaryHover ? 'translateY(-2px)' : 'translateY(0)',
              display: 'flex', alignItems: 'center', gap: 8,
            }}
          >
            Start Your Free Trial Today
            <svg width="16" height="16" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M13 7l5 5m0 0l-5 5m5-5H6" />
            </svg>
          </button>
          <button
            onMouseEnter={() => setSecondaryHover(true)}
            onMouseLeave={() => setSecondaryHover(false)}
            style={{
              padding: '16px 28px', borderRadius: 12,
              border: '1px solid rgba(255,255,255,0.12)',
              background: secondaryHover ? 'rgba(255,255,255,0.06)' : 'transparent',
              color: '#E2E8F0', fontSize: '0.95rem', fontWeight: 600,
              cursor: 'pointer', fontFamily: 'inherit',
              transition: 'all 0.2s cubic-bezier(0.16,1,0.3,1)',
              display: 'flex', alignItems: 'center', gap: 8,
            }}
            onClick={() => window.location.href = 'mailto:smartbillr.support@gmail.com'}
          >
            Book a Live Demo
            <svg width="16" height="16" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
            </svg>
          </button>
        </div>

        <p style={{
          fontSize: '0.78rem', color: '#64748B', marginTop: 28,
          display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
        }}>
          <svg width="14" height="14" fill="none" viewBox="0 0 24 24" stroke="#22C55E" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
          No credit card required &middot; Free for 30 days &middot; Cancel anytime
        </p>
      </div>
    </section>
  )
}
