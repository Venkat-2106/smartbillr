import { useSubscription } from '../hooks/useSubscription'
import { formatDate } from '../../../shared/utils/formatDate'

export default function SubscriptionBanner() {
  const { data: sub } = useSubscription()

  if (!sub || sub.is_expired) return null

  if (sub.subscription_type === 'trial') {
    const days = sub.days_remaining

    return (
      <div style={{
        background: 'var(--warning-bg, #FFFBEB)',
        borderBottom: '1px solid var(--warning-border, #FDE68A)',
        padding: '10px 28px',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 8,
        fontSize: 13,
        fontWeight: 500,
        color: 'var(--warning-text, #92400E)',
        flexShrink: 0,
      }}>
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0 }}>
          <path d="M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z" />
          <line x1="12" y1="9" x2="12" y2="13" />
          <line x1="12" y1="17" x2="12.01" y2="17" />
        </svg>
        <span>Free trial — {days === 0 ? 'last day' : days === 1 ? '1 day remaining' : `${days} days remaining`}</span>
        {sub.trial_end_at && (
          <span style={{ opacity: 0.7 }}>
            (ends {formatDate(sub.trial_end_at)})
          </span>
        )}
      </div>
    )
  }

  if (sub.subscription_type === 'monthly' || sub.subscription_type === 'annual') {
    return (
      <div style={{
        background: 'var(--info-bg, #EFF6FF)',
        borderBottom: '1px solid var(--info-border, #BFDBFE)',
        padding: '10px 28px',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 8,
        fontSize: 13,
        fontWeight: 500,
        color: 'var(--info-text, #1E40AF)',
        flexShrink: 0,
      }}>
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0 }}>
          <circle cx="12" cy="12" r="10" />
          <line x1="12" y1="16" x2="12" y2="12" />
          <line x1="12" y1="8" x2="12.01" y2="8" />
        </svg>
        <span>Subscription active</span>
        {sub.subscription_end_at && (
          <span style={{ opacity: 0.7 }}>
            — renews on {formatDate(sub.subscription_end_at)}
          </span>
        )}
      </div>
    )
  }

  return null
}
