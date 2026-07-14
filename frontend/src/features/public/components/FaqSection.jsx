import { useState, useEffect } from 'react'

const faqs = [
  {
    q: 'Is SmartBillr easy to use?',
    a: 'Absolutely. SmartBillr is designed for business owners, not tech experts. You can start billing in under 5 minutes with no training required.',
  },
  {
    q: 'Does SmartBillr support GST?',
    a: 'Yes. SmartBillr is fully GST-ready with support for multi-tax rates, GST invoice formats, and tax reports.',
  },
  {
    q: 'Can I manage multiple businesses?',
    a: 'Yes. You can manage multiple businesses from a single account and switch between them instantly.',
  },
  {
    q: 'Is my data secure?',
    a: 'Your data is encrypted and stored securely in the cloud with automatic daily backups. We use industry-standard security practices.',
  },
  {
    q: 'Does it work on mobile?',
    a: 'SmartBillr is fully responsive and works on any device — phone, tablet, or desktop. Access your business from anywhere.',
  },
  {
    q: 'Can I cancel anytime?',
    a: 'Yes. There are no long-term contracts. You can cancel your subscription at any time with no penalties.',
  },
  {
    q: 'Do I need technical knowledge?',
    a: 'No technical knowledge is required. If you can use a smartphone, you can use SmartBillr.',
  },
  {
    q: 'Can multiple employees use it?',
    a: 'Yes. You can add multiple users with role-based permissions — owner, manager, cashier, and more.',
  },
  {
    q: 'Is there a free trial?',
    a: 'Yes. Start your 30-day free trial today with no credit card required. Explore all features risk-free.',
  },
]

export default function FaqSection() {
  const [visible, setVisible] = useState(false)
  const [openIndex, setOpenIndex] = useState(null)

  useEffect(() => {
    const observer = new IntersectionObserver(
      ([entry]) => { if (entry.isIntersecting) setVisible(true) },
      { threshold: 0.1 }
    )
    const el = document.getElementById('faq')
    if (el) observer.observe(el)
    return () => observer.disconnect()
  }, [])

  return (
    <section id="faq" style={{
      padding: '100px 24px',
      background: 'var(--bg-page)',
    }}>
      <div style={{ maxWidth: 750, margin: '0 auto' }}>
        <div style={{ textAlign: 'center', marginBottom: 56 }}>
          <span style={{
            display: 'inline-block', fontSize: '0.7rem', fontWeight: 700,
            color: 'var(--accent-600)', letterSpacing: '0.08em',
            textTransform: 'uppercase', marginBottom: 12,
            padding: '4px 12px', borderRadius: 99,
            background: 'var(--accent-50)', border: '1px solid var(--accent-100)',
          }}>
            Got questions?
          </span>
          <h2 style={{
            fontSize: '2.2rem', fontWeight: 800, color: 'var(--text-primary)',
            lineHeight: 1.2, letterSpacing: '-0.8px', margin: 0,
          }}>
            Frequently Asked Questions
          </h2>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {faqs.map((faq, i) => (
            <div
              key={i}
              className="card"
              style={{
                overflow: 'hidden',
                opacity: visible ? 1 : 0,
                transform: visible ? 'translateY(0)' : 'translateY(10px)',
                transition: `all 0.3s cubic-bezier(0.16,1,0.3,1) ${i * 0.03}s`,
              }}
            >
              <button
                onClick={() => setOpenIndex(openIndex === i ? null : i)}
                aria-expanded={openIndex === i}
                style={{
                  width: '100%', display: 'flex', alignItems: 'center',
                  justifyContent: 'space-between', gap: 16,
                  padding: '18px 24px',
                  background: 'none', border: 'none',
                  cursor: 'pointer', fontFamily: 'inherit',
                  fontSize: '0.9rem', fontWeight: 600,
                  color: 'var(--text-primary)',
                  textAlign: 'left',
                }}
              >
                <span>{faq.q}</span>
                <svg
                  width="16" height="16" fill="none" viewBox="0 0 24 24"
                  stroke="currentColor" strokeWidth={2}
                  style={{
                    flexShrink: 0,
                    transition: 'transform 0.2s ease',
                    transform: openIndex === i ? 'rotate(45deg)' : 'rotate(0)',
                  }}
                >
                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 6v6m0 0v6m0-6h6m-6 0H6" />
                </svg>
              </button>
              <div style={{
                maxHeight: openIndex === i ? 200 : 0,
                overflow: 'hidden',
                transition: 'max-height 0.3s cubic-bezier(0.16,1,0.3,1)',
              }}>
                <p style={{
                  margin: 0, padding: '0 24px 18px',
                  fontSize: '0.85rem', color: 'var(--text-secondary)',
                  lineHeight: 1.6,
                }}>
                  {faq.a}
                </p>
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  )
}
