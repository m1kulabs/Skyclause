/* eslint-disable skyclause-i18n/no-literal-jsx -- Landing copy is English in the component (no Malay landing route; LND-7 is P2). */
import Link from 'next/link'
import { t } from '@skyclause/i18n/brand'
import { FooterClock } from './clock'
import { PHOTO_KEYS, photo } from './photos'

// Internal links are next/link without prefetch, so no other route's script loads before the visitor asks.
// The name, built large: each letter knocked out of its own capsule, the capsules of different heights standing on one
// strip (the brand mark, a capsule on its day, at the scale of the page). Below: the links that exist, the place and
// its live MYT clock, both brand lines and the picture credits.
const LETTERS = ['S', 'k', 'y', 'c', 'l', 'a', 'u', 's', 'e']
const HEIGHTS = [100, 74, 88, 66, 94, 80, 62, 86, 96]
const GAP = 4

/** The wordmark as capsule blocks in one inline SVG: each letter knocked out of its own block, bottoms on one line. */
function BlockMark({
  width,
  height,
  fontSize,
  className
}: {
  width: number
  height: number
  fontSize: number
  className: string
}) {
  const block = (width - GAP * (LETTERS.length - 1)) / LETTERS.length
  return (
    <svg
      className={className}
      viewBox={`0 0 ${width} ${height}`}
      role="img"
      aria-label={t('brand.name', {}, 'en')}
      data-reveal
    >
      {LETTERS.map((letter, index) => {
        const h = (HEIGHTS[index]! / 100) * height
        const x = index * (block + GAP)
        return (
          <g key={`${letter}-${index}`}>
            <rect x={x} y={height - h} width={block} height={h} rx={block / 2} className="footer-block" />
            <text
              x={x + block / 2}
              y={height - h / 2}
              fontSize={fontSize}
              textAnchor="middle"
              dominantBaseline="central"
              className="footer-letter"
            >
              {letter}
            </text>
          </g>
        )
      })}
    </svg>
  )
}

export function LandingFooter() {
  return (
    <footer className="footer">
      <BlockMark width={1000} height={230} fontSize={118} className="footer-mark footer-mark--wide" />
      <BlockMark width={400} height={220} fontSize={34} className="footer-mark footer-mark--narrow" />
      <div className="footer-strip" aria-hidden="true" />
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
              <Link href="/sign-in" prefetch={false}>
                Sign in
              </Link>
            </li>
            <li>
              <Link href="/sign-up" prefetch={false}>
                Create an account
              </Link>
            </li>
          </ul>
          <ul>
            <li>
              <Link href="/legal/terms" prefetch={false}>
                Terms
              </Link>
            </li>
            <li>
              <Link href="/legal/privacy" prefetch={false}>
                Privacy
              </Link>
            </li>
            <li>
              <Link href="/ms/legal/privacy" prefetch={false} lang="ms" hrefLang="ms">
                Privasi dalam Bahasa Melayu
              </Link>
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
        <p data-source="/legal/terms">© 2026 Skyclause</p>
        <a href="#main-content" className="footer-top">
          Back to the top
        </a>
      </div>
    </footer>
  )
}
