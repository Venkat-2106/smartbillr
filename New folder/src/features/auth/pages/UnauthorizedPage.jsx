// src/features/auth/pages/UnauthorizedPage.jsx
//
// NEW FILE — create at this path.
//
// Shown when a user navigates to a route their role cannot access.
// Uses the same CSS variables as the rest of the app (DashboardLayout uses them).
// Does NOT use DashboardLayout — stands alone like LoginPage.

import { useNavigate } from 'react-router-dom'
import useAuthStore from '../../../store/authStore'

export default function UnauthorizedPage() {
  const navigate = useNavigate()
  const profile  = useAuthStore(s => s.profile)
  const role     = profile?.role
    ? profile.role.charAt(0).toUpperCase() + profile.role.slice(1)
    : 'Staff'

  return (
    <div style={{
      minHeight:      '100vh',
      background:     'var(--bg-page, #F1F5F9)',
      display:        'flex',
      alignItems:     'center',
      justifyContent: 'center',
      fontFamily:     "'Plus Jakarta Sans', -apple-system, sans-serif",
      padding:        '24px',
    }}>
      <div style={{
        background:    'var(--bg-card, #FFFFFF)',
        border:        '1px solid var(--border, #E2E8F0)',
        borderRadius:  '20px',
        padding:       '48px 52px',
        textAlign:     'center',
        maxWidth:      '440px',
        width:         '100%',
        boxShadow:     '0 4px 24px rgba(15,23,42,0.07)',
      }}>

        {/* Icon */}
        <div style={{
          width:          '60px',
          height:         '60px',
          background:     '#FEF2F2',
          border:         '1px solid #FECACA',
          borderRadius:   '16px',
          display:        'flex',
          alignItems:     'center',
          justifyContent: 'center',
          margin:         '0 auto 24px',
        }}>
          <svg width="26" height="26" viewBox="0 0 24 24" fill="none">
            <path
              d="M12 2C9.24 2 7 4.24 7 7v2H6a2 2 0 00-2 2v9a2 2 0 002 2h12a2 2 0 002-2v-9a2 2 0 00-2-2h-1V7c0-2.76-2.24-5-5-5zm0 2c1.66 0 3 1.34 3 3v2H9V7c0-1.66 1.34-3 3-3zm0 9a2 2 0 110 4 2 2 0 010-4z"
              fill="#EF4444"
            />
          </svg>
        </div>

        {/* Text */}
        <h1 style={{
          fontSize:      '20px',
          fontWeight:    '800',
          color:         'var(--text-primary, #0F172A)',
          margin:        '0 0 8px',
          letterSpacing: '-0.4px',
        }}>
          Access Restricted
        </h1>

        <p style={{
          fontSize:   '13.5px',
          color:      'var(--text-secondary, #64748B)',
          lineHeight: '1.65',
          margin:     '0 0 6px',
        }}>
          Your <strong>{role}</strong> account doesn't have permission to view this page.
        </p>

        <p style={{
          fontSize: '12.5px',
          color:    'var(--text-muted, #94A3B8)',
          margin:   '0 0 32px',
        }}>
          Contact your admin if you need access.
        </p>

        {/* Buttons */}
        <div style={{ display: 'flex', gap: '10px', justifyContent: 'center' }}>
          <button
            onClick={() => navigate(-1)}
            style={{
              padding:      '9px 18px',
              border:       '1px solid var(--border, #E2E8F0)',
              borderRadius: '10px',
              background:   'var(--bg-subtle, #F8FAFC)',
              color:        'var(--text-primary, #0F172A)',
              fontSize:     '13px',
              fontWeight:   '600',
              cursor:       'pointer',
              fontFamily:   'inherit',
              transition:   'all 0.13s',
            }}
            onMouseEnter={e => {
              e.currentTarget.style.background    = 'var(--bg-hover, #F1F5F9)'
              e.currentTarget.style.borderColor   = 'var(--border-hover, #CBD5E1)'
            }}
            onMouseLeave={e => {
              e.currentTarget.style.background    = 'var(--bg-subtle, #F8FAFC)'
              e.currentTarget.style.borderColor   = 'var(--border, #E2E8F0)'
            }}
          >
            Go Back
          </button>

          <button
            onClick={() => navigate('/dashboard')}
            style={{
              padding:      '9px 18px',
              border:       'none',
              borderRadius: '10px',
              background:   'var(--accent-600, #4F46E5)',
              color:        '#FFFFFF',
              fontSize:     '13px',
              fontWeight:   '600',
              cursor:       'pointer',
              fontFamily:   'inherit',
              transition:   'opacity 0.13s',
            }}
            onMouseEnter={e => e.currentTarget.style.opacity = '0.88'}
            onMouseLeave={e => e.currentTarget.style.opacity = '1'}
          >
            Go to Dashboard
          </button>
        </div>
      </div>
    </div>
  )
}