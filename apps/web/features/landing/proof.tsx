/* eslint-disable skyclause-i18n/no-literal-jsx -- Landing copy is English in the component (no Malay landing route; LND-7 is P2). */
import { attribution } from '@skyclause/i18n/brand'
import { TERMS_SERVICE } from './fragments'
import { Words } from './words'

type Kind = keyof typeof attribution

interface Source {
  name: string
  kinds: Kind[]
  reads: string
}

// The real sources, by name in type (no drawn marks, no implied partnership), each with what is read from it, how
// often (the terms' cadences) and its licence (the brand catalogue's attribution table).
const SOURCES: Source[] = [
  {
    name: 'JPS Infobanjir',
    kinds: ['jps_rain'],
    reads: 'Rain gauge 0232901RF, every 5 minutes, summed into 60-minute totals.'
  },
  {
    name: 'DOE APIMS',
    kinds: ['apims'],
    reads: 'The Air Pollutant Index at three stations around Bukit Jalil, hourly, polled every 15 minutes.'
  },
  {
    name: 'MET Malaysia',
    kinds: ['met_warning', 'met_forecast'],
    reads: 'Warnings in force, polled every 10 minutes, and the daily forecast, every 6 hours.'
  },
  {
    name: 'Rapid Rail',
    kinds: ['rapidrail_od'],
    reads: 'Gate taps at Bukit Jalil station for each night, published the day after.'
  },
  {
    name: 'GoLive',
    kinds: ['golive'],
    reads: 'Stadium and arena listings at Bukit Jalil, polled hourly.'
  },
  {
    name: 'Wikipedia',
    kinds: ['wikipedia'],
    reads: 'Event listings for the venues, revisions checked daily.'
  }
]

function Licence({ kind }: { kind: Kind }) {
  const { licence_name: name, licence_url: url, derived_only: derived } = attribution[kind]
  if (!name || !url) return <>{derived ? 'No open licence: only derived values are shown.' : 'No open licence.'}</>
  return (
    <>
      Licence:{' '}
      <a href={url} rel="license noreferrer">
        {name}
      </a>
    </>
  )
}

export function Proof() {
  return (
    <section id="sources" className="proof" aria-labelledby="proof-heading" data-reveal-section>
      <ul className="proof-board">
        <li className="proof-tile proof-tile--head" data-reveal>
          <h2 id="proof-heading" className="proof-heading" data-words>
            <Words text="Read from public sources" />
          </h2>
        </li>
        {SOURCES.map((source) => (
          <li key={source.name} className="proof-tile" data-reveal>
            <p className="proof-name">{source.name}</p>
            <p className="proof-reads" data-source={TERMS_SERVICE}>
              {source.reads}
            </p>
            <p className="proof-licence" data-source={TERMS_SERVICE}>
              <Licence kind={source.kinds[0]!} />
            </p>
          </li>
        ))}
        <li className="proof-tile proof-tile--note" data-reveal>
          <p>
            Public data, used under each source&rsquo;s terms. Skyclause is not affiliated with or endorsed by APU, KPT,
            JPS, MET Malaysia, DOE, Prasarana or Rapid KL, or the stadium.
          </p>
        </li>
      </ul>
    </section>
  )
}
