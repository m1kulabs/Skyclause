/* eslint-disable skyclause-i18n/no-literal-jsx, @next/next/no-img-element -- Landing copy is the DESIGN copy deck verbatim (English P1; Malay LND-7 P2). Images are cropped-only Wikimedia Commons files loaded lazily. */
// Stadium drift (NFR-7): 1.00→1.04 over 24s, no JS: a checkbox pauses via CSS. Reduced motion stops it.
export function StadiumDrift() {
  return (
    <figure className="landing-drift-wrap landing-inner landing-reveal-2">
      <input type="checkbox" id="drift-pause" name="landing-drift-pause" className="landing-drift-input" />
      <div style={{ overflow: 'hidden' }}>
        <img
          src="https://commons.wikimedia.org/wiki/Special:FilePath/Bukit_Jalil_National_Stadium_at_night.jpg?width=800"
          alt="Bukit Jalil National Stadium at night"
          width={800}
          height={1000}
          loading="lazy"
          decoding="async"
          className="landing-drift w-full"
          style={{ aspectRatio: '4 / 5', objectFit: 'cover' }}
        />
      </div>
      <figcaption className="landing-small landing-soft">Bukit Jalil National Stadium at night</figcaption>
      <p className="landing-small landing-soft">
        Pak Misai ·{' '}
        <a
          href="https://commons.wikimedia.org/wiki/File:Bukit_Jalil_National_Stadium_at_night.jpg"
          data-source="https://commons.wikimedia.org/wiki/File:Bukit_Jalil_National_Stadium_at_night.jpg"
        >
          CC BY-SA 4.0
        </a>{' '}
        ·{' '}
        <a
          href="https://commons.wikimedia.org/wiki/File:Bukit_Jalil_National_Stadium_at_night.jpg"
          data-source="https://commons.wikimedia.org/wiki/File:Bukit_Jalil_National_Stadium_at_night.jpg"
        >
          File
        </a>
      </p>
      <label htmlFor="drift-pause" className="landing-button">
        Pause
      </label>
    </figure>
  )
}
