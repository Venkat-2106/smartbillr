import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'

export default function LandingNav() {
  const navigate = useNavigate()
  const [scrolled, setScrolled] = useState(false)
  const [mobileOpen, setMobileOpen] = useState(false)
  const [hoveredLink, setHoveredLink] = useState(null)

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 40)
    window.addEventListener('scroll', onScroll, { passive: true })
    return () => window.removeEventListener('scroll', onScroll)
  }, [])

  function scrollTo(id) {
    setMobileOpen(false)
    const el = document.getElementById(id)
    if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }

  const navLinks = [
    { label: 'Features', target: 'features' },
    { label: 'Pricing', target: 'pricing' },
    { label: 'Guide', target: 'user-guide' },
    { label: 'FAQ', target: 'faq' },
    { label: 'Contact', target: 'footer-contact' },
  ]

  return (
    <nav
      style={{
        position: 'fixed', top: 0, left: 0, right: 0, zIndex: 1000,
        padding: scrolled ? '10px 0' : '16px 0',
        background: scrolled ? 'rgba(11,15,25,0.92)' : 'transparent',
        backdropFilter: scrolled ? 'blur(16px)' : 'none',
        WebkitBackdropFilter: scrolled ? 'blur(16px)' : 'none',
        borderBottom: scrolled ? '1px solid rgba(255,255,255,0.06)' : '1px solid transparent',
        transition: 'all 0.3s cubic-bezier(0.16,1,0.3,1)',
      }}
    >
      <div style={{
        maxWidth: 1200, margin: '0 auto', padding: '0 24px',
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
      }}>
        <div
          onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })}
          onKeyDown={(e) => { if (e.key === 'Enter') window.scrollTo({ top: 0, behavior: 'smooth' }) }}
          role="button" tabIndex={0}
          style={{ display: 'flex', alignItems: 'center', gap: 11, cursor: 'pointer' }}
        >
          <div style={{
            width: 34, height: 34, borderRadius: 10,
            background: 'linear-gradient(135deg, var(--accent-600, #4F46E5), var(--accent-500, #6366F1))',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            boxShadow: '0 3px 12px rgba(79,70,229,0.4)',
            flexShrink: 0,
          }}>
            <svg width="17" height="17" fill="none" viewBox="0 0 24 24" stroke="white" strokeWidth={2.2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
            </svg>
          </div>
          <span style={{ fontSize: '1.3rem', fontWeight: 800, letterSpacing: '-0.8px', color: '#F8FAFC' }}>
            Smart<span style={{ color: 'var(--accent-400, #818CF8)' }}>Billr</span>
          </span>
        </div>

        <div className="landing-nav-links" style={{ display: 'flex', alignItems: 'center', gap: 32 }}>
          {navLinks.map((link) => (
            <button
              key={link.target}
              onClick={() => link.target === 'user-guide' ? navigate('/user-guide') : link.target === 'pricing' ? navigate('/subscription') : scrollTo(link.target)}
              onMouseEnter={() => setHoveredLink(link.target)}
              onMouseLeave={() => setHoveredLink(null)}
              style={{
                fontSize: '0.8rem', fontWeight: 600,
                color: hoveredLink === link.target ? '#F8FAFC' : '#94A3B8',
                cursor: 'pointer', transition: 'color 0.16s ease',
                background: 'none', border: 'none', fontFamily: 'inherit',
                padding: '6px 2px', letterSpacing: '0.01em',
              }}
            >
              {link.label}
            </button>
          ))}
        </div>

        <div className="landing-nav-buttons" style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <button
            onClick={() => navigate('/login')}
            style={{
              padding: '8px 18px', borderRadius: 8,
              border: '1px solid rgba(255,255,255,0.12)',
              background: 'transparent', color: '#E2E8F0',
              fontSize: '0.8rem', fontWeight: 600, cursor: 'pointer',
              fontFamily: 'inherit', transition: 'all 0.16s ease',
            }}
            onMouseEnter={(e) => { e.currentTarget.style.background = 'rgba(255,255,255,0.08)' }}
            onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent' }}
          >
            Login
          </button>
          <button
            onClick={() => navigate('/signup')}
            style={{
              padding: '8px 18px', borderRadius: 8, border: 'none',
              background: 'linear-gradient(135deg, var(--accent-600, #4F46E5), var(--accent-500, #6366F1))',
              boxShadow: '0 2px 10px rgba(79,70,229,0.25)',
              color: '#fff', fontSize: '0.8rem', fontWeight: 600,
              cursor: 'pointer', fontFamily: 'inherit',
              transition: 'all 0.16s ease',
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.transform = 'translateY(-1px)'
              e.currentTarget.style.boxShadow = '0 6px 20px rgba(79,70,229,0.4)'
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.transform = 'translateY(0)'
              e.currentTarget.style.boxShadow = '0 2px 10px rgba(79,70,229,0.25)'
            }}
          >
            Start Free Trial
          </button>
        </div>

        <button
          className="landing-nav-hamburger"
          onClick={() => setMobileOpen(!mobileOpen)}
          aria-label={mobileOpen ? 'Close menu' : 'Open menu'}
          style={{
            background: 'none', border: 'none', cursor: 'pointer',
            padding: 4, color: '#94A3B8', display: 'none',
          }}
        >
          <svg width="22" height="22" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            {mobileOpen
              ? <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
              : <path strokeLinecap="round" strokeLinejoin="round" d="M4 6h16M4 12h16M4 18h16" />
            }
          </svg>
        </button>
      </div>

      {mobileOpen && (
        <div style={{
          padding: '16px 24px 24px', display: 'flex',
          flexDirection: 'column', alignItems: 'center', gap: 4,
        }}>
          {navLinks.map((link) => (
            <button
              key={link.target}
              onClick={() => link.target === 'user-guide' ? navigate('/user-guide') : link.target === 'pricing' ? navigate('/subscription') : scrollTo(link.target)}
              style={{
                fontSize: '1rem', fontWeight: 600, color: '#CBD5E1',
                cursor: 'pointer', background: 'none', border: 'none',
                fontFamily: 'inherit', padding: '12px 0', width: '100%',
                textAlign: 'center',
              }}
            >
              {link.label}
            </button>
          ))}
          <div style={{ display: 'flex', gap: 10, marginTop: 12, width: '100%' }}>
            <button
              onClick={() => navigate('/login')}
              style={{
                flex: 1, padding: '10px 0', borderRadius: 8,
                border: '1px solid rgba(255,255,255,0.12)',
                background: 'transparent', color: '#E2E8F0',
                fontSize: '0.85rem', fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit',
              }}
            >
              Login
            </button>
            <button
              onClick={() => navigate('/signup')}
              style={{
                flex: 1, padding: '10px 0', borderRadius: 8, border: 'none',
                background: 'linear-gradient(135deg, var(--accent-600, #4F46E5), var(--accent-500, #6366F1))',
                color: '#fff', fontSize: '0.85rem', fontWeight: 600,
                cursor: 'pointer', fontFamily: 'inherit',
              }}
            >
              Start Free Trial
            </button>
          </div>
        </div>
      )}
    </nav>
  )
}
