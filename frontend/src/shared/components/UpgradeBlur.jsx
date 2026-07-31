import { useNavigate } from 'react-router-dom'

// compact=true is for small tiles (e.g. MetricCard KPI cards, colSpan 2-3)
// where the full message card would overflow the tile's natural height.
// Use the full treatment for larger panels (BentoCard sections, report
// sections) where there's room for the icon + heading + description + CTA.
export default function UpgradeBlur({ children, reason, feature = 'financial reports', compact = false }) {
  const navigate = useNavigate()

  if (!reason) return children

  const scrim = (
    // Neutral dark scrim — theme-agnostic, matches the existing modal
    // backdrop convention (ModalPortal.jsx) rather than a hardcoded
    // white wash that only reads correctly in light theme.
    <div
      style={{
        position: 'absolute',
        inset: 0,
        background: 'rgba(0,0,0,0.28)',
        borderRadius: 'inherit',
        zIndex: 1,
      }}
    />
  )

  return (
    <div style={{ position: 'relative' }}>
      <div
        style={{
          filter: 'blur(6px)',
          pointerEvents: 'none',
          userSelect: 'none',
          opacity: 0.45,
          transition: 'opacity 0.3s',
        }}
        aria-hidden="true"
      >
        {children}
      </div>

      {scrim}

      {compact ? (
        reason === 'permission_denied' ? (
          <div
            style={{
              position: 'absolute',
              top: '50%',
              left: '50%',
              transform: 'translate(-50%, -50%)',
              padding: '7px 14px',
              fontSize: 12,
              fontWeight: 600,
              border: '1px solid var(--border)',
              borderRadius: 'var(--r-lg)',
              whiteSpace: 'nowrap',
              background: 'var(--bg-card)',
              color: 'var(--text-primary)',
              boxShadow: 'var(--shadow-elevated, 0 8px 24px rgba(0,0,0,0.18))',
              zIndex: 2,
            }}
          >
            Restricted
          </div>
        ) : (
        // Small pill button, centered — fits inside a KPI-tile-sized card
        // without spilling past its edges.
        <button
          type="button"
          onClick={() => navigate('/subscription')}
          title={reason === 'suspended'
            ? 'Your subscription has been suspended. Reactivate to access this data.'
            : 'This data is available on paid plans only.'}
          style={{
            position: 'absolute',
            top: '50%',
            left: '50%',
            transform: 'translate(-50%, -50%)',
            display: 'inline-flex',
            alignItems: 'center',
            gap: 6,
            padding: '7px 14px',
            fontSize: 12,
            fontWeight: 600,
            border: '1px solid var(--border)',
            borderRadius: 'var(--r-lg)',
            cursor: 'pointer',
            whiteSpace: 'nowrap',
            background: 'var(--bg-card)',
            color: 'var(--text-primary)',
            boxShadow: 'var(--shadow-elevated, 0 8px 24px rgba(0,0,0,0.18))',
            zIndex: 2,
            transition: 'all var(--duration-fast) var(--ease-out)',
          }}
          onMouseEnter={(e) => { e.currentTarget.style.transform = 'translate(-50%, -50%) translateY(-1px)' }}
          onMouseLeave={(e) => { e.currentTarget.style.transform = 'translate(-50%, -50%)' }}
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="var(--warning)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M12 3l1.5 5.5L19 10l-5.5 1.5L12 17l-1.5-5.5L5 10l5.5-1.5z" />
          </svg>
          {reason === 'suspended' ? 'Reactivate' : 'Upgrade'}
        </button>
        )
      ) : (
        // Solid, bordered card — anchored to the page like every other
        // floating panel in the app (see ConfirmDialog.jsx), not a
        // translucent film sitting loosely on top of the content.
        <div
          style={{
            position: 'absolute',
            top: '50%',
            left: '50%',
            transform: 'translate(-50%, -50%)',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            gap: 10,
            padding: '20px 24px',
            maxWidth: 260,
            background: 'var(--bg-card)',
            border: '1px solid var(--border)',
            borderRadius: 'var(--r-lg)',
            boxShadow: 'var(--shadow-elevated, 0 8px 24px rgba(0,0,0,0.18))',
            zIndex: 2,
          }}
        >
          <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="var(--warning)" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
            <path d="M12 3l1.5 5.5L19 10l-5.5 1.5L12 17l-1.5-5.5L5 10l5.5-1.5z" />
            <path d="M18 14l1 2.5L21.5 18l-2.5 1L18 21.5l-1-2.5L14.5 18l2.5-1z" />
          </svg>

          <div style={{ textAlign: 'center' }}>
            <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-primary)', marginBottom: 4 }}>
              {reason === 'permission_denied' ? 'Restricted' : `Upgrade to see your ${feature}`}
            </div>
            <div style={{ fontSize: 12, color: 'var(--text-secondary)', lineHeight: 1.5 }}>
              {reason === 'suspended'
                ? 'Your subscription has been suspended. Reactivate to access this data.'
                : reason === 'permission_denied'
                  ? `Contact your admin for ${feature} access.`
                  : 'This data is available on paid plans only.'}
            </div>
          </div>

          {reason !== 'permission_denied' && (
          <button
            type="button"
            onClick={() => navigate('/subscription')}
            style={{
              marginTop: 2,
              padding: '8px 20px',
              fontSize: 13,
              fontWeight: 600,
              border: 'none',
              borderRadius: 'var(--r-lg)',
              cursor: 'pointer',
              background: 'linear-gradient(135deg, var(--warning), #F59E0B)',
              color: '#fff',
              boxShadow: '0 1px 3px rgba(217,119,6,0.25), 0 0 0 1px rgba(217,119,6,0.3)',
              transition: 'all var(--duration-fast) var(--ease-out)',
              whiteSpace: 'nowrap',
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.boxShadow = '0 4px 12px rgba(217,119,6,0.35), 0 0 0 1px rgba(217,119,6,0.4)'
              e.currentTarget.style.transform = 'translateY(-1px)'
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.boxShadow = '0 1px 3px rgba(217,119,6,0.25), 0 0 0 1px rgba(217,119,6,0.3)'
              e.currentTarget.style.transform = 'none'
            }}
          >
            {reason === 'suspended' ? 'Reactivate →' : 'View plans →'}
          </button>
          )}
        </div>
      )}
    </div>
  )
}