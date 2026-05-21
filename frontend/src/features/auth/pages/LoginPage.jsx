import { useState } from 'react'
import AuthLayout from '../../../app/layouts/AuthLayout'
import { useLogin } from '../hooks/useAuth'

export default function LoginPage() {
  const { login, isLoading } = useLogin()
  const [email, setEmail]           = useState('')
  const [password, setPassword]     = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [focused, setFocused]       = useState('')
  const [errors, setErrors]         = useState({})

  function validate() {
    const errs = {}
    if (!email) errs.email = 'Email is required'
    else if (!/\S+@\S+\.\S+/.test(email)) errs.email = 'Enter a valid email'
    if (!password) errs.password = 'Password is required'
    else if (password.length < 6) errs.password = 'Minimum 6 characters'
    return errs
  }

  async function handleSubmit(e) {
    e.preventDefault()
    const errs = validate()
    if (Object.keys(errs).length > 0) { setErrors(errs); return }
    setErrors({})
    await login(email, password)
  }

  function getInputStyle(name, hasError) {
    const isFocused = focused === name
    return {
      width: '100%',
      padding: '11px 14px 11px 40px',
      background: isFocused ? '#FFFFFF' : '#F8FAFC',
      border: `1.5px solid ${hasError ? '#DC2626' : isFocused ? '#4F46E5' : '#E2E8F0'}`,
      borderRadius: 11,
      fontSize: '0.84rem',
      fontFamily: "'Plus Jakarta Sans', sans-serif",
      color: '#0F172A',
      outline: 'none',
      boxShadow: hasError
        ? '0 0 0 3px rgba(220,38,38,0.10)'
        : isFocused
          ? '0 0 0 3px rgba(79,70,229,0.12)'
          : 'none',
      transition: 'all 0.18s ease',
    }
  }

  return (
    <AuthLayout>

      {/* Header */}
      <div style={{ marginBottom: '1.75rem' }}>
        <h1 style={{
          fontSize: '1.4rem', fontWeight: 800,
          color: '#0F172A', letterSpacing: '-0.4px', margin: 0, marginBottom: 6,
        }}>
          Welcome back
        </h1>
        <p style={{ fontSize: '0.84rem', color: '#64748B', margin: 0 }}>
          Sign in to continue to SmartBillr
        </p>
      </div>

      <form onSubmit={handleSubmit} noValidate>

        {/* Email field */}
        <div style={{ marginBottom: '1rem' }}>
          <label style={labelStyle}>Email address</label>
          <div style={{ position: 'relative' }}>
            <span style={iconWrap}>
              <svg width="15" height="15" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round"
                  d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
              </svg>
            </span>
            <input
              type="email"
              value={email}
              onChange={(e) => { setEmail(e.target.value); setErrors(p => ({ ...p, email: '' })) }}
              onFocus={() => setFocused('email')}
              onBlur={() => setFocused('')}
              placeholder="you@company.com"
              autoComplete="email"
              style={getInputStyle('email', !!errors.email)}
            />
          </div>
          {errors.email && <p style={errorStyle}>{errors.email}</p>}
        </div>

        {/* Password field */}
        <div style={{ marginBottom: '0.5rem' }}>
          <label style={labelStyle}>Password</label>
          <div style={{ position: 'relative' }}>
            <span style={iconWrap}>
              <svg width="15" height="15" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round"
                  d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
              </svg>
            </span>
            <input
              type={showPassword ? 'text' : 'password'}
              value={password}
              onChange={(e) => { setPassword(e.target.value); setErrors(p => ({ ...p, password: '' })) }}
              onFocus={() => setFocused('password')}
              onBlur={() => setFocused('')}
              placeholder="••••••••"
              autoComplete="current-password"
              style={{ ...getInputStyle('password', !!errors.password), paddingRight: '3.8rem' }}
            />
            <button
              type="button"
              onClick={() => setShowPassword(!showPassword)}
              style={{
                position: 'absolute', right: '0.85rem', top: '50%',
                transform: 'translateY(-50%)',
                background: 'none', border: 'none', cursor: 'pointer',
                fontSize: '0.6rem', fontWeight: 700,
                letterSpacing: '0.08em', color: '#94A3B8',
                fontFamily: "'Plus Jakarta Sans', sans-serif",
                transition: 'color 0.14s',
              }}
              onMouseEnter={e => e.currentTarget.style.color = '#4F46E5'}
              onMouseLeave={e => e.currentTarget.style.color = '#94A3B8'}
            >
              {showPassword ? 'HIDE' : 'SHOW'}
            </button>
          </div>
          {errors.password && <p style={errorStyle}>{errors.password}</p>}
        </div>

        {/* Forgot password */}
        <div style={{ textAlign: 'right', marginBottom: '1.5rem' }}>
          <span style={{
            fontSize: '0.75rem', color: '#4F46E5',
            fontWeight: 600, cursor: 'pointer',
            transition: 'color 0.14s',
          }}
            onMouseEnter={e => e.currentTarget.style.color = '#4338CA'}
            onMouseLeave={e => e.currentTarget.style.color = '#4F46E5'}
          >
            Forgot password?
          </span>
        </div>

        {/* Submit button */}
        <button
          type="submit"
          disabled={isLoading}
          style={{
            width: '100%',
            padding: '12px',
            background: isLoading
              ? '#A5B4FC'
              : 'linear-gradient(135deg, #4F46E5 0%, #6366F1 100%)',
            boxShadow: isLoading ? 'none' : '0 8px 24px rgba(79,70,229,0.35)',
            color: '#fff',
            border: 'none',
            borderRadius: 12,
            fontSize: '0.875rem',
            fontWeight: 700,
            letterSpacing: '0.2px',
            fontFamily: "'Plus Jakarta Sans', sans-serif",
            cursor: isLoading ? 'not-allowed' : 'pointer',
            transition: 'all 0.18s ease',
          }}
          onMouseEnter={(e) => {
            if (!isLoading) {
              e.currentTarget.style.transform = 'translateY(-2px)'
              e.currentTarget.style.boxShadow = '0 14px 32px rgba(79,70,229,0.45)'
            }
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.transform = 'translateY(0)'
            e.currentTarget.style.boxShadow = isLoading ? 'none' : '0 8px 24px rgba(79,70,229,0.35)'
          }}
          onMouseDown={e => { if (!isLoading) e.currentTarget.style.transform = 'scale(0.98)' }}
          onMouseUp={e => { if (!isLoading) e.currentTarget.style.transform = 'translateY(-2px)' }}
        >
          {isLoading ? (
            <span style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8 }}>
              <SpinnerIcon />
              Signing in...
            </span>
          ) : (
            '→ Sign in to SmartBillr'
          )}
        </button>

      </form>

      {/* Security note */}
      <div style={{
        marginTop: '1.75rem',
        paddingTop: '1.25rem',
        borderTop: '1px solid #F1F5F9',
        display: 'flex', alignItems: 'center',
        justifyContent: 'center', gap: '0.5rem',
      }}>
        <svg width="12" height="12" fill="none" viewBox="0 0 24 24" stroke="#94A3B8" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round"
            d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
        </svg>
        <span style={{ fontSize: '0.68rem', color: '#94A3B8' }}>
          Secured by Supabase Auth · JWT encrypted
        </span>
      </div>

    </AuthLayout>
  )
}

// ─── Spinner icon ────────────────────────────────────────
function SpinnerIcon() {
  return (
    <svg
      width="16" height="16" viewBox="0 0 24 24" fill="none"
      stroke="white" strokeWidth={2.5} strokeLinecap="round"
      style={{ animation: 'spin 0.7s linear infinite' }}
    >
      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
      <path d="M12 2v4M12 18v4M4.93 4.93l2.83 2.83M16.24 16.24l2.83 2.83M2 12h4M18 12h4M4.93 19.07l2.83-2.83M16.24 7.76l2.83-2.83" />
    </svg>
  )
}

// ─── Shared styles ───────────────────────────────────────
const labelStyle = {
  display: 'block',
  fontSize: '0.75rem',
  fontWeight: 600,
  color: '#374151',
  marginBottom: 6,
}

const iconWrap = {
  position: 'absolute',
  left: '12px',
  top: '50%',
  transform: 'translateY(-50%)',
  color: '#94A3B8',
  pointerEvents: 'none',
  display: 'flex',
  alignItems: 'center',
}

const errorStyle = {
  marginTop: '0.35rem',
  fontSize: '0.74rem',
  color: '#DC2626',
  fontWeight: 500,
}
