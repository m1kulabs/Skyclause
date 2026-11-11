/* eslint-disable skyclause-i18n/no-literal-jsx, @next/next/no-img-element -- Landing copy is the DESIGN copy deck verbatim (English P1; Malay LND-7 P2). Images are cropped-only Wikimedia Commons files loaded lazily. */
'use client'

import { useEffect, useState } from 'react'
import type { GradesState } from './grades'

const GRADES_SOURCE = '/v1/public/commons/bukit-jalil/grades'

function gradesAnswer(state: GradesState | undefined, source: string) {
  if (!state || state.kind === 'empty') {
    return (
      <p data-source={source}>
        Every call is graded after the fact and published with n and a 95% interval. No live grades yet (n=0).
      </p>
    )
  }
  if (state.kind === 'error') {
    return <p data-source={source}>Couldn&rsquo;t load grades: {state.message}</p>
  }
  const low = state.low === null ? '' : `, ${state.low.toFixed(2)}`
  const high = state.high === null ? '' : `–${state.high.toFixed(2)}`
  return (
    <p data-source={source}>
      Every call is graded after the fact and published with n and a 95% interval. Latest: n={state.n}
      {state.x !== null ? `, ${state.x} of ${state.n}` : ''} (Wilson 95% interval {low}
      {high}).
    </p>
  )
}

const QUESTIONS = [
  {
    q: 'Is this an emergency warning service?',
    a: (
      <p>
        No. Skyclause is not a safety or emergency service. In an emergency, call{' '}
        <a href="https://www.malaysia.gov.my/" data-source="https://www.malaysia.gov.my/">
          999
        </a>
        .
      </p>
    )
  },
  {
    q: 'Who makes the call?',
    a: (
      <p>
        An AI agent drafts it from the clause sheet; a person on the approver rota approves it before anyone hears it.
      </p>
    )
  },
  {
    q: 'Can my AI approve a call?',
    a: <p>No. AI tools can read, draft and ask for evidence. Only a person with the Approver role or above approves.</p>
  },
  {
    q: 'What happens when a feed fails?',
    a: (
      <p data-source="/legal/terms#service">
        The call says so, for example &lsquo;No call: gauge silent 25 min&rsquo;. It never shows an old reading.
      </p>
    )
  },
  {
    q: 'Where does the data come from?',
    a: (
      <p data-source="https://infobanjirjpskl.water.gov.my/Rainfall/GetRainfallGraph/75">
        JPS gauge <span translate="no">0232901RF</span>, MET Malaysia, DOE APIMS, Rapid Rail gate taps at{' '}
        <span translate="no">SP17</span>, and GoLive and Wikipedia listings.
      </p>
    )
  },
  {
    q: 'Is it right?',
    a: null,
    grades: true
  },
  {
    q: 'Does it work outside Bukit Jalil?',
    a: (
      <p>
        The Sky pack works with any station JPS, MET and APIMS cover in Malaysia; the Crowd pack needs a venue with
        listings and a rail station with gate taps.
      </p>
    )
  },
  {
    q: 'Does it excuse attendance?',
    a: <p>No. Teaching mode is the lecturer&rsquo;s and the university&rsquo;s decision.</p>
  }
] as const

// No-JS first: one radio per question drives the panes through CSS (`#faq-N:checked ~ …`), so the index works
// with script off and content is never hidden. With script on the same radios keep working; the client only
// refreshes the grades answer. Radios stay keyboard-focusable (arrows move between them); labels show the dot.
export function FaqClient({
  grades,
  pilot,
  gradesSource = GRADES_SOURCE
}: {
  grades?: GradesState
  pilot?: { org: string; project: string } | null
  gradesSource?: string
}) {
  const [live, setLive] = useState<GradesState | undefined>(grades)
  const source = gradesSource

  useEffect(() => {
    if (!pilot) return
    let cancelled = false
    const url = source
    fetch(url, { cache: 'no-store' })
      .then(async (res) => {
        if (cancelled) return
        if (!res.ok) {
          setLive({ kind: 'error', message: `Grades request failed (${res.status})` })
          return
        }
        const body = (await res.json()) as {
          data?: Array<{ n?: unknown; x?: unknown; low?: unknown; high?: unknown; metric?: unknown }>
        }
        const rows = Array.isArray(body.data) ? body.data : []
        const totalN = rows.reduce((sum, r) => sum + (typeof r.n === 'number' ? r.n : 0), 0)
        if (totalN === 0) return
        const first = rows.find((r) => typeof r.n === 'number' && r.n > 0) ?? rows[0]
        setLive({
          kind: 'grades',
          n: totalN,
          x: typeof first?.x === 'number' ? first.x : null,
          low: typeof first?.low === 'number' ? first.low : null,
          high: typeof first?.high === 'number' ? first.high : null,
          metric: typeof first?.metric === 'string' ? first.metric : ''
        })
      })
      .catch((error: unknown) => {
        if (!cancelled) setLive({ kind: 'error', message: error instanceof Error ? error.message : String(error) })
      })
    return () => {
      cancelled = true
    }
  }, [pilot, source])

  return (
    <div className="landing-reveal-2 landing-faq">
      {QUESTIONS.map((item, index) => (
        <input
          key={item.q}
          type="radio"
          name="landing-faq"
          id={`faq-${index}`}
          className="landing-faq-input"
          defaultChecked={index === 5}
        />
      ))}
      <div className="landing-inner landing-faq-index" role="radiogroup" aria-label="Common questions">
        {QUESTIONS.map((item, index) => (
          <label key={item.q} htmlFor={`faq-${index}`} className="landing-faq-label">
            <span className="landing-faq-dot" aria-hidden="true">
              <span className="landing-crimson-dot" data-crimson="faq-dot" />
            </span>
            <span>{item.q}</span>
          </label>
        ))}
      </div>
      <div className="landing-inner landing-faq-panes">
        {QUESTIONS.map((item, index) => (
          <div key={item.q} id={`faq-${index}-pane`} className="landing-faq-pane" role="tabpanel" aria-live="polite">
            {'grades' in item ? gradesAnswer(live, source) : item.a}
          </div>
        ))}
      </div>
      <figure className="landing-inner">
        <img
          src="https://commons.wikimedia.org/wiki/Special:FilePath/Bukit_Jalil_LRT_Panorama.jpg?width=800"
          alt="Bukit Jalil LRT panorama"
          width={800}
          height={450}
          loading="lazy"
          decoding="async"
          className="w-full"
          style={{ aspectRatio: '16 / 9', objectFit: 'cover' }}
        />
        <figcaption
          className="landing-small landing-soft"
          data-source="https://commons.wikimedia.org/wiki/File:Bukit_Jalil_LRT_Panorama.jpg"
        >
          Bukit Jalil LRT Panorama, 2025
        </figcaption>
        <p className="landing-small landing-soft">
          Pixdoet ·{' '}
          <a
            href="https://commons.wikimedia.org/wiki/File:Bukit_Jalil_LRT_Panorama.jpg"
            data-source="https://commons.wikimedia.org/wiki/File:Bukit_Jalil_LRT_Panorama.jpg"
          >
            CC BY 4.0
          </a>{' '}
          ·{' '}
          <a
            href="https://commons.wikimedia.org/wiki/File:Bukit_Jalil_LRT_Panorama.jpg"
            data-source="https://commons.wikimedia.org/wiki/File:Bukit_Jalil_LRT_Panorama.jpg"
          >
            File
          </a>
        </p>
      </figure>
    </div>
  )
}
