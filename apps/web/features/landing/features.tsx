/* eslint-disable skyclause-i18n/no-literal-jsx, @next/next/no-img-element -- Landing copy is English in the component (no Malay landing route; LND-7 is P2). Self-hosted, pre-sized pictures; next/image would add client script. */
import { Glyph } from '../brand/glyph'
import { photo } from './photos'

function PhotoSlot({ which }: { which: 'rain' | 'haze' }) {
  const entry = photo(which)
  return (
    <span className="slot" data-which={which} data-reveal-slot>
      <img src={entry.src} width={entry.width} height={entry.height} alt="" loading="lazy" decoding="async" />
    </span>
  )
}

// "Paragraph with picture words": one statement does the work of a feature grid. Each capability's key noun is
// followed by an inline slot: a tight crop of the thing, or the product's own capsule at text size.
export function Features({ signInHref }: { signInHref: string }) {
  return (
    <section className="features" aria-labelledby="features-heading" data-reveal-section>
      <h2 id="features-heading" className="sr-only">
        What it does
      </h2>
      <p className="features-statement" data-reveal>
        <span className="features-line">
          Every reading keeps its age, from the rain{' '}
          <span className="nowrap">
            gauge <PhotoSlot which="rain" />.
          </span>
        </span>{' '}
        <span className="features-line">
          When the haze{' '}
          <span className="nowrap">
            index <PhotoSlot which="haze" />
          </span>{' '}
          fails, the call says No&nbsp;call.
        </span>{' '}
        <span className="features-line">
          A person approves each{' '}
          <span className="nowrap">
            call{' '}
            <span className="slot slot--capsule" data-tone="commute-disruption" data-reveal-slot>
              <Glyph state="commute_disruption" width={16} height={16} />
            </span>
            ;
          </span>{' '}
          the next morning grades it.
        </span>
      </p>
      <div className="features-foot" data-reveal>
        <p>
          Readings come from JPS, APIMS, MET and Rapid Rail on their own schedules, and a source that fails is never
          filled in with an old value.
        </p>
        <a href={signInHref} className="landing-button">
          Sign in
        </a>
      </div>
    </section>
  )
}
