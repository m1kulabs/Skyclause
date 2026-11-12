/* eslint-disable skyclause-i18n/no-literal-jsx, @next/next/no-img-element -- Landing copy is English in the component (no Malay landing route; LND-7 is P2). Self-hosted, pre-sized pictures; next/image would add client script. */
import type { ReactNode } from 'react'
import type { LatestCallRead } from '../landing-hero/evaluate'
import { CalendarFragment, LedgerFragment, LiveGrades, NoticeFragment, TERMS_SERVICE } from './fragments'
import { JPS_SOURCE_URL } from './data'
import type { GradesState } from './grades'
import { photo, srcSetOf, type PhotoKey } from './photos'
import { Words } from './words'

interface RecordItem {
  id: string
  name: string
  fact: ReactNode
  picture: PhotoKey
  object: ReactNode
}

// "Object on a disc", with the capsule in place of the disc: the record's four parts as a list; choosing one swaps the
// object (an interface fragment) and the photograph inside the capsule. Radios drive it, so it works without script.
export function Showcase({
  now,
  latestCall,
  calendarSource,
  grades,
  gradesSource
}: {
  now: Date
  latestCall: LatestCallRead
  calendarSource: string
  grades: GradesState
  gradesSource: string
}) {
  const items: RecordItem[] = [
    {
      id: 'ledger',
      name: 'The ledger entry',
      fact: 'Append-only: every run, call, edit, approval, send, delay and grade, exportable on every plan.',
      picture: 'storm',
      object: <LedgerFragment />
    },
    {
      id: 'notice',
      name: 'The notice',
      fact: 'Sent only after approval, to people who need no account, with a way to unsubscribe.',
      picture: 'lrtPlatform',
      object: <NoticeFragment />
    },
    {
      id: 'calendar',
      name: 'The conditions calendar',
      fact: 'One calendar per project of approved calls and surge nights, to subscribe to in any calendar app.',
      picture: 'persiaran',
      object: <CalendarFragment now={now} latestCall={latestCall} source={calendarSource} />
    },
    {
      id: 'grade',
      name: 'The grade',
      fact: (
        <>
          Every call is graded after the fact, rejected calls included, and published with n.{' '}
          <LiveGrades grades={grades} source={gradesSource} />
        </>
      ),
      picture: 'rain',
      object: (
        <div className="frag" data-ui="grade-record">
          <p className="frag-tag" data-source={JPS_SOURCE_URL}>
            <span className="frag-badge">Replay</span>
            <span>The input a grade reads, 2 November 2026</span>
          </p>
          <p className="frag-figure" data-source={JPS_SOURCE_URL}>
            <span data-numeric>59.5</span>
            <span className="frag-unit">mm at 15:35 MYT</span>
          </p>
          <p className="frag-meta" data-source={TERMS_SERVICE}>
            Sky windows are graded nightly at 23:55 MYT against the gauge and APIMS, with a grade by 06:45 MYT.
          </p>
        </div>
      )
    }
  ]
  return (
    <section id="record" className="record" aria-labelledby="record-heading" data-reveal-section>
      <div className="record-stage">
        <div className="record-capsule" data-reveal>
          {items.map((item) => {
            const entry = photo(item.picture)
            return (
              <img
                key={item.id}
                className="record-photo record-item"
                data-item={item.id}
                src={entry.src}
                srcSet={srcSetOf(entry)}
                sizes="(min-width: 1024px) 64vw, 100vw"
                width={entry.width}
                height={entry.height}
                alt={entry.alt}
                loading="lazy"
                decoding="async"
              />
            )
          })}
        </div>
        <div className="record-objects" data-reveal>
          {items.map((item) => (
            <div key={item.id} className="record-object record-item" data-item={item.id}>
              {item.object}
            </div>
          ))}
        </div>
        <div className="record-facts" data-reveal>
          {items.map((item) => (
            <div key={item.id} className="record-fact record-item" data-item={item.id} data-source={TERMS_SERVICE}>
              {item.fact}
            </div>
          ))}
        </div>
      </div>
      <fieldset className="record-index">
        <legend className="sr-only">Parts of the record</legend>
        <h2 id="record-heading" className="record-heading" data-words>
          <Words text="What the record keeps" />
        </h2>
        {items.map((item, index) => (
          <label key={item.id} className="record-name" data-reveal>
            <input type="radio" name="record" value={item.id} defaultChecked={index === 0} className="record-radio" />
            <span>{item.name}</span>
          </label>
        ))}
      </fieldset>
    </section>
  )
}
