import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'

const linkStyle = {
  fontSize: '0.8rem',
  fontWeight: 600,
  color: '#94A3B8',
  cursor: 'pointer',
  transition: 'color 0.16s ease',
  background: 'none',
  border: 'none',
  fontFamily: 'inherit',
  padding: '6px 2px',
  letterSpacing: '0.01em',
}

export default function LandingNav() {
  const navigate = useNavigate()
  const [scrolled, setScrolled] = useState(false)
  const [mobileOpen, setMobileOpen] = useState(false)
  const [hoveredLink, setHoveredLink] = useState(null)
  const [loginHovered, setLoginHovered] = useState(false)
  const [signupHovered, setSignupHovered] = useState(false)

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

  function goToContact() {
    setMobileOpen(false)
    const el = document.getElementById('contact')
    if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }

  const navLinks = [
    { label: 'Features', target: 'features' },
    { label: 'About', target: 'about' },
    { label: 'Contact', target: 'contact' },
  ]

  const mobileItemStyle = {
    ...linkStyle,
    color: '#CBD5E1',
    fontSize: '1rem',
    padding: '12px 0',
    width: '100%',
    textAlign: 'center',
  }

  return (
    <nav
      role="navigation"
      aria-label="Main navigation"
      style={{
        position: 'fixed',
        top: 0,
        left: 0,
        right: 0,
        zIndex: 1000,
        padding: scrolled ? '10px 0' : '16px 0',
        background: scrolled
          ? 'rgba(15,23,42,0.92)'
          : 'transparent',
        backdropFilter: scrolled ? 'blur(16px)' : 'none',
        WebkitBackdropFilter: scrolled ? 'blur(16px)' : 'none',
        borderBottom: scrolled ? '1px solid rgba(255,255,255,0.06)' : '1px solid transparent',
        transition: 'all 0.3s cubic-bezier(0.16,1,0.3,1)',
      }}
    >
      <div
        style={{
          maxWidth: 1200,
          margin: '0 auto',
          padding: '0 24px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
        }}
      >
        {/* Logo */}
        <div
          onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })}
          onKeyDown={(e) => { if (e.key === 'Enter') window.scrollTo({ top: 0, behavior: 'smooth' }) }}
          role="button"
          tabIndex={0}
          aria-label="SmartBillr home"
          style={{ display: 'flex', alignItems: 'center', gap: 11, cursor: 'pointer' }}
        >
          <div
            style={{
              width: 34,
              height: 34,
              borderRadius: 10,
              background: 'linear-gradient(135deg, var(--accent-600, #4F46E5), var(--accent-500, #6366F1))',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              boxShadow: '0 3px 12px rgba(79,70,229,0.4)',
              flexShrink: 0,
            }}
          >
            <svg width="17" height="17" fill="none" viewBox="0 0 24 24" stroke="white" strokeWidth={2.2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
            </svg>
          </div>
          <span style={{ fontSize: '1.3rem', fontWeight: 800, letterSpacing: '-0.8px', color: '#F8FAFC' }}>
            Smart<span style={{ color: 'var(--accent-400, #818CF8)' }}>Billr</span>
          </span>
        </div>

        {/* Desktop nav links */}
        <div className="landing-nav-links" style={{ display: 'flex', alignItems: 'center', gap: 32 }}>
          {navLinks.map((link) => (
            <button
              key={link.target}
              onClick={() => scrollTo(link.target)}
              onMouseEnter={() => setHoveredLink(link.target)}
              onMouseLeave={() => setHoveredLink(null)}
              style={{
                ...linkStyle,
                color: hoveredLink === link.target ? '#F8FAFC' : '#94A3B8',
              }}
            >
              {link.label}
            </button>
          ))}
        </div>

        {/* Desktop buttons */}
        <div className="landing-nav-buttons" style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <button
            onClick={() => navigate('/login')}
            onMouseEnter={() => setLoginHovered(true)}
            onMouseLeave={() => setLoginHovered(false)}
            style={{
              padding: '8px 18px',
              borderRadius: 10,
              border: '1px solid rgba(255,255,255,0.12)',
              background: loginHovered ? 'rgba(255,255,255,0.08)' : 'transparent',
              color: '#E2E8F0',
              fontSize: '0.8rem',
              fontWeight: 600,
              cursor: 'pointer',
              fontFamily: 'inherit',
              transition: 'all 0.16s ease',
            }}
          >
            Login
          </button>
          <button
            onClick={() => goToContact()}
            onMouseEnter={() => setSignupHovered(true)}
            onMouseLeave={() => setSignupHovered(false)}
            style={{
              padding: '8px 18px',
              borderRadius: 10,
              border: 'none',
              background: signupHovered
                ? 'linear-gradient(135deg, var(--accent-700, #4338CA), var(--accent-600, #4F46E5))'
                : 'linear-gradient(135deg, var(--accent-600, #4F46E5), var(--accent-500, #6366F1))',
              boxShadow: signupHovered
                ? '0 6px 20px rgba(79,70,229,0.4)'
                : '0 2px 10px rgba(79,70,229,0.25)',
              color: '#fff',
              fontSize: '0.8rem',
              fontWeight: 600,
              cursor: 'pointer',
              fontFamily: 'inherit',
              transition: 'all 0.16s ease',
              transform: signupHovered ? 'translateY(-1px)' : 'translateY(0)',
            }}
          >
            Sign Up
          </button>
        </div>

        {/* Mobile hamburger */}
        <button
          className="landing-nav-hamburger"
          onClick={() => setMobileOpen(!mobileOpen)}
          aria-label={mobileOpen ? 'Close menu' : 'Open menu'}
          aria-expanded={mobileOpen}
          style={{
            background: 'none',
            border: 'none',
            cursor: 'pointer',
            padding: 4,
            color: '#94A3B8',
            display: 'none',
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

      {/* Mobile menu */}
      {mobileOpen && (
        <div
          className="landing-nav-mobile"
          style={{
            padding: '16px 24px 24px',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            gap: 4,
          }}
        >
          {navLinks.map((link) => (
            <button
              key={link.target}
              onClick={() => scrollTo(link.target)}
              style={mobileItemStyle}
            >
              {link.label}
            </button>
          ))}
          <div style={{ display: 'flex', gap: 10, marginTop: 12, width: '100%' }}>
            <button
              onClick={() => navigate('/login')}
              style={{
                flex: 1,
                padding: '10px 0',
                borderRadius: 10,
                border: '1px solid rgba(255,255,255,0.12)',
                background: 'transparent',
                color: '#E2E8F0',
                fontSize: '0.85rem',
                fontWeight: 600,
                cursor: 'pointer',
                fontFamily: 'inherit',
              }}
            >
              Login
            </button>
            <button
              onClick={() => goToContact()}
              style={{
                flex: 1,
                padding: '10px 0',
                borderRadius: 10,
                border: 'none',
                background: 'linear-gradient(135deg, var(--accent-600, #4F46E5), var(--accent-500, #6366F1))',
                color: '#fff',
                fontSize: '0.85rem',
                fontWeight: 600,
                cursor: 'pointer',
                fontFamily: 'inherit',
              }}
            >
              Sign Up
            </button>
          </div>
        </div>
      )}
    </nav>
  )
}
