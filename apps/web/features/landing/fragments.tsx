/* eslint-disable skyclause-i18n/no-literal-jsx -- Landing copy is English in the component (no Malay landing route; LND-7 is P2). Notice lines come from the real notice catalogue. */
import type { ReactNode } from 'react'
import { formatDateShort, t as notice } from '@skyclause/i18n/notices'
import { formatDate } from '@skyclause/i18n/format'
import { Glyph } from '../brand/glyph'
import { StatusMark } from '../brand/status-mark'
import type { LatestCallRead } from '../landing-hero/evaluate'
import { CLOCK_SOURCE } from '../landing-hero/window-model'
import { JPS_SOURCE_URL, JPS_STATION, replaySlice } from './data'
import type { GradesState } from './grades'

// Interface fragments of the product, built in real markup from the labelled Replay of 2 November 2026 (the JPS
// capture in fixtures.json; totals from generator.ts) or from this request's live reads. Nothing here is invented:
// where the replay has no value (no call was made that day), the fragment says so.

export const TERMS_SERVICE = '/legal/terms#service'
const DAY = '2026-11-02'
const at = (clock: string) => `${DAY}T${clock}:00+08:00`
const RELEASE = at('15:30')
const SPAN_FROM = at('15:00')
const SPAN_TO = at('16:30')

/** A time of the replay day, printed with its zone. */
function Myt({ clock }: { clock: string }) {
  return <time dateTime={at(clock)}>{clock} MYT</time>
}

/** The replay's 60-minute totals as bars, ink on the panel, the last one emphasised, with the Lebat line at 31 mm. */
function ReplayBars({ from, to }: { from: string; to: string }) {
  const points = replaySlice(at(from), at(to))
  const top = 60
  const last = points.at(-1)!
  return (
    <figure className="frag-bars" data-source={JPS_SOURCE_URL}>
      <div className="frag-bars-plot" aria-hidden="true">
        <span className="frag-bars-lebat" style={{ bottom: `${(31 / top) * 100}%` }}>
          <span>Lebat 31 mm</span>
        </span>
        {points.map((point) => (
          <span
            key={point.at}
            className="frag-bar"
            data-last={point === last || undefined}
            style={{ height: `max(6px, ${((point.value / top) * 100).toFixed(1)}%)` }}
          />
        ))}
      </div>
      <figcaption className="frag-bars-axis">
        <Myt clock={from} />
        <span>60-minute totals, every 5 minutes</span>
        <Myt clock={to} />
      </figcaption>
    </figure>
  )
}

/** One afternoon of the replay day as a strip: the clause span as a band, the window as its capsule, edged (a draft). */
function ReplayDay() {
  const start = 14 * 60
  const span = 3 * 60
  const x = (clock: string) => {
    const [h, m] = clock.split(':').map(Number)
    return (((h! * 60 + m! - start) / span) * 100).toFixed(3)
  }
  return (
    <figure className="frag-day" data-source={CLOCK_SOURCE}>
      <div className="frag-day-track" aria-hidden="true">
        <span className="frag-day-span" style={{ left: `${x('15:00')}%`, right: `${100 - Number(x('16:30'))}%` }} />
        <span
          className="frag-day-capsule"
          data-tone="commute-disruption"
          style={{ left: `calc(${x('15:30')}% - 18px)` }}
        >
          <Glyph state="commute_disruption" width={12} height={12} />
        </span>
      </div>
      <figcaption className="frag-day-ticks">
        {['14:00', '15:00', '16:00', '17:00'].map((clock) => (
          <time key={clock} dateTime={at(clock)} style={{ left: `${x(clock)}%` }}>
            {clock}
          </time>
        ))}
      </figcaption>
    </figure>
  )
}

function ReplayTag({ children }: { children?: ReactNode }) {
  return (
    <p className="frag-tag" data-source={JPS_SOURCE_URL}>
      <span className="frag-badge">Replay</span>
      <span>{children ?? 'JPS gauge 0232901RF, Monday 2 November 2026'}</span>
    </p>
  )
}

export function ReadingsFragment() {
  return (
    <div className="frag" data-ui="readings">
      <ReplayTag />
      <p className="frag-title" data-source={TERMS_SERVICE}>
        Rain in the last 60 minutes
      </p>
      <p className="frag-figure" data-source={JPS_SOURCE_URL}>
        <span data-numeric>39.0</span>
        <span className="frag-unit">mm</span>
        <StatusMark state="commute_disruption" label="Lebat" />
      </p>
      <p className="frag-meta" data-source={JPS_SOURCE_URL}>
        Gauge <span translate="no">{JPS_STATION}</span>, read <Myt clock="15:00" />, 5 min old at the{' '}
        <Myt clock="15:05" /> poll
      </p>
      <ReplayBars from="14:00" to="15:00" />
    </div>
  )
}

export function ClauseFragment() {
  return (
    <div className="frag" data-ui="clause">
      <ReplayTag>Sky pack clause sheet, evaluated on the replay</ReplayTag>
      <div className="frag-row frag-row--head">
        <p className="frag-title">Storm confirmed</p>
        <span className="frag-state">
          <Glyph state="commute_disruption" width={14} height={14} />
          Fired
        </span>
      </div>
      <dl className="frag-fields" data-source={TERMS_SERVICE}>
        <div>
          <dt>Reads</dt>
          <dd>
            JPS gauge <span translate="no">{JPS_STATION}</span>
          </dd>
        </div>
        <div>
          <dt>Fires when</dt>
          <dd>At least 31 mm in 60 minutes (Lebat), from 30 minutes before to 60 minutes after the window ends</dd>
        </div>
        <div>
          <dt>Span</dt>
          <dd data-source={CLOCK_SOURCE}>
            <time dateTime={SPAN_FROM}>15:00 MYT</time> to <time dateTime={SPAN_TO}>16:30 MYT</time>, for the 15:30 MYT
            release wave
          </dd>
        </div>
        <div>
          <dt>Input</dt>
          <dd data-source={JPS_SOURCE_URL}>39.0 mm in 60 min, 5 min old</dd>
        </div>
        <div>
          <dt>Proposes</dt>
          <dd>
            <StatusMark state="commute_disruption" />
          </dd>
        </div>
      </dl>
    </div>
  )
}

export function VerdictFragment() {
  return (
    <div className="frag" data-ui="verdict">
      <ReplayTag>Bukit Jalil, Monday 2 November 2026, from 14:00 MYT to 17:00 MYT</ReplayTag>
      <ReplayDay />
      <p className="frag-title" data-source={CLOCK_SOURCE}>
        The <Myt clock="15:30" /> release wave
      </p>
      <p className="frag-row">
        <StatusMark state="commute_disruption" />
        <span>Storm confirmed</span>
      </p>
      <p className="frag-label">Clause engine verdict: not reviewed, not sent</p>
      <p className="frag-meta" data-source={CLOCK_SOURCE}>
        The verdict changed at the <Myt clock="15:05" /> poll: that crossing wakes a run, and the decision agent drafts
        the call from it. The agent does no arithmetic.
      </p>
    </div>
  )
}

export function ApprovalFragment() {
  return (
    <div className="frag" data-ui="approval">
      <ReplayTag>Worked example: no call was made that day</ReplayTag>
      <p className="frag-title">Bundle for the Sky pack</p>
      <ul className="frag-list">
        <li>
          <span>Release wave</span>
          <StatusMark state="commute_disruption" variant="plain" />
        </li>
        <li data-source={JPS_SOURCE_URL}>
          <span>Fired</span>
          <span>Storm confirmed, gauge 39.0 mm, 5 min old</span>
        </li>
        <li data-source={TERMS_SERVICE}>
          <span>Approval</span>
          <span>One, by the approver on duty, within the 10-minute SLA</span>
        </li>
      </ul>
      <p className="frag-meta" data-source={TERMS_SERVICE}>
        Approved, the notice goes to subscribers whose windows the call covers. On the documented delays it could have
        gone out about <Myt clock="15:20" />, 15 minutes after the crossing.
      </p>
    </div>
  )
}

export function GradeFragment({ grades, source }: { grades: GradesState; source: string }) {
  return (
    <div className="frag" data-ui="grade">
      <ReplayTag>What the grade reads: the same gauge, the next morning</ReplayTag>
      <p className="frag-title" data-source={TERMS_SERVICE}>
        Graded by <time dateTime="2026-11-03T06:45:00+08:00">06:45 MYT</time> on Tuesday 3 November
      </p>
      <p className="frag-figure" data-source={JPS_SOURCE_URL}>
        <span data-numeric>59.5</span>
        <span className="frag-unit">mm peak</span>
      </p>
      <p className="frag-meta" data-source={JPS_SOURCE_URL}>
        The span&rsquo;s highest 60-minute total, at <Myt clock="15:35" />: Lebat. A Sky grade is a hit, a miss, a false
        alarm or a correct Normal.
      </p>
      <LiveGrades grades={grades} source={source} />
    </div>
  )
}

/** The live grades read: n=0 before any grade, the read's error, or n with the Wilson 95% interval. */
export function LiveGrades({ grades, source }: { grades: GradesState; source: string }) {
  if (grades.kind === 'error') {
    return (
      <p className="frag-live" data-source={source}>
        <Glyph state="error" width={14} height={14} />
        <span>Couldn&rsquo;t load live grades: {grades.message}</span>
      </p>
    )
  }
  if (grades.kind === 'empty') {
    return (
      <p className="frag-live" data-source={source}>
        <Glyph state="no_call" width={14} height={14} />
        <span>No live grades yet (n=0)</span>
      </p>
    )
  }
  const low = grades.low === null ? '' : grades.low.toFixed(2)
  const high = grades.high === null ? '' : `–${grades.high.toFixed(2)}`
  return (
    <p className="frag-live" data-source={source}>
      <span>
        Latest: n={grades.n}
        {grades.x !== null ? `, ${grades.x} of ${grades.n}` : ''} (Wilson 95% interval {low}
        {high})
      </span>
    </p>
  )
}

export function LedgerFragment() {
  return (
    <div className="frag" data-ui="ledger">
      <ReplayTag>Ledger, Bukit Jalil, replay of Monday 2 November 2026</ReplayTag>
      <ol className="frag-ledger">
        <li data-source={JPS_SOURCE_URL}>
          <Myt clock="15:05" />
          <span className="frag-ledger-what">Crossing</span>
          <span>Storm confirmed fired: gauge 39.0 mm in 60 min, read 15:00 MYT, 5 min old</span>
        </li>
        <li data-source={CLOCK_SOURCE}>
          <Myt clock="15:05" />
          <span className="frag-ledger-what">Shadow verdict</span>
          <span>
            <StatusMark state="commute_disruption" variant="plain" /> for the 15:30 MYT release wave
          </span>
        </li>
        <li>
          <span className="frag-ledger-when">None</span>
          <span className="frag-ledger-what">Call, approval, send</span>
          <span>Empty: no call was made that day</span>
        </li>
        <li data-source={JPS_SOURCE_URL}>
          <time dateTime="2026-11-03T06:45:00+08:00">06:45 MYT</time>
          <span className="frag-ledger-what">Grade input</span>
          <span>Span peak 59.5 mm at 15:35 MYT</span>
        </li>
      </ol>
    </div>
  )
}

export function NoticeFragment() {
  const date = formatDateShort(RELEASE, 'en')
  const mode = 'Commute disruption'
  const window = 'the 15:30 MYT release wave'
  return (
    <div className="frag frag--mail" data-ui="notice">
      <p className="frag-mail-subject" data-source={JPS_SOURCE_URL}>
        {notice('notices.subject', { mode, window, date }, 'en')}
      </p>
      <p className="frag-title" data-source={JPS_SOURCE_URL}>
        {notice('notices.headline', { mode, window, date }, 'en')}
      </p>
      <p className="frag-meta" data-source={JPS_SOURCE_URL}>
        {notice(
          'notices.replay.why',
          {
            clause: 'Storm confirmed',
            input: 'gauge',
            station: JPS_STATION,
            value: '39.0',
            unit: 'mm',
            minutes: 60,
            time: '15:00 MYT',
            class: 'Lebat',
            age: '5 min old'
          },
          'en'
        )}
      </p>
      <p className="frag-tag" data-source={JPS_SOURCE_URL}>
        <span className="frag-badge">Replay</span>
        <span>{notice('notices.replay.label', { station: JPS_STATION, date: formatDate(RELEASE, 'en') }, 'en')}</span>
      </p>
    </div>
  )
}

const WEEK = 7

export function CalendarFragment({
  now,
  latestCall,
  source
}: {
  now: Date
  latestCall: LatestCallRead
  source: string
}) {
  // The current MYT week, Monday first, with today marked: the days are the clock's; the entries are the live read's.
  const myt = new Date(now.getTime() + 8 * 3_600_000)
  const weekday = (myt.getUTCDay() + 6) % 7
  const monday = Date.UTC(myt.getUTCFullYear(), myt.getUTCMonth(), myt.getUTCDate() - weekday, 4)
  const days = Array.from({ length: WEEK }, (_, index) => new Date(monday + index * 86_400_000))
  return (
    <div className="frag" data-ui="calendar">
      <p className="frag-tag" data-source={source}>
        <span className="frag-badge frag-badge--live">Live</span>
        <span>Conditions calendar, Bukit Jalil</span>
      </p>
      <ol className="frag-week" data-source={CLOCK_SOURCE}>
        {days.map((day, index) => (
          <li
            key={day.toISOString()}
            data-today={index === weekday || undefined}
            aria-current={index === weekday ? 'date' : undefined}
          >
            <time dateTime={day.toISOString().slice(0, 10)}>{formatDateShort(day, 'en')}</time>
          </li>
        ))}
      </ol>
      {latestCall === 'error' ? (
        <p className="frag-live" data-source={source}>
          <Glyph state="error" width={14} height={14} />
          <span>Couldn&rsquo;t reach the approved-call calendar.</span>
        </p>
      ) : latestCall ? (
        // The permalink's page (/c/{callId}, PUB-3) is not built yet: the date stands alone until it is.
        <p className="frag-live" data-source={source}>
          Latest approved call, <time dateTime={latestCall.at}>{formatDate(latestCall.at, 'en')}</time>
        </p>
      ) : (
        <p className="frag-live" data-source={source}>
          <Glyph state="no_call" width={14} height={14} />
          <span>No approved call yet (n=0)</span>
        </p>
      )}
    </div>
  )
}
