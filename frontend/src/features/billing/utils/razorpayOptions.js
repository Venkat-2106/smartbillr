// FIX (2026-08-03): prefill + theme for the Razorpay Checkout modal.
//   - prefill: business name / owner email / phone (avoids retyping)
//   - theme:   match the app's active accent colour (reads --accent-600)
export function razorpayPrefill({ business, user }) {
  const name = business?.business_name || user?.user_metadata?.full_name || ''
  const email = user?.email || ''
  let contact
  if (business?.business_phone) {
    const digits = String(business.business_phone).replace(/\D/g, '')
    if (digits.length >= 10 && digits.length <= 15) contact = digits
  }
  return { name, email, contact }
}

export function razorpayTheme() {
  const color =
    typeof window !== 'undefined'
      ? getComputedStyle(document.documentElement)
          .getPropertyValue('--accent-600')
          .trim()
      : ''
  return { color: color || '#2563EB' }
}
