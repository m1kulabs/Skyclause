/* eslint-disable skyclause-i18n/no-literal-jsx, @next/next/no-html-link-for-pages -- Landing copy is English in the component (no Malay landing route; LND-7 is P2). Plain links: next/link would add router script to the landing's 150 KB budget; these navigate to other route groups anyway. */
import { t } from '@skyclause/i18n/brand'
import { BlockWordmark } from '../public-chrome/block-wordmark'
import { appHref } from './app-links'
import { FooterClock } from './clock'
import { PHOTO_KEYS, photo } from './photos'

// The name, built large as capsule blocks (the shared BlockWordmark, as on every public page), then the links that
// exist, the place and its live MYT clock, both brand lines and the picture credits.
export function LandingFooter() {
  return (
    <footer className="footer">
      <BlockWordmark />
      <div className="footer-grid">
        <nav aria-label="Footer" className="footer-links">
          <ul>
            <li>
              <a href="#how">How it works</a>
            </li>
            <li>
              <a href="#record">The record</a>
            </li>
            <li>
              <a href="#sources">Sources</a>
            </li>
            <li>
              <a href="#prices">Prices</a>
            </li>
            <li>
              <a href="#questions">Questions</a>
            </li>
          </ul>
          <ul>
            <li>
              <a href={appHref('/sign-in')}>Sign in</a>
            </li>
            <li>
              <a href={appHref('/sign-up')}>Create an account</a>
            </li>
          </ul>
          <ul>
            <li>
              <a href="/legal/terms">Terms</a>
            </li>
            <li>
              <a href="/legal/privacy">Privacy</a>
            </li>
            <li>
              <a href="/ms/legal/privacy" lang="ms" hrefLang="ms">
                Privasi dalam Bahasa Melayu
              </a>
            </li>
          </ul>
        </nav>
        <div className="footer-place">
          <p>Bukit Jalil, Kuala Lumpur</p>
          <p>
            <FooterClock />
          </p>
        </div>
      </div>
      <div className="footer-lines">
        <p data-source="https://www.malaysia.gov.my/">{t('brand.not_safety_service', {}, 'en')}</p>
        <p>{t('brand.non_affiliation', {}, 'en')}</p>
      </div>
      <div className="footer-credits">
        <p className="footer-credits-title">Pictures, from Wikimedia Commons</p>
        <ul>
          {PHOTO_KEYS.map((key) => {
            const entry = photo(key)
            return (
              <li key={key} data-source={entry.page}>
                <a href={entry.page}>&ldquo;{entry.title}&rdquo;</a> by {entry.creator},{' '}
                <a href={entry.licenceUrl} rel="license noreferrer">
                  {entry.licence}
                </a>
              </li>
            )
          })}
        </ul>
      </div>
      <div className="footer-last">
        <p data-source="/legal/terms">
          © 2026 <span translate="no">{t('brand.name', {}, 'en')}</span>
        </p>
        <a href="#main-content" className="footer-top">
          Back to the top
        </a>
      </div>
    </footer>
  )
}
