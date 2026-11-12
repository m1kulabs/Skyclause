/* eslint-disable skyclause-i18n/no-literal-jsx -- Landing copy is English in the component (no Malay landing route; LND-7 is P2). */
import { Glyph } from '../brand/glyph'
import { JPS_SOURCE_URL } from './data'

// "Paragraph with picture words": one statement does the work of a feature grid. Each capability's key noun is
// followed by a fragment of the product at text size: the replayed gauge figure with its Replay label, the No call
// mark with its glyph and word, and the Approve capsule (inert: a picture of the button, not a button).
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
            gauge{' '}
            <span className="slot slot--figure" data-source={JPS_SOURCE_URL} data-reveal-slot>
              <span className="slot-note">Replay</span>
              <span>39.0&nbsp;mm</span>
            </span>
            .
          </span>
        </span>{' '}
        <span className="features-line">
          When the haze index fails, the call{' '}
          <span className="nowrap">
            says{' '}
            <span className="slot slot--mark" data-tone="no-call" data-reveal-slot>
              <Glyph state="no_call" width={16} height={16} />
              No&nbsp;call
            </span>
            .
          </span>
        </span>{' '}
        <span className="features-line">
          A person approves each{' '}
          <span className="nowrap">
            call{' '}
            <span className="slot slot--approve" aria-hidden="true" data-reveal-slot>
              Approve
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
