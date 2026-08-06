import { useState } from 'react'
import { useNavigate } from 'react-router-dom'

const TIER_INFO = {
  trial:   { label: 'Trial',    color: 'var(--warning-text)' },
  monthly: { label: 'Monthly',  color: 'var(--accent-600)' },
  annual:  { label: 'Annual',   color: 'var(--accent-600)' },
  lifetime: { label: 'Lifetime', color: 'var(--accent-600)' },
}

const PLAN_COMPARISON = {
  trial:   { staff: '0',   manager: '0',    icon: '☀️' },
  monthly: { staff: '2',   manager: '1',    icon: '🚀' },
  annual:  { staff: '∞',   manager: '∞',    icon: '🌟' },
  lifetime: { staff: '∞',  manager: '∞',    icon: '🌟' },
}

function SparkleIcon({ size = 16 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" style={{ flexShrink: 0 }}>
      <path d="M12 3l1.5 5.5L19 10l-5.5 1.5L12 17l-1.5-5.5L5 10l5.5-1.5z" />
      <path d="M18 14l1 2.5L21.5 18l-2.5 1L18 21.5l-1-2.5L14.5 18l2.5-1z" />
    </svg>
  )
}

function UpgradeButton({ onClick, compact, children }) {
  return (
    <button
      type="button"
      onClick={onClick}
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 6,
        padding: compact ? '6px 14px' : '10px 20px',
        fontSize: compact ? 12 : 13,
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
      {children || 'Upgrade →'}
    </button>
  )
}

export default function UpgradePrompt({
  variant = 'inline',
  feature = 'team members',
  currentTier = 'trial',
  title,
  message,
  onDismiss,
  onUpgrade,
  style,
}) {
  const navigate = useNavigate()
  const [dismissed, setDismissed] = useState(false)
  const tip = TIER_INFO[currentTier] || TIER_INFO.trial

  const handleUpgrade = onUpgrade || (() => navigate('/subscription'))

  if (variant === 'banner') {
    if (dismissed) return null

    return (
      <div
        role="alert"
        style={{
          background: 'linear-gradient(135deg, var(--warning-bg) 0%, #FEF3C7 100%)',
          border: '1px solid var(--warning-border)',
          borderRadius: 'var(--r-lg)',
          padding: '14px 20px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: 16,
          flexWrap: 'wrap',
          animation: 'fadeIn 300ms var(--ease-out)',
          ...style,
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, flex: 1, minWidth: 200 }}>
          <SparkleIcon size={18} />
          <div>
            <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--warning-text)', marginBottom: 2 }}>
              {title || 'You\u2019re on a free trial'}
            </div>
            <div style={{ fontSize: 12.5, color: 'var(--text-secondary)', lineHeight: 1.5 }}>
              {message || `Upgrade to manage ${feature} and unlock premium features.`}
            </div>
          </div>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexShrink: 0 }}>
          <UpgradeButton onClick={handleUpgrade} compact />
          {onDismiss && (
            <button
              type="button"
              onClick={() => { setDismissed(true); onDismiss?.() }}
              aria-label="Dismiss"
              style={{
                background: 'none',
                border: 'none',
                cursor: 'pointer',
                color: 'var(--text-muted)',
                padding: 4,
                borderRadius: 'var(--r-sm)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                transition: 'color var(--duration-fast) var(--ease-out)',
              }}
              onMouseEnter={(e) => { e.currentTarget.style.color = 'var(--text-secondary)' }}
              onMouseLeave={(e) => { e.currentTarget.style.color = 'var(--text-muted)' }}
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <line x1="18" y1="6" x2="6" y2="18" />
                <line x1="6" y1="6" x2="18" y2="18" />
              </svg>
            </button>
          )}
        </div>
      </div>
    )
  }

  const planKeys = currentTier === 'monthly'
    ? ['monthly', 'annual', 'lifetime']
    : ['trial', 'monthly', 'annual', 'lifetime']

  return (
    <div
      style={{
        borderRadius: 'var(--r-lg)',
        border: '1px solid var(--warning-border)',
        background: 'var(--warning-bg)',
        overflow: 'hidden',
        animation: 'fadeIn 200ms var(--ease-out)',
        ...style,
      }}
    >
      <div style={{ display: 'flex', gap: 0 }}>
        <div style={{
          width: 4,
          flexShrink: 0,
          background: 'linear-gradient(180deg, var(--warning), #F59E0B)',
        }} />
        <div style={{ flex: 1, padding: '16px 18px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 10 }}>
            <SparkleIcon size={16} />
            <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--warning-text)' }}>
              {feature ? `Upgrade to add more ${feature}` : 'Upgrade to unlock'}
            </span>
          </div>

          <p style={{ fontSize: 12.5, color: 'var(--text-secondary)', lineHeight: 1.5, margin: '0 0 14px 26px' }}>
            Your plan (<span style={{ fontWeight: 600, color: tip.color }}>{tip.label}</span>) has limited {feature} slots.
            Upgrade to a paid plan for more capacity.
          </p>

          <div style={{
            display: 'grid',
            gridTemplateColumns: `repeat(${planKeys.length}, 1fr)`,
            gap: 8,
            marginBottom: 14,
            marginLeft: 26,
          }}>
            {planKeys.map((tier) => {
              const plan = PLAN_COMPARISON[tier]
              const isCurrent = tier === currentTier
              const isRecommended = currentTier === 'trial'
                ? tier === 'monthly'
                : tier === 'annual'
              return (
                <div
                  key={tier}
                  style={{
                    padding: '10px 10px 8px',
                    borderRadius: 'var(--r-md)',
                    background: isCurrent ? 'rgba(217,119,6,0.08)' : 'transparent',
                    border: isRecommended && !isCurrent ? '1px solid var(--warning-border)' : '1px solid transparent',
                    textAlign: 'center',
                  }}
                >
                  <div style={{ fontSize: 18, marginBottom: 2 }}>{plan.icon}</div>
                  <div style={{
                    fontSize: 11,
                    fontWeight: 600,
                    color: isCurrent ? 'var(--warning-text)' : 'var(--text-secondary)',
                    marginBottom: 4,
                  }}>
                    {plan.label}
                    {isRecommended && !isCurrent && (
                      <span style={{
                        display: 'block',
                        fontSize: 9,
                        fontWeight: 500,
                        color: 'var(--warning)',
                        marginTop: 1,
                        textTransform: 'uppercase',
                        letterSpacing: '0.04em',
                      }}>
                        Recommended
                      </span>
                    )}
                    {isCurrent && (
                      <span style={{
                        display: 'block',
                        fontSize: 9,
                        fontWeight: 500,
                        color: 'var(--text-muted)',
                        marginTop: 1,
                      }}>
                        Current
                      </span>
                    )}
                  </div>
                  <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-primary)' }}>
                    {plan.staff === '∞' ? 'Unlimited' : plan.staff}
                  </div>
                  <div style={{ fontSize: 10.5, color: 'var(--text-muted)', marginTop: 1 }}>
                    staff
                  </div>
                  <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-primary)', marginTop: 4 }}>
                    {plan.manager === '∞' ? 'Unlimited' : plan.manager}
                  </div>
                  <div style={{ fontSize: 10.5, color: 'var(--text-muted)', marginTop: 1 }}>
                    managers
                  </div>
                </div>
              )
            })}
          </div>

          <div style={{ marginLeft: 26 }}>
            <UpgradeButton onClick={handleUpgrade} compact>
              View plans →
            </UpgradeButton>
          </div>
        </div>
      </div>
    </div>
  )
}
