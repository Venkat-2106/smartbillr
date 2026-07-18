import { useNavigate } from 'react-router-dom'

export default function UpgradeBlur({ children, reason, feature = 'financial reports' }) {
  const navigate = useNavigate()

  if (!reason) return children

  return (
    <div style={{ position: 'relative', overflow: 'hidden' }}>
      <div
        style={{
          filter: 'blur(6px)',
          pointerEvents: 'none',
          userSelect: 'none',
          opacity: 0.35,
          transition: 'opacity 0.3s',
        }}
        aria-hidden="true"
      >
        {children}
      </div>

      <div
        style={{
          position: 'absolute',
          inset: 0,
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          gap: 10,
          padding: 20,
          background: 'rgba(255,255,255,0.35)',
          backdropFilter: 'blur(2px)',
          borderRadius: 'inherit',
          zIndex: 2,
        }}
      >
        <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="var(--warning)" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
          <path d="M12 3l1.5 5.5L19 10l-5.5 1.5L12 17l-1.5-5.5L5 10l5.5-1.5z" />
          <path d="M18 14l1 2.5L21.5 18l-2.5 1L18 21.5l-1-2.5L14.5 18l2.5-1z" />
        </svg>

        <div style={{ textAlign: 'center' }}>
          <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--warning-text)', marginBottom: 4 }}>
            Upgrade to see your {feature}
          </div>
          <div style={{ fontSize: 12, color: 'var(--text-secondary)', lineHeight: 1.5 }}>
            {reason === 'suspended'
              ? 'Your subscription has been suspended. Reactivate to access this data.'
              : 'This data is available on paid plans only.'}
          </div>
        </div>

        <button
          type="button"
          onClick={() => navigate('/subscription')}
          style={{
            marginTop: 4,
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
      </div>
    </div>
  )
}
