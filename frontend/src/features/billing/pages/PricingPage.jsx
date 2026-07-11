import React, { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { usePlans, useCheckout } from '../hooks/useCheckout'
import useAuthStore from '../../../store/authStore'
import { Button, Spinner } from '../../../shared/components'

const PRICING_PLANS = [
  {
    code: 'basic',
    name: 'Basic',
    description: 'For single-location shops',
    monthly: { inr: 499, usd: 9.99 },
    yearly: null,
    features: ['500 products', '500 customers', '2,000 sales/mo', '2 staff members'],
  },
  {
    code: 'pro',
    name: 'Pro',
    description: 'For growing businesses',
    monthly: { inr: 999, usd: 19 },
    yearly: { inr: 4999, usd: 99 },
    features: ['Unlimited products', 'Unlimited customers', 'Unlimited sales', '10 staff members', 'Financial reports', 'Product profit view'],
  },
]

export default function PricingPage() {
  const navigate = useNavigate()
  const user = useAuthStore((s) => s.user)
  const isLoggedIn = !!user
  const country = useAuthStore((s) => s.business)?.business_country_code || 'IN'
  const isIndia = country.toUpperCase() === 'IN'

  const { mutate: startCheckout, isPending } = useCheckout()
  const [selectedBilling, setSelectedBilling] = useState('monthly')

  function handleSubscribe(planCode) {
    if (!isLoggedIn) {
      navigate(`/signup?plan=${planCode}`)
      return
    }
    startCheckout(planCode, {
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
        ondismiss: () => {},
      },
    }
    const rzp = new window.Razorpay(options)
    rzp.open()
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
        {PRICING_PLANS.map((plan) => {
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
                onClick={() => handleSubscribe(plan.code)}
                disabled={isPending}
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
