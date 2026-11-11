/* eslint-disable skyclause-i18n/no-literal-jsx -- Landing copy is the DESIGN copy deck verbatim (English P1; Malay LND-7 P2). Images are cropped-only Wikimedia Commons files loaded lazily. */
import './landing.css'
import { JPS_SOURCE_URL, replaySlice, WINDOW_1530_FROM, WINDOW_1530_TO, CLAUSE_SPAN_FROM, CLAUSE_SPAN_TO } from './data'
import { LandingStrip } from './strip'

// Showcase: "One window, three moments" — three 640px copies, middle reveals inputs on focus or click.
// LOC-6 outranks the copy deck: every printed time carries MYT (also satisfies expectZonedTimes).
export function Showcase() {
  const before = replaySlice('2026-11-02T14:00:00+08:00', '2026-11-02T14:55:00+08:00')
  const crossing = replaySlice('2026-11-02T14:00:00+08:00', '2026-11-02T15:00:00+08:00')
  const after = replaySlice('2026-11-02T14:00:00+08:00', '2026-11-02T16:00:00+08:00')
  return (
    <section aria-labelledby="showcase-heading" className="landing-section landing-reveal-0">
      <div className="landing-inner">
        <h2 id="showcase-heading" className="landing-head landing-reveal-0">
          One window, three moments
        </h2>
        <p className="landing-soft landing-reveal-1" data-source={JPS_SOURCE_URL}>
          The 15:30 MYT release wave on 2 November 2026, three verdicts.
        </p>
      </div>
      <div className="landing-copies landing-reveal-2" role="list" aria-label="One window, three moments">
        <article role="listitem" className="landing-copy" aria-label="Before">
          <h3>Before</h3>
          <p data-source={JPS_SOURCE_URL}>Normal · 29.5 mm in 60 min · Lebat starts at 31 mm</p>
          <LandingStrip
            from="2026-11-02T14:00:00+08:00"
            to="2026-11-02T14:55:00+08:00"
            rain60={before}
            windowSpan={null}
          />
        </article>
        {/* eslint-disable-next-line jsx-a11y/no-noninteractive-tabindex -- The middle copy reveals inputs on focus/click. */}
        <article role="listitem" className="landing-copy landing-middle" aria-label="Crossing" tabIndex={0}>
          <h3>Crossing</h3>
          <p data-source={JPS_SOURCE_URL}>Commute disruption · Storm confirmed · 39.0 mm in 60 min (Lebat)</p>
          <LandingStrip
            from="2026-11-02T14:00:00+08:00"
            to="2026-11-02T15:00:00+08:00"
            rain60={crossing}
            windowSpan={{ from: WINDOW_1530_FROM, to: WINDOW_1530_TO }}
            crimsonWindow
          />
          <div className="landing-middle-details">
            <p data-source={JPS_SOURCE_URL}>
              Gauge <span translate="no">0232901RF</span>, reading 15:00 MYT, 5 min old at the 15:05 MYT poll; clause
              span 15:00 MYT–16:30 MYT, from 30 minutes before to 60 minutes after the window ends; Lebat 31–60 mm
            </p>
            <p data-source="clock:Asia/Kuala_Lumpur">
              Clause span <time dateTime={CLAUSE_SPAN_FROM}>15:00 MYT</time>–
              <time dateTime={CLAUSE_SPAN_TO}>16:30 MYT</time>
            </p>
          </div>
        </article>
        <article role="listitem" className="landing-copy" aria-label="After">
          <h3>After</h3>
          <p data-source={JPS_SOURCE_URL}>
            Commute disruption holds · 24.0 mm in 60 min; the window&rsquo;s span peaked at 59.5 mm at 15:35 MYT
          </p>
          <LandingStrip
            from="2026-11-02T14:00:00+08:00"
            to="2026-11-02T16:00:00+08:00"
            rain60={after}
            windowSpan={null}
          />
        </article>
      </div>
      <p className="landing-inner landing-soft" data-source={JPS_SOURCE_URL}>
        Replay of 2 November 2026 from the JPS 5-minute series; 60-minute totals are our arithmetic. Clause engine
        verdict: not reviewed, not sent.
      </p>
    </section>
  )
}
