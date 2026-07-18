import { useState } from 'react'

export default function FeedbackSection() {
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [message, setMessage] = useState('')
  const [sent, setSent] = useState(false)

  const handleSubmit = (e) => {
    e.preventDefault()
    const subject = encodeURIComponent(`SmartBillr Feedback from ${name}`)
    const body = encodeURIComponent(
      `Name: ${name}\nEmail: ${email}\n\nFeedback:\n${message}`
    )
    window.location.href = `mailto:smartbillr.support@gmail.com?subject=${subject}&body=${body}`
    setSent(true)
  }

  return (
    <section
      id="feedback"
      style={{
        padding: '80px 24px',
        background: 'var(--bg-page)',
        borderTop: '1px solid var(--border)',
      }}
    >
      <div style={{ maxWidth: 560, margin: '0 auto' }}>
        <div style={{ textAlign: 'center', marginBottom: 36 }}>
          <span
            style={{
              display: 'inline-block',
              padding: '4px 14px',
              borderRadius: 99,
              background: 'color-mix(in srgb, var(--accent-500) 10%, transparent)',
              color: 'var(--accent-500)',
              fontSize: '0.72rem',
              fontWeight: 700,
              letterSpacing: '0.06em',
              textTransform: 'uppercase',
              marginBottom: 16,
              border: '1px solid color-mix(in srgb, var(--accent-500) 18%, transparent)',
            }}
          >
            Feedback
          </span>
          <h2
            style={{
              fontSize: '1.6rem',
              fontWeight: 800,
              color: 'var(--text-primary)',
              letterSpacing: '-0.6px',
              margin: '0 0 10px',
            }}
          >
            Help us improve
          </h2>
          <p
            style={{
              fontSize: '0.88rem',
              color: 'var(--text-secondary)',
              lineHeight: 1.6,
              margin: 0,
            }}
          >
            Have a suggestion or found a bug? We'd love to hear from you.
          </p>
        </div>

        {sent ? (
          <div
            style={{
              textAlign: 'center',
              padding: '40px 20px',
              background: 'var(--bg-card)',
              border: '1px solid var(--border)',
              borderRadius: 16,
            }}
          >
            <div
              style={{
                width: 48,
                height: 48,
                borderRadius: '50%',
                background: 'color-mix(in srgb, var(--accent-500) 14%, transparent)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                margin: '0 auto 16px',
              }}
            >
              <svg width="22" height="22" fill="none" viewBox="0 0 24 24" stroke="var(--accent-500)" strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round">
                <path d="M20 6L9 17l-5-5" />
              </svg>
            </div>
            <p style={{ fontSize: '0.92rem', fontWeight: 600, color: 'var(--text-primary)', margin: '0 0 4px' }}>
              Thanks, {name}!
            </p>
            <p style={{ fontSize: '0.8rem', color: 'var(--text-muted)', margin: 0 }}>
              Your feedback will be sent via email. Please check your email client to complete sending.
            </p>
          </div>
        ) : (
          <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            <input
              type="text"
              placeholder="Your name"
              value={name}
              onChange={e => setName(e.target.value)}
              required
              style={{
                padding: '12px 16px',
                borderRadius: 'var(--r-md)',
                border: '1.5px solid var(--border)',
                background: 'var(--bg-card)',
                color: 'var(--text-primary)',
                fontSize: '0.88rem',
                outline: 'none',
              }}
            />
            <input
              type="email"
              placeholder="Your email (optional)"
              value={email}
              onChange={e => setEmail(e.target.value)}
              style={{
                padding: '12px 16px',
                borderRadius: 'var(--r-md)',
                border: '1.5px solid var(--border)',
                background: 'var(--bg-card)',
                color: 'var(--text-primary)',
                fontSize: '0.88rem',
                outline: 'none',
              }}
            />
            <textarea
              placeholder="Tell us your thoughts..."
              value={message}
              onChange={e => setMessage(e.target.value)}
              required
              rows={5}
              style={{
                padding: '12px 16px',
                borderRadius: 'var(--r-md)',
                border: '1.5px solid var(--border)',
                background: 'var(--bg-card)',
                color: 'var(--text-primary)',
                fontSize: '0.88rem',
                outline: 'none',
                resize: 'vertical',
                fontFamily: 'inherit',
              }}
            />
            <button
              type="submit"
              style={{
                padding: '12px 24px',
                borderRadius: 'var(--r-md)',
                border: 'none',
                background: 'var(--accent-500)',
                color: '#fff',
                fontSize: '0.88rem',
                fontWeight: 700,
                cursor: 'pointer',
              }}
            >
              Send Feedback
            </button>
          </form>
        )}
      </div>
    </section>
  )
}
