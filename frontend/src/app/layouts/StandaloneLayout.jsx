import { Suspense } from 'react'
import { Outlet } from 'react-router-dom'
import useAuthStore from '../../store/authStore'
import { Spinner } from '../../shared/components'

const LogoSvg = (
  <svg width="15" height="15" fill="none" viewBox="0 0 24 24" stroke="white" strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round">
    <path d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
  </svg>
)

export default function StandaloneLayout() {
  const user     = useAuthStore((s) => s.user)
  const profile  = useAuthStore((s) => s.profile)
  const business = useAuthStore((s) => s.business)

  const userName     = profile?.full_name || user?.user_metadata?.full_name || user?.email?.split('@')[0] || 'User'
  const businessName = business?.business_name || 'SmartBillr'
  const initials     = userName.split(' ').map(w => w[0]).join('').toUpperCase().slice(0, 2)

  return (
    <div style={{
      display: 'flex', flexDirection: 'column',
      height: '100vh', overflow: 'hidden',
      fontFamily: "'Inter', -apple-system, sans-serif",
      background: 'var(--bg-page)',
    }}>
      {/* Header */}
      <header style={{
        height: 56, flexShrink: 0,
        background: 'var(--topbar-bg)',
        backdropFilter: 'blur(12px)',
        WebkitBackdropFilter: 'blur(12px)',
        borderBottom: '1px solid var(--topbar-border)',
        display: 'flex', alignItems: 'center',
        justifyContent: 'space-between',
        padding: '0 28px',
      }}>
        {/* Left — logo + business name */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <div style={{
            width: 28, height: 28, borderRadius: 8, flexShrink: 0,
            background: 'var(--accent-600)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}>
            {LogoSvg}
          </div>
          <span style={{
            fontSize: '0.9rem', fontWeight: 700, letterSpacing: '-0.3px',
            color: 'var(--text-primary)', whiteSpace: 'nowrap',
          }}>
            {businessName}
          </span>
        </div>

        {/* Right — user avatar + name */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{
            fontSize: '0.72rem', fontWeight: 600, color: 'var(--text-primary)',
            textTransform: 'capitalize',
          }}>
            {userName}
          </span>
          <div style={{
            width: 32, height: 32, borderRadius: 8,
            background: 'var(--accent-600)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontSize: '0.68rem', fontWeight: 700, color: '#fff',
          }}>
            {initials}
          </div>
        </div>
      </header>

      {/* Page content */}
      <main style={{
        flex: 1, overflowY: 'auto', overflowX: 'hidden',
        padding: '1.5rem 2rem',
      }}>
        <Suspense fallback={
          <div style={{ padding: '3rem', display: 'flex', justifyContent: 'center' }}>
            <Spinner />
          </div>
        }>
          <Outlet />
        </Suspense>
      </main>
    </div>
  )
}
