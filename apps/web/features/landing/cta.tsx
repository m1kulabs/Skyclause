/* eslint-disable skyclause-i18n/no-literal-jsx -- Landing copy is English in the component (no Malay landing route; LND-7 is P2). */
import { CLOCK_SOURCE } from '../landing-hero/window-model'

// "A sentence with a blank": the blank is a time, and the sentence's last word submits it to the hero's GET form for
// today, so the verdict for that hour opens at the top of the page. It asks for no personal data.
export function Cta({ today }: { today: string }) {
  return (
    <section className="cta" aria-labelledby="cta-heading" data-reveal-section>
      <form method="get" action="/#window" className="cta-form" data-source={CLOCK_SOURCE}>
        <input type="hidden" name="date" value={today} />
        <h2 id="cta-heading" className="cta-sentence" data-reveal>
          <label htmlFor="cta-start">What&rsquo;s the call for</label>{' '}
          <input
            id="cta-start"
            className="cta-blank"
            type="text"
            name="start"
            inputMode="numeric"
            autoComplete="off"
            spellCheck={false}
            placeholder="15:30"
            pattern="([01][0-9]|2[0-3]):(00|15|30|45)"
            title="A time in MYT on a quarter hour, such as 15:30"
            aria-describedby="cta-help"
            required
          />{' '}
          <button type="submit" className="cta-submit">
            today?
          </button>
        </h2>
        <p id="cta-help" className="cta-help" data-reveal>
          A time in MYT, on the quarter hour. It opens the clause engine&rsquo;s verdict for that hour at the top of
          this page, with no account and no personal details.
        </p>
      </form>
    </section>
  )
}
