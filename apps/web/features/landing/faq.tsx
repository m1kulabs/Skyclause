/* eslint-disable skyclause-i18n/no-literal-jsx -- Landing copy is the DESIGN copy deck verbatim (English P1; Malay LND-7 P2). */
import { pilotRefFromEnv, type GradesState } from './grades'
import { FaqClient } from './faq-client'

// FAQ: "Common questions" — index and one answer pane, inverted. Answers under questions on phones via stacking.
// PILOT_PROJECT is read with loadEnv (§6, D4); the client fetches GET /v1/public/{org}/{project}/grades.
// The grades source defaults to the Commons pilot (the P1 shared "Bukit Jalil" project) until PILOT_PROJECT names one.
export function Faq() {
  const pilot = pilotRefFromEnv(process.env) as { org: string; project: string } | null
  const initial: GradesState = { kind: 'empty', n: 0 }
  const gradesSource = pilot
    ? `/v1/public/${encodeURIComponent(pilot.org)}/${encodeURIComponent(pilot.project)}/grades`
    : '/v1/public/commons/bukit-jalil/grades'
  return (
    <section aria-labelledby="faq-heading" className="landing-section landing-inverted landing-reveal-0">
      <div className="landing-inner">
        <h2 id="faq-heading" className="landing-head landing-reveal-0">
          Common questions
        </h2>
      </div>
      <FaqClient grades={initial} pilot={pilot} gradesSource={gradesSource} />
    </section>
  )
}
