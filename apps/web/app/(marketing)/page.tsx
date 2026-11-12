import { connection } from 'next/server'
import { LandingFooter, LandingSections } from '../../features/landing'
import { gradesPath, pilotRefFromEnv, readGrades } from '../../features/landing/grades'
import { LandingHero } from '../../features/landing-hero/landing-hero'
import { readHero } from '../../features/landing-hero/read'

// The verdict is per-request (no-JS acceptance), so this route blocks instead of prerendering a stale snapshot.
export const instant = false

export default async function Home({
  searchParams
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>
}) {
  // The hero reads `new Date()` for the next-hour window; render it at request time, never prerendered.
  await connection()
  const query = await searchParams
  // The live reads run together, each with a 2s timeout; a failure renders as that read's error, never a fallback.
  const [read, grades] = await Promise.all([readHero(query), readGrades(fetch, process.env, AbortSignal.timeout(2000))])
  return (
    <div className="landing">
      {/* The skip link's target: past the language suggestion, straight to the page. */}
      <main id="landing-main" tabIndex={-1}>
        <LandingHero read={read} />
        <LandingSections read={read} grades={grades} gradesSource={gradesPath(pilotRefFromEnv(process.env))} />
      </main>
      <LandingFooter />
    </div>
  )
}
