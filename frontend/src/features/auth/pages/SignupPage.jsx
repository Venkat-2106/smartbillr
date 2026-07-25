import { useState, useEffect } from 'react'

// UI/UX Audit (2026-07-18):
//   Finding #5  — All fields validated via react-hook-form + Zod schema
//   Finding #12 — Country/state selects replaced with shared COUNTRIES module
//                 and StateDropdown component (deduplicates ~70 lines of local data)
//   See UI_UX_AUDIT_REPORT.md
import { useNavigate } from 'react-router-dom'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import AuthLayout from '../../../app/layouts/AuthLayout'
import { registerBusiness } from '../../subscription/api/subscriptionApi'
import toast from 'react-hot-toast'
import FormField, { selectStyle } from '../../../shared/components/FormField'
import StateDropdown from '../../../shared/components/StateDropdown'
import { COUNTRIES } from '../../../shared/data/countries'

const signupSchema = z.object({
  business_name:          z.string().min(1, 'Business name is required'),
  owner_name:             z.string().min(1, 'Your name is required'),
  owner_email:            z.string().min(1, 'Email is required').email('Enter a valid email'),
  owner_password:         z.string().min(1, 'Password is required').min(8, 'Minimum 8 characters'),
  business_phone:         z.string().optional().or(z.literal('')),
  business_country_code:  z.string().min(1, 'Country is required'),
  business_state:         z.string().min(1, 'State is required'),
  business_address:       z.string().optional().or(z.literal('')),
})

export default function SignupPage() {
  const navigate = useNavigate()
  const [isLoading, setIsLoading] = useState(false)
  const [submitted, setSubmitted] = useState(false)
  const [serverError, setServerError] = useState('')

  const {
    register,
    handleSubmit,
    watch,
    setValue,
    setError,
    formState: { errors },
  } = useForm({
    resolver: zodResolver(signupSchema),
    defaultValues: {
      business_name: '',
      owner_name: '',
      owner_email: '',
      owner_password: '',
      business_phone: '',
      business_country_code: '',
      business_state: '',
      business_address: '',
    },
  })

  const countryCode = watch('business_country_code')

  useEffect(() => {
    if (countryCode) setValue('business_state', '')
  }, [countryCode, setValue])

  async function onSubmit(data) {
    if (submitted) return
    setSubmitted(true)
    setServerError('')
    setIsLoading(true)
    try {
      const payload = { ...data }
      if (!payload.business_phone) delete payload.business_phone
      if (!payload.business_address) payload.business_address = null
      const res = await registerBusiness(payload)
      if (res && res.business_id) {
        toast.success('Business created successfully! Check your email to sign in.')
        navigate('/login')
      } else {
        setServerError(res?.message || 'Registration failed. Please try again.')
      }
    } catch (err) {
      const data = err?.response?.data
      let msg = ''
      if (data?.message) {
        msg = data.message
      } else if (data?.detail) {
        msg = typeof data.detail === 'string' ? data.detail : Array.isArray(data.detail) ? data.detail.map(d => d.msg).filter(Boolean).join('; ') : ''
      } else if (err?.message) {
        msg = err.message
      }
      if (msg.toLowerCase().includes('already registered')) {
        setServerError('')
        setError('owner_email', { type: 'server', message: msg })
      } else {
        setServerError(msg || 'Registration failed. Please try again.')
      }
    } finally {
      setIsLoading(false)
      setSubmitted(false)
    }
  }

  return (
    <AuthLayout>
      <p style={{ fontSize: '1.3rem', fontWeight: '700', color: 'var(--text-primary)', marginBottom: '4px' }}>
        Create your business
      </p>
      <p style={{ fontSize: '0.82rem', color: 'var(--text-secondary)', marginBottom: '1.5rem' }}>
        Start your free 30-day trial
      </p>

      {serverError && (
        <div style={{
          padding: '10px 14px', borderRadius: '10px',
          background: '#FEF2F2', border: '1px solid #FECACA',
          color: '#DC2626', fontSize: '0.78rem', fontWeight: '600',
          marginBottom: '1rem',
        }}>
          {serverError}
        </div>
      )}

      <form onSubmit={handleSubmit(onSubmit)}>
        <FormField label="Business name" error={errors.business_name?.message} required style={{ marginBottom: 16 }}>
          <input
            {...register('business_name')}
            className={`input ${errors.business_name ? 'error' : ''}`}
            placeholder="Sri MahaLakshmi Pvt. Ltd."
          />
        </FormField>

        <FormField label="Your name" error={errors.owner_name?.message} required style={{ marginBottom: 16 }}>
          <input
            {...register('owner_name')}
            className={`input ${errors.owner_name ? 'error' : ''}`}
            placeholder="Ravi Kumar"
          />
        </FormField>

        <FormField label="Email address" error={errors.owner_email?.message} required style={{ marginBottom: 16 }}>
          <input
            {...register('owner_email')}
            className={`input ${errors.owner_email ? 'error' : ''}`}
            type="email"
            placeholder="you@company.com"
            autoComplete="email"
          />
        </FormField>

        <FormField label="Password" error={errors.owner_password?.message} required style={{ marginBottom: 16 }} helper="Min 8 characters, with uppercase, lowercase & a digit">
          <input
            {...register('owner_password')}
            className={`input ${errors.owner_password ? 'error' : ''}`}
            type="password"
            placeholder="At least 8 characters"
            autoComplete="new-password"
          />
        </FormField>

        <FormField label="Phone (optional)" error={errors.business_phone?.message} style={{ marginBottom: 16 }}>
          <input
            {...register('business_phone')}
            className="input"
            placeholder="+1 234 567 8900"
          />
        </FormField>

        <FormField label="Country" error={errors.business_country_code?.message} required style={{ marginBottom: 16 }}>
          <select
            {...register('business_country_code')}
            className="sb-select"
            style={selectStyle}
          >
            <option value="">Select country</option>
            {COUNTRIES.filter(c => c.value).map(c => (
              <option key={c.value} value={c.value}>{c.label}</option>
            ))}
          </select>
        </FormField>

        <div style={{ marginBottom: 16 }}>
          <StateDropdown
            countryCode={countryCode}
            value={watch('business_state')}
            onChange={(val) => setValue('business_state', val)}
            error={errors.business_state?.message}
            required
          />
        </div>

        <FormField label="Address (optional)" error={errors.business_address?.message} style={{ marginBottom: 20 }}>
          <input
            {...register('business_address')}
            className="input"
            placeholder="123 Main St, City"
          />
        </FormField>

        <button
          type="submit"
          disabled={isLoading}
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
            fontSize: '0.875rem', fontWeight: '600',
            letterSpacing: '0.3px', fontFamily: 'Inter, sans-serif',
            cursor: isLoading ? 'not-allowed' : 'pointer',
            transition: 'transform 0.15s, box-shadow 0.15s',
          }}
        >
          {isLoading ? 'Creating account...' : '→ Create your business'}
        </button>
      </form>

      <div style={{
        marginTop: '1.25rem', textAlign: 'center',
      }}>
        <span style={{ fontSize: '0.78rem', color: 'var(--text-muted)' }}>
          Already have an account?{' '}
        </span>
        <span
          onClick={() => navigate('/login')}
          style={{
            fontSize: '0.78rem', color: '#3B82F6', fontWeight: '600',
            cursor: 'pointer',
          }}
          onMouseEnter={e => e.currentTarget.style.color = '#1D4ED8'}
          onMouseLeave={e => e.currentTarget.style.color = '#3B82F6'}
        >
          Sign in
        </span>
      </div>

      <div style={{ marginTop: '0.75rem', textAlign: 'center' }}>
        <span
          onClick={() => navigate('/subscription')}
          style={{
            fontSize: '0.78rem', color: '#3B82F6', fontWeight: '600',
            cursor: 'pointer',
          }}
          onMouseEnter={e => e.currentTarget.style.color = '#1D4ED8'}
          onMouseLeave={e => e.currentTarget.style.color = '#3B82F6'}
        >
          View pricing plans &rarr;
        </span>
      </div>
    </AuthLayout>
  )
}
