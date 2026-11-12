/* eslint-disable skyclause-i18n/no-literal-jsx -- Landing copy is English in the component (no Malay landing route; LND-7 is P2). */
import { CLOCK_SOURCE, TIME_INPUT_PATTERN } from '../landing-hero/window-model'

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
            inputMode="text"
            enterKeyHint="go"
            autoComplete="off"
            spellCheck={false}
            placeholder="15:30"
            pattern={TIME_INPUT_PATTERN}
            title="A time in MYT on the quarter hour, such as 15:30, 1530 or 3.30pm"
            aria-describedby="cta-help"
            required
          />{' '}
          <button type="submit" className="cta-submit">
            today?
          </button>
        </h2>
        <p id="cta-help" className="cta-help" data-reveal>
          A time in MYT on the quarter hour, typed any way you like, such as 1530 or 3.30pm. It opens the clause
          engine&rsquo;s verdict for that hour at the top of this page, with no account and no personal details.
        </p>
      </form>
    </section>
  )
}
