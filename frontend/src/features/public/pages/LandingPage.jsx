import { lazy, Suspense, useEffect } from 'react'
import LandingNav from '../components/LandingNav'
import LandingHero from '../components/LandingHero'
import LandingFeatures from '../components/LandingFeatures'
import LandingWhy from '../components/LandingWhy'
import LandingPreview from '../components/LandingPreview'
import PremiumFeatures from '../components/PremiumFeatures'
import TrustSection from '../components/TrustSection'
import FaqSection from '../components/FaqSection'
import FinalCta from '../components/FinalCta'
import LandingFooter from '../components/LandingFooter'

// LandingDemo is marketing-only (1,592-line animated product demo). Lazy-load
// it so its ~63 kB never ships in the main entry chunk — the hero stays in the
// immediate first paint; only the below-the-fold demo chunk is deferred.
const LandingDemo = lazy(() => import('../components/LandingDemo'))

// Placeholder matching the demo's reserved layout (#demo section, 2:1 stage)
// so the split causes no layout shift while the demo chunk loads.
function LandingDemoFallback() {
  return (
    <section id="demo" data-accent="purple" aria-busy="true" style={{ padding: '92px 24px 104px', background: 'var(--bg-page)' }}>
      <div style={{ maxWidth: 1100, margin: '0 auto' }}>
        <div style={{ textAlign: 'center', marginBottom: 44 }}>
          <span style={{ display: 'inline-block', fontSize: '0.7rem', fontWeight: 700, color: 'var(--accent-600)', letterSpacing: '0.08em', textTransform: 'uppercase', padding: '4px 12px', borderRadius: 99, background: 'var(--accent-50)', border: '1px solid var(--accent-100)' }}>
            See SmartBillr in Action
          </span>
        </div>
        <div style={{ aspectRatio: '2 / 1', borderRadius: 16, overflow: 'hidden', border: '1px solid var(--border)', background: 'var(--bg-card)', boxShadow: '0 8px 30px rgba(0,0,0,0.08), 0 4px 10px rgba(0,0,0,0.04)', display: 'flex' }}>
          <div style={{ width: 216, flexShrink: 0, background: '#0F172A', padding: 18, display: 'flex', flexDirection: 'column', gap: 12 }}>
            {[...Array(6)].map((_, i) => (
              <div key={i} style={{ height: 10, borderRadius: 5, background: 'rgba(255,255,255,0.08)', width: i === 0 ? '72%' : `${92 - i * 8}%` }} />
            ))}
          </div>
          <div style={{ flex: 1, padding: 22, display: 'flex', flexDirection: 'column', gap: 12 }}>
            <div style={{ display: 'flex', gap: 10 }}>
              {[...Array(4)].map((_, i) => (
                <div key={i} style={{ flex: 1, height: 44, borderRadius: 8, background: 'var(--bg-page)', border: '1px solid var(--border)' }} />
              ))}
            </div>
            <div style={{ flex: 1, borderRadius: 8, background: 'var(--bg-page)', border: '1px solid var(--border)' }} />
          </div>
        </div>
      </div>
    </section>
  )
}

export default function LandingPage() {
  useEffect(() => {
    const theme = localStorage.getItem('sb-theme') || 'light'
    const accent = localStorage.getItem('sb-accent') || 'purple'
    document.documentElement.setAttribute('data-theme', theme)
    document.documentElement.setAttribute('data-accent', accent)
  }, [])

  useEffect(() => {
    window.scrollTo(0, 0)
  }, [])

  return (
    <div style={{ overflowX: 'hidden' }}>
      <LandingNav />
      <main>
        <LandingHero />
        <Suspense fallback={<LandingDemoFallback />}>
          <LandingDemo />
        </Suspense>
        <LandingFeatures />
        <LandingWhy />
        <LandingPreview />
        <PremiumFeatures />
        <TrustSection />
        <FaqSection />
        <FinalCta />
      </main>
      <LandingFooter />
    </div>
  )
}
