import { connection } from 'next/server'
import { LandingSections } from '../../features/landing'
import { LandingHero } from '../../features/landing-hero/landing-hero'

// The verdict is per-request (no-JS acceptance), so this route blocks instead of prerendering a stale snapshot.
export const instant = false

export default async function Home({
  searchParams
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>
}) {
  // The hero reads `new Date()` for the next-hour window; render it at request time, never prerendered.
  await connection()
  return (
    <main>
      <LandingHero searchParams={searchParams} />
      <LandingSections />
    </main>
  )
}
