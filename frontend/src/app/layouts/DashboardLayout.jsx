import { useState, useEffect, useRef, useMemo, useCallback } from 'react'
import { NavLink, Outlet, useNavigate, useLocation } from 'react-router-dom'
import useAuthStore from '../../store/authStore'
import toast from 'react-hot-toast'
import { ErrorBoundary } from '../../shared/components'
import useMediaQuery from '../../shared/hooks/useMediaQuery'
import { usePermissionsSync } from '../../shared/hooks/usePermissionsSync'
import { useIdleLogout } from '../../shared/hooks/useIdleLogout'
import { useShortcutContext } from '../../shared/hooks/useShortcut'
import CommandPalette from '../../shared/components/CommandPalette'
import ShortcutHelp from '../../shared/components/ShortcutHelp'
import SubscriptionBanner from '../../features/subscription/components/SubscriptionBanner'

const THEME_KEY  = 'sb-theme'
const ACCENT_KEY = 'sb-accent'
const ACCENT_OPTIONS = [
  { id: 'blue',    label: 'Ocean Blue',   hex: '#2563EB' },
  { id: 'purple',  label: 'Royal Purple', hex: '#4F46E5' },
  { id: 'emerald', label: 'Emerald',      hex: '#059669' },
  { id: 'amber',   label: 'Amber Gold',   hex: '#D97706' },
]

function applyTheme(theme, accent) {
  document.documentElement.setAttribute('data-theme',  theme)
  document.documentElement.setAttribute('data-accent', accent)
}

function useTheme() {
  const [theme,  setThemeState]  = useState(() => localStorage.getItem(THEME_KEY)  || 'light')
  const [accent, setAccentState] = useState(() => localStorage.getItem(ACCENT_KEY) || 'blue')
  useEffect(() => { applyTheme(theme, accent) }, [theme, accent])
  function setTheme(t)  { localStorage.setItem(THEME_KEY,  t); setThemeState(t) }
  function setAccent(a) { localStorage.setItem(ACCENT_KEY, a); setAccentState(a) }
  return { theme, setTheme, accent, setAccent }
}

const NAV = [
  { label: 'Overview', items: [
    { label: 'Dashboard', path: '/dashboard', permission: 'dashboard.view',
      icon: 'M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6' },
  ]},
  { label: 'Commerce', items: [
    { label: 'Sales',     path: '/sales',     permission: 'sales.view',
      icon: 'M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z' },
    { label: 'Purchases', path: '/purchases', permission: 'purchases.view',
      icon: 'M3 3h2l.4 2M7 13h10l4-8H5.4M7 13L5.4 5M7 13l-2.293 2.293c-.63.63-.184 1.707.707 1.707H17m0 0a2 2 0 100 4 2 2 0 000-4zm-8 2a2 2 0 11-4 0 2 2 0 014 0z' },
    { label: 'Payments',  path: '/payments',  permission: 'payments.manage',
      icon: 'M3 10h18M7 15h1m4 0h1m-7 4h12a3 3 0 003-3V8a3 3 0 00-3-3H6a3 3 0 00-3 3v8a3 3 0 003 3z' },
  ]},
  { label: 'People', items: [
    { label: 'Customers', path: '/customers', permission: 'customers.manage',
      icon: 'M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z' },
    { label: 'Suppliers', path: '/suppliers', permission: 'suppliers.manage',
      icon: 'M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4' },
  ]},
  { label: 'Inventory', items: [
    { label: 'Products',   path: '/products',   permission: 'products.view',
      icon: 'M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4' },
    { label: 'Categories', path: '/categories', permission: 'products.view',
      icon: 'M7 7h.01M7 3h5c.512 0 1.024.195 1.414.586l7 7a2 2 0 010 2.828l-7 7a2 2 0 01-2.828 0l-7-7A1.994 1.994 0 013 12V7a4 4 0 014-4z' },
    { label: 'Stock',      path: '/stock',      permission: 'stock.view',
      icon: 'M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z' },
  ]},
  { label: 'Finance', items: [
    { label: 'Expenses',         path: '/expenses',         permission: 'expenses.manage',
      icon: 'M17 9V7a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2m2 4h10a2 2 0 002-2v-6a2 2 0 00-2-2H9a2 2 0 00-2 2v6a2 2 0 002 2zm7-5a2 2 0 11-4 0 2 2 0 014 0z' },
    { label: 'Sales Returns',    path: '/sales-returns',    permission: 'sales_returns.manage',
      icon: 'M3 10h10a8 8 0 018 8v2M3 10l6 6m-6-6l6-6' },
    { label: 'Purchase Returns', path: '/purchase-returns', permission: 'purchase_returns.manage',
      icon: 'M21 10H11a8 8 0 00-8 8v2m18-10l-6 6m6-6l-6-6' },
  ]},
  { label: 'System', items: [
    { label: 'Reports',  path: '/reports',  permission: 'reports.view',
      icon: 'M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z' },
    { label: 'Settings', path: '/settings', permission: 'settings.manage',
      icon: 'M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z M15 12a3 3 0 11-6 0 3 3 0 016 0z' },
    { label: 'Staff',    path: '/staff',    permission: 'staff.manage',
      icon: 'M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197M13 7a4 4 0 11-8 0 4 4 0 018 0z' },
  ]},
]
const NAV_FLAT = NAV.flatMap(s => s.items)

const SLIM = 64, FULL = 240
const MOBILE_BREAK = 768

const BOTTOM_NAV_ITEMS = [
  { label: 'Dashboard', path: '/dashboard', icon: 'M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6' },
  { label: 'Sales',     path: '/sales',     icon: 'M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z' },
  { label: 'Products',  path: '/products',  icon: 'M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4' },
  { label: 'Customers', path: '/customers', icon: 'M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z' },
  { label: 'More',      path: null,         icon: 'M12 5v.01M12 12v.01M12 19v.01' },
]

function Logo({ collapsed }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
      <div style={{
        width: 28, height: 28, borderRadius: 8, flexShrink: 0,
        background: 'var(--accent-600)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
      }}>
        <svg width="15" height="15" fill="none" viewBox="0 0 24 24" stroke="white" strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round">
          <path d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
        </svg>
      </div>
      {!collapsed && (
        <span style={{
          fontSize: '0.9rem', fontWeight: 700, letterSpacing: '-0.3px',
          color: 'var(--sb-text-primary)', whiteSpace: 'nowrap',
        }}>
          Smart<span style={{ color: 'var(--accent-400)' }}>Billr</span>
        </span>
      )}
    </div>
  )
}

function ThemePanel({ theme, setTheme, accent, setAccent, onClose }) {
  const ref = useRef(null)
  useEffect(() => {
    function h(e) { if (ref.current && !ref.current.contains(e.target)) onClose() }
    document.addEventListener('mousedown', h)
    return () => document.removeEventListener('mousedown', h)
  }, [onClose])
  return (
    <div ref={ref} style={{
      position: 'absolute', top: 'calc(100% + 8px)', right: 0, zIndex: 200,
      width: 240, background: 'var(--bg-card)', border: '1px solid var(--border)',
      borderRadius: 'var(--r-xl)', boxShadow: 'var(--shadow-elevated)',
      padding: '16px', animation: 'scaleIn 0.18s var(--ease-spring) both',
    }}>
      <p style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-muted)', letterSpacing: '0.06em', textTransform: 'uppercase', marginBottom: 10 }}>
        Theme
      </p>
      <div style={{ display: 'flex', gap: 6, marginBottom: 18 }}>
        {['light','dark'].map(t => (
          <button
            key={t}
            onClick={() => setTheme(t)}
            aria-label={`${t} theme`}
            aria-pressed={theme === t}
            style={{
              flex: 1, height: 34,
              background: theme === t ? 'var(--accent-600)' : 'var(--bg-subtle)',
              color: theme === t ? '#fff' : 'var(--text-secondary)',
              border: `1px solid ${theme === t ? 'var(--accent-600)' : 'var(--border)'}`,
              borderRadius: 'var(--r-md)', fontSize: 12.5, fontWeight: 600,
              cursor: 'pointer', fontFamily: 'inherit',
              transition: 'all 0.14s',
            }}
          >
            {t === 'light' ? 'Light' : 'Dark'}
          </button>
        ))}
      </div>
      <p style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-muted)', letterSpacing: '0.06em', textTransform: 'uppercase', marginBottom: 10 }}>
        Accent
      </p>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
        {ACCENT_OPTIONS.map(a => (
          <button
            key={a.id}
            onClick={() => setAccent(a.id)}
            aria-label={`${a.label} accent`}
            aria-pressed={accent === a.id}
            style={{
              display: 'flex', alignItems: 'center', gap: 10,
              padding: '8px 10px',
              background: accent === a.id ? 'var(--bg-hover)' : 'transparent',
              border: `1px solid ${accent === a.id ? 'var(--border-hover)' : 'transparent'}`,
              borderRadius: 'var(--r-md)', cursor: 'pointer', fontFamily: 'inherit',
              transition: 'all 0.12s',
            }}
          >
            <div style={{ width: 16, height: 16, borderRadius: '50%', background: a.hex, flexShrink: 0 }} />
            <span style={{ fontSize: 13, color: 'var(--text-primary)', fontWeight: accent === a.id ? 600 : 400 }}>{a.label}</span>
            {accent === a.id && (
              <svg style={{ marginLeft: 'auto', color: a.hex }} width="12" height="12" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7"/>
              </svg>
            )}
          </button>
        ))}
      </div>
    </div>
  )
}

function LogoutDialog({ onConfirm, onCancel }) {
  return (
    <div
      onClick={onCancel}
      role="dialog"
      aria-modal="true"
      aria-label="Sign out confirmation"
      style={{
        position: 'fixed', inset: 0, zIndex: 999,
        background: 'rgba(0,0,0,0.45)', backdropFilter: 'blur(4px)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        animation: 'fadeIn 0.15s var(--ease-out)',
      }}
    >
      <div onClick={e => e.stopPropagation()} style={{
        background: 'var(--bg-card)', border: '1px solid var(--border)',
        borderRadius: 'var(--r-2xl)', padding: '28px', width: '100%', maxWidth: 360,
        boxShadow: 'var(--shadow-elevated)', animation: 'scaleIn 0.2s var(--ease-spring)',
      }}>
        <div style={{
          width: 44, height: 44, borderRadius: 12,
          background: 'var(--danger-bg)', border: '1px solid var(--danger-border)',
          display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: 18,
        }}>
          <svg width="20" height="20" fill="none" viewBox="0 0 24 24" stroke="var(--danger)" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
            <path d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1"/>
          </svg>
        </div>
        <h3 style={{ fontSize: 16, fontWeight: 700, color: 'var(--text-primary)', marginBottom: 6 }}>
          Sign out of SmartBillr?
        </h3>
        <p style={{ fontSize: 13.5, color: 'var(--text-secondary)', lineHeight: 1.6 }}>
          You'll be returned to the login screen.
        </p>
        <div style={{ height: 1, background: 'var(--border)', margin: '20px 0' }} />
        <div style={{ display: 'flex', gap: 8 }}>
          <button onClick={onCancel} className="btn btn-secondary" style={{ flex: 1, height: 38 }}>Cancel</button>
          <button onClick={onConfirm} className="btn btn-danger" style={{ flex: 1, height: 38 }}>Sign out</button>
        </div>
      </div>
    </div>
  )
}

function IconButton({ onClick, children, style = {}, 'aria-label': ariaLabel }) {
  return (
    <button
      onClick={onClick}
      aria-label={ariaLabel}
      className="sb-icon-btn"
      style={{
        background: 'transparent',
        border: 'none',
        width: 34, height: 34,
        borderRadius: 8,
        cursor: 'pointer',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        color: 'var(--text-secondary)',
        ...style,
      }}
    >
      {children}
    </button>
  )
}

function NavItem({ item, collapsed, onNavClick }) {
  return (
    <NavLink
      to={item.path}
      title={collapsed ? item.label : undefined}
      onClick={onNavClick}
      className="sb-nav-item"
      style={({ isActive }) => ({
        display: 'flex',
        alignItems: 'center',
        gap: collapsed ? 0 : 10,
        justifyContent: collapsed ? 'center' : 'flex-start',
        padding: collapsed ? '10px' : '8px 12px',
        borderRadius: 8,
        marginBottom: 1,
        textDecoration: 'none',
        color: isActive ? 'var(--accent-sidebar-text)' : 'var(--sb-text-muted)',
        background: isActive ? 'var(--accent-sidebar-active)' : 'transparent',
        border: 'none',
        borderLeft: isActive ? '2px solid var(--accent-500)' : '2px solid transparent',
      })}
    >
      {({ isActive }) => (<>
        <span style={{ color: isActive ? 'var(--accent-sidebar-icon)' : 'inherit', display: 'flex' }}>
          <svg width="16" height="16" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.7} strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0 }}>
            <path d={item.icon}/>
          </svg>
        </span>
        {!collapsed && (
          <span style={{
            fontSize: '0.8rem',
            fontWeight: isActive ? 600 : 450,
            color: isActive ? 'var(--sb-text-primary)' : 'inherit',
            letterSpacing: '-0.1px',
            whiteSpace: 'nowrap',
          }}>
            {item.label}
          </span>
        )}
      </>)}
    </NavLink>
  )
}

function BottomNav({ items, isMobile, onMoreClick }) {
  if (!isMobile) return null
  return (
    <nav className="bottom-nav" aria-label="Mobile navigation">
      {items.map(item => {
        if (item.path) {
          return (
            <NavLink
              key={item.label}
              to={item.path}
              className="bottom-nav-item"
              aria-label={item.label}
              style={({ isActive }) => ({
                color: isActive ? 'var(--accent-500)' : 'var(--text-muted)',
              })}
            >
              <svg width="18" height="18" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
                <path d={item.icon} />
              </svg>
              <span>{item.label}</span>
            </NavLink>
          )
        }
        return (
          <button key={item.label} className="bottom-nav-item" aria-label="More navigation" onClick={onMoreClick} style={{ color: 'var(--text-muted)' }}>
            <svg width="18" height="18" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
              <path d={item.icon} />
            </svg>
            <span>{item.label}</span>
          </button>
        )
      })}
    </nav>
  )
}

export default function DashboardLayout() {
  const isMobile = useMediaQuery(`(max-width: ${MOBILE_BREAK}px)`)
  const [collapsed,  setCollapsed]  = useState(false)
  const [mobileOpen, setMobileOpen] = useState(false)
  const [showLogout, setShowLogout] = useState(false)
  const [showTheme,  setShowTheme]  = useState(false)

  usePermissionsSync()
  useIdleLogout()

  const { theme, setTheme, accent, setAccent } = useTheme()
  const { user, business, profile } = useAuthStore()
  const permissions = useAuthStore(s => s.permissions)
  const navigate = useNavigate()
  const location = useLocation()

  const userName     = profile?.full_name || user?.user_metadata?.full_name || user?.email?.split('@')[0] || 'User'
  const businessName = business?.business_name || 'Your Business'
  const userRole     = profile?.role ? profile.role.charAt(0).toUpperCase() + profile.role.slice(1) : 'Staff'
  const initials     = userName.split(' ').map(w => w[0]).join('').toUpperCase().slice(0, 2)

  const currentPage = useMemo(() =>
    NAV_FLAT.find(item => location.pathname.startsWith(item.path))?.label || 'Dashboard',
    [location.pathname]
  )

  useEffect(() => { setMobileOpen(false) }, [location.pathname])

  const { registerShortcut, paletteOpen, setPaletteOpen, helpOpen, setHelpOpen } = useShortcutContext()
  const paletteOpenRef = useRef(paletteOpen)
  paletteOpenRef.current = paletteOpen

  const navMap = useMemo(() => ({
    d: '/dashboard', c: '/customers', s: '/sales',
    p: '/products',  u: '/suppliers', t: '/stock',
    e: '/expenses',  r: '/reports',   h: '/settings',
  }), [])

  const handleNav = useCallback((path) => { navigate(path) }, [navigate])
  const handleThemeClose = useCallback(() => setShowTheme(false), [])

  useEffect(() => {
    const unregisters = Object.entries(navMap).map(([key, path]) =>
      registerShortcut('g+' + key, () => handleNav(path), { preventDefault: true })
    )
    const helpUnregister = registerShortcut('?', () => setHelpOpen(true), { preventDefault: true })
    const ctrlKUnregister = registerShortcut('ctrl+k', () => {
      if (paletteOpenRef.current) return
      setPaletteOpen(true)
    }, { preventDefault: true })
    const ctrlNUnregister = registerShortcut('alt+n', () => {
      document.querySelector('[data-shortcut="new"]')?.click()
    }, { preventDefault: true })
    const ctrlFUnregister = registerShortcut('ctrl+f', () => {
      const input = document.querySelector('[data-search-input]')
      if (input) { input.focus(); input.select() }
    }, { preventDefault: true })
    const f5Unregister = registerShortcut('f5', () => {
      window.dispatchEvent(new CustomEvent('sb:refresh'))
    }, { preventDefault: true })

    return () => {
      unregisters.forEach(fn => fn())
      helpUnregister()
      ctrlKUnregister()
      ctrlNUnregister()
      ctrlFUnregister()
      f5Unregister()
    }
  }, [navMap, handleNav, registerShortcut, setHelpOpen, setPaletteOpen])

  useEffect(() => {
    const handler = () => window.dispatchEvent(new CustomEvent('sb:data-refresh'))
    window.addEventListener('sb:refresh', handler)
    return () => window.removeEventListener('sb:refresh', handler)
  }, [])

  async function handleLogout() {
    try {
      const { default: api } = await import('../../api/axios')
      await api.post('/auth/logout')
    } catch {
      // ignore
    }
    useAuthStore.getState().clearAuth()
    toast.success('Signed out successfully')
    navigate('/login')
  }

  const visibleNav = useMemo(() =>
    NAV
      .map(section => ({ ...section, items: section.items.filter(item => permissions.includes(item.permission)) }))
      .filter(section => section.items.length > 0),
    [permissions]
  )

  const W = isMobile ? FULL : (collapsed ? SLIM : FULL)

  return (
    <div style={{
      display: 'flex', height: '100vh', overflow: 'hidden',
      fontFamily: "'Inter', -apple-system, sans-serif",
      background: 'var(--bg-page)',
    }}>
      <style>{`
        .sb-icon-btn { transition: background-color .13s, color .13s; }
        .sb-icon-btn:hover { background: var(--bg-hover); color: var(--text-primary); }
        .sb-nav-item { transition: background-color .13s, color .13s; }
        .sb-nav-item:hover { background: var(--bg-hover); color: var(--text-primary); }
      `}</style>

      {isMobile && mobileOpen && (
        <div
          onClick={() => setMobileOpen(false)}
          role="presentation"
          aria-hidden={true}
          style={{
            position: 'fixed', inset: 0, zIndex: 99,
            background: 'rgba(0,0,0,0.5)',
            backdropFilter: 'blur(4px)',
            animation: 'fadeIn 0.15s var(--ease-out)',
          }}
        />
      )}

      {/* ── SIDEBAR ── */}
      <aside
        role="navigation"
        aria-label="Main navigation"
        style={{
          width: isMobile ? FULL : W,
          minHeight: '100vh',
          background: 'var(--sb-bg)',
          display: 'flex',
          flexDirection: 'column',
          position: 'fixed',
          top: 0, left: 0, bottom: 0,
          zIndex: isMobile ? 100 : 100,
          transform: isMobile ? `translateX(${mobileOpen ? '0' : `-${FULL}px`})` : 'none',
          transition: 'width 0.2s var(--ease-out), transform 0.22s var(--ease-out)',
          overflow: 'hidden',
          borderRight: '1px solid var(--sb-border)',
          boxShadow: isMobile && mobileOpen ? 'var(--shadow-elevated)' : 'none',
        }}
      >
        {/* Logo header */}
        <div style={{
          height: 60,
          display: 'flex', alignItems: 'center',
          padding: collapsed && !isMobile ? '0 18px' : '0 16px',
          justifyContent: (collapsed && !isMobile) ? 'center' : 'space-between',
          borderBottom: '1px solid var(--sb-border)',
          flexShrink: 0,
        }}>
          {isMobile ? (
            <>
              <Logo collapsed={false} />
              <button
                onClick={() => setMobileOpen(false)}
                aria-label="Close sidebar"
                style={{
                  background: 'rgba(255,255,255,0.04)',
                  border: '1px solid rgba(255,255,255,0.07)',
                  borderRadius: 7, width: 26, height: 26, cursor: 'pointer',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  color: 'var(--sb-text-muted)', flexShrink: 0,
                }}
              >
                <svg width="14" height="14" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.2}>
                  <path d="M6 18L18 6M6 6l12 12"/>
                </svg>
              </button>
            </>
          ) : collapsed ? (
            <button onClick={() => setCollapsed(false)} aria-label="Expand sidebar" style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}>
              <Logo collapsed />
            </button>
          ) : (
            <>
              <Logo collapsed={false} />
              <button
                onClick={() => setCollapsed(true)}
                aria-label="Collapse sidebar"
                style={{
                  background: 'rgba(255,255,255,0.04)',
                  border: '1px solid rgba(255,255,255,0.07)',
                  borderRadius: 7, width: 26, height: 26, cursor: 'pointer',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  color: 'var(--sb-text-muted)', flexShrink: 0,
                }}
              >
                <svg width="12" height="12" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.2}>
                  <path d="M11 19l-7-7 7-7m8 14l-7-7 7-7"/>
                </svg>
              </button>
            </>
          )}
        </div>

        {/* Workspace badge */}
        {!collapsed && (
          <div style={{
            margin: '12px 10px 4px',
            background: 'rgba(255,255,255,0.03)',
            border: '1px solid rgba(255,255,255,0.06)',
            borderRadius: 10, padding: '9px 10px',
            display: 'flex', alignItems: 'center', gap: 9,
          }}>
            <div style={{
              width: 24, height: 24, borderRadius: 6,
              background: 'var(--accent-600)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontSize: '0.6rem', fontWeight: 800, color: '#fff', flexShrink: 0,
            }}>
              {businessName[0]?.toUpperCase()}
            </div>
            <div style={{ overflow: 'hidden', flex: 1 }}>
              <p style={{ fontSize: '0.7rem', fontWeight: 600, color: 'var(--sb-text-primary)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', margin: 0 }}>
                {businessName}
              </p>
              <p style={{ fontSize: '0.58rem', color: 'var(--sb-text-muted)', margin: 0 }}>Workspace</p>
            </div>
            <div style={{ width: 6, height: 6, borderRadius: '50%', background: '#22C55E', flexShrink: 0 }} />
          </div>
        )}

        {/* Nav sections */}
        <nav
          aria-label="Page sections"
          style={{
            flex: 1, overflowY: 'auto', overflowX: 'hidden',
            padding: collapsed && !isMobile ? '10px 8px' : '6px 8px',
            scrollbarWidth: 'none',
          }}
        >
          {visibleNav.map(section => (
            <div key={section.label} style={{ marginBottom: 2 }}>
              {!collapsed && (
                <p style={{
                  fontSize: '0.58rem', fontWeight: 700, color: 'var(--sb-text-section)',
                  textTransform: 'uppercase', letterSpacing: '0.08em',
                  padding: '16px 10px 6px', margin: 0,
                }}>
                  {section.label}
                </p>
              )}
              {collapsed && !isMobile && <div style={{ height: 8 }} />}
              {section.items.map(item => (
                <NavItem key={item.path} item={item} collapsed={collapsed && !isMobile} />
              ))}
            </div>
          ))}
        </nav>

        {/* User footer */}
        <div style={{
          padding: collapsed && !isMobile ? '12px 8px' : '12px 10px',
          borderTop: '1px solid var(--sb-border)', flexShrink: 0,
        }}>
          {(!collapsed || isMobile) ? (
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <div style={{
                width: 32, height: 32, borderRadius: 8,
                background: 'var(--accent-600)',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontSize: '0.68rem', fontWeight: 700, color: '#fff', flexShrink: 0,
              }}>
                {initials}
              </div>
              <div style={{ flex: 1, overflow: 'hidden' }}>
                <p style={{
                  fontSize: '0.72rem', fontWeight: 600, color: 'var(--sb-text-primary)',
                  whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
                  margin: 0, textTransform: 'capitalize',
                }}>
                  {userName}
                </p>
                <p style={{ fontSize: '0.6rem', color: 'var(--sb-text-muted)', margin: 0 }}>
                  {userRole}
                </p>
              </div>
              <button
                onClick={() => setShowLogout(true)}
                aria-label="Sign out"
                style={{
                  background: 'rgba(239,68,68,0.08)',
                  border: '1px solid rgba(239,68,68,0.12)',
                  borderRadius: 7, width: 28, height: 28, cursor: 'pointer',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  color: '#F87171', flexShrink: 0,
                  transition: 'background 0.13s',
                }}
              >
                <svg width="13" height="13" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1"/>
                </svg>
              </button>
            </div>
          ) : (
            <div style={{ display: 'flex', justifyContent: 'center' }}>
              <div style={{
                width: 32, height: 32, borderRadius: 8,
                background: 'var(--accent-600)',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontSize: '0.68rem', fontWeight: 700, color: '#fff', cursor: 'pointer',
              }} title={userName} role="button" tabIndex={0}>
                {initials}
              </div>
            </div>
          )}
          {!collapsed && (
            <div style={{
              display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 4,
              marginTop: 8, paddingTop: 8, borderTop: '1px solid var(--sb-border)',
            }}>
              <span style={{ fontSize: '0.6rem', color: 'var(--sb-text-muted)' }}>
                Press <kbd style={{
                  fontFamily: "'JetBrains Mono', monospace", fontSize: 9, fontWeight: 600,
                  padding: '1px 4px', borderRadius: 3,
                  border: '1px solid rgba(255,255,255,0.1)',
                  background: 'rgba(255,255,255,0.04)', color: 'var(--sb-text-muted)',
                }}>?</kbd> for shortcuts
              </span>
            </div>
          )}
        </div>
      </aside>

      {/* ── MAIN CONTENT ── */}
      <div style={{
        flex: 1, minWidth: 0,
        marginLeft: isMobile ? 0 : W,
        transition: 'margin-left 0.2s var(--ease-out)',
        display: 'flex', flexDirection: 'column',
        height: '100vh', overflowX: 'hidden',
      }}>

        {/* Topbar */}
        <header style={{
          height: 56,
          background: 'var(--topbar-bg)',
          backdropFilter: 'blur(12px)',
          WebkitBackdropFilter: 'blur(12px)',
          borderBottom: '1px solid var(--topbar-border)',
          display: 'flex', alignItems: 'center',
          justifyContent: 'space-between',
          padding: isMobile ? '0 16px' : '0 28px',
          position: 'sticky', top: 0, zIndex: 50,
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            {isMobile && (
              <button
                onClick={() => setMobileOpen(true)}
                aria-label="Open sidebar"
                style={{
                  background: 'transparent',
                  border: 'none',
                  width: 34, height: 34,
                  cursor: 'pointer',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  color: 'var(--text-secondary)',
                }}
              >
                <svg width="18" height="18" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path d="M3 6h18M3 12h18M3 18h18"/>
                </svg>
              </button>
            )}
            <div>
              <p style={{
                fontSize: isMobile ? '0.8rem' : '0.85rem',
                fontWeight: 700, color: 'var(--text-primary)', margin: 0,
                letterSpacing: '-0.2px',
              }}>
                {currentPage}
              </p>
            </div>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: isMobile ? 4 : 8 }}>

            <IconButton aria-label="Notifications">
              <svg width="16" height="16" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
                <path d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9"/>
              </svg>
              <span style={{
                position: 'absolute', top: 8, right: 9,
                width: 5, height: 5, background: 'var(--accent-600)',
                borderRadius: '50%',
                border: '1.5px solid var(--topbar-bg)',
              }} />
            </IconButton>

            <div style={{ width: 1, height: 18, background: 'var(--border)' }} />

            <div style={{ position: 'relative' }}>
              <IconButton onClick={() => setShowTheme(v => !v)} aria-label="Toggle theme">
                <svg width="16" height="16" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
                  <path d="M20.354 15.354A9 9 0 018.646 3.646 9.003 9.003 0 0012 21a9.003 9.003 0 008.354-5.646z"/>
                </svg>
              </IconButton>
              {showTheme && <ThemePanel theme={theme} setTheme={setTheme} accent={accent} setAccent={setAccent} onClose={handleThemeClose} />}
            </div>

            <div style={{
              display: 'flex', alignItems: 'center', gap: 8,
              background: 'var(--bg-subtle)',
              border: '1px solid var(--border)',
              borderRadius: 8,
              padding: '3px 10px 3px 3px',
              cursor: 'pointer',
            }}>
              <div style={{
                width: 26, height: 26, borderRadius: 6,
                background: 'var(--accent-600)',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontSize: '0.6rem', fontWeight: 700, color: '#fff',
              }}>
                {initials}
              </div>
              {!isMobile && (
                <span style={{ fontSize: '0.72rem', fontWeight: 600, color: 'var(--text-primary)', textTransform: 'capitalize' }}>
                  {userName}
                </span>
              )}
            </div>

          </div>
        </header>

        <SubscriptionBanner />

        <main style={{
          flex: 1,
          padding: isMobile ? '1.25rem 1rem' : '1.5rem 2rem',
          paddingBottom: isMobile ? 'calc(1.25rem + 3.5rem)' : '1.5rem',
          overflowY: 'auto', overflowX: 'hidden',
        }}>
          <div className="fade-up"><ErrorBoundary><Outlet /></ErrorBoundary></div>
        </main>
      </div>

      <BottomNav items={BOTTOM_NAV_ITEMS} isMobile={isMobile} onMoreClick={() => setMobileOpen(true)} />

      {showLogout && <LogoutDialog onConfirm={handleLogout} onCancel={() => setShowLogout(false)} />}

      <CommandPalette open={paletteOpen} onClose={() => setPaletteOpen(false)} />
      <ShortcutHelp open={helpOpen} onClose={() => setHelpOpen(false)} />
    </div>
  )
}
