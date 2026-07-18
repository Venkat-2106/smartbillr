import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import AuthLayout from '../../../app/layouts/AuthLayout'
import { registerBusiness } from '../../subscription/api/subscriptionApi'
import toast from 'react-hot-toast'
import FormField, { selectStyle } from '../../../shared/components/FormField'

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
        <FormField label="Business name" error={errors.business_name} required style={{ marginBottom: 16 }}>
          <input
            className={`input ${errors.business_name ? 'error' : ''}`}
            value={form.business_name}
            onChange={e => set('business_name', e.target.value)}
            placeholder="Sri MahaLakshmi Stores"
          />
        </FormField>

        <FormField label="Your name" error={errors.owner_name} required style={{ marginBottom: 16 }}>
          <input
            className={`input ${errors.owner_name ? 'error' : ''}`}
            value={form.owner_name}
            onChange={e => set('owner_name', e.target.value)}
            placeholder="John Doe"
          />
        </FormField>

        <FormField label="Email address" error={errors.owner_email} required style={{ marginBottom: 16 }}>
          <input
            className={`input ${errors.owner_email ? 'error' : ''}`}
            type="email"
            value={form.owner_email}
            onChange={e => set('owner_email', e.target.value)}
            placeholder="you@company.com"
            autoComplete="email"
          />
        </FormField>

        <FormField label="Password" error={errors.owner_password} required style={{ marginBottom: 16 }} helper="Min 8 characters, with uppercase, lowercase & a digit">
          <input
            className={`input ${errors.owner_password ? 'error' : ''}`}
            type="password"
            value={form.owner_password}
            onChange={e => set('owner_password', e.target.value)}
            placeholder="At least 8 characters"
            autoComplete="new-password"
          />
        </FormField>

        <FormField label="Phone (optional)" error={errors.business_phone} style={{ marginBottom: 16 }}>
          <input
            className="input"
            value={form.business_phone}
            onChange={e => set('business_phone', e.target.value)}
            placeholder="+1 234 567 8900"
          />
        </FormField>

        <FormField label="Country" error={errors.business_country_code} required style={{ marginBottom: 16 }}>
          <select
            className="sb-select"
            style={selectStyle}
            value={form.business_country_code}
            onChange={e => set('business_country_code', e.target.value)}
          >
            <option value="">Select country</option>
            {COUNTRIES.map(c => (
              <option key={c.code} value={c.code}>{c.name}</option>
            ))}
          </select>
        </FormField>

        <FormField label="State" error={errors.business_state} required style={{ marginBottom: 16 }}>
          <select
            className="sb-select"
            style={selectStyle}
            value={form.business_state}
            onChange={e => set('business_state', e.target.value)}
            disabled={!form.business_country_code}
          >
            <option value="">Select state</option>
            {states.map(s => (
              <option key={s} value={s}>{s}</option>
            ))}
          </select>
        </FormField>

        <FormField label="Address (optional)" error={errors.business_address} style={{ marginBottom: 20 }}>
          <input
            className="input"
            value={form.business_address}
            onChange={e => set('business_address', e.target.value)}
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
