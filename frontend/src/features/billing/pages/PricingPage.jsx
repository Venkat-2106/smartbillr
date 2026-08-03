import { useState, useEffect, useMemo } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import toast from 'react-hot-toast'
import { usePlans, useCheckout, useChangePlan } from '../hooks/useCheckout'
import { useSubscription } from '../../subscription/hooks/useSubscription'
import { razorpayPrefill, razorpayTheme } from '../utils/razorpayOptions'
import useAuthStore from '../../../store/authStore'
import { Button, Spinner } from '../../../shared/components'

const PLAN_DESCRIPTIONS = {
  basic: 'For single-location shops',
  pro: 'For growing businesses',
  lifetime: 'Pay once, use forever',
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
      if (value === -1 || value === null) return `Unlimited ${label}`
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
        lifetime: null,
        lifetimeCode: null,
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
    } else if (plan.billing_cycle === 'one_time') {
      groups[baseCode].lifetime = entry
      groups[baseCode].lifetimeCode = plan.plan_code
      if (!groups[baseCode].name) groups[baseCode].name = plan.display_name
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
  const business = useAuthStore((s) => s.business)
  const country = business?.business_country_code || 'IN'
  const isIndia = country.toUpperCase() === 'IN'

  const [searchParams] = useSearchParams()

  useEffect(() => {
    if (searchParams.get('cancelled') === '1') {
      toast.error('Checkout cancelled. You can try again anytime.')
      navigate('/pricing', { replace: true })
    }
  }, [navigate, searchParams])

  const { data: plansData, isLoading, isError, refetch } = usePlans()
  const { data: sub } = useSubscription()
  const { mutate: startCheckout, isPending: isCheckoutPending } = useCheckout()
  const { mutate: startChangePlan, isPending: isChangePending } = useChangePlan()
  const [selectedBilling, setSelectedBilling] = useState('monthly')

  const isPending = isCheckoutPending || isChangePending
  const displayPlans = useMemo(() => groupPlansByFamily(plansData), [plansData])

  const isExistingPaidPlan = isLoggedIn && !!sub && !sub.is_expired && sub.subscription_type !== 'trial'

  function handleSubscribe(planCode, yearlyCode, overrideBillingCycle) {
    if (!isLoggedIn) {
      navigate(`/signup?plan=${planCode}`)
      return
    }
    const billingCycle = overrideBillingCycle || (selectedBilling === 'yearly' && yearlyCode ? 'yearly' : 'monthly')
    const resolvedCode = billingCycle === 'yearly' && yearlyCode ? yearlyCode : planCode
    const cycleLabel = billingCycle === 'yearly' ? 'Yearly' : billingCycle === 'one_time' ? 'One-time' : 'Monthly'
    const planLabel = `${planCode.charAt(0).toUpperCase() + planCode.slice(1)} Plan – ${cycleLabel}`
    const onData = (data) => {
      if (data.provider === 'razorpay') {
        openRazorpayCheckout(data, planLabel)
      } else if (data.checkout_url) {
        window.location.href = data.checkout_url
      }
    }
    // FIX (2026-08-03): A subscribed business switching plans must go through
    // /change-plan so the old Razorpay subscription is cancelled first —
    // otherwise the same business gets billed on two subscriptions.
    const isDifferentPlan = isExistingPaidPlan && sub.subscription_type !== resolvedCode
    if (isDifferentPlan) {
      startChangePlan({ planCode: resolvedCode, billingCycle }, { onSuccess: onData })
    } else {
      startCheckout({ planCode: resolvedCode, billingCycle }, { onSuccess: onData })
    }
  }

  function openRazorpayCheckout(data, planLabel) {
    const prefill = razorpayPrefill({ business, user })
    const theme = razorpayTheme()
    const logoUrl = `${window.location.origin}/logo-512.png`
    if (data.mode === 'subscription') {
      // Recurring plans: Razorpay derives the amount from the Plan itself,
      // so no amount/currency/order_id — just the subscription_id.
      const options = {
        key: data.razorpay_key_id,
        subscription_id: data.razorpay_subscription_id,
        name: 'SmartBillr',
        description: planLabel,
        image: logoUrl,
        prefill,
        theme,
        handler: function () {
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
      return
    }

    const options = {
      key: data.razorpay_key_id,
      amount: data.amount,
      currency: data.currency,
      order_id: data.razorpay_order_id,
      name: 'SmartBillr',
      description: planLabel,
      image: logoUrl,
      prefill,
      theme,
      handler: function () {
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

  if (isError) {
    return (
      <div style={{ maxWidth: 960, margin: '0 auto', padding: '40px 24px', textAlign: 'center' }}>
        <div style={{
          background: 'var(--danger-bg)', border: '1px solid var(--danger-border)',
          borderRadius: 12, padding: '16px 20px', color: 'var(--danger-text)',
          fontSize: 14, marginBottom: 16,
        }}>
          Could not load plans. Check that the backend is running and try again.
        </div>
        <Button variant="secondary" onClick={() => refetch()}>Retry</Button>
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
          let price
          if (plan.lifetime) {
            price = isIndia ? `₹${plan.lifetime.inr}` : `$${plan.lifetime.usd}`
          } else if (selectedBilling === 'yearly' && plan.yearly) {
            price = isIndia ? `₹${plan.yearly.inr}/yr` : `$${plan.yearly.usd}/yr`
          } else {
            price = isIndia ? `₹${plan.monthly?.inr}/mo` : `$${plan.monthly?.usd}/mo`
          }

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
                onClick={() => handleSubscribe(plan.code, plan.yearlyCode, plan.lifetime ? 'one_time' : null)}
                disabled={isPending || (!plan.lifetime && selectedBilling === 'yearly' && !plan.yearly)}
                style={{ width: '100%' }}
              >
                {isPending ? <Spinner size={16} /> : (plan.lifetime ? 'Get Lifetime Access' : 'Get Started')}
              </Button>
            </div>
          )
        })}
      </div>
    </div>
  )
}
