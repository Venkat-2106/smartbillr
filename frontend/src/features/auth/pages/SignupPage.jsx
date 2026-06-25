import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import AuthLayout from '../../../app/layouts/AuthLayout'
import { registerBusiness } from '../../subscription/api/subscriptionApi'

const COUNTRIES = [
  { code: 'IN', name: 'India' },
  { code: 'US', name: 'United States' },
  { code: 'GB', name: 'United Kingdom' },
  { code: 'CA', name: 'Canada' },
  { code: 'AU', name: 'Australia' },
  { code: 'AE', name: 'UAE' },
  { code: 'SG', name: 'Singapore' },
  { code: 'MY', name: 'Malaysia' },
  { code: 'NZ', name: 'New Zealand' },
  { code: 'ZA', name: 'South Africa' },
]

const STATES_BY_COUNTRY = {
  IN: [
    'Andhra Pradesh', 'Arunachal Pradesh', 'Assam', 'Bihar', 'Chhattisgarh',
    'Goa', 'Gujarat', 'Haryana', 'Himachal Pradesh', 'Jharkhand',
    'Karnataka', 'Kerala', 'Madhya Pradesh', 'Maharashtra', 'Manipur',
    'Meghalaya', 'Mizoram', 'Nagaland', 'Odisha', 'Punjab',
    'Rajasthan', 'Sikkim', 'Tamil Nadu', 'Telangana', 'Tripura',
    'Uttar Pradesh', 'Uttarakhand', 'West Bengal',
    'Andaman and Nicobar Islands', 'Chandigarh', 'Dadra and Nagar Haveli and Daman and Diu',
    'Delhi', 'Jammu and Kashmir', 'Ladakh', 'Lakshadweep', 'Puducherry',
  ],
  US: [
    'Alabama', 'Alaska', 'Arizona', 'Arkansas', 'California',
    'Colorado', 'Connecticut', 'Delaware', 'Florida', 'Georgia',
    'Hawaii', 'Idaho', 'Illinois', 'Indiana', 'Iowa',
    'Kansas', 'Kentucky', 'Louisiana', 'Maine', 'Maryland',
    'Massachusetts', 'Michigan', 'Minnesota', 'Mississippi', 'Missouri',
    'Montana', 'Nebraska', 'Nevada', 'New Hampshire', 'New Jersey',
    'New Mexico', 'New York', 'North Carolina', 'North Dakota', 'Ohio',
    'Oklahoma', 'Oregon', 'Pennsylvania', 'Rhode Island', 'South Carolina',
    'South Dakota', 'Tennessee', 'Texas', 'Utah', 'Vermont',
    'Virginia', 'Washington', 'West Virginia', 'Wisconsin', 'Wyoming',
  ],
  GB: [
    'England', 'Scotland', 'Wales', 'Northern Ireland',
  ],
  CA: [
    'Alberta', 'British Columbia', 'Manitoba', 'New Brunswick',
    'Newfoundland and Labrador', 'Nova Scotia', 'Ontario', 'Prince Edward Island',
    'Quebec', 'Saskatchewan', 'Northwest Territories', 'Nunavut', 'Yukon',
  ],
  AU: [
    'New South Wales', 'Queensland', 'South Australia', 'Tasmania',
    'Victoria', 'Western Australia', 'Australian Capital Territory', 'Northern Territory',
  ],
  AE: [
    'Abu Dhabi', 'Ajman', 'Dubai', 'Fujairah',
    'Ras Al Khaimah', 'Sharjah', 'Umm Al Quwain',
  ],
  SG: [
    'Central Singapore', 'North East', 'North West', 'South East', 'South West',
  ],
  MY: [
    'Johor', 'Kedah', 'Kelantan', 'Kuala Lumpur', 'Labuan',
    'Melaka', 'Negeri Sembilan', 'Pahang', 'Perak', 'Perlis',
    'Pulau Pinang', 'Putrajaya', 'Sabah', 'Sarawak', 'Selangor', 'Terengganu',
  ],
  NZ: [
    'Auckland', 'Bay of Plenty', 'Canterbury', 'Gisborne',
    "Hawke's Bay", 'Manawatu-Whanganui', 'Marlborough', 'Nelson',
    'Northland', 'Otago', 'Southland', 'Taranaki',
    'Tasman', 'Waikato', 'Wellington', 'West Coast',
    'Chatham Islands',
  ],
  ZA: [
    'Eastern Cape', 'Free State', 'Gauteng', 'KwaZulu-Natal',
    'Limpopo', 'Mpumalanga', 'North West', 'Northern Cape', 'Western Cape',
  ],
}

export default function SignupPage() {
  const navigate = useNavigate()
  const [form, setForm] = useState({
    business_name: '',
    owner_name: '',
    owner_email: '',
    owner_password: '',
    business_phone: '',
    business_address: '',
    business_country_code: '',
    business_state: '',
  })
  const [errors, setErrors] = useState({})
  const [isLoading, setIsLoading] = useState(false)
  const [submitted, setSubmitted] = useState(false)
  const [serverError, setServerError] = useState('')
  const [focused, setFocused] = useState('')

  const states = STATES_BY_COUNTRY[form.business_country_code] || []

  function validate() {
    const errs = {}
    if (!form.business_name) errs.business_name = 'Business name is required'
    if (!form.owner_name) errs.owner_name = 'Your name is required'
    if (!form.owner_email) errs.owner_email = 'Email is required'
    else if (!/\S+@\S+\.\S+/.test(form.owner_email)) errs.owner_email = 'Enter a valid email'
    if (!form.owner_password) errs.owner_password = 'Password is required'
    else if (form.owner_password.length < 8) errs.owner_password = 'Minimum 8 characters'
    if (!form.business_country_code) errs.business_country_code = 'Country is required'
    if (!form.business_state) errs.business_state = 'State is required'
    return errs
  }

  async function handleSubmit(e) {
    e.preventDefault()
    if (submitted) return
    setSubmitted(true)
    setServerError('')
    const errs = validate()
    if (Object.keys(errs).length > 0) { setErrors(errs); setSubmitted(false); return }
    setErrors({})
    setIsLoading(true)
    try {
      const payload = { ...form }
      if (!payload.business_phone) delete payload.business_phone
      if (!payload.business_address) payload.business_address = null
      const res = await registerBusiness(payload)
      if (res && res.business_id) {
        navigate('/login')
      } else {
        setServerError(res?.message || 'Registration failed')
      }
    } catch (err) {
      const msg = err?.response?.data?.message || ''
      if (msg.toLowerCase().includes('already registered')) {
        setErrors(p => ({ ...p, owner_email: msg }))
      } else {
        setServerError(msg || 'Registration failed. Please try again.')
      }
    } finally {
      setIsLoading(false)
      setSubmitted(false)
    }
  }

  function set(field, value) {
    const next = { ...form, [field]: value }
    if (field === 'business_country_code') {
      next.business_state = ''
    }
    setForm(next)
    setErrors(p => ({ ...p, [field]: '' }))
  }

  return (
    <AuthLayout>
      <style>{`.signup-input::placeholder { color: #94A3B8; opacity: 1; }`}</style>
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

      <form onSubmit={handleSubmit}>
        <div style={{ marginBottom: '1rem' }}>
          <label style={labelStyle}>Business name</label>
          <input
            className="signup-input"
            value={form.business_name}
            onChange={e => set('business_name', e.target.value)}
            onFocus={() => setFocused('business_name')}
            onBlur={() => setFocused('')}
            placeholder="Acme Corp"
            style={inputStyle(focused === 'business_name', !!errors.business_name)}
          />
          {errors.business_name && <p style={errorStyle}>{errors.business_name}</p>}
        </div>

        <div style={{ marginBottom: '1rem' }}>
          <label style={labelStyle}>Your name</label>
          <input
            className="signup-input"
            value={form.owner_name}
            onChange={e => set('owner_name', e.target.value)}
            onFocus={() => setFocused('owner_name')}
            onBlur={() => setFocused('')}
            placeholder="John Doe"
            style={inputStyle(focused === 'owner_name', !!errors.owner_name)}
          />
          {errors.owner_name && <p style={errorStyle}>{errors.owner_name}</p>}
        </div>

        <div style={{ marginBottom: '1rem' }}>
          <label style={labelStyle}>Email address</label>
          <input
            className="signup-input"
            type="email"
            value={form.owner_email}
            onChange={e => set('owner_email', e.target.value)}
            onFocus={() => setFocused('owner_email')}
            onBlur={() => setFocused('')}
            placeholder="you@company.com"
            autoComplete="email"
            style={inputStyle(focused === 'owner_email', !!errors.owner_email)}
          />
          {errors.owner_email && <p style={errorStyle}>{errors.owner_email}</p>}
        </div>

        <div style={{ marginBottom: '1rem' }}>
          <label style={labelStyle}>Password</label>
          <input
            className="signup-input"
            type="password"
            value={form.owner_password}
            onChange={e => set('owner_password', e.target.value)}
            onFocus={() => setFocused('owner_password')}
            onBlur={() => setFocused('')}
            placeholder="At least 8 characters"
            autoComplete="new-password"
            style={inputStyle(focused === 'owner_password', !!errors.owner_password)}
          />
          <p style={{ marginTop: '0.2rem', fontSize: '0.7rem', color: 'var(--text-muted)' }}>
            Min 8 characters, with uppercase, lowercase &amp; a digit
          </p>
          {errors.owner_password && <p style={errorStyle}>{errors.owner_password}</p>}
        </div>

        <div style={{ marginBottom: '1rem' }}>
          <label style={labelStyle}>Phone (optional)</label>
          <input
            className="signup-input"
            value={form.business_phone}
            onChange={e => set('business_phone', e.target.value)}
            onFocus={() => setFocused('business_phone')}
            onBlur={() => setFocused('')}
            placeholder="+1 234 567 8900"
            style={inputStyle(focused === 'business_phone', !!errors.business_phone)}
          />
        </div>

        <div style={{ marginBottom: '1rem' }}>
          <label style={{ ...labelStyle }}>
            Country <span style={{ color: '#DC2626' }}>*</span>
          </label>
          <select
            value={form.business_country_code}
            onChange={e => set('business_country_code', e.target.value)}
            onFocus={() => setFocused('business_country_code')}
            onBlur={() => setFocused('')}
            style={selectStyle(focused === 'business_country_code', !!errors.business_country_code)}
          >
            <option value="">Select country</option>
            {COUNTRIES.map(c => (
              <option key={c.code} value={c.code}>{c.name}</option>
            ))}
          </select>
          {errors.business_country_code && <p style={errorStyle}>{errors.business_country_code}</p>}
        </div>

        <div style={{ marginBottom: '1rem' }}>
          <label style={{ ...labelStyle }}>
            State <span style={{ color: '#DC2626' }}>*</span>
          </label>
          <select
            value={form.business_state}
            onChange={e => set('business_state', e.target.value)}
            onFocus={() => setFocused('business_state')}
            onBlur={() => setFocused('')}
            disabled={!form.business_country_code}
            style={selectStyle(focused === 'business_state', !!errors.business_state, !form.business_country_code)}
          >
            <option value="">Select state</option>
            {states.map(s => (
              <option key={s} value={s}>{s}</option>
            ))}
          </select>
          {errors.business_state && <p style={errorStyle}>{errors.business_state}</p>}
        </div>

        <div style={{ marginBottom: '1.25rem' }}>
          <label style={labelStyle}>Address (optional)</label>
          <input
            className="signup-input"
            value={form.business_address}
            onChange={e => set('business_address', e.target.value)}
            onFocus={() => setFocused('business_address')}
            onBlur={() => setFocused('')}
            placeholder="123 Main St, City"
            style={inputStyle(focused === 'business_address', !!errors.business_address)}
          />
        </div>

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
    </AuthLayout>
  )
}

const labelStyle = {
  display: 'block', fontSize: '0.74rem',
  fontWeight: '600', color: 'var(--text-primary)', marginBottom: '5px',
}
const errorStyle = {
  marginTop: '0.3rem', fontSize: '0.74rem',
  color: '#DC2626', fontWeight: '500',
}

function inputStyle(isFocused, hasError) {
  return {
    width: '100%',
    padding: '10px 12px',
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

function selectStyle(isFocused, hasError, disabled) {
  return {
    width: '100%',
    padding: '10px 12px',
    background: disabled ? '#F1F5F9' : isFocused ? '#FFFFFF' : '#F8FAFC',
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
    cursor: disabled ? 'not-allowed' : 'pointer',
  }
}