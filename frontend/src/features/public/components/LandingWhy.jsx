import { useState, useEffect } from 'react'

const features = [
  {
    icon: <svg width="22" height="22" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}><path strokeLinecap="round" strokeLinejoin="round" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" /></svg>,
    title: 'Smart Billing',
    desc: 'Lightning-fast invoice generation with GST/VAT support. Thermal printer ready, barcode support, digital receipts, and professional invoices in seconds.',
    gradient: 'linear-gradient(135deg, #667EEA, #764BA2)',
  },
  {
    icon: <svg width="22" height="22" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}><path strokeLinecap="round" strokeLinejoin="round" d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4" /></svg>,
    title: 'Inventory Management',
    desc: 'Live stock tracking, low stock alerts, batch updates, purchase management, and barcode scanning. Always know what you have in stock.',
    gradient: 'linear-gradient(135deg, #F093FB, #F5576C)',
  },
  {
    icon: <svg width="22" height="22" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}><path strokeLinecap="round" strokeLinejoin="round" d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z" /></svg>,
    title: 'Customer Management',
    desc: 'Complete purchase history, outstanding payments, credit management, and instant customer search. Build loyalty and never miss a follow-up.',
    gradient: 'linear-gradient(135deg, #4FACFE, #00F2FE)',
  },
  {
    icon: <svg width="22" height="22" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}><path strokeLinecap="round" strokeLinejoin="round" d="M16 11V7a4 4 0 00-8 0v4M5 9h14l1 12H4L5 9z" /></svg>,
    title: 'Purchase & Suppliers',
    desc: 'Manage purchase invoices, supplier balances, cost tracking, and due reminders. Keep your supply chain organized in one place.',
    gradient: 'linear-gradient(135deg, #fa709a, #fee140)',
  },
  {
    icon: <svg width="22" height="22" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}><path strokeLinecap="round" strokeLinejoin="round" d="M17 9V7a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2m2 4h10a2 2 0 002-2v-6a2 2 0 00-2-2H9a2 2 0 00-2 2v6a2 2 0 002 2z" /></svg>,
    title: 'Expense Management',
    desc: 'Track daily expenses, categorize spending, and generate expense reports. See where your money goes with monthly tracking.',
    gradient: 'linear-gradient(135deg, #a18cd1, #fbc2eb)',
  },
  {
    icon: <svg width="22" height="22" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}><path strokeLinecap="round" strokeLinejoin="round" d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" /></svg>,
    title: 'Business Dashboard',
    desc: 'Real-time sales analytics, profit insights, best-selling products, revenue trends, and daily, weekly, monthly reports.',
    gradient: 'linear-gradient(135deg, #ffecd2, #fcb69f)',
  },
  {
    icon: <svg width="22" height="22" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}><path strokeLinecap="round" strokeLinejoin="round" d="M3 15a4 4 0 004 4h9a5 5 0 10-.1-9.999 5.002 5.002 0 10-9.78 2.096A4.001 4.001 0 003 15z" /></svg>,
    title: 'Cloud Platform',
    desc: 'Secure cloud backup, access from anywhere, multi-device, multi-user with role-based permissions. Automatic updates, always up to date.',
    gradient: 'linear-gradient(135deg, #667eea, #764ba2)',
  },
  {
    icon: <svg width="22" height="22" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}><path strokeLinecap="round" strokeLinejoin="round" d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" /></svg>,
    title: 'Multi-Business Support',
    desc: 'Manage multiple businesses from one account. Perfect for owners with multiple stores — switch between them instantly.',
    gradient: 'linear-gradient(135deg, #f093fb, #f5576c)',
  },
]

export default function LandingWhy() {
  const [visible, setVisible] = useState(false)
  const [activeIndex, setActiveIndex] = useState(null)

  useEffect(() => {
    const observer = new IntersectionObserver(
      ([entry]) => { if (entry.isIntersecting) setVisible(true) },
      { threshold: 0.1 }
    )
    const el = document.getElementById('features-detail')
    if (el) observer.observe(el)
    return () => observer.disconnect()
  }, [])

  return (
    <section id="features-detail" style={{
      padding: '100px 24px',
      background: 'var(--bg-subtle)',
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
            Everything you need
          </span>
          <h2 style={{
            fontSize: '2.4rem', fontWeight: 800, color: 'var(--text-primary)',
            lineHeight: 1.2, letterSpacing: '-0.8px', margin: 0,
          }}>
            One platform to run your entire business.
          </h2>
        </div>

        <div style={{
          display: 'grid', gridTemplateColumns: '1fr 1fr 1fr 1fr',
          gap: 16,
        }}>
          {features.map((feature, i) => (
            <div
              key={i}
              className="card"
              onMouseEnter={() => setActiveIndex(i)}
              onMouseLeave={() => setActiveIndex(null)}
              style={{
                padding: 24,
                cursor: 'default',
                opacity: visible ? 1 : 0,
                transform: visible ? 'translateY(0)' : 'translateY(20px)',
                transition: `all 0.4s cubic-bezier(0.16,1,0.3,1) ${i * 0.04}s`,
                borderColor: activeIndex === i ? 'var(--border-hover)' : 'var(--border)',
                position: 'relative',
                overflow: 'hidden',
              }}
            >
              <div style={{
                width: 44, height: 44, borderRadius: 12,
                background: feature.gradient,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                color: '#fff', marginBottom: 16,
                boxShadow: `0 4px 12px ${feature.gradient}33`,
              }}>
                {feature.icon}
              </div>
              <h3 style={{
                fontSize: '0.9rem', fontWeight: 700, color: 'var(--text-primary)',
                margin: '0 0 8px',
              }}>
                {feature.title}
              </h3>
              <p style={{
                fontSize: '0.8rem', color: 'var(--text-secondary)',
                lineHeight: 1.6, margin: 0,
              }}>
                {feature.desc}
              </p>
            </div>
          ))}
        </div>
      </div>
    </section>
  )
}
