import { useState } from 'react'
import { NavLink, Outlet, useNavigate } from 'react-router-dom'
import toast from 'react-hot-toast'
import useAuthStore from '../../../store/authStore'
import api from '../../../api/axios'

export default function AdminDashboardLayout() {
  const [showLogout, setShowLogout] = useState(false)
  const { user, clearAuth, setSuperAdmin } = useAuthStore()
  const navigate = useNavigate()
  const userName = user?.email?.split('@')[0] || 'Admin'

  async function handleLogout() {
    try {
      await api.post('/auth/logout')
    } catch {}
    clearAuth()
    setSuperAdmin(false)
    toast.success('Signed out')
    navigate('/admin/login')
  }

  return (
    <div style={{
      display: 'flex', height: '100vh', overflow: 'hidden',
      fontFamily: "'Inter', -apple-system, sans-serif",
      background: '#0F172A',
    }}>
      <aside style={{
        width: 220, minHeight: '100vh',
        background: '#1E293B', flexShrink: 0,
        display: 'flex', flexDirection: 'column',
        borderRight: '1px solid rgba(255,255,255,0.06)',
      }}>
        <div style={{
          height: 60, display: 'flex', alignItems: 'center',
          padding: '0 20px', borderBottom: '1px solid rgba(255,255,255,0.06)',
        }}>
          <div style={{
            width: 28, height: 28, borderRadius: 8,
            background: 'linear-gradient(135deg, #4F46E5, #818CF8)',
            display: 'flex', alignItems: 'center', justifyContent: 'center', marginRight: 10,
          }}>
            <svg width="14" height="14" fill="none" viewBox="0 0 24 24" stroke="white" strokeWidth={2.2}>
              <path d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z"/>
            </svg>
          </div>
          <span style={{ fontSize: '0.85rem', fontWeight: 700, color: '#F8FAFC' }}>
            SmartBillr<span style={{ color: '#818CF8' }}> Admin</span>
          </span>
        </div>

        <nav style={{ flex: 1, padding: '12px 10px' }}>
          <NavLink
            to="/admin/businesses"
            style={({ isActive }) => ({
              display: 'flex', alignItems: 'center', gap: 10,
              padding: '8px 12px', borderRadius: 8, textDecoration: 'none',
              fontSize: '0.8rem', fontWeight: 500,
              color: isActive ? '#F8FAFC' : '#94A3B8',
              background: isActive ? 'rgba(79,70,229,0.15)' : 'transparent',
              border: 'none', marginBottom: 2, cursor: 'pointer',
            })}
          >
            <svg width="16" height="16" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.7}>
              <path d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4"/>
            </svg>
            Businesses
          </NavLink>
        </nav>

        <div style={{
          padding: '12px 14px', borderTop: '1px solid rgba(255,255,255,0.06)',
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
            <div style={{
              width: 28, height: 28, borderRadius: 6,
              background: '#4F46E5',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontSize: '0.6rem', fontWeight: 700, color: '#fff',
            }}>
              {userName[0]?.toUpperCase()}
            </div>
            <span style={{ fontSize: '0.72rem', color: '#CBD5E1', fontWeight: 500 }}>{userName}</span>
          </div>
          <button
            onClick={() => setShowLogout(true)}
            style={{
              width: '100%', padding: '8px', borderRadius: 8,
              border: '1px solid rgba(239,68,68,0.2)',
              background: 'rgba(239,68,68,0.08)',
              color: '#F87171', fontSize: '0.72rem', fontWeight: 600,
              cursor: 'pointer', fontFamily: 'inherit',
            }}
          >
            Sign out
          </button>
        </div>
      </aside>

      <main style={{
        flex: 1, overflowY: 'auto', padding: '1.5rem 2rem',
        background: '#0F172A',
      }}>
        <Outlet />
      </main>

      {showLogout && (
        <div
          onClick={() => setShowLogout(false)}
          style={{
            position: 'fixed', inset: 0, zIndex: 999,
            background: 'rgba(0,0,0,0.5)', backdropFilter: 'blur(4px)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}
        >
          <div onClick={e => e.stopPropagation()} style={{
            background: '#1E293B', border: '1px solid rgba(255,255,255,0.08)',
            borderRadius: 16, padding: 28, maxWidth: 360, width: '90%',
          }}>
            <h3 style={{ fontSize: 16, fontWeight: 700, color: '#F8FAFC', margin: '0 0 6px' }}>
              Sign out?
            </h3>
            <p style={{ fontSize: 13, color: '#94A3B8', marginBottom: 20 }}>
              You'll be returned to the super admin login.
            </p>
            <div style={{ display: 'flex', gap: 8 }}>
              <button
                onClick={() => setShowLogout(false)}
                style={{
                  flex: 1, padding: '10px', borderRadius: 10,
                  border: '1px solid rgba(255,255,255,0.1)',
                  background: 'transparent', color: '#CBD5E1',
                  fontSize: 13, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit',
                }}
              >
                Cancel
              </button>
              <button
                onClick={handleLogout}
                style={{
                  flex: 1, padding: '10px', borderRadius: 10,
                  border: 'none', background: '#EF4444', color: '#fff',
                  fontSize: 13, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit',
                }}
              >
                Sign out
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
