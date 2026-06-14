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
  const [submitHovered, setSubmitHovered] = useState(false)
  const [linkHovered,   setLinkHovered]   = useState(false)
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
      background: isFocused ? 'var(--bg-card)' : 'var(--bg-subtle)',
      border: `1px solid ${hasError ? 'var(--danger-text)' : isFocused ? 'var(--accent-500)' : 'var(--border)'}`,
      borderRadius: '10px',
      fontSize: '0.82rem',
      fontFamily: 'inherit',
      color: 'var(--text-primary)',
      outline: 'none',
      boxShadow: hasError
        ? '0 0 0 3px var(--danger-bg)'
        : isFocused
          ? '0 0 0 3px color-mix(in srgb, var(--accent-500) 20%, transparent)'
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
            border: '3px solid var(--border)',
            borderTopColor: 'var(--accent-600)',
            borderRadius: '50%',
            animation: 'spin 0.7s linear infinite',
          }} />
          <style>{`@keyframes spin { to { transform: rotate(360deg) } }`}</style>
          <p style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', margin: 0 }}>
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
        <p style={{ fontSize: '1.3rem', fontWeight: 700, color: 'var(--text-primary)', marginBottom: 4 }}>
          Set new password
        </p>
        <p style={{ fontSize: '0.82rem', color: 'var(--text-secondary)', margin: 0 }}>
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
                color: 'var(--text-secondary)', fontFamily: 'inherit',
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
          onMouseEnter={() => !isLoading && setSubmitHovered(true)}
          onMouseLeave={() => setSubmitHovered(false)}
          style={{
            width: '100%', padding: '11px',
            background: isLoading ? 'var(--accent-300)' : 'linear-gradient(135deg, var(--accent-600), var(--accent-700))',
            boxShadow: isLoading || !submitHovered ? 'none' : '0 12px 28px color-mix(in srgb, var(--accent-600) 40%, transparent)',
            color: '#fff', border: 'none', borderRadius: '12px',
            fontSize: '0.875rem', fontWeight: 600,
            fontFamily: 'inherit',
            cursor: isLoading ? 'not-allowed' : 'pointer',
            transform: submitHovered ? 'translateY(-2px)' : 'translateY(0)',
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
          onMouseEnter={() => setLinkHovered(true)}
          onMouseLeave={() => setLinkHovered(false)}
          style={{
            fontSize: '0.74rem', color: linkHovered ? 'var(--accent-700)' : 'var(--accent-500)',
            fontWeight: 500, cursor: 'pointer',
            transition: 'color 0.14s',
          }}
        >
          ← Back to sign in
        </span>
      </div>
    </AuthLayout>
  )
}

const labelStyle = {
  display: 'block', fontSize: '0.74rem',
  fontWeight: 600, color: 'var(--text-primary)', marginBottom: 5,
}
const iconWrap = {
  position: 'absolute', left: '10px',
  top: '50%', transform: 'translateY(-50%)',
  fontSize: '0.8rem', pointerEvents: 'none',
}
const errorStyle = {
  marginTop: '0.3rem', fontSize: '0.74rem',
  color: 'var(--danger-text)', fontWeight: 500,
}