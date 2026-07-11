import React, { useState, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import toast from 'react-hot-toast'
import { usePlans, useCheckout } from '../hooks/useCheckout'
import useAuthStore from '../../../store/authStore'
import { Button, Spinner } from '../../../shared/components'

const PLAN_DESCRIPTIONS = {
  basic: 'For single-location shops',
  pro: 'For growing businesses',
}

const FEATURE_LABELS = {
  max_products: 'products',
  max_customers: 'customers',
  max_sales_monthly: 'sales/mo',
  max_staff: 'staff members',
}

function formatFeatures(featureLimits) {
  if (!featureLimits || typeof featureLimits !== 'object') return []
  return Object.entries(featureLimits)
    .map(([key, value]) => {
      if (key === 'financial_reports') return value ? 'Financial reports' : null
      if (key === 'product_profit_view') return value ? 'Product profit view' : null
      const label = FEATURE_LABELS[key]
      if (!label) return null
      if (value === -1) return `Unlimited ${label}`
      return `${Number(value).toLocaleString()} ${label}`
    })
    .filter(Boolean)
}

function groupPlansByFamily(plans) {
  if (!plans) return []
  const paid = plans.filter((p) => p.billing_cycle !== 'trial')
  const groups = {}
  for (const plan of paid) {
    const baseCode = plan.plan_code.replace(/_yearly$/, '')
    if (!groups[baseCode]) {
      groups[baseCode] = {
        code: baseCode,
        name: plan.display_name.replace(/ Yearly$/, ''),
        description: PLAN_DESCRIPTIONS[baseCode] || '',
        monthly: null,
        yearly: null,
        yearlyCode: null,
        features: formatFeatures(plan.feature_limits),
      }
    }
    const entry = {
      inr: plan.price_inr != null ? Number(plan.price_inr) : null,
      usd: plan.price_usd != null ? Number(plan.price_usd) : null,
    }
    if (plan.billing_cycle === 'yearly') {
      groups[baseCode].yearly = entry
      groups[baseCode].yearlyCode = plan.plan_code
    } else {
      groups[baseCode].monthly = entry
      if (!groups[baseCode].name) groups[baseCode].name = plan.display_name
    }
  }
  return Object.values(groups).sort((a, b) => {
    const aPlan = paid.find((p) => p.plan_code.replace(/_yearly$/, '') === a.code)
    const bPlan = paid.find((p) => p.plan_code.replace(/_yearly$/, '') === b.code)
    return (aPlan?.sort_order ?? 0) - (bPlan?.sort_order ?? 0)
  })
}

export default function PricingPage() {
  const navigate = useNavigate()
  const user = useAuthStore((s) => s.user)
  const isLoggedIn = !!user
  const country = useAuthStore((s) => s.business)?.business_country_code || 'IN'
  const isIndia = country.toUpperCase() === 'IN'

  const { data: plansData, isLoading } = usePlans()
  const { mutate: startCheckout, isPending } = useCheckout()
  const [selectedBilling, setSelectedBilling] = useState('monthly')

  const displayPlans = useMemo(() => groupPlansByFamily(plansData), [plansData])

  function handleSubscribe(planCode, yearlyCode) {
    if (!isLoggedIn) {
      navigate(`/signup?plan=${planCode}`)
      return
    }
    const resolvedCode = selectedBilling === 'yearly' && yearlyCode ? yearlyCode : planCode
    startCheckout({ planCode: resolvedCode, billingCycle: selectedBilling }, {
      onSuccess: (data) => {
        if (data.provider === 'razorpay') {
          openRazorpayCheckout(data)
        } else if (data.checkout_url) {
          window.location.href = data.checkout_url
        }
      },
    })
  }

  function openRazorpayCheckout(data) {
    const options = {
      key: data.razorpay_key_id,
      amount: data.amount,
      currency: data.currency,
      order_id: data.razorpay_order_id,
      handler: function (response) {
        navigate(`/billing/success?payment_id=${data.payment_id}`)
      },
      modal: {
        ondismiss: () => {
          toast.error('Checkout cancelled. You can try again anytime.')
        },
      },
    }
    const rzp = new window.Razorpay(options)
    rzp.open()
  }

  if (isLoading) {
    return (
      <div style={{ maxWidth: 960, margin: '0 auto', padding: '40px 24px', textAlign: 'center' }}>
        <Spinner size={32} />
      </div>
    )
  }

  return (
    <div style={{ maxWidth: 960, margin: '0 auto', padding: '40px 24px' }}>
      <div style={{ textAlign: 'center', marginBottom: 40 }}>
        <h1 style={{ fontSize: 32, fontWeight: 700, marginBottom: 8 }}>Choose Your Plan</h1>
        <p style={{ fontSize: 16, color: 'var(--text-secondary)', marginBottom: 24 }}>
          Start with a free trial. Upgrade anytime.
        </p>
        <div style={{ display: 'inline-flex', background: 'var(--bg-secondary)', borderRadius: 8, padding: 4 }}>
          <button
            onClick={() => setSelectedBilling('monthly')}
            style={{
              padding: '8px 20px', borderRadius: 6, border: 'none', cursor: 'pointer', fontSize: 14, fontWeight: 500,
              background: selectedBilling === 'monthly' ? 'var(--bg-primary)' : 'transparent',
              color: selectedBilling === 'monthly' ? 'var(--text-primary)' : 'var(--text-secondary)',
              boxShadow: selectedBilling === 'monthly' ? '0 1px 3px rgba(0,0,0,0.1)' : 'none',
            }}
          >
            Monthly
          </button>
          <button
            onClick={() => setSelectedBilling('yearly')}
            style={{
              padding: '8px 20px', borderRadius: 6, border: 'none', cursor: 'pointer', fontSize: 14, fontWeight: 500,
              background: selectedBilling === 'yearly' ? 'var(--bg-primary)' : 'transparent',
              color: selectedBilling === 'yearly' ? 'var(--text-primary)' : 'var(--text-secondary)',
              boxShadow: selectedBilling === 'yearly' ? '0 1px 3px rgba(0,0,0,0.1)' : 'none',
            }}
          >
            Yearly <span style={{ color: 'var(--success)', fontSize: 12 }}>Save 17%</span>
          </button>
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: 24 }}>
        {displayPlans.map((plan) => {
          const price = selectedBilling === 'yearly' && plan.yearly
            ? (isIndia ? `₹${plan.yearly.inr}/yr` : `$${plan.yearly.usd}/yr`)
            : (isIndia ? `₹${plan.monthly.inr}/mo` : `$${plan.monthly.usd}/mo`)

          return (
            <div
              key={plan.code}
              style={{
                border: '1px solid var(--border-color)',
                borderRadius: 16,
                padding: 32,
                display: 'flex',
                flexDirection: 'column',
                background: 'var(--bg-primary)',
              }}
            >
              <h2 style={{ fontSize: 22, fontWeight: 600, marginBottom: 4 }}>{plan.name}</h2>
              <p style={{ fontSize: 14, color: 'var(--text-secondary)', marginBottom: 16 }}>{plan.description}</p>
              <div style={{ fontSize: 32, fontWeight: 700, marginBottom: 24 }}>{price}</div>
              <ul style={{ listStyle: 'none', padding: 0, margin: 0, marginBottom: 24, flex: 1 }}>
                {plan.features.map((f) => (
                  <li key={f} style={{ padding: '6px 0', fontSize: 14, color: 'var(--text-secondary)' }}>
                    ✓ {f}
                  </li>
                ))}
              </ul>
              <Button
                variant="primary"
                onClick={() => handleSubscribe(plan.code, plan.yearlyCode)}
                disabled={isPending || (selectedBilling === 'yearly' && !plan.yearly)}
                style={{ width: '100%' }}
              >
                {isPending ? <Spinner size={16} /> : 'Get Started'}
              </Button>
            </div>
          )
        })}
      </div>
    </div>
  )
}
