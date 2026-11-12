import './landing.css'
import type { HeroRead } from '../landing-hero/landing-hero'
import { calendarPath, pilotRefOf } from '../landing-hero/evaluate'
import { localDateOf } from '../landing-hero/window-model'
import { Cta } from './cta'
import { Faq } from './faq'
import { Features } from './features'
import type { GradesState } from './grades'
import { HowItWorks } from './how-it-works'
import { MotionBoot } from './motion-boot'
import { Pricing } from './pricing'
import { Proof } from './proof'
import { Showcase } from './showcase'

export { LandingFooter } from './footer'

/** Where the primary action, Sign in, lives (APP_ORIGIN splits hosts in multi-host mode). */
export function signInHref(): string {
  const appOrigin = process.env.APP_ORIGIN
  return appOrigin ? new URL('/sign-in', appOrigin).toString() : '/sign-in'
}

// The sections after the hero, in the order of the page's argument: how one window gets its call, what the record
// keeps, what it does, where the readings come from, what it costs, the questions, and the closing sentence.
export function LandingSections({
  read,
  grades,
  gradesSource
}: {
  read: HeroRead
  grades: GradesState
  gradesSource: string
}) {
  const href = signInHref()
  return (
    <div className="landing-frame">
      <HowItWorks grades={grades} gradesSource={gradesSource} />
      <Showcase
        now={read.now}
        latestCall={read.latestCall}
        calendarSource={calendarPath(pilotRefOf(process.env.PILOT_PROJECT))}
        grades={grades}
        gradesSource={gradesSource}
      />
      <Features signInHref={href} />
      <Proof />
      <Pricing signInHref={href} />
      <Faq grades={grades} gradesSource={gradesSource} />
      <Cta today={localDateOf(read.now)} />
      <MotionBoot />
    </div>
  )
}
