import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import toast from 'react-hot-toast'
import useAuthStore from '../../../store/authStore'
import { loginWithEmail } from '../../auth/api/authApi'
import api from '../../../api/axios'

export default function AdminLoginPage() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const { setAuth, setSuperAdmin, clearAuth } = useAuthStore()
  const navigate = useNavigate()

  async function handleSubmit(e) {
    e.preventDefault()
    if (!email || !password) { toast.error('Email and password are required'); return }
    setLoading(true)

    try {
      const supabaseData = await loginWithEmail(email, password)
      const token = supabaseData.access_token
      const user = supabaseData.user

      setAuth(token, user, supabaseData.refresh_token)

      const resp = await api.get('/superadmin/businesses?page=1&limit=1')
      setSuperAdmin(true)
      toast.success('Signed in as super admin')
      navigate('/admin/businesses')
    } catch (err) {
      clearAuth()
      const msg = err.response?.data?.message || err.message || 'Invalid credentials'
      toast.error(msg)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div style={{
      minHeight: '100vh',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      background: 'linear-gradient(135deg, #0F172A 0%, #1E293B 100%)',
      fontFamily: "'Inter', -apple-system, sans-serif",
    }}>
      <div style={{
        width: '100%', maxWidth: 400,
        background: '#1E293B',
        border: '1px solid rgba(255,255,255,0.08)',
        borderRadius: 18, padding: '2rem',
        boxShadow: '0 20px 60px rgba(0,0,0,0.5)',
      }}>
        <div style={{ textAlign: 'center', marginBottom: '1.5rem' }}>
          <div style={{
            width: 40, height: 40, borderRadius: 10,
            background: 'linear-gradient(135deg, #4F46E5, #818CF8)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            margin: '0 auto 12px',
          }}>
            <svg width="18" height="18" fill="none" viewBox="0 0 24 24" stroke="white" strokeWidth={2.2}>
              <path d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z"/>
            </svg>
          </div>
          <h1 style={{ fontSize: '1.1rem', fontWeight: 700, color: '#F8FAFC', margin: 0 }}>
            Super Admin
          </h1>
          <p style={{ fontSize: '0.78rem', color: '#94A3B8', marginTop: 6 }}>
            Platform administration console
          </p>
        </div>

        <form onSubmit={handleSubmit}>
          <div style={{ marginBottom: '1rem' }}>
            <label style={{ display: 'block', fontSize: '0.74rem', fontWeight: 600, color: '#CBD5E1', marginBottom: 5 }}>
              Email
            </label>
            <input
              type="email"
              value={email}
              onChange={e => setEmail(e.target.value)}
              placeholder="admin@example.com"
              autoComplete="email"
              style={{
                width: '100%', padding: '10px 12px',
                background: '#0F172A', border: '1px solid rgba(255,255,255,0.1)',
                borderRadius: 10, fontSize: '0.82rem',
                color: '#F8FAFC', outline: 'none', boxSizing: 'border-box',
              }}
            />
          </div>

          <div style={{ marginBottom: '1.25rem' }}>
            <label style={{ display: 'block', fontSize: '0.74rem', fontWeight: 600, color: '#CBD5E1', marginBottom: 5 }}>
              Password
            </label>
            <input
              type="password"
              value={password}
              onChange={e => setPassword(e.target.value)}
              placeholder="••••••••"
              autoComplete="current-password"
              style={{
                width: '100%', padding: '10px 12px',
                background: '#0F172A', border: '1px solid rgba(255,255,255,0.1)',
                borderRadius: 10, fontSize: '0.82rem',
                color: '#F8FAFC', outline: 'none', boxSizing: 'border-box',
              }}
            />
          </div>

          <button
            type="submit"
            disabled={loading}
            style={{
              width: '100%', padding: '11px',
              background: loading ? '#6366F180' : 'linear-gradient(135deg, #4F46E5, #6366F1)',
              color: '#fff', border: 'none', borderRadius: 10,
              fontSize: '0.82rem', fontWeight: 600, cursor: loading ? 'not-allowed' : 'pointer',
              fontFamily: 'inherit',
            }}
          >
            {loading ? 'Verifying...' : 'Sign in'}
          </button>
        </form>

        <div style={{ marginTop: '1.25rem', textAlign: 'center' }}>
          <span
            onClick={() => navigate('/login')}
            style={{ fontSize: '0.74rem', color: '#818CF8', cursor: 'pointer', fontWeight: 500 }}
          >
            Back to business login
          </span>
        </div>
      </div>
    </div>
  )
}
