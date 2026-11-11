/* eslint-disable skyclause-i18n/no-literal-jsx -- Landing copy is the DESIGN copy deck verbatim (English P1; Malay LND-7 P2). Images are cropped-only Wikimedia Commons files loaded lazily. */
// Proof: "Readings from" — names at 22px, no logos. No crimson.
export function Proof() {
  return (
    <section aria-labelledby="proof-heading" className="landing-section landing-reveal-0">
      <div className="landing-inner">
        <h2 id="proof-heading" className="landing-head landing-reveal-0">
          Readings from
        </h2>
        <p className="landing-proof-names landing-reveal-1">
          <span>JPS Infobanjir</span> · <span>MET Malaysia</span> · <span>DOE APIMS</span> · <span>Rapid Rail</span> ·{' '}
          <span>GoLive</span> · <span>Wikipedia</span>
        </p>
        <p className="landing-small landing-soft landing-reveal-2">
          Public data, used under each source&rsquo;s terms. Skyclause is not affiliated with or endorsed by APU, KPT,
          JPS, MET Malaysia, DOE, Prasarana or Rapid KL, or the stadium.
        </p>
      </div>
    </section>
  )
}
