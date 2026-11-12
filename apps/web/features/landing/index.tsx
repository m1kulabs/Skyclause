import './landing.css'
import { Showcase } from './showcase'
import { HowItWorks } from './how-it-works'
import { Proof } from './proof'
import { Features } from './features'
import { Pricing } from './pricing'
import { Faq } from './faq'
import { CtaFooter } from './cta-footer'

// Landing sections below the hero (#185). Hero is owned by #184; this export is the (marketing) `/` sections.
export function LandingSections() {
  return (
    <div className="landing-frame">
      <Showcase />
      <HowItWorks />
      <Proof />
      <Features />
      <Pricing />
      <Faq />
      <CtaFooter />
    </div>
  )
}
