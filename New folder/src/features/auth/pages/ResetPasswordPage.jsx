import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import AuthLayout from '../../../app/layouts/AuthLayout'
import { useResetPassword } from '../hooks/useAuth'
import supabase from '../../../lib/supabaseClient'
import toast from 'react-hot-toast'

export default function ResetPasswordPage() {
  const { resetPassword, isLoading } = useResetPassword()
  const navigate = useNavigate()

  const [password,    setPassword]    = useState('')
  const [confirm,     setConfirm]     = useState('')
  const [showPass,    setShowPass]    = useState(false)
  const [focused,     setFocused]     = useState('')
  const [errors,      setErrors]      = useState({})
  const [sessionReady, setSessionReady] = useState(false)
  const [checking,    setChecking]    = useState(true)

  // ── Supabase puts recovery token in the URL hash when user clicks the link.
  // We call getSession() to exchange it for a live session automatically.
  // If no valid session → the link is expired → redirect to login.
  useEffect(() => {
    async function checkSession() {
      const { data, error } = await supabase.auth.getSession()

      if (error || !data?.session) {
        toast.error('Reset link is invalid or has expired. Request a new one.')
        navigate('/login')
        return
      }

      setSessionReady(true)
      setChecking(false)
    }

    // Also listen for the SIGNED_IN event that Supabase fires when it
    // processes the recovery token from the hash
    const { data: listener } = supabase.auth.onAuthStateChange((event) => {
      if (event === 'PASSWORD_RECOVERY') {
        setSessionReady(true)
        setChecking(false)
      }
    })

    checkSession()

    return () => listener?.subscription?.unsubscribe()
  }, [navigate])

  function validate() {
    const errs = {}
    if (!password)              errs.password = 'Password is required'
    else if (password.length < 6) errs.password = 'Minimum 6 characters'
    if (!confirm)               errs.confirm  = 'Please confirm your password'
    else if (confirm !== password) errs.confirm = 'Passwords do not match'
    return errs
  }

  async function handleSubmit(e) {
    e.preventDefault()
    const errs = validate()
    if (Object.keys(errs).length) { setErrors(errs); return }
    setErrors({})
    await resetPassword(password)
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
      fontFamily: 'inherit',
      color: '#0F172A',
      outline: 'none',
      boxShadow: hasError
        ? '0 0 0 4px rgba(220,38,38,0.1)'
        : isFocused
          ? '0 0 0 4px rgba(59,130,246,0.15)'
          : 'none',
      transition: 'all 0.2s ease',
    }
  }

  // ── While checking the session ──
  if (checking) {
    return (
      <AuthLayout>
        <div style={{ textAlign: 'center', padding: '32px 0' }}>
          <div style={{
            width: 40, height: 40, margin: '0 auto 16px',
            border: '3px solid #E2E8F0',
            borderTopColor: '#4F46E5',
            borderRadius: '50%',
            animation: 'spin 0.7s linear infinite',
          }} />
          <style>{`@keyframes spin { to { transform: rotate(360deg) } }`}</style>
          <p style={{ fontSize: '0.85rem', color: '#64748B', margin: 0 }}>
            Verifying your reset link...
          </p>
        </div>
      </AuthLayout>
    )
  }

  return (
    <AuthLayout>
      {/* Header */}
      <div style={{ marginBottom: 28 }}>
        <p style={{ fontSize: '1.3rem', fontWeight: 700, color: '#0F172A', marginBottom: 4 }}>
          Set new password
        </p>
        <p style={{ fontSize: '0.82rem', color: '#64748B', margin: 0 }}>
          Choose a strong password for your SmartBillr account
        </p>
      </div>

      <form onSubmit={handleSubmit}>

        {/* New password */}
        <div style={{ marginBottom: '1rem' }}>
          <label style={labelStyle}>New password</label>
          <div style={{ position: 'relative' }}>
            <span style={iconWrap}>🔒</span>
            <input
              type={showPass ? 'text' : 'password'}
              value={password}
              onChange={e => { setPassword(e.target.value); setErrors(p => ({ ...p, password: '' })) }}
              onFocus={() => setFocused('password')}
              onBlur={() => setFocused('')}
              placeholder="Min. 6 characters"
              style={{ ...inputStyle('password', !!errors.password), paddingRight: '3.5rem' }}
            />
            <button
              type="button"
              onClick={() => setShowPass(v => !v)}
              style={{
                position: 'absolute', right: '0.75rem', top: '50%',
                transform: 'translateY(-50%)',
                background: 'none', border: 'none', cursor: 'pointer',
                fontSize: '0.6rem', fontWeight: 700, letterSpacing: '1px',
                color: '#64748B', fontFamily: 'inherit',
              }}
            >
              {showPass ? 'HIDE' : 'SHOW'}
            </button>
          </div>
          {errors.password && <p style={errorStyle}>{errors.password}</p>}
        </div>

        {/* Confirm password */}
        <div style={{ marginBottom: '1.5rem' }}>
          <label style={labelStyle}>Confirm password</label>
          <div style={{ position: 'relative' }}>
            <span style={iconWrap}>🔒</span>
            <input
              type={showPass ? 'text' : 'password'}
              value={confirm}
              onChange={e => { setConfirm(e.target.value); setErrors(p => ({ ...p, confirm: '' })) }}
              onFocus={() => setFocused('confirm')}
              onBlur={() => setFocused('')}
              placeholder="Re-enter password"
              style={inputStyle('confirm', !!errors.confirm)}
            />
          </div>
          {errors.confirm && <p style={errorStyle}>{errors.confirm}</p>}
        </div>

        {/* Submit */}
        <button
          type="submit"
          disabled={isLoading || !sessionReady}
          onMouseEnter={e => {
            if (!isLoading) {
              e.currentTarget.style.transform = 'translateY(-2px)'
              e.currentTarget.style.boxShadow = '0 15px 30px rgba(79,70,229,0.45)'
            }
          }}
          onMouseLeave={e => {
            e.currentTarget.style.transform = 'translateY(0)'
            e.currentTarget.style.boxShadow = '0 10px 25px rgba(79,70,229,0.35)'
          }}
          style={{
            width: '100%', padding: '11px',
            background: isLoading ? '#93C5FD' : 'linear-gradient(135deg, #2563EB, #4F46E5)',
            boxShadow: isLoading ? 'none' : '0 10px 25px rgba(79,70,229,0.35)',
            color: '#fff', border: 'none', borderRadius: '12px',
            fontSize: '0.875rem', fontWeight: 600,
            fontFamily: 'inherit',
            cursor: isLoading ? 'not-allowed' : 'pointer',
            transition: 'transform 0.15s, box-shadow 0.15s',
          }}
        >
          {isLoading ? 'Updating password...' : 'Update password'}
        </button>

      </form>

      {/* Back to login */}
      <div style={{ textAlign: 'center', marginTop: 20 }}>
        <span
          onClick={() => navigate('/login')}
          style={{
            fontSize: '0.74rem', color: '#3B82F6',
            fontWeight: 500, cursor: 'pointer',
            transition: 'color 0.14s',
          }}
          onMouseEnter={e => e.currentTarget.style.color = '#1D4ED8'}
          onMouseLeave={e => e.currentTarget.style.color = '#3B82F6'}
        >
          ← Back to sign in
        </span>
      </div>
    </AuthLayout>
  )
}

const labelStyle = {
  display: 'block', fontSize: '0.74rem',
  fontWeight: 600, color: '#374151', marginBottom: 5,
}
const iconWrap = {
  position: 'absolute', left: '10px',
  top: '50%', transform: 'translateY(-50%)',
  fontSize: '0.8rem', pointerEvents: 'none',
}
const errorStyle = {
  marginTop: '0.3rem', fontSize: '0.74rem',
  color: '#DC2626', fontWeight: 500,
}