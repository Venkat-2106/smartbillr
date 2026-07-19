// FIX (2026-07-18): Subscription date display
//   Trial and subscription end dates were shown independently (both visible
//   simultaneously when trial_end_at persists after upgrading to paid).
//   Now gated on subscription_type: trial → trial_end_at, paid → subscription_end_at.

import { useNavigate } from 'react-router-dom'
import { Spinner, Button } from '../../../shared/components'
import { useSubscription } from '../hooks/useSubscription'
import useAuthStore from '../../../store/authStore'
import { useMemo } from 'react'
import { formatDate } from '../../../shared/utils/formatDate'
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

const PRICING = {
  trial:   { inr: 'Free',               usd: 'Free' },
  monthly: { inr: '₹499/month',         usd: '$9.99/month' },
  annual:  { inr: '₹4,999/year',        usd: '$99/year',        inrSub: '≈₹416/month', usdSub: '≈$8.25/month' },
  lifetime:{ inr: '₹14,999',            usd: '$299' },
}

function getPlanData(tier) {
  const s = STAFF_LIMITS_PLANS[tier] || STAFF_LIMITS_PLANS.trial
  const f = FEATURE_LIMITS_PLANS[tier] || FEATURE_LIMITS_PLANS.trial
  return { staff: s.staff, manager: s.manager, ...f }
}

function CheckIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--accent-600)" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" style={{ display: 'inline-block', verticalAlign: 'middle' }}>
      <polyline points="20 6 9 17 4 12" />
    </svg>
  )
}

function FeatureValue({ val }) {
  if (val === '✓') return <CheckIcon />
  if (val === '—') return <span style={{ color: 'var(--text-muted)' }}>—</span>
  return <>{val}</>
}

export default function SubscriptionPage() {
  const navigate = useNavigate()
  const { data: sub, isLoading } = useSubscription()
  const token = useAuthStore(s => s.token)
  const business = useAuthStore(s => s.business)
  const country = business?.business_country_code || 'IN'

  const isLoggedIn = !!token
  const currentTier = sub?.subscription_type || 'trial'
  const nextTier = sub && NEXT_TIER[currentTier]

  const isNativeINR = country === 'IN'

  const plans = useMemo(() => PLAN_ORDER.map((tier) => ({
    id: tier,
    name: DISPLAY_NAMES[tier],
    isCurrent: isLoggedIn && tier === currentTier,
    isUpgrade: isLoggedIn && sub && tier === nextTier,
    data: getPlanData(tier),
  })), [currentTier, nextTier, isLoggedIn, sub])

  const pricingRow = useMemo(() => ({
    label: 'Pricing',
    values: plans.map(p => {
      const price = PRICING[p.id]
      if (!price) return { primary: '—', secondary: null, subtitle: null }
      return {
        primary: isNativeINR ? price.inr : price.usd,
        secondary: isNativeINR ? price.usd : price.inr,
        subtitle: isNativeINR ? (price.inrSub || null) : (price.usdSub || null),
      }
    }),
  }), [plans, isNativeINR])

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

  if (isLoading && isLoggedIn) {
    return (
      <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100vh', background: 'var(--bg-page)' }}>
        <Spinner size={32} />
      </div>
    )
  }

  const statusLabel = {
    pending: 'Pending',
    paid: 'Active',
    suspended: 'Suspended',
  }

  const hasSubscription = isLoggedIn && sub

  return (
    <div style={{
      minHeight: '100vh',
      background: 'var(--bg-page)',
      padding: 'var(--page-padding-desktop, 2rem)',
      fontFamily: 'var(--font-sans, "Inter", sans-serif)',
    }}>
      <div style={{ maxWidth: 960, margin: '0 auto' }}>

        {/* ── Back button ── */}
        <button
          onClick={() => navigate(-1)}
          style={{
            background: 'none',
            border: 'none',
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            gap: 6,
            fontSize: 14,
            color: 'var(--text-secondary)',
            padding: '4px 0',
            marginBottom: 8,
            fontFamily: 'inherit',
          }}
        >
          <svg width="16" height="16" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
            <path d="M19 12H5m7-7l-7 7 7 7"/>
          </svg>
          Back
        </button>

        {/* ── Page header ── */}
        <div style={{ textAlign: 'center', marginBottom: 32, paddingTop: 8 }}>
          <h1 style={{ fontSize: 28, fontWeight: 700, margin: '0 0 6px', color: 'var(--text-primary)' }}>
            {hasSubscription ? 'Plans & Pricing' : 'Pricing Plans'}
          </h1>
          <p style={{ margin: 0, fontSize: 15, color: 'var(--text-secondary)', lineHeight: 1.5 }}>
            {hasSubscription
              ? 'Compare features and find the right plan for your business.'
              : 'Choose the perfect plan for your business. No hidden fees.'}
          </p>
        </div>

        {/* ── Current subscription card (only for logged-in users) ── */}
        {hasSubscription && (
          <div style={{
            background: 'var(--bg-card)',
            borderRadius: 'var(--r-xl, 16px)',
            padding: 32,
            boxShadow: 'var(--shadow-card)',
            marginBottom: 32,
            textAlign: 'center',
            borderTop: '3px solid var(--accent-600)',
          }}>
            <div style={{
              width: 64, height: 64, borderRadius: '50%',
              background: sub.is_expired ? 'var(--danger-bg)' : 'var(--accent-50)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              margin: '0 auto 20px',
            }}>
              <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke={sub.is_expired ? 'var(--danger)' : 'var(--accent-600)'} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
                <path d="M7 11V7a5 5 0 0 1 10 0v4" />
              </svg>
            </div>

            <h1 style={{ fontSize: 24, fontWeight: 600, margin: '0 0 8px', color: 'var(--text-primary)' }}>
              {sub.is_expired ? 'Subscription Required' : `${DISPLAY_NAMES[currentTier] || 'Trial'} Plan`}
            </h1>

            <p style={{ color: 'var(--text-secondary)', margin: '0 0 24px', lineHeight: 1.5 }}>
              {sub.is_expired
                ? 'Your access has been restricted. Please renew to continue.'
                : 'Your subscription is active.'}
            </p>

            <div style={{
              display: 'flex', justifyContent: 'center', gap: 32,
              flexWrap: 'wrap',
            }}>
              <InfoBadge label="Status" value={statusLabel[sub.payment_status] || sub.payment_status} />
              {currentTier === 'trial' && sub.trial_end_at && (
                <InfoBadge label="Trial Ends" value={formatDate(sub.trial_end_at)} />
              )}
              {currentTier !== 'trial' && sub.subscription_end_at && (
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
        )}

        {/* ── Renewal callout (only for expired subscriptions) ── */}
        {hasSubscription && sub.is_expired && (
          <div style={{
            background: 'color-mix(in srgb, var(--danger) 8%, var(--bg-card))',
            border: '1px solid color-mix(in srgb, var(--danger) 20%, transparent)',
            borderRadius: 'var(--r-xl, 16px)',
            padding: 24,
            marginBottom: 32,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            flexWrap: 'wrap',
            gap: 16,
          }}>
            <div>
              <p style={{ margin: '0 0 4px', fontSize: 16, fontWeight: 600, color: 'var(--danger)' }}>
                Renew your subscription
              </p>
              <p style={{ margin: 0, fontSize: 14, color: 'var(--text-secondary)', lineHeight: 1.5 }}>
                Your current plan has expired. Renew to restore full access to your business data.
              </p>
            </div>
            <Button
              variant="primary"
              onClick={() => navigate('/pricing')}
              rightIcon={<span style={{ marginLeft: 2 }}>→</span>}
            >
              Renew now
            </Button>
          </div>
        )}

        {/* ── Upgrade callout (only for logged-in users) ── */}
        {hasSubscription && nextTier && !sub.is_expired && (
          <div style={{
            background: 'color-mix(in srgb, var(--accent-600) 8%, var(--bg-card))',
            border: '1px solid color-mix(in srgb, var(--accent-600) 20%, transparent)',
            borderRadius: 'var(--r-xl, 16px)',
            padding: 24,
            marginBottom: 32,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            flexWrap: 'wrap',
            gap: 16,
          }}>
            <div>
              <p style={{ margin: '0 0 4px', fontSize: 16, fontWeight: 600, color: 'var(--accent-700)' }}>
                Upgrade to {DISPLAY_NAMES[nextTier]}
              </p>
              <p style={{ margin: 0, fontSize: 14, color: 'var(--accent-600)', lineHeight: 1.5 }}>
                Unlock more features and higher limits for your business.
              </p>
            </div>
            <Button
              variant="primary"
              onClick={() => navigate('/pricing')}
              rightIcon={<span style={{ marginLeft: 2 }}>→</span>}
            >
              Upgrade now
            </Button>
          </div>
        )}

        {/* ── Plan comparison table ── */}
        <div style={{
          background: 'var(--bg-card)',
          borderRadius: 'var(--r-xl, 16px)',
          boxShadow: 'var(--shadow-card)',
        }}>
          <div style={{
            display: 'grid',
            gridTemplateColumns: `200px repeat(${plans.length}, 1fr)`,
            borderBottom: '1px solid var(--border)',
          }}>
            <div style={{ padding: '16px 16px', fontSize: 13, fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>Plan</div>
            {plans.map((p) => (
              <div key={p.id} style={{
                padding: '16px 16px',
                textAlign: 'center',
                background: p.isCurrent ? 'var(--accent-50)' : 'transparent',
                position: 'relative',
              }}>
                {p.isUpgrade && (
                  <span style={{
                    position: 'absolute', top: -8, left: '50%', transform: 'translateX(-50%)',
                    background: 'linear-gradient(135deg, var(--accent-600), var(--accent-500))',
                    color: 'white', fontSize: 10, fontWeight: 600,
                    padding: '2px 10px', borderRadius: 10,
                    whiteSpace: 'nowrap',
                  }}>
                    Recommended
                  </span>
                )}
                <div style={{ fontSize: 16, fontWeight: 600, color: p.isCurrent ? 'var(--accent-700)' : 'var(--text-primary)' }}>
                  {p.name}
                </div>
                {p.isCurrent && (
                  <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--accent-600)', marginTop: 2 }}>Current</div>
                )}
              </div>
            ))}
          </div>

          {/* ── Pricing row ── */}
          <div style={{
            display: 'grid',
            gridTemplateColumns: `200px repeat(${plans.length}, 1fr)`,
            borderBottom: '1px solid var(--border)',
            background: 'var(--bg-subtle)',
          }}>
            <div style={{ padding: '12px 16px', fontSize: 13.5, fontWeight: 600, color: 'var(--text-primary)' }}>
              Pricing
            </div>
            {pricingRow.values.map((price, j) => (
              <div key={j} style={{
                padding: '14px 16px',
                textAlign: 'center',
                background: plans[j].isCurrent ? 'var(--accent-50)' : 'transparent',
              }}>
                <div style={{ fontSize: 15, fontWeight: 700, color: plans[j].isCurrent ? 'var(--accent-700)' : 'var(--text-primary)' }}>
                  {price.primary}
                </div>
                {price.secondary && (
                  <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 2 }}>
                    {price.secondary}
                  </div>
                )}
                {price.subtitle && (
                  <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 1 }}>
                    {price.subtitle}
                  </div>
                )}
              </div>
            ))}
          </div>

          {featureRows.map((row, i) => (
            <div key={i} style={{
              display: 'grid',
              gridTemplateColumns: `200px repeat(${plans.length}, 1fr)`,
              borderBottom: i < featureRows.length - 1 ? '1px solid var(--border)' : 'none',
              background: i % 2 === 0 ? 'var(--bg-subtle)' : 'transparent',
            }}>
              <div style={{ padding: '12px 16px', fontSize: 13.5, color: 'var(--text-primary)' }}>
                {row.label}
              </div>
              {row.values.map((val, j) => (
                <div key={j} style={{
                  padding: '14px 16px',
                  textAlign: 'center',
                  fontSize: 13,
                  fontWeight: plans[j].isCurrent ? 600 : 400,
                  color: plans[j].isCurrent ? 'var(--accent-700)' : 'var(--text-secondary)',
                  background: plans[j].isCurrent ? 'var(--accent-50)' : 'transparent',
                }}>
                  <FeatureValue val={val} />
                </div>
              ))}
            </div>
          ))}
        </div>

        {/* ── Contact support ── */}
        <div style={{
          background: 'color-mix(in srgb, var(--accent-600) 8%, var(--bg-card))',
          border: '1px solid color-mix(in srgb, var(--accent-600) 20%, transparent)',
          borderRadius: 'var(--r-lg, 12px)',
          padding: 16,
          marginTop: 24,
          textAlign: 'center',
        }}>
          <p style={{ margin: '0 0 4px', fontSize: 14, color: 'var(--accent-700)', fontWeight: 500 }}>
            Need help choosing a plan or a custom solution?
          </p>
          <p style={{ margin: 0, fontSize: 14, color: 'var(--accent-600)' }}>
            Email: support@smartbillr.com &nbsp;|&nbsp;             WhatsApp: +91 87541 20458
          </p>
        </div>

      </div>
    </div>
  )
}

function InfoBadge({ label, value, highlight }) {
  return (
    <div style={{ textAlign: 'center' }}>
      <div style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 2 }}>{label}</div>
      <div style={{
        fontSize: 15, fontWeight: 600,
        color: highlight ? 'var(--danger)' : 'var(--text-primary)',
      }}>
        {value}
      </div>
    </div>
  )
}
