import { useNavigate } from 'react-router-dom'
import { Spinner } from '../../../shared/components'
import { useSubscription } from '../hooks/useSubscription'
import useAuthStore from '../../../store/authStore'
import { useEffect } from 'react'

export default function SubscriptionPage() {
  const navigate = useNavigate()
  const { data: sub, isLoading } = useSubscription()
  const token = useAuthStore(s => s.token)
  const logout = () => {
    useAuthStore.getState().clearAuth()
    navigate('/login', { replace: true })
  }

  useEffect(() => {
    if (!token) {
      navigate('/login', { replace: true })
    }
  }, [token, navigate])

  if (isLoading) {
    return (
      <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100vh' }}>
        <Spinner size={32} />
      </div>
    )
  }

  if (!sub) {
    return (
      <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100vh' }}>
        <p>Unable to load subscription information.</p>
      </div>
    )
  }

  const statusLabel = {
    pending: 'Pending',
    paid: 'Active',
    suspended: 'Suspended',
  }

  return (
    <div style={{
      minHeight: '100vh',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      background: '#f5f5f5',
      padding: 24,
      fontFamily: 'system-ui, sans-serif',
    }}>
      <div style={{
        maxWidth: 500,
        width: '100%',
        background: 'white',
        borderRadius: 16,
        padding: 40,
        boxShadow: '0 4px 24px rgba(0,0,0,0.08)',
        textAlign: 'center',
      }}>
        <div style={{
          width: 64,
          height: 64,
          borderRadius: '50%',
          background: sub.is_expired ? '#FEE2E2' : '#DBEAFE',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          margin: '0 auto 24px',
        }}>
          <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke={sub.is_expired ? '#DC2626' : '#2563EB'} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
            <path d="M7 11V7a5 5 0 0 1 10 0v4" />
          </svg>
        </div>

        <h1 style={{ fontSize: 24, fontWeight: 600, margin: '0 0 8px', color: '#111' }}>
          {sub.is_expired ? 'Subscription Required' : 'Subscription Status'}
        </h1>

        <p style={{ color: '#666', margin: '0 0 32px', lineHeight: 1.5 }}>
          {sub.is_expired
            ? 'Your access has been restricted. Please contact us to renew your subscription.'
            : 'Your subscription is active.'}
        </p>

        <div style={{
          background: '#F9FAFB',
          borderRadius: 12,
          padding: 20,
          textAlign: 'left',
          marginBottom: 24,
        }}>
          <InfoRow label="Status" value={statusLabel[sub.payment_status] || sub.payment_status} />
          <InfoRow label="Plan" value={sub.subscription_type === 'trial' ? 'Trial' : sub.subscription_type === 'monthly' ? 'Monthly' : sub.subscription_type === 'annual' ? 'Annual' : sub.subscription_type} />
          {sub.trial_end_at && (
            <InfoRow label="Trial Ends" value={formatDate(sub.trial_end_at)} />
          )}
          {sub.subscription_end_at && (
            <InfoRow label="Subscription Ends" value={formatDate(sub.subscription_end_at)} />
          )}
          {sub.days_remaining !== null && sub.days_remaining !== undefined && (
            <InfoRow label="Days Remaining" value={String(sub.days_remaining)} />
          )}
        </div>

        <div style={{
          background: '#FFF7ED',
          borderRadius: 12,
          padding: 16,
          marginBottom: 24,
          textAlign: 'left',
        }}>
          <p style={{ margin: 0, fontSize: 14, color: '#9A3412', fontWeight: 500 }}>
            Contact us to renew or upgrade your subscription:
          </p>
          <p style={{ margin: '4px 0 0', fontSize: 14, color: '#C2410C' }}>
            Email: support@smartbillr.com<br />
            WhatsApp: +91-XXXXXXXXXX
          </p>
        </div>

        <button
          onClick={logout}
          style={{
            padding: '12px 24px',
            background: '#111',
            color: 'white',
            border: 'none',
            borderRadius: 8,
            fontSize: 15,
            fontWeight: 500,
            cursor: 'pointer',
            width: '100%',
          }}
        >
          Sign Out
        </button>
      </div>
    </div>
  )
}

function InfoRow({ label, value }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', padding: '8px 0', borderBottom: '1px solid #E5E7EB', fontSize: 14 }}>
      <span style={{ color: '#666' }}>{label}</span>
      <span style={{ color: '#111', fontWeight: 500 }}>{value}</span>
    </div>
  )
}

function formatDate(iso) {
  if (!iso) return '—'
  const d = new Date(iso)
  return d.toLocaleDateString('en-IN', { year: 'numeric', month: 'short', day: 'numeric' })
}
