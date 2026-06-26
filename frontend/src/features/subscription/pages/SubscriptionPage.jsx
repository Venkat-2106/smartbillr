import { useNavigate } from 'react-router-dom'
import { Spinner } from '../../../shared/components'
import { useSubscription } from '../hooks/useSubscription'
import useAuthStore from '../../../store/authStore'
import { useEffect, useMemo } from 'react'
import {
  SUBSCRIPTION_DISPLAY_NAMES as DISPLAY_NAMES,
  PLAN_ORDER, NEXT_TIER, getSubscriptionDisplayName,
} from '../../../shared/utils/subscriptionUtils'

const FEATURES = [
  { key: 'billing',    label: 'Billing',                  render: (v) => v },
  { key: 'staff',      label: 'Staff accounts',           render: (v) => v === null ? 'Unlimited' : String(v) },
  { key: 'manager',    label: 'Manager accounts',         render: (v) => v === null ? 'Unlimited' : String(v) },
  { key: 'products',   label: 'Products',                 render: (v) => v === null ? 'Unlimited' : `Up to ${v}` },
  { key: 'customers',  label: 'Customers',                render: (v) => v === null ? 'Unlimited' : `Up to ${v}` },
  { key: 'suppliers',  label: 'Suppliers',                render: (v) => v === null ? 'Unlimited' : `Up to ${v}` },
  { key: 'sales',      label: 'Monthly sales',            render: (v) => v === null ? 'Unlimited' : `Up to ${v}` },
  { key: 'purchases',  label: 'Monthly purchases',        render: (v) => v === null ? 'Unlimited' : `Up to ${v}` },
  { key: 'exports',    label: 'Export rows',              render: (v) => v === null ? 'Unlimited' : `Up to ${v.toLocaleString()}` },
  { key: 'reports',    label: 'Financial reports',        render: (v) => v ? '✓' : '—' },
  { key: 'profit',     label: 'Product profit view',      render: (v) => v ? '✓' : '—' },
  { key: 'support',    label: 'Support',                  render: (v) => v },
]

const STAFF_LIMITS_PLANS = {
  trial:   { staff: 0,    manager: 0 },
  monthly: { staff: 2,    manager: 1 },
  annual:  { staff: null, manager: null },
  lifetime: { staff: null, manager: null },
}

const FEATURE_LIMITS_PLANS = {
  trial: {
    billing: 'Free',
    products: 50, customers: 50, suppliers: 25,
    sales: 100, purchases: 50, exports: 500,
    reports: false, profit: false,
    support: 'Email',
  },
  monthly: {
    billing: 'Monthly',
    products: null, customers: null, suppliers: null,
    sales: null, purchases: null, exports: 10_000,
    reports: true, profit: true,
    support: 'Email + WhatsApp',
  },
  annual: {
    billing: 'Yearly',
    products: null, customers: null, suppliers: null,
    sales: null, purchases: null, exports: 10_000,
    reports: true, profit: true,
    support: 'Email + WhatsApp',
  },
  lifetime: {
    billing: 'One-time',
    products: null, customers: null, suppliers: null,
    sales: null, purchases: null, exports: 10_000,
    reports: true, profit: true,
    support: 'Priority',
  },
}

function getPlanData(tier) {
  const s = STAFF_LIMITS_PLANS[tier] || STAFF_LIMITS_PLANS.trial
  const f = FEATURE_LIMITS_PLANS[tier] || FEATURE_LIMITS_PLANS.trial
  return { staff: s.staff, manager: s.manager, ...f }
}

export default function SubscriptionPage() {
  const navigate = useNavigate()
  const { data: sub, isLoading } = useSubscription()
  const token = useAuthStore(s => s.token)

  useEffect(() => {
    if (!token) {
      navigate('/login', { replace: true })
    }
  }, [token, navigate])

  const currentTier = sub?.subscription_type || 'trial'
  const nextTier = NEXT_TIER[currentTier]

  const plans = useMemo(() => PLAN_ORDER.map((tier) => ({
    id: tier,
    name: DISPLAY_NAMES[tier],
    isCurrent: tier === currentTier,
    isUpgrade: tier === nextTier,
    data: getPlanData(tier),
  })), [currentTier, nextTier])

  const featureRows = useMemo(() => FEATURES.map((f) => {
    const planValues = plans.map((p) => {
      let val
      if (f.key === 'staff')   val = p.data.staff
      else if (f.key === 'manager') val = p.data.manager
      else if (f.key === 'products')  val = p.data.products
      else if (f.key === 'customers') val = p.data.customers
      else if (f.key === 'suppliers') val = p.data.suppliers
      else if (f.key === 'sales')     val = p.data.sales
      else if (f.key === 'purchases') val = p.data.purchases
      else if (f.key === 'exports')   val = p.data.exports
      else if (f.key === 'reports')   val = p.data.reports
      else if (f.key === 'profit')    val = p.data.profit
      else if (f.key === 'billing')   val = p.data.billing
      else if (f.key === 'support')   val = p.data.support
      return f.render(val)
    })
    return { label: f.label, values: planValues }
  }), [plans])

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
      background: '#f5f5f5',
      padding: 24,
      fontFamily: 'system-ui, sans-serif',
    }}>
      <div style={{ maxWidth: 960, margin: '0 auto' }}>

        {/* ── Current subscription card ── */}
        <div style={{
          background: 'white',
          borderRadius: 16,
          padding: 32,
          boxShadow: '0 4px 24px rgba(0,0,0,0.08)',
          marginBottom: 32,
          textAlign: 'center',
        }}>
          <div style={{
            width: 64, height: 64, borderRadius: '50%',
            background: sub.is_expired ? '#FEE2E2' : '#DBEAFE',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            margin: '0 auto 20px',
          }}>
            <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke={sub.is_expired ? '#DC2626' : '#2563EB'} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
              <path d="M7 11V7a5 5 0 0 1 10 0v4" />
            </svg>
          </div>

          <h1 style={{ fontSize: 24, fontWeight: 600, margin: '0 0 8px', color: '#111' }}>
            {sub.is_expired ? 'Subscription Required' : `${DISPLAY_NAMES[currentTier] || 'Trial'} Plan`}
          </h1>

          <p style={{ color: '#666', margin: '0 0 24px', lineHeight: 1.5 }}>
            {sub.is_expired
              ? 'Your access has been restricted. Please renew to continue.'
              : 'Your subscription is active.'}
          </p>

          <div style={{
            display: 'flex', justifyContent: 'center', gap: 32,
            flexWrap: 'wrap',
          }}>
            <InfoBadge label="Status" value={statusLabel[sub.payment_status] || sub.payment_status} />
            {sub.trial_end_at && (
              <InfoBadge label="Trial Ends" value={formatDate(sub.trial_end_at)} />
            )}
            {sub.subscription_end_at && (
              <InfoBadge label="Subscription Ends" value={formatDate(sub.subscription_end_at)} />
            )}
            {sub.days_remaining !== null && sub.days_remaining !== undefined && (
              <InfoBadge
                label="Days Remaining"
                value={String(sub.days_remaining)}
                highlight={sub.days_remaining <= 7}
              />
            )}
          </div>
        </div>

        {/* ── Upgrade callout ── */}
        {nextTier && !sub.is_expired && (
          <div style={{
            background: 'linear-gradient(135deg, #FFF7ED 0%, #FEF3C7 100%)',
            border: '1px solid #FDE68A',
            borderRadius: 16,
            padding: 24,
            marginBottom: 32,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            flexWrap: 'wrap',
            gap: 16,
          }}>
            <div>
              <p style={{ margin: '0 0 4px', fontSize: 16, fontWeight: 600, color: '#92400E' }}>
                Upgrade to {DISPLAY_NAMES[nextTier]}
              </p>
              <p style={{ margin: 0, fontSize: 14, color: '#B45309', lineHeight: 1.5 }}>
                Unlock more features and higher limits for your business.
              </p>
            </div>
            <button
              type="button"
              onClick={() => navigate('/upgrade')}
              style={{
                padding: '10px 24px',
                background: 'linear-gradient(135deg, #F59E0B, #D97706)',
                color: 'white',
                border: 'none',
                borderRadius: 8,
                fontSize: 14,
                fontWeight: 600,
                cursor: 'pointer',
                whiteSpace: 'nowrap',
                boxShadow: '0 1px 3px rgba(217,119,6,0.3)',
              }}
            >
              Upgrade now →
            </button>
          </div>
        )}

        {/* ── Plan comparison table ── */}
        <div style={{
          background: 'white',
          borderRadius: 16,
          boxShadow: '0 4px 24px rgba(0,0,0,0.08)',
          overflow: 'hidden',
        }}>
          <div style={{
            display: 'grid',
            gridTemplateColumns: `200px repeat(${plans.length}, 1fr)`,
            borderBottom: '1px solid #E5E7EB',
          }}>
            <div style={{ padding: 16, fontSize: 13, fontWeight: 600, color: '#6B7280' }}>Plan</div>
            {plans.map((p) => (
              <div key={p.id} style={{
                padding: 16,
                textAlign: 'center',
                background: p.isCurrent ? '#FFF7ED' : 'transparent',
                position: 'relative',
              }}>
                {p.isUpgrade && (
                  <span style={{
                    position: 'absolute', top: -8, left: '50%', transform: 'translateX(-50%)',
                    background: 'linear-gradient(135deg, #F59E0B, #D97706)',
                    color: 'white', fontSize: 10, fontWeight: 600,
                    padding: '2px 10px', borderRadius: 10,
                    whiteSpace: 'nowrap',
                  }}>
                    Recommended
                  </span>
                )}
                <div style={{ fontSize: 16, fontWeight: 600, color: p.isCurrent ? '#92400E' : '#111' }}>
                  {p.name}
                </div>
                {p.isCurrent && (
                  <div style={{ fontSize: 11, color: '#B45309', marginTop: 2 }}>Current</div>
                )}
              </div>
            ))}
          </div>

          {featureRows.map((row, i) => (
            <div key={i} style={{
              display: 'grid',
              gridTemplateColumns: `200px repeat(${plans.length}, 1fr)`,
              borderBottom: i < featureRows.length - 1 ? '1px solid #F3F4F6' : 'none',
              background: i % 2 === 0 ? '#FAFAFA' : 'white',
            }}>
              <div style={{ padding: '12px 16px', fontSize: 13.5, color: '#374151' }}>
                {row.label}
              </div>
              {row.values.map((val, j) => (
                <div key={j} style={{
                  padding: '12px 16px',
                  textAlign: 'center',
                  fontSize: 13,
                  fontWeight: plans[j].isCurrent ? 600 : 400,
                  color: plans[j].isCurrent ? '#92400E' : '#6B7280',
                }}>
                  {val}
                </div>
              ))}
            </div>
          ))}
        </div>

        {/* ── Contact support ── */}
        <div style={{
          background: '#FFF7ED',
          borderRadius: 12,
          padding: 16,
          marginTop: 24,
          textAlign: 'center',
        }}>
          <p style={{ margin: '0 0 4px', fontSize: 14, color: '#9A3412', fontWeight: 500 }}>
            Need help choosing a plan or a custom solution?
          </p>
          <p style={{ margin: 0, fontSize: 14, color: '#C2410C' }}>
            Email: support@smartbillr.com &nbsp;|&nbsp; WhatsApp: +91-XXXXXXXXXX
          </p>
        </div>

        <div style={{ textAlign: 'center', marginTop: 24 }}>
          <button
            onClick={() => { useAuthStore.getState().clearAuth(); navigate('/login', { replace: true }) }}
            style={{
              padding: '10px 24px',
              background: 'none',
              color: '#6B7280',
              border: '1px solid #D1D5DB',
              borderRadius: 8,
              fontSize: 14,
              cursor: 'pointer',
            }}
          >
            Sign Out
          </button>
        </div>
      </div>
    </div>
  )
}

function InfoBadge({ label, value, highlight }) {
  return (
    <div style={{ textAlign: 'center' }}>
      <div style={{ fontSize: 12, color: '#6B7280', marginBottom: 2 }}>{label}</div>
      <div style={{
        fontSize: 15, fontWeight: 600,
        color: highlight ? '#DC2626' : '#111',
      }}>
        {value}
      </div>
    </div>
  )
}

function formatDate(iso) {
  if (!iso) return '—'
  const d = new Date(iso)
  return d.toLocaleDateString('en-IN', { year: 'numeric', month: 'short', day: 'numeric' })
}
