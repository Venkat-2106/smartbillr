import { useEffect } from 'react'
import LandingNav from '../components/LandingNav'
import LandingHero from '../components/LandingHero'
import LandingFeatures from '../components/LandingFeatures'
import LandingWhy from '../components/LandingWhy'
import LandingPreview from '../components/LandingPreview'
import LandingContact from '../components/LandingContact'
import LandingFooter from '../components/LandingFooter'

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
        <LandingFeatures />
        <LandingWhy />
        <LandingPreview />
        <LandingContact />
      </main>
      <LandingFooter />
    </div>
  )
}
