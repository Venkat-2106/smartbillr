import { useState, useEffect } from 'react'

const benefits = [
  {
    icon: <svg width="18" height="18" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M13 10V3L4 14h7v7l9-11h-7z" /></svg>,
    title: 'Faster Billing',
    desc: 'Serve customers quicker with lightning-fast invoice generation.',
  },
  {
    icon: <svg width="18" height="18" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>,
    title: 'Save Time',
    desc: 'Reduce hours of manual work every week. Focus on what matters.',
  },
  {
    icon: <svg width="18" height="18" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>,
    title: 'Increase Accuracy',
    desc: 'Eliminate billing mistakes and human errors in calculations.',
  },
  {
    icon: <svg width="18" height="18" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4" /></svg>,
    title: 'Better Inventory',
    desc: 'Always know what is in stock. Never run out unexpectedly.',
  },
  {
    icon: <svg width="18" height="18" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" /></svg>,
    title: 'Better Decisions',
    desc: 'Real-time business insights and analytics at your fingertips.',
  },
  {
    icon: <svg width="18" height="18" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M13 7h8m0 0v8m0-8l-8 8-4-4-6 6" /></svg>,
    title: 'Grow Faster',
    desc: 'Focus on serving customers and growing sales, not paperwork.',
  },
]

export default function LandingPreview() {
  const [visible, setVisible] = useState(false)

  useEffect(() => {
    const observer = new IntersectionObserver(
      ([entry]) => { if (entry.isIntersecting) setVisible(true) },
      { threshold: 0.2 }
    )
    const el = document.getElementById('love')
    if (el) observer.observe(el)
    return () => observer.disconnect()
  }, [])

  return (
    <section id="love" style={{
      padding: '100px 24px',
      background: 'var(--bg-page)',
    }}>
      <div style={{ maxWidth: 1100, margin: '0 auto' }}>
        <div style={{ textAlign: 'center', marginBottom: 64 }}>
          <span style={{
            display: 'inline-block', fontSize: '0.7rem', fontWeight: 700,
            color: 'var(--accent-600)', letterSpacing: '0.08em',
            textTransform: 'uppercase', marginBottom: 12,
            padding: '4px 12px', borderRadius: 99,
            background: 'var(--accent-50)', border: '1px solid var(--accent-100)',
          }}>
            Why business owners love SmartBillr
          </span>
          <h2 style={{
            fontSize: '2.4rem', fontWeight: 800, color: 'var(--text-primary)',
            lineHeight: 1.2, letterSpacing: '-0.8px', margin: 0,
          }}>
            Built for the way you work.
          </h2>
        </div>

        <div className="landing-preview-grid" style={{
          display: 'grid', gridTemplateColumns: '1fr 1fr 1fr',
          gap: 20,
        }}>
          {benefits.map((benefit, i) => (
            <div
              key={i}
              className="card"
              style={{
                padding: 28,
                opacity: visible ? 1 : 0,
                transform: visible ? 'translateY(0)' : 'translateY(20px)',
                transition: `all 0.4s cubic-bezier(0.16,1,0.3,1) ${i * 0.06}s`,
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'flex-start',
              }}
            >
              <div style={{
                width: 38, height: 38, borderRadius: 10,
                background: 'var(--accent-50)',
                color: 'var(--accent-600)',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                marginBottom: 14,
              }}>
                {benefit.icon}
              </div>
              <h3 style={{
                fontSize: '0.95rem', fontWeight: 700, color: 'var(--text-primary)',
                margin: '0 0 6px',
              }}>
                {benefit.title}
              </h3>
              <p style={{
                fontSize: '0.82rem', color: 'var(--text-secondary)',
                lineHeight: 1.6, margin: 0,
              }}>
                {benefit.desc}
              </p>
            </div>
          ))}
        </div>
      </div>
    </section>
  )
}
