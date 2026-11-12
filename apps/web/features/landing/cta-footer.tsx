/* eslint-disable skyclause-i18n/no-literal-jsx -- Landing copy is the DESIGN copy deck verbatim (English P1; Malay LND-7 P2). */
import Link from 'next/link'
import { FooterClock } from './clock'

// Call to action + footer row. The CTA button is this screen's one crimson element (#b11226, white label).
export function CtaFooter() {
  const appOrigin = process.env.APP_ORIGIN ?? ''
  const guestHref = appOrigin ? `${appOrigin.replace(/\/$/, '')}/guest` : '/guest'
  return (
    <>
      <section aria-labelledby="cta-heading" className="landing-section landing-reveal-0">
        <div className="landing-inner">
          <h2 id="cta-heading" className="landing-head landing-reveal-0">
            Open the Commons and read the call for Bukit Jalil right now.
          </h2>
          <p className="landing-reveal-1">
            <a href={guestHref} className="landing-cta-button" data-crimson="cta-button">
              Open the Commons
            </a>{' '}
            <Link href="/docs" className="landing-text-link">
              Read the docs
            </Link>
          </p>
        </div>
      </section>
      <footer className="landing-section landing-reveal-0">
        <div className="landing-frame">
          <p className="landing-reveal-1">
            <FooterClock />
          </p>
          <nav aria-label="Footer" className="landing-reveal-2">
            <Link href="/docs">Docs</Link> · <Link href="/status">Status</Link> · <Link href="/legal/terms">Terms</Link>{' '}
            · <Link href="/ms/legal/privacy">Bahasa Melayu</Link>
          </nav>
          <p className="landing-reveal-2">
            <Link href="/legal/terms" data-source="/legal/terms">
              © 2026
            </Link>{' '}
            · <Link href="/legal/privacy">Privacy</Link>
          </p>
        </div>
      </footer>
    </>
  )
}
