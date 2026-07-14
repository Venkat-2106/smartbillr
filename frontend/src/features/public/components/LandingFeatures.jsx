import { useState, useEffect } from 'react'

const pains = [
  {
    icon: <svg width="20" height="20" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}><path strokeLinecap="round" strokeLinejoin="round" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>,
    pain: "Spending hours creating bills manually?",
    solution: "Generate GST-ready invoices in seconds. Print or share digitally.",
  },
  {
    icon: <svg width="20" height="20" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}><path strokeLinecap="round" strokeLinejoin="round" d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4" /></svg>,
    pain: "Running out of stock when customers need it most?",
    solution: "Live stock tracking with low-stock alerts. Never lose a sale again.",
  },
  {
    icon: <svg width="20" height="20" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}><path strokeLinecap="round" strokeLinejoin="round" d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z" /></svg>,
    pain: "Forgetting customer payments and pending dues?",
    solution: "Track every customer, their purchases, and outstanding payments automatically.",
  },
  {
    icon: <svg width="20" height="20" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}><path strokeLinecap="round" strokeLinejoin="round" d="M9 17V7m0 10a2 2 0 01-2 2H5a2 2 0 01-2-2V7a2 2 0 012-2h2a2 2 0 012 2m0 10a2 2 0 002 2h2a2 2 0 002-2M9 7a2 2 0 012-2h2a2 2 0 012 2m0 10V7m0 10a2 2 0 002 2h2a2 2 0 002-2V7a2 2 0 00-2-2h-2a2 2 0 00-2 2" /></svg>,
    pain: "No idea which products actually make you money?",
    solution: "Know your best-sellers, profit margins, and daily revenue at a glance.",
  },
  {
    icon: <svg width="20" height="20" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}><path strokeLinecap="round" strokeLinejoin="round" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" /></svg>,
    pain: "Managing expenses, suppliers, and purchases in Excel?",
    solution: "One platform for billing, inventory, purchases, expenses — no more spreadsheets.",
  },
  {
    icon: <svg width="20" height="20" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}><path strokeLinecap="round" strokeLinejoin="round" d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" /></svg>,
    pain: "Worried about losing data if your computer crashes?",
    solution: "Secure cloud backup. Access your business from anywhere, on any device.",
  },
]

export default function LandingFeatures() {
  const [visible, setVisible] = useState(false)

  useEffect(() => {
    const observer = new IntersectionObserver(
      ([entry]) => { if (entry.isIntersecting) setVisible(true) },
      { threshold: 0.1 }
    )
    const el = document.getElementById('features')
    if (el) observer.observe(el)
    return () => observer.disconnect()
  }, [])

  return (
    <section id="features" style={{
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
            Sounds familiar?
          </span>
          <h2 style={{
            fontSize: '2.4rem', fontWeight: 800, color: 'var(--text-primary)',
            lineHeight: 1.2, letterSpacing: '-0.8px', margin: '0 0 16px',
          }}>
            We've seen every struggle.
            <br />
            <span style={{ color: 'var(--text-secondary)' }}>
              Here's how SmartBillr fixes it.
            </span>
          </h2>
        </div>

        <div style={{
          display: 'grid', gridTemplateColumns: '1fr 1fr',
          gap: 20,
        }}>
          {pains.map((item, i) => (
            <div
              key={i}
              className="card card-hover"
              style={{
                padding: 28,
                opacity: visible ? 1 : 0,
                transform: visible ? 'translateY(0)' : 'translateY(20px)',
                transition: `all 0.4s cubic-bezier(0.16,1,0.3,1) ${i * 0.06}s`,
              }}
            >
              <div style={{
                width: 40, height: 40, borderRadius: 10,
                background: 'var(--accent-50)',
                color: 'var(--accent-600)',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                marginBottom: 16,
              }}>
                {item.icon}
              </div>
              <h3 style={{
                fontSize: '0.95rem', fontWeight: 700, color: 'var(--text-primary)',
                margin: '0 0 8px', lineHeight: 1.4,
              }}>
                {item.pain}
              </h3>
              <p style={{
                fontSize: '0.85rem', color: 'var(--text-secondary)',
                lineHeight: 1.6, margin: 0,
              }}>
                {item.solution}
              </p>
            </div>
          ))}
        </div>
      </div>
    </section>
  )
}
