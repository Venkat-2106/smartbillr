// src/features/auth/pages/LoginPage.jsx
//
// FIXES APPLIED:
//   1. Replaced useState + manual validate() with React Hook Form + Zod
//      — same validation rules and same error messages, just the correct pattern
//   2. Fixed fontFamily: 'Inter, sans-serif' → fontFamily: 'inherit'
//      — LoginPage now inherits Plus Jakarta Sans from the design system
//   3. Replaced all hardcoded hex colors with CSS vars
//      — dark mode now works correctly on the login page
//   4. Replaced onMouseEnter/Leave DOM mutations with React state hover
//      — same as the fix already applied in DashboardLayout, Table, StatCard

import { useState } from 'react'
import { useForm }  from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z }           from 'zod'
import AuthLayout from '../../../app/layouts/AuthLayout'
import { useLogin, useForgotPassword } from '../hooks/useAuth'

// ── Validation schema (replaces the inline validate() function) ──────────────
const loginSchema = z.object({
  email:    z.string().min(1, 'Email is required').email('Enter a valid email'),
  password: z.string().min(6, 'Minimum 6 characters'),
})

export default function LoginPage() {
  const { login, isLoading }                        = useLogin()
  const { sendResetEmail, isLoading: resetLoading } = useForgotPassword()

  // UI-only state — not form fields
  const [showPassword, setShowPassword] = useState(false)
  const [focused,      setFocused]      = useState('')
  const [btnHovered,   setBtnHovered]   = useState(false)
  const [linkHovered,  setLinkHovered]  = useState(false)

  // FIX 1: React Hook Form + Zod — replaces [email, setEmail], [password, setPassword],
  // [errors, setErrors], and the manual validate() function entirely.
  const {
    register,
    handleSubmit,
    getValues,
    formState: { errors },
  } = useForm({
    resolver: zodResolver(loginSchema),
  })

  async function onSubmit(data) {
    await login(data.email, data.password)
  }

  // getValues() reads the current email without triggering form validation
  async function handleForgotPassword() {
    await sendResetEmail(getValues('email'))
  }

  // FIX 2 + 3: CSS vars instead of hardcoded hex; 'inherit' instead of 'Inter'
  function inputStyle(name, hasError) {
    const isFocused = focused === name
    return {
      width:        '100%',
      padding:      '10px 12px 10px 36px',
      background:   isFocused ? 'var(--bg-card)' : 'var(--bg-subtle)',
      border:       `1px solid ${hasError ? 'var(--danger)' : isFocused ? 'var(--accent-600)' : 'var(--border)'}`,
      borderRadius: '10px',
      fontSize:     '0.82rem',
      fontFamily:   'inherit',                        // FIX 2: was 'Inter, sans-serif'
      color:        'var(--text-primary)',
      outline:      'none',
      boxShadow:    hasError
        ? '0 0 0 4px rgba(220,38,38,0.1)'
        : isFocused
          ? '0 0 0 4px var(--accent-glow)'
          : 'none',
      transition: 'all 0.2s ease',
    }
  }

  return (
    <AuthLayout>
      {/* FIX 3: #0F172A → var(--text-primary) */}
      <p style={{ fontSize: '1.3rem', fontWeight: '700', color: 'var(--text-primary)', marginBottom: '4px' }}>
        Welcome back
      </p>
      {/* FIX 3: #64748B → var(--text-secondary) */}
      <p style={{ fontSize: '0.82rem', color: 'var(--text-secondary)', marginBottom: '1.5rem' }}>
        Sign in to continue to SmartBillr
      </p>

      {/* FIX 1: handleSubmit from useForm replaces manual onSubmit */}
      <form onSubmit={handleSubmit(onSubmit)} noValidate>

        <div style={{ marginBottom: '1rem' }}>
          <label style={labelStyle}>Email address</label>
          <div style={{ position: 'relative' }}>
            <span style={iconStyle}>✉</span>
            {/* FIX 1: {...register('email')} replaces value/onChange pair */}
            <input
              {...register('email')}
              type="email"
              onFocus={() => setFocused('email')}
              onBlur={(e) => { register('email').onBlur(e); setFocused('') }}
              placeholder="you@company.com"
              autoComplete="email"
              style={inputStyle('email', !!errors.email)}
            />
          </div>
          {/* FIX 1: errors.email.message from Zod, not from manual validate() */}
          {errors.email && <p style={errorStyle}>{errors.email.message}</p>}
        </div>

        <div style={{ marginBottom: '0.4rem' }}>
          <label style={labelStyle}>Password</label>
          <div style={{ position: 'relative' }}>
            <span style={iconStyle}>🔒</span>
            <input
              {...register('password')}
              type={showPassword ? 'text' : 'password'}
              onFocus={() => setFocused('password')}
              onBlur={(e) => { register('password').onBlur(e); setFocused('') }}
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
                color: 'var(--text-secondary)',   // FIX 3: was #64748B
                fontFamily: 'inherit',            // FIX 2: was 'Inter, sans-serif'
              }}
            >
              {showPassword ? 'HIDE' : 'SHOW'}
            </button>
          </div>
          {errors.password && <p style={errorStyle}>{errors.password.message}</p>}
        </div>

        <div style={{ textAlign: 'right', marginBottom: '1.25rem' }}>
          {/* FIX 4: onMouseEnter/Leave state instead of e.currentTarget.style DOM mutation */}
          <span
            onClick={handleForgotPassword}
            onMouseEnter={() => setLinkHovered(true)}
            onMouseLeave={() => setLinkHovered(false)}
            style={{
              fontSize:   '0.74rem',
              color:      resetLoading
                ? 'var(--text-muted)'
                : linkHovered
                  ? 'var(--accent-700)'
                  : 'var(--accent-600)',         // FIX 3: was #3B82F6 / #1D4ED8
              fontWeight: '500',
              cursor:     resetLoading ? 'not-allowed' : 'pointer',
              transition: 'color 0.14s',
            }}
          >
            {resetLoading ? 'Sending...' : 'Forgot password?'}
          </span>
        </div>

        {/* FIX 4: hover state via React state — transform/boxShadow derived from state */}
        <button
          type="submit"
          disabled={isLoading}
          onMouseEnter={() => setBtnHovered(true)}
          onMouseLeave={() => setBtnHovered(false)}
          style={{
            width:        '100%',
            padding:      '11px',
            background:   isLoading
              ? 'var(--text-muted)'
              : 'linear-gradient(135deg, var(--accent-600), var(--accent-500))', // FIX 3
            boxShadow:    isLoading
              ? 'none'
              : btnHovered
                ? '0 15px 30px var(--accent-glow)'
                : '0 10px 25px var(--accent-glow)',   // FIX 3
            color:        '#fff',
            border:       'none',
            borderRadius: '12px',
            fontSize:     '0.875rem',
            fontWeight:   '600',
            letterSpacing: '0.3px',
            fontFamily:   'inherit',                  // FIX 2
            cursor:       isLoading ? 'not-allowed' : 'pointer',
            transform:    (!isLoading && btnHovered) ? 'translateY(-2px)' : 'translateY(0)',
            transition:   'transform 0.15s, box-shadow 0.15s',
          }}
        >
          {isLoading ? 'Signing in...' : '→ Sign in to SmartBillr'}
        </button>

      </form>

      <div style={{
        marginTop:      '1.5rem',
        paddingTop:     '1.25rem',
        borderTop:      '1px solid var(--border)',  // FIX 3: was #F1F5F9
        display:        'flex',
        alignItems:     'center',
        justifyContent: 'center',
        gap:            '0.4rem',
      }}>
        <span style={{ fontSize: '0.75rem' }}>🔐</span>
        {/* FIX 3: #94A3B8 → var(--text-muted) */}
        <span style={{ fontSize: '0.68rem', color: 'var(--text-muted)' }}>
          Secured by Supabase Auth · JWT encrypted
        </span>
      </div>
    </AuthLayout>
  )
}

// ── Style constants ───────────────────────────────────────────────────────────
// FIX 3: all hardcoded hex replaced with CSS vars

const labelStyle = {
  display:      'block',
  fontSize:     '0.74rem',
  fontWeight:   '600',
  color:        'var(--text-primary)',  // was #374151
  marginBottom: '5px',
}

const iconStyle = {
  position:      'absolute',
  left:          '10px',
  top:           '50%',
  transform:     'translateY(-50%)',
  fontSize:      '0.8rem',
  pointerEvents: 'none',
}

const errorStyle = {
  marginTop:  '0.3rem',
  fontSize:   '0.74rem',
  color:      'var(--danger)',   // was #DC2626
  fontWeight: '500',
}