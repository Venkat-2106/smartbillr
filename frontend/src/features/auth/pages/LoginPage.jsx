import { useState } from 'react'
import AuthLayout from '../../../app/layouts/AuthLayout'
import { useLogin, useForgotPassword } from '../hooks/useAuth'

export default function LoginPage() {
  const { login, isLoading }                        = useLogin()
  const { sendResetEmail, isLoading: resetLoading } = useForgotPassword()

  const [email,        setEmail]        = useState('')
  const [password,     setPassword]     = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [focused,      setFocused]      = useState('')
  const [errors,       setErrors]       = useState({})

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

  async function handleForgotPassword() {
    await sendResetEmail(email)
  }

  function inputStyle(name, hasError) {
    const isFocused = focused === name
    return {
      width: '100%',
      padding: '10px 12px 10px 36px',
      background: isFocused ? '#FFFFFF' : '#F8FAFC',
      border: `1px solid ${hasError ? '#DC2626' : isFocused ? '#3B82F6' : '#E2E8F0'}`,
      borderRadius: '10px',
      fontSize: '0.82rem',
      fontFamily: 'Inter, sans-serif',
      color: '#0F172A',
      outline: 'none',
      boxSizing: 'border-box',
      boxShadow: hasError
        ? '0 0 0 4px rgba(220,38,38,0.1)'
        : isFocused
          ? '0 0 0 4px rgba(59,130,246,0.15)'
          : 'none',
    }
  }

  return (
    <AuthLayout>
      <style>{`.login-input::placeholder { color: #94A3B8; opacity: 1; }`}</style>
      <p style={{ fontSize: '1.3rem', fontWeight: '700', color: 'var(--text-primary)', marginBottom: '4px' }}>
        Welcome back
      </p>
      <p style={{ fontSize: '0.82rem', color: 'var(--text-secondary)', marginBottom: '1.5rem' }}>
        Sign in to continue to SmartBillr
      </p>

      <form onSubmit={handleSubmit}>

        <div style={{ marginBottom: '1rem' }}>
          <label style={labelStyle}>Email address</label>
          <div style={{ position: 'relative' }}>
            <span style={iconStyle}>✉</span>
            <input
              className="login-input"
              type="email"
              value={email}
              onChange={(e) => { setEmail(e.target.value); setErrors(p => ({ ...p, email: '' })) }}
              onFocus={() => setFocused('email')}
              onBlur={() => setFocused('')}
              placeholder="you@company.com"
              autoComplete="email"
              style={inputStyle('email', !!errors.email)}
            />
          </div>
          {errors.email && <p style={errorStyle}>{errors.email}</p>}
        </div>

        <div style={{ marginBottom: '0.4rem' }}>
          <label style={labelStyle}>Password</label>
          <div style={{ position: 'relative' }}>
            <span style={iconStyle}>🔒</span>
            <input
              className="login-input"
              type={showPassword ? 'text' : 'password'}
              value={password}
              onChange={(e) => { setPassword(e.target.value); setErrors(p => ({ ...p, password: '' })) }}
              onFocus={() => setFocused('password')}
              onBlur={() => setFocused('')}
              placeholder="••••••••"
              autoComplete="current-password"
              style={{ ...inputStyle('password', !!errors.password), paddingRight: '3.5rem' }}
            />
            <button
              type="button"
              onClick={() => setShowPassword(!showPassword)}
              style={{
                position: 'absolute', right: '0.75rem', top: '50%',
                transform: 'translateY(-50%)', background: 'none',
                border: 'none', cursor: 'pointer', fontSize: '0.6rem',
                fontWeight: '700', letterSpacing: '1px',
                color: 'var(--text-secondary)', fontFamily: 'Inter, sans-serif',
              }}
            >
              {showPassword ? 'HIDE' : 'SHOW'}
            </button>
          </div>
          {errors.password && <p style={errorStyle}>{errors.password}</p>}
        </div>

        <div style={{ textAlign: 'right', marginBottom: '1.25rem' }}>
          <span
            onClick={handleForgotPassword}
            style={{
              fontSize: '0.74rem',
              color: resetLoading ? '#93C5FD' : '#3B82F6',
              fontWeight: '500',
              cursor: resetLoading ? 'not-allowed' : 'pointer',
              transition: 'color 0.14s',
            }}
            onMouseEnter={e => { if (!resetLoading) e.currentTarget.style.color = '#1D4ED8' }}
            onMouseLeave={e => { if (!resetLoading) e.currentTarget.style.color = '#3B82F6' }}
          >
            {resetLoading ? 'Sending...' : 'Forgot password?'}
          </span>
        </div>

        <button
          type="submit"
          disabled={isLoading}
          onMouseEnter={(e) => {
            if (!isLoading) {
              e.currentTarget.style.transform = 'translateY(-2px)'
              e.currentTarget.style.boxShadow = '0 15px 30px rgba(79,70,229,0.45)'
            }
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.transform = 'translateY(0)'
            e.currentTarget.style.boxShadow = '0 10px 25px rgba(79,70,229,0.35)'
          }}
          style={{
            width: '100%', padding: '11px',
            background: isLoading ? '#93C5FD' : 'linear-gradient(135deg, #2563EB, #4F46E5)',
            boxShadow: isLoading ? 'none' : '0 10px 25px rgba(79,70,229,0.35)',
            color: '#fff', border: 'none', borderRadius: '12px',
            fontSize: '0.875rem', fontWeight: '600',
            letterSpacing: '0.3px', fontFamily: 'Inter, sans-serif',
            cursor: isLoading ? 'not-allowed' : 'pointer',
            transition: 'transform 0.15s, box-shadow 0.15s',
          }}
        >
          {isLoading ? 'Signing in...' : '→ Sign in to SmartBillr'}
        </button>

      </form>

      <div style={{
        marginTop: '1.5rem', paddingTop: '1.25rem',
        borderTop: '1px solid var(--border)',
        display: 'flex', alignItems: 'center',
        justifyContent: 'center', gap: '0.4rem',
      }}>
        <span style={{ fontSize: '0.75rem' }}>🔐</span>
        <span style={{ fontSize: '0.68rem', color: 'var(--text-muted)' }}>
          Secured by Supabase Auth · JWT encrypted
        </span>
      </div>
    </AuthLayout>
  )
}

const labelStyle = {
  display: 'block', fontSize: '0.74rem',
  fontWeight: '600', color: 'var(--text-primary)', marginBottom: '5px',
}
const iconStyle = {
  position: 'absolute', left: '10px',
  top: '50%', transform: 'translateY(-50%)',
  fontSize: '0.8rem', pointerEvents: 'none',
}
const errorStyle = {
  marginTop: '0.3rem', fontSize: '0.74rem',
  color: '#DC2626', fontWeight: '500',
}
