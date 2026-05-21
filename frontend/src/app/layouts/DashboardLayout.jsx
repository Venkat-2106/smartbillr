import { useState } from 'react'
import { NavLink, Outlet, useNavigate, useLocation } from 'react-router-dom'
import useAuthStore from '../../store/authStore'
import toast from 'react-hot-toast'

// ─── NAV STRUCTURE ──────────────────────────────────────
const NAV_SECTIONS = [
  {
    label: 'Main',
    items: [
      { label: 'Dashboard',  path: '/dashboard',
        icon: 'M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6' },
      { label: 'Sales',      path: '/sales',
        icon: 'M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z' },
      { label: 'Purchases',  path: '/purchases',
        icon: 'M3 3h2l.4 2M7 13h10l4-8H5.4M7 13L5.4 5M7 13l-2.293 2.293c-.63.63-.184 1.707.707 1.707H17m0 0a2 2 0 100 4 2 2 0 000-4zm-8 2a2 2 0 11-4 0 2 2 0 014 0z' },
      { label: 'Payments',   path: '/payments',
        icon: 'M3 10h18M7 15h1m4 0h1m-7 4h12a3 3 0 003-3V8a3 3 0 00-3-3H6a3 3 0 00-3 3v8a3 3 0 003 3z' },
    ],
  },
  {
    label: 'People',
    items: [
      { label: 'Customers',  path: '/customers',
        icon: 'M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z' },
      { label: 'Suppliers',  path: '/suppliers',
        icon: 'M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4' },
    ],
  },
  {
    label: 'Inventory',
    items: [
      { label: 'Products',   path: '/products',
        icon: 'M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4' },
      { label: 'Categories', path: '/categories',
        icon: 'M7 7h.01M7 3h5c.512 0 1.024.195 1.414.586l7 7a2 2 0 010 2.828l-7 7a2 2 0 01-2.828 0l-7-7A1.994 1.994 0 013 12V7a4 4 0 014-4z' },
      { label: 'Stock',      path: '/stock',
        icon: 'M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z' },
    ],
  },
  {
    label: 'Finance',
    items: [
      { label: 'Expenses',         path: '/expenses',
        icon: 'M17 9V7a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2m2 4h10a2 2 0 002-2v-6a2 2 0 00-2-2H9a2 2 0 00-2 2v6a2 2 0 002 2zm7-5a2 2 0 11-4 0 2 2 0 014 0z' },
      { label: 'Sales Returns',    path: '/sales-returns',
        icon: 'M3 10h10a8 8 0 018 8v2M3 10l6 6m-6-6l6-6' },
      { label: 'Purchase Returns', path: '/purchase-returns',
        icon: 'M21 10H11a8 8 0 00-8 8v2m18-10l-6 6m6-6l-6-6' },
    ],
  },
  {
    label: 'More',
    items: [
      { label: 'Reports',  path: '/reports',
        icon: 'M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z' },
      { label: 'Settings', path: '/settings',
        icon: 'M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z M15 12a3 3 0 11-6 0 3 3 0 016 0z' },
    ],
  },
]

// ─── SVG Icon ────────────────────────────────────────────
function Icon({ d, size = 16 }) {
  return (
    <svg width={size} height={size} fill="none" viewBox="0 0 24 24"
      stroke="currentColor" strokeWidth={1.8}
      strokeLinecap="round" strokeLinejoin="round"
      style={{ flexShrink: 0 }}>
      {d.split('M').filter(Boolean).map((part, i) => (
        <path key={i} d={`M${part}`} />
      ))}
    </svg>
  )
}

// ─── Logo Mark ───────────────────────────────────────────
function LogoMark({ size = 30 }) {
  return (
    <div style={{
      width: size, height: size, borderRadius: 9,
      background: 'linear-gradient(135deg, #4F46E5 0%, #818CF8 100%)',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      flexShrink: 0, boxShadow: '0 2px 10px rgba(79,70,229,0.45)',
    }}>
      <svg width={size * 0.52} height={size * 0.52} fill="none" viewBox="0 0 24 24"
        stroke="white" strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round">
        <path d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
      </svg>
    </div>
  )
}

// ─── Logout Confirm Dialog ───────────────────────────────
function LogoutDialog({ onConfirm, onCancel }) {
  return (
    <div
      onClick={onCancel}
      style={{
        position: 'fixed', inset: 0, zIndex: 999,
        background: 'rgba(15,23,42,0.5)',
        backdropFilter: 'blur(6px)',
        WebkitBackdropFilter: 'blur(6px)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
      }}
    >
      <style>{`
        @keyframes popIn {
          from { opacity: 0; transform: scale(0.90) translateY(10px); }
          to   { opacity: 1; transform: scale(1) translateY(0); }
        }
      `}</style>

      <div
        onClick={e => e.stopPropagation()}
        style={{
          background: '#FFFFFF',
          border: '1px solid #E2E8F0',
          borderRadius: 22,
          padding: '32px',
          width: '100%', maxWidth: 380,
          boxShadow: '0 24px 64px rgba(0,0,0,0.18)',
          animation: 'popIn 0.2s cubic-bezier(0.34,1.56,0.64,1) both',
        }}
      >
        {/* Icon */}
        <div style={{
          width: 54, height: 54, borderRadius: 16,
          background: '#FEF2F2',
          border: '1px solid #FECACA',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          marginBottom: 22,
        }}>
          <svg width="24" height="24" fill="none" viewBox="0 0 24 24"
            stroke="#DC2626" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
            <path d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
          </svg>
        </div>

        {/* Text */}
        <h3 style={{
          fontSize: 18, fontWeight: 800,
          color: '#0F172A', margin: 0, marginBottom: 10,
          letterSpacing: '-0.4px',
        }}>
          Logout of SmartBillr?
        </h3>
        <p style={{
          fontSize: 14, color: '#64748B',
          margin: 0, lineHeight: 1.65,
        }}>
          You will be returned to the login screen.<br />
          Any unsaved changes will be lost.
        </p>

        {/* Divider */}
        <div style={{ height: 1, background: '#F1F5F9', margin: '24px 0' }} />

        {/* Buttons */}
        <div style={{ display: 'flex', gap: 10 }}>

          {/* Cancel */}
          <button
            onClick={onCancel}
            style={{
              flex: 1, padding: '12px',
              background: '#F8FAFC',
              border: '1px solid #E2E8F0',
              borderRadius: 12, fontSize: 14,
              fontWeight: 600, color: '#64748B',
              cursor: 'pointer', fontFamily: 'inherit',
              transition: 'all 0.14s',
            }}
            onMouseEnter={e => {
              e.currentTarget.style.background = '#F1F5F9'
              e.currentTarget.style.borderColor = '#CBD5E1'
              e.currentTarget.style.color = '#0F172A'
            }}
            onMouseLeave={e => {
              e.currentTarget.style.background = '#F8FAFC'
              e.currentTarget.style.borderColor = '#E2E8F0'
              e.currentTarget.style.color = '#64748B'
            }}
          >
            Cancel
          </button>

          {/* Confirm */}
          <button
            onClick={onConfirm}
            style={{
              flex: 1, padding: '12px',
              background: 'linear-gradient(135deg, #DC2626 0%, #EF4444 100%)',
              border: 'none',
              borderRadius: 12, fontSize: 14,
              fontWeight: 700, color: '#fff',
              cursor: 'pointer', fontFamily: 'inherit',
              boxShadow: '0 4px 16px rgba(220,38,38,0.35)',
              transition: 'all 0.14s',
            }}
            onMouseEnter={e => {
              e.currentTarget.style.transform = 'translateY(-1px)'
              e.currentTarget.style.boxShadow = '0 8px 24px rgba(220,38,38,0.45)'
            }}
            onMouseLeave={e => {
              e.currentTarget.style.transform = 'translateY(0)'
              e.currentTarget.style.boxShadow = '0 4px 16px rgba(220,38,38,0.35)'
            }}
            onMouseDown={e => e.currentTarget.style.transform = 'scale(0.97)'}
            onMouseUp={e => e.currentTarget.style.transform = 'translateY(-1px)'}
          >
            Yes, Logout
          </button>

        </div>
      </div>
    </div>
  )
}

// ─── Constants ───────────────────────────────────────────
const SIDEBAR_FULL = 252
const SIDEBAR_SLIM = 68

// ─── Main Layout ─────────────────────────────────────────
export default function DashboardLayout() {
  const [collapsed,   setCollapsed]   = useState(false)
  const [showLogout,  setShowLogout]  = useState(false)   // ← logout dialog state
  const { user, business, profile, clearAuth } = useAuthStore()
  const navigate = useNavigate()
  const location = useLocation()

  // ── Name resolution (priority order) ─────────────────
  const userName = profile?.full_name
                || user?.user_metadata?.full_name
                || user?.email?.split('@')[0]?.replace(/[._]/g, ' ')
                || 'User'

  const businessName = business?.business_name || 'Your Business'

  const userRole = profile?.role
    ? profile.role.charAt(0).toUpperCase() + profile.role.slice(1)
    : 'Administrator'

  const initials = userName.split(' ').map(w => w[0]).join('').toUpperCase().slice(0, 2)

  const hour     = new Date().getHours()
  const greeting = hour < 12 ? 'Good morning' : hour < 17 ? 'Good afternoon' : 'Good evening'

  const currentPage = NAV_SECTIONS.flatMap(s => s.items)
    .find(item => location.pathname.startsWith(item.path))?.label || 'Dashboard'

  // ── Logout handlers ───────────────────────────────────
  function handleLogout() {
    clearAuth()
    toast.success('Logged out successfully')
    navigate('/login')
  }

  const W = collapsed ? SIDEBAR_SLIM : SIDEBAR_FULL

  return (
    <div style={{
      display: 'flex', minHeight: '100vh',
      fontFamily: "'Plus Jakarta Sans', -apple-system, sans-serif",
      background: '#F1F5F9',
    }}>

      {/* ════════════════════════════════
          SIDEBAR
      ════════════════════════════════ */}
      <aside style={{
        width: W, minHeight: '100vh',
        background: '#0F172A',
        display: 'flex', flexDirection: 'column',
        position: 'fixed', top: 0, left: 0, bottom: 0,
        zIndex: 100,
        transition: 'width 0.22s cubic-bezier(0.22,1,0.36,1)',
        overflow: 'hidden',
        borderRight: '1px solid rgba(255,255,255,0.04)',
      }}>

        {/* ── Logo row ── */}
        <div style={{
          height: 64, display: 'flex', alignItems: 'center',
          padding: collapsed ? '0 17px' : '0 18px',
          justifyContent: collapsed ? 'center' : 'space-between',
          borderBottom: '1px solid rgba(255,255,255,0.05)',
          flexShrink: 0,
        }}>
          {!collapsed ? (
            <>
              <div style={{ display: 'flex', alignItems: 'center', gap: 11 }}>
                <LogoMark size={30} />
                <span style={{ fontSize: '1.08rem', fontWeight: 800, letterSpacing: '-0.5px', whiteSpace: 'nowrap' }}>
                  <span style={{ color: '#F1F5F9' }}>Smart</span>
                  <span style={{ color: '#818CF8' }}>Billr</span>
                </span>
              </div>
              <button onClick={() => setCollapsed(true)} title="Collapse" style={iconBtn}>
                <svg width="13" height="13" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M11 19l-7-7 7-7m8 14l-7-7 7-7" />
                </svg>
              </button>
            </>
          ) : (
            <button onClick={() => setCollapsed(false)} title="Expand"
              style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}>
              <LogoMark size={30} />
            </button>
          )}
        </div>

        {/* ── Business chip ── */}
        {!collapsed && (
          <div style={{
            margin: '14px 12px 4px',
            background: 'rgba(255,255,255,0.04)',
            border: '1px solid rgba(255,255,255,0.07)',
            borderRadius: 12, padding: '10px 12px',
            display: 'flex', alignItems: 'center', gap: 9,
          }}>
            <div style={{
              width: 26, height: 26, borderRadius: 7,
              background: 'linear-gradient(135deg, #4F46E5, #818CF8)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontSize: '0.6rem', fontWeight: 800, color: '#fff', flexShrink: 0,
            }}>
              {businessName[0]?.toUpperCase()}
            </div>
            <div style={{ overflow: 'hidden' }}>
              <p style={{
                fontSize: '0.73rem', fontWeight: 700, color: '#E2E8F0',
                whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', margin: 0,
              }}>
                {businessName}
              </p>
              <p style={{ fontSize: '0.62rem', color: '#475569', margin: 0 }}>Active workspace</p>
            </div>
          </div>
        )}

        {/* ── Navigation ── */}
        <nav style={{
          flex: 1, overflowY: 'auto', overflowX: 'hidden',
          padding: collapsed ? '10px 9px' : '6px 10px',
          scrollbarWidth: 'none',
        }}>
          {NAV_SECTIONS.map((section) => (
            <div key={section.label} style={{ marginBottom: 4 }}>
              {!collapsed && (
                <p style={{
                  fontSize: '0.59rem', fontWeight: 700, color: '#334155',
                  textTransform: 'uppercase', letterSpacing: '0.09em',
                  padding: '12px 10px 4px', margin: 0,
                }}>
                  {section.label}
                </p>
              )}
              {collapsed && <div style={{ height: 8 }} />}

              {section.items.map((item) => (
                <NavLink
                  key={item.path}
                  to={item.path}
                  title={collapsed ? item.label : undefined}
                  style={({ isActive }) => ({
                    display: 'flex',
                    alignItems: 'center',
                    gap: collapsed ? 0 : 10,
                    justifyContent: collapsed ? 'center' : 'flex-start',
                    padding: collapsed ? '10px 0' : '8.5px 10px',
                    borderRadius: 10, marginBottom: 2,
                    textDecoration: 'none',
                    background: isActive ? 'rgba(99,102,241,0.15)' : 'transparent',
                    border: `1px solid ${isActive ? 'rgba(99,102,241,0.25)' : 'transparent'}`,
                    color: isActive ? '#A5B4FC' : '#64748B',
                    transition: 'all 0.13s ease',
                  })}
                  onMouseEnter={(e) => {
                    if (!e.currentTarget.style.background.includes('0.15')) {
                      e.currentTarget.style.background = 'rgba(255,255,255,0.05)'
                      e.currentTarget.style.color = '#94A3B8'
                    }
                  }}
                  onMouseLeave={(e) => {
                    if (!e.currentTarget.style.background.includes('0.15')) {
                      e.currentTarget.style.background = 'transparent'
                      e.currentTarget.style.color = '#64748B'
                    }
                  }}
                >
                  {({ isActive }) => (
                    <>
                      <span style={{ color: 'inherit', flexShrink: 0 }}>
                        <Icon d={item.icon} size={16} />
                      </span>
                      {!collapsed && (
                        <span style={{
                          fontSize: '0.8rem',
                          fontWeight: isActive ? 700 : 500,
                          color: isActive ? '#E2E8F0' : 'inherit',
                          whiteSpace: 'nowrap', letterSpacing: '-0.1px',
                        }}>
                          {item.label}
                        </span>
                      )}
                    </>
                  )}
                </NavLink>
              ))}
            </div>
          ))}
        </nav>

        {/* ── User footer ── */}
        <div style={{
          padding: collapsed ? '14px 9px' : '14px 12px',
          borderTop: '1px solid rgba(255,255,255,0.05)',
          display: 'flex', alignItems: 'center',
          justifyContent: collapsed ? 'center' : 'space-between',
          gap: 8, flexShrink: 0,
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 9, overflow: 'hidden' }}>
            <div style={{
              width: 34, height: 34, borderRadius: '50%',
              background: 'linear-gradient(135deg, #4F46E5, #818CF8)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontSize: '0.7rem', fontWeight: 800, color: '#fff', flexShrink: 0,
              boxShadow: '0 2px 8px rgba(79,70,229,0.4)',
            }}>
              {initials}
            </div>
            {!collapsed && (
              <div style={{ overflow: 'hidden' }}>
                <p style={{
                  fontSize: '0.76rem', fontWeight: 700, color: '#E2E8F0',
                  margin: 0, whiteSpace: 'nowrap', overflow: 'hidden',
                  textOverflow: 'ellipsis', textTransform: 'capitalize',
                }}>
                  {userName}
                </p>
                <p style={{ fontSize: '0.62rem', color: '#475569', margin: 0 }}>
                  {userRole}
                </p>
              </div>
            )}
          </div>

          {/* ── Logout button — opens dialog ── */}
          {!collapsed && (
            <button
              onClick={() => setShowLogout(true)}
              title="Logout"
              style={{
                background: 'rgba(239,68,68,0.08)',
                border: '1px solid rgba(239,68,68,0.14)',
                borderRadius: 8, width: 32, height: 32,
                cursor: 'pointer', color: '#F87171',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                flexShrink: 0, transition: 'background 0.14s',
              }}
              onMouseEnter={e => e.currentTarget.style.background = 'rgba(239,68,68,0.18)'}
              onMouseLeave={e => e.currentTarget.style.background = 'rgba(239,68,68,0.08)'}
            >
              <svg width="14" height="14" fill="none" viewBox="0 0 24 24"
                stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round"
                  d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
              </svg>
            </button>
          )}
        </div>
      </aside>

      {/* ════════════════════════════════
          MAIN AREA
      ════════════════════════════════ */}
      <div style={{
        flex: 1,
        marginLeft: W,
        transition: 'margin-left 0.22s cubic-bezier(0.22,1,0.36,1)',
        display: 'flex', flexDirection: 'column', minHeight: '100vh',
      }}>

        {/* ── TOPBAR ── */}
        <header style={{
          height: 64,
          background: 'rgba(255,255,255,0.90)',
          backdropFilter: 'blur(14px)',
          WebkitBackdropFilter: 'blur(14px)',
          borderBottom: '1px solid rgba(226,232,240,0.80)',
          display: 'flex', alignItems: 'center',
          justifyContent: 'space-between',
          padding: '0 36px',
          position: 'sticky', top: 0, zIndex: 50,
        }}>

          {/* Left */}
          <div>
            <h1 style={{ fontSize: '0.9rem', fontWeight: 700, color: '#0F172A', margin: 0 }}>
              {greeting}, {userName.split(' ')[0]} 👋
            </h1>
            <p style={{ fontSize: '0.7rem', color: '#94A3B8', margin: 0, marginTop: 1 }}>
              {currentPage} · {businessName}
            </p>
          </div>

          {/* Right */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>

            {/* Search */}
            <div style={{
              display: 'flex', alignItems: 'center', gap: 8,
              background: '#F8FAFC', border: '1px solid #E2E8F0',
              borderRadius: 10, padding: '7px 14px', cursor: 'text',
              minWidth: 210, transition: 'border-color 0.14s, box-shadow 0.14s',
            }}
              onMouseEnter={e => {
                e.currentTarget.style.borderColor = '#CBD5E1'
                e.currentTarget.style.boxShadow = '0 2px 8px rgba(0,0,0,0.04)'
              }}
              onMouseLeave={e => {
                e.currentTarget.style.borderColor = '#E2E8F0'
                e.currentTarget.style.boxShadow = 'none'
              }}
            >
              <svg width="13" height="13" fill="none" viewBox="0 0 24 24" stroke="#94A3B8" strokeWidth={2.2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
              </svg>
              <span style={{ fontSize: '0.78rem', color: '#CBD5E1', flex: 1 }}>Search...</span>
              <span style={{
                fontSize: '0.58rem', color: '#CBD5E1',
                background: '#F1F5F9', border: '1px solid #E2E8F0',
                borderRadius: 5, padding: '1px 6px',
                fontFamily: "'DM Mono', monospace",
              }}>⌘K</span>
            </div>

            {/* Notifications */}
            <button style={{
              background: '#F8FAFC', border: '1px solid #E2E8F0',
              borderRadius: 10, width: 38, height: 38,
              cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center',
              position: 'relative', color: '#64748B', transition: 'all 0.13s',
            }}
              onMouseEnter={e => { e.currentTarget.style.background = '#F1F5F9'; e.currentTarget.style.borderColor = '#CBD5E1' }}
              onMouseLeave={e => { e.currentTarget.style.background = '#F8FAFC'; e.currentTarget.style.borderColor = '#E2E8F0' }}
            >
              <svg width="16" height="16" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round"
                  d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9" />
              </svg>
              <span style={{
                position: 'absolute', top: 9, right: 10,
                width: 6, height: 6, background: '#4F46E5',
                borderRadius: '50%', border: '1.5px solid #fff',
              }} />
            </button>

            {/* Divider */}
            <div style={{ width: 1, height: 22, background: '#E2E8F0' }} />

            {/* Identity chip */}
            <div style={{
              display: 'flex', alignItems: 'center', gap: 10,
              background: '#F8FAFC', border: '1px solid #E2E8F0',
              borderRadius: 12, padding: '5px 13px 5px 5px',
              cursor: 'pointer', transition: 'all 0.13s',
            }}
              onMouseEnter={e => { e.currentTarget.style.background = '#F1F5F9'; e.currentTarget.style.borderColor = '#CBD5E1' }}
              onMouseLeave={e => { e.currentTarget.style.background = '#F8FAFC'; e.currentTarget.style.borderColor = '#E2E8F0' }}
            >
              <div style={{
                width: 30, height: 30, borderRadius: 8,
                background: 'linear-gradient(135deg, #4F46E5, #818CF8)',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontSize: '0.68rem', fontWeight: 800, color: '#fff',
              }}>
                {initials}
              </div>
              <div>
                <p style={{ fontSize: '0.76rem', fontWeight: 700, color: '#0F172A', margin: 0, textTransform: 'capitalize', lineHeight: 1.3 }}>
                  {userName}
                </p>
                <p style={{ fontSize: '0.62rem', color: '#94A3B8', margin: 0 }}>
                  {businessName}
                </p>
              </div>
              <svg width="11" height="11" fill="none" viewBox="0 0 24 24" stroke="#94A3B8" strokeWidth={2.5} style={{ marginLeft: 2 }}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
              </svg>
            </div>

          </div>
        </header>

        {/* ── PAGE CONTENT ── */}
        <main style={{ flex: 1, padding: '36px 40px', overflowY: 'auto' }}>
          <div style={{ animation: 'fadeUp 0.22s cubic-bezier(0.22,1,0.36,1) both' }}>
            <style>{`
              @keyframes fadeUp {
                from { opacity: 0; transform: translateY(6px); }
                to   { opacity: 1; transform: translateY(0); }
              }
            `}</style>
            <Outlet />
          </div>
        </main>
      </div>

      {/* ════════════════════════════════
          LOGOUT CONFIRM DIALOG
          Rendered outside sidebar so it
          covers the full screen properly
      ════════════════════════════════ */}
      {showLogout && (
        <LogoutDialog
          onConfirm={handleLogout}
          onCancel={() => setShowLogout(false)}
        />
      )}

    </div>
  )
}

// ─── Shared button style ─────────────────────────────────
const iconBtn = {
  background: 'rgba(255,255,255,0.05)',
  border: '1px solid rgba(255,255,255,0.07)',
  borderRadius: 7, width: 28, height: 28,
  cursor: 'pointer', display: 'flex',
  alignItems: 'center', justifyContent: 'center',
  color: '#475569', flexShrink: 0,
  transition: 'background 0.13s, color 0.13s',
}
