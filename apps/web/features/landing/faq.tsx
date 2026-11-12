/* eslint-disable skyclause-i18n/no-literal-jsx -- Landing copy is English in the component (no Malay landing route; LND-7 is P2). */
import type { ReactNode } from 'react'
import { JPS_SOURCE_URL } from './data'
import { LiveGrades, TERMS_SERVICE } from './fragments'
import type { GradesState } from './grades'
import { Words } from './words'

interface Question {
  q: string
  a: ReactNode
}

// "Accordion of filled tiles": native <details> sharing one name, so one opens at a time, with no script.
export function Faq({ grades, gradesSource }: { grades: GradesState; gradesSource: string }) {
  const questions: Question[] = [
    {
      q: 'Is this an emergency warning service?',
      a: (
        <p>
          No. It reads public sources for scheduled windows; in an emergency, call{' '}
          <span data-source="https://www.malaysia.gov.my/">999</span>.
        </p>
      )
    },
    {
      q: 'Who makes the call?',
      a: (
        <p>
          The decision agent drafts it from the clause sheet; a person on the approver rota approves it before anyone
          hears it.
        </p>
      )
    },
    {
      q: 'Can my AI approve a call?',
      a: (
        <p>
          No. AI tools can read, draft and ask for evidence. Only a person with the Approver role or above approves.
        </p>
      )
    },
    {
      q: 'What happens when a source fails?',
      a: (
        <p data-source={TERMS_SERVICE}>
          The call says so, for example &ldquo;No call: gauge silent 25 min&rdquo;, and only the clauses that need it
          stop. It never shows an old reading.
        </p>
      )
    },
    {
      q: 'Where does the data come from?',
      a: (
        <p data-source={JPS_SOURCE_URL}>
          JPS gauge <span translate="no">0232901RF</span>, MET Malaysia, DOE APIMS, Rapid Rail gate taps at{' '}
          <span translate="no">SP17</span>, and GoLive and Wikipedia listings.
        </p>
      )
    },
    {
      q: 'Is it right?',
      a: (
        <>
          <p data-source={gradesSource}>Every call is graded after the fact and published with n and a 95% interval.</p>
          <LiveGrades grades={grades} source={gradesSource} />
        </>
      )
    },
    {
      q: 'Do I need an account to get notices?',
      a: (
        <p>
          No. A subscriber gives an email, a role and the windows they care about, and changes them by magic link. Every
          notice has a way to unsubscribe.
        </p>
      )
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
  ]
  return (
    <section id="questions" className="faq" aria-labelledby="faq-heading" data-reveal-section>
      <h2 id="faq-heading" className="faq-heading" data-words>
        <Words text="Common questions" />
      </h2>
      <div className="faq-list">
        {questions.map((item, index) => (
          <details key={item.q} name="faq" className="faq-tile" open={index === 5} data-reveal>
            <summary className="faq-question">
              <span>{item.q}</span>
              <span className="faq-sign" aria-hidden="true" />
            </summary>
            <div className="faq-answer">{item.a}</div>
          </details>
        ))}
      </div>
    </section>
  )
}
