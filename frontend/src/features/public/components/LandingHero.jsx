import { useState } from 'react'
import { useNavigate } from 'react-router-dom'

export default function LandingHero() {
  const navigate = useNavigate()
  const [ctaHovered, setCtaHovered] = useState(false)
  const [demoHovered, setDemoHovered] = useState(false)

  return (
    <section
      id="hero"
      style={{
        minHeight: '100vh',
        display: 'flex',
        alignItems: 'center',
        position: 'relative',
        overflow: 'hidden',
        background: 'linear-gradient(135deg, #0B0F1A 0%, #1E293B 100%)',
      }}
    >
      <div style={{
        position: 'absolute', width: '700px', height: '700px',
        background: 'radial-gradient(circle, rgba(79,70,229,0.15) 0%, transparent 65%)',
        filter: 'blur(100px)', top: '-20%', left: '-10%', pointerEvents: 'none',
      }} />
      <div style={{
        position: 'absolute', width: '500px', height: '500px',
        background: 'radial-gradient(circle, rgba(99,102,241,0.1) 0%, transparent 65%)',
        filter: 'blur(80px)', bottom: '-10%', right: '5%', pointerEvents: 'none',
      }} />
      <div style={{
        position: 'absolute', inset: 0, pointerEvents: 'none',
        backgroundImage: 'radial-gradient(rgba(255,255,255,0.05) 1px, transparent 1px)',
        backgroundSize: '30px 30px',
        maskImage: 'radial-gradient(ellipse 70% 70% at 50% 50%, black 35%, transparent 100%)',
        WebkitMaskImage: 'radial-gradient(ellipse 70% 70% at 50% 50%, black 35%, transparent 100%)',
      }} />

      <div className="landing-hero-inner" style={{
        maxWidth: 1200, margin: '0 auto', padding: '120px 24px 80px',
        display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 60,
        alignItems: 'center', position: 'relative', zIndex: 1, width: '100%',
      }}>
        <div className="fade-up">
          <div style={{
            display: 'inline-flex', alignItems: 'center', gap: 8,
            padding: '6px 14px', borderRadius: 99,
            background: 'rgba(99,102,241,0.1)',
            border: '1px solid rgba(99,102,241,0.18)',
            marginBottom: 28,
          }}>
            <svg width="14" height="14" fill="none" viewBox="0 0 24 24" stroke="#22C55E" strokeWidth={2.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
            </svg>
            <span style={{ fontSize: '0.75rem', color: '#A5B4FC', fontWeight: 600, letterSpacing: '0.02em' }}>
              Trusted by 500+ businesses worldwide
            </span>
          </div>

          <h1 style={{
            fontSize: '3.4rem', fontWeight: 800, color: '#F8FAFC',
            lineHeight: 1.1, letterSpacing: '-1.5px', margin: '0 0 24px',
          }}>
            Run Your Business.
            <br />
            <span style={{
              background: 'linear-gradient(135deg, #818CF8, #A5B4FC)',
              WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent',
              backgroundClip: 'text',
            }}>
              Not Your Paperwork.
            </span>
          </h1>

          <p style={{
            fontSize: '1.05rem', color: '#94A3B8', lineHeight: 1.7,
            margin: '0 0 36px', maxWidth: 500,
          }}>
            Stop wasting hours on manual billing, spreadsheets, and stock headaches.
            SmartBillr automates invoicing, inventory, customers, expenses — so you can
            focus on growing your business.
          </p>

          <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
            <button
              onClick={() => navigate('/signup')}
              onMouseEnter={() => setCtaHovered(true)}
              onMouseLeave={() => setCtaHovered(false)}
              style={{
                padding: '14px 32px', borderRadius: 12, border: 'none',
                background: ctaHovered
                  ? 'linear-gradient(135deg, var(--accent-700), var(--accent-600))'
                  : 'linear-gradient(135deg, var(--accent-600), var(--accent-500))',
                boxShadow: ctaHovered
                  ? '0 8px 28px rgba(79,70,229,0.45)'
                  : '0 4px 16px rgba(79,70,229,0.3)',
                color: '#fff', fontSize: '0.9rem', fontWeight: 700,
                cursor: 'pointer', fontFamily: 'inherit',
                transition: 'all 0.2s cubic-bezier(0.16,1,0.3,1)',
                transform: ctaHovered ? 'translateY(-2px)' : 'translateY(0)',
                display: 'flex', alignItems: 'center', gap: 8,
              }}
            >
              Start Free Trial
              <svg width="16" height="16" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M13 7l5 5m0 0l-5 5m5-5H6" />
              </svg>
            </button>
            <button
              onMouseEnter={() => setDemoHovered(true)}
              onMouseLeave={() => setDemoHovered(false)}
              style={{
                padding: '14px 28px', borderRadius: 12,
                border: '1px solid rgba(255,255,255,0.12)',
                background: demoHovered ? 'rgba(255,255,255,0.06)' : 'transparent',
                color: '#E2E8F0', fontSize: '0.9rem', fontWeight: 600,
                cursor: 'pointer', fontFamily: 'inherit',
                transition: 'all 0.2s cubic-bezier(0.16,1,0.3,1)',
                display: 'flex', alignItems: 'center', gap: 8,
              }}
              onClick={() => {
                const el = document.getElementById('demo')
                if (el) el.scrollIntoView({ behavior: 'smooth' })
              }}
            >
              <svg width="16" height="16" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M14.752 11.168l-3.197-2.132A1 1 0 0010 9.87v4.263a1 1 0 001.555.832l3.197-2.132a1 1 0 000-1.664z" />
                <path strokeLinecap="round" strokeLinejoin="round" d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              Watch Demo
            </button>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: 24, marginTop: 40 }}>
            <div style={{ display: 'flex', alignItems: 'center' }}>
              {['#6366F1', '#818CF8', '#A5B4FC', '#C7D2FE', '#E0E7FF'].map((c, i) => (
                <div key={i} style={{
                  width: 28, height: 28, borderRadius: '50%',
                  border: '2px solid #0F172A',
                  background: c,
                  marginLeft: i > 0 ? -8 : 0,
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  fontSize: '0.6rem', fontWeight: 700, color: '#fff',
                }}>
                  {['S', 'M', 'R', 'K', 'A'][i]}
                </div>
              ))}
            </div>
            <div>
              <div style={{ display: 'flex', gap: 2 }}>
                {[1,2,3,4,5].map(i => (
                  <svg key={i} width="12" height="12" fill="#F59E0B" viewBox="0 0 20 20">
                    <path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z" />
                  </svg>
                ))}
              </div>
              <p style={{ fontSize: '0.72rem', color: '#64748B', margin: '2px 0 0' }}>
                Rated 4.9 / 5 by business owners
              </p>
            </div>
          </div>
        </div>

        <div className="landing-hero-visual fade-up" style={{ animationDelay: '0.15s' }}>
          <DashboardPreview />
        </div>
      </div>
    </section>
  )
}

function DashboardPreview() {
  return (
    <div style={{
      background: 'rgba(30,41,59,0.6)',
      border: '1px solid rgba(255,255,255,0.08)',
      borderRadius: 20, padding: 24,
      backdropFilter: 'blur(20px)',
      WebkitBackdropFilter: 'blur(20px)',
      boxShadow: '0 25px 60px rgba(0,0,0,0.4), 0 0 0 1px rgba(255,255,255,0.04)',
    }}>
      <div style={{ display: 'flex', gap: 7, marginBottom: 20 }}>
        <div style={{ width: 10, height: 10, borderRadius: '50%', background: '#EF4444' }} />
        <div style={{ width: 10, height: 10, borderRadius: '50%', background: '#F59E0B' }} />
        <div style={{ width: 10, height: 10, borderRadius: '50%', background: '#10B981' }} />
      </div>

      <div style={{
        display: 'flex', alignItems: 'center', gap: 8,
        marginBottom: 20, paddingBottom: 16,
        borderBottom: '1px solid rgba(255,255,255,0.06)',
      }}>
        <div style={{ width: 20, height: 20, borderRadius: 6, background: 'linear-gradient(135deg, #4F46E5, #818CF8)' }} />
        <span style={{ fontSize: '0.75rem', fontWeight: 700, color: '#CBD5E1' }}>SmartBillr</span>
        <div style={{ flex: 1 }} />
        <div style={{ width: 60, height: 6, borderRadius: 3, background: 'rgba(255,255,255,0.06)' }} />
        <div style={{ width: 40, height: 6, borderRadius: 3, background: 'rgba(255,255,255,0.06)' }} />
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 10, marginBottom: 16 }}>
        {[
          { label: "Today's Revenue", value: '₹28,450', color: '#22C55E' },
          { label: 'Invoices Today', value: '43', color: '#818CF8' },
          { label: 'Profit Margin', value: '32%', color: '#F59E0B' },
        ].map((stat) => (
          <div key={stat.label} style={{
            padding: 14, background: 'rgba(0,0,0,0.2)',
            borderRadius: 12, border: '1px solid rgba(255,255,255,0.04)',
          }}>
            <p style={{
              fontSize: '0.6rem', color: '#64748B', fontWeight: 600,
              letterSpacing: '0.06em', textTransform: 'uppercase',
              margin: '0 0 6px',
            }}>{stat.label}</p>
            <p style={{ fontSize: '0.95rem', fontWeight: 800, color: stat.color, margin: 0 }}>
              {stat.value}
            </p>
          </div>
        ))}
      </div>

      <div style={{
        padding: 16, background: 'rgba(0,0,0,0.2)',
        borderRadius: 12, border: '1px solid rgba(255,255,255,0.04)',
        marginBottom: 16,
      }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 14 }}>
          <span style={{ fontSize: '0.68rem', fontWeight: 600, color: '#94A3B8' }}>
            Revenue (This Week)
          </span>
        </div>
        <div style={{ display: 'flex', alignItems: 'flex-end', gap: 6, height: 60 }}>
          {[35, 45, 30, 55, 50, 65, 75].map((h, i) => (
            <div key={i} style={{
              flex: 1, height: `${h}%`, borderRadius: 4,
              background: i === 6
                ? 'linear-gradient(180deg, #818CF8, #4F46E5)'
                : 'rgba(99,102,241,0.25)',
              transition: 'height 0.3s ease',
            }} />
          ))}
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
        <div style={{
          padding: 14, background: 'rgba(0,0,0,0.2)',
          borderRadius: 12, border: '1px solid rgba(255,255,255,0.04)',
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
            <svg width="14" height="14" fill="none" viewBox="0 0 24 24" stroke="#22C55E" strokeWidth={1.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M13 7h8m0 0v8m0-8l-8 8-4-4-6 6" />
            </svg>
            <span style={{ fontSize: '0.65rem', color: '#94A3B8', fontWeight: 600 }}>Best Sellers</span>
          </div>
          {['Basmati Rice 5kg', 'Sunflower Oil', 'Toothpaste'].map((item, i) => (
            <div key={item} style={{
              display: 'flex', justifyContent: 'space-between',
              padding: '5px 0',
              borderTop: i > 0 ? '1px solid rgba(255,255,255,0.04)' : 'none',
            }}>
              <span style={{ fontSize: '0.65rem', color: '#CBD5E1' }}>{item}</span>
              <span style={{ fontSize: '0.65rem', color: '#22C55E', fontWeight: 600 }}>
                ₹{[124, 88, 67][i]}k
              </span>
            </div>
          ))}
        </div>
        <div style={{
          padding: 14, background: 'rgba(0,0,0,0.2)',
          borderRadius: 12, border: '1px solid rgba(255,255,255,0.04)',
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
            <svg width="14" height="14" fill="none" viewBox="0 0 24 24" stroke="#F59E0B" strokeWidth={1.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4" />
            </svg>
            <span style={{ fontSize: '0.65rem', color: '#94A3B8', fontWeight: 600 }}>Low Stock</span>
          </div>
          {['Sunflower Oil', 'Wheat Flour', 'Detergent'].map((item, i) => (
            <div key={item} style={{
              display: 'flex', justifyContent: 'space-between',
              padding: '5px 0',
              borderTop: i > 0 ? '1px solid rgba(255,255,255,0.04)' : 'none',
            }}>
              <span style={{ fontSize: '0.65rem', color: '#CBD5E1' }}>{item}</span>
              <span style={{ fontSize: '0.65rem', color: '#F59E0B', fontWeight: 600 }}>
                {[3, 5, 2]} left
              </span>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
