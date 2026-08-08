import { useEffect, useState, useRef } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import toast from 'react-hot-toast'
import { useCheckoutStatus } from '../hooks/useCheckout'
import { Spinner } from '../../../shared/components'

export default function BillingSuccessPage() {
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const paymentId = searchParams.get('payment_id') || searchParams.get('session_id')
  const { data: status, hasTimedOut } = useCheckoutStatus(paymentId)

  const [elapsed, setElapsed] = useState(0)
  // FIX (2026-08-08): useCheckoutStatus polls every 1.5s and this effect
  // re-runs on every poll tick while status is still pending. Without this
  // guard, if status flips to 'paid'/'failed' and the toast fired inside the
  // effect body directly, StrictMode double-invocation or a stray re-render
  // could fire it twice. A ref-based one-shot latch is the standard fix.
  const notifiedRef = useRef(false)

  useEffect(() => {
    if (status?.status === 'paid' && !notifiedRef.current) {
      notifiedRef.current = true
      toast.success('Subscription activated!')
      navigate('/dashboard')
      return
    }
    if (status?.status === 'failed') {
      if (!notifiedRef.current) {
        notifiedRef.current = true
        toast.error('Payment could not be verified.')
      }
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

  // FIX (2026-08-03): after ~60s of unanswered polling, stop spinning and show
  // a terminal state instead of an infinite spinner.
  if (hasTimedOut) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '100vh' }}>
        <h2 style={{ fontSize: 20, fontWeight: 600 }}>Payment confirmation is taking longer than usual</h2>
        <p style={{ marginTop: 8, fontSize: 14, color: 'var(--text-secondary)', textAlign: 'center', maxWidth: 420 }}>
          We couldn't confirm your payment yet. If you were charged, we'll email you once it's verified. You can safely leave this page.
        </p>
        <div style={{ display: 'flex', gap: 12, marginTop: 24 }}>
          <button onClick={() => navigate('/dashboard')} style={{ color: 'var(--primary)', background: 'none', border: '1px solid var(--primary)', borderRadius: 8, padding: '10px 20px', cursor: 'pointer' }}>
            Go to Dashboard
          </button>
          <button onClick={() => navigate('/pricing')} style={{ color: 'var(--primary)', background: 'none', border: '1px solid var(--primary)', borderRadius: 8, padding: '10px 20px', cursor: 'pointer' }}>
            Back to Pricing
          </button>
        </div>
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
