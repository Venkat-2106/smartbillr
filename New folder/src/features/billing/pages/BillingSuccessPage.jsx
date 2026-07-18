import React, { useEffect, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { useCheckoutStatus } from '../hooks/useCheckout'
import useAuthStore from '../../../store/authStore'
import { Spinner } from '../../../shared/components'

export default function BillingSuccessPage() {
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const paymentId = searchParams.get('payment_id') || searchParams.get('session_id')
  const { data: status, isLoading } = useCheckoutStatus(paymentId)
  const refetchSubscription = useAuthStore((s) => s.setProfile)

  const [elapsed, setElapsed] = useState(0)

  useEffect(() => {
    if (status?.status === 'paid') {
      navigate('/dashboard')
      return
    }
    if (status?.status === 'failed') {
      return
    }
    const timer = setInterval(() => setElapsed((e) => e + 1), 1000)
    return () => clearInterval(timer)
  }, [status, navigate])

  if (!paymentId) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '100vh' }}>
        <p style={{ fontSize: 16, color: 'var(--text-secondary)' }}>Invalid payment reference.</p>
        <button onClick={() => navigate('/dashboard')} style={{ marginTop: 16, color: 'var(--primary)', background: 'none', border: 'none', cursor: 'pointer' }}>
          Go to Dashboard
        </button>
      </div>
    )
  }

  if (status?.status === 'failed') {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '100vh' }}>
        <p style={{ fontSize: 16, color: 'var(--text-secondary)' }}>Payment could not be verified. Please contact support or try again.</p>
        <button onClick={() => navigate('/pricing')} style={{ marginTop: 16, color: 'var(--primary)', background: 'none', border: 'none', cursor: 'pointer' }}>
          Back to Pricing
        </button>
      </div>
    )
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '100vh' }}>
      <Spinner size={40} />
      <h2 style={{ marginTop: 24, fontSize: 20, fontWeight: 600 }}>Activating your subscription...</h2>
      <p style={{ marginTop: 8, fontSize: 14, color: 'var(--text-secondary)', textAlign: 'center', maxWidth: 400 }}>
        {elapsed > 20
          ? "This is taking longer than usual. We'll email you once confirmed."
          : 'This usually takes just a few seconds. Please don\'t close this page.'}
      </p>
      {status?.status && (
        <p style={{ marginTop: 16, fontSize: 12, color: 'var(--text-tertiary)' }}>
          Status: {status.status}
        </p>
      )}
    </div>
  )
}
