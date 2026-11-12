/* eslint-disable skyclause-i18n/no-literal-jsx -- Landing copy is the DESIGN copy deck verbatim (English P1; Malay LND-7 P2). Images are cropped-only Wikimedia Commons files loaded lazily. */
import { JPS_SOURCE_URL, CLAUSE_SPAN_FROM, CLAUSE_SPAN_TO, replaySlice } from './data'
import { LandingStrip } from './strip'

// Features: "Read before you approve" — 380×680 bundle template with named fields, six notes.
// The selection line inside the panel is this screen's one crimson element.
export function Features() {
  return (
    <section aria-labelledby="features-heading" className="landing-section landing-reveal-0">
      <div className="landing-inner">
        <h2 id="features-heading" className="landing-head landing-reveal-0">
          Read before you approve
        </h2>
        <p className="landing-reveal-1">The bundle page, before it asks for approval.</p>
      </div>
      <div className="landing-reveal-2" data-ui="bundle-panel" style={{ width: 380, height: 680, maxWidth: '100%' }}>
        <span className="landing-crimson-line block w-16" data-crimson="features-selection" aria-hidden="true" />
        <p data-source={JPS_SOURCE_URL}>Commute disruption · Storm confirmed · 39.0 mm in 60 min (Lebat)</p>
        <p data-source={JPS_SOURCE_URL}>Gauge 39.0 mm in 60 min, 5 min old at the 15:05 MYT poll</p>
        <p data-source="clock:Asia/Kuala_Lumpur">
          Clause span <time dateTime={CLAUSE_SPAN_FROM}>15:00 MYT</time>–
          <time dateTime={CLAUSE_SPAN_TO}>16:30 MYT</time>
        </p>
        <LandingStrip
          from="2026-11-02T14:00:00+08:00"
          to="2026-11-02T16:30:00+08:00"
          rain60={replaySlice('2026-11-02T14:00:00+08:00', '2026-11-02T16:30:00+08:00')}
          windowSpan={{ from: '2026-11-02T15:30:00+08:00', to: '2026-11-02T15:30:00+08:00' }}
        />
        <p data-source="/legal/terms#service">
          {'{recipients}'} · {'{wording}'} · {'{approver}'}
        </p>
      </div>
      <div className="landing-inner landing-reveal-2">
        <dl>
          <div>
            <dt>Disagreement first</dt>
            <dd>if the agent and the clause engine differ, the bundle says so before anything else</dd>
          </div>
          <div>
            <dt>Fired clauses</dt>
            <dd data-source={JPS_SOURCE_URL}>
              each with its reading and age: gauge 39.0 mm in 60 min, 5 min old at the 15:05 MYT poll
            </dd>
          </div>
          <div>
            <dt>Warning, verbatim</dt>
            <dd>MET text in Malay with an English gloss and its valid span</dd>
          </div>
          <div>
            <dt>The window strip</dt>
            <dd>five-minute rain, the Lebat line and the window on one clock</dd>
          </div>
          <div>
            <dt>Who hears it</dt>
            <dd>the recipients each call covers, and their wording</dd>
          </div>
          <div>
            <dt>Approve, edit, reject</dt>
            <dd>one approval per bundle; a rejected call is still graded</dd>
          </div>
        </dl>
      </div>
    </section>
  )
}
