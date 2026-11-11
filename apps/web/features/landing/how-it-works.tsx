/* eslint-disable skyclause-i18n/no-literal-jsx, @next/next/no-img-element -- Landing copy is the DESIGN copy deck verbatim (English P1; Malay LND-7 P2). Images are cropped-only Wikimedia Commons files loaded lazily. */
import { JPS_SOURCE_URL } from './data'

// How it works: "From gauge to notice" — the slip with zigzag foot. No crimson in this section.
export function HowItWorks() {
  return (
    <section aria-labelledby="how-heading" className="landing-section landing-reveal-0">
      <div className="landing-inner">
        <h2 id="how-heading" className="landing-head landing-reveal-0">
          From gauge to notice
        </h2>
        <p className="landing-reveal-1">
          Every call ends as a ledger row, and the row is its receipt. Here is one, printed.
        </p>
      </div>
      <div className="landing-slip landing-reveal-2" data-ui="slip">
        <h3>Every weekday</h3>
        <ul data-source="/legal/terms#service">
          <li>rain gauge polled, every 5 min</li>
          <li>MET warnings polled, every 10 min</li>
          <li>APIMS index read, hourly</li>
          <li data-source="/legal/terms#service">morning run, 06:45 MYT</li>
        </ul>
        <h3 data-source="/legal/terms#service">Monday 2 November</h3>
        <ul>
          <li data-source={JPS_SOURCE_URL}>60-minute rain reaches Lebat, 39.0 mm, 15:00 MYT</li>
          <li data-source="/legal/terms#service">the 15:05 MYT poll changes the verdict: the crossing, 15:05 MYT</li>
          <li data-source="/legal/terms#service">decision agent drafts the bundle, by 15:15 MYT</li>
          <li data-source="/legal/terms#service">approver approves, about 15:20 MYT</li>
          <li data-source="https://s3-ap-southeast-1.amazonaws.com/open-ws/weektimetable">
            89 sessions end, 15:30 MYT
          </li>
        </ul>
        <h3>The next morning</h3>
        <ul data-source="/legal/terms#service">
          <li>window graded against the gauge, by 06:45 MYT</li>
          <li>stadium night graded against Rapid Rail gate taps, D+1</li>
        </ul>
        <p className="landing-slip-final" data-source="/legal/terms#service">
          One approved call, on the record · about 15 min from the crossing
        </p>
      </div>
      <p className="landing-inner landing-small landing-soft" data-source="/legal/terms#service">
        Worked example from the Skyclause idea: times after 15:05 MYT are inferred from documented delays, not measured,
        and no call was made that day.
      </p>
      <figure className="landing-inner landing-reveal-2">
        <img
          src="/landing/rain-kuala-lumpur.jpg"
          alt="Rain over Kuala Lumpur"
          width={800}
          height={533}
          loading="lazy"
          decoding="async"
          className="w-full"
          style={{ aspectRatio: '3 / 2', objectFit: 'cover' }}
        />
        <figcaption className="landing-small landing-soft">Rain, Kuala Lumpur</figcaption>
        <p className="landing-small landing-soft">
          Eutah Mizushima ·{' '}
          <a
            href="https://commons.wikimedia.org/wiki/File:Rain,_Kuala_Lumpur_(Unsplash).jpg"
            data-source="https://commons.wikimedia.org/wiki/File:Rain,_Kuala_Lumpur_(Unsplash).jpg"
          >
            CC0
          </a>
        </p>
      </figure>
    </section>
  )
}
