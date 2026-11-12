/* eslint-disable skyclause-i18n/no-literal-jsx -- Landing copy is English in the component (no Malay landing route; LND-7 is P2). */
import { JPS_SOURCE_URL } from './data'
import {
  ApprovalFragment,
  ClauseFragment,
  GradeFragment,
  ReadingsFragment,
  TERMS_SERVICE,
  VerdictFragment
} from './fragments'
import type { GradesState } from './grades'
import { StageRange } from './stage-range'

export const STAGES = ['Readings', 'Clause', 'Verdict and call', 'Approval and notice', 'Grade'] as const

// "Drag through the stages": a range input and the stage names (radios, so the section works without script) drive
// the clause on the left, which is the section's heading, and the fragment on the right. CSS shows the checked stage.
export function HowItWorks({ grades, gradesSource }: { grades: GradesState; gradesSource: string }) {
  const clauses = [
    <span key="0" data-source={JPS_SOURCE_URL}>
      First, the gauge reads 39&nbsp;mm
    </span>,
    <span key="1">Then Storm confirmed fires</span>,
    <span key="2">The window gets its verdict</span>,
    <span key="3">A person approves the call</span>,
    <span key="4">Next morning, it is graded</span>
  ]
  const fragments = [
    <ReadingsFragment key="0" />,
    <ClauseFragment key="1" />,
    <VerdictFragment key="2" />,
    <ApprovalFragment key="3" />,
    <GradeFragment key="4" grades={grades} source={gradesSource} />
  ]
  return (
    <section id="how" className="how" aria-labelledby="how-heading" data-reveal-section>
      <div className="how-clause">
        <h2 id="how-heading" className="how-heading" data-reveal>
          {clauses.map((clause, index) => (
            <span key={index} className="how-step" data-stage={index}>
              {clause}
            </span>
          ))}
        </h2>
        <p className="how-note" data-source={TERMS_SERVICE}>
          Replay of 2 November 2026 from JPS gauge 0232901RF; the 60-minute totals are our arithmetic. Times after 15:05
          MYT are inferred from the documented delays, and no call was made that day.
        </p>
      </div>
      <div className="how-field" data-reveal>
        {fragments.map((fragment, index) => (
          <div key={index} className="how-step how-fragment" data-stage={index}>
            {fragment}
          </div>
        ))}
      </div>
      <div className="how-trackbox" aria-hidden="true" />
      <div className="how-track" data-reveal>
        <div className="how-rangebox">
          <span className="how-rail" aria-hidden="true">
            <span className="how-fill" />
          </span>
          <StageRange names={[...STAGES]} />
        </div>
      </div>
      <fieldset className="how-names" data-reveal>
        <legend className="sr-only">Stages</legend>
        {STAGES.map((name, index) => (
          <label key={name} className="how-name">
            <input type="radio" name="stage" value={index} defaultChecked={index === 0} className="how-radio" />
            <span>{name}</span>
          </label>
        ))}
      </fieldset>
    </section>
  )
}
