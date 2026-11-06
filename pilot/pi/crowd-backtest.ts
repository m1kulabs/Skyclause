// The Crowd backtest (#69): the labelled replay over 1 January 2025 to 2 November 2026,
// printed beside the source idea's 48 nights, 20%, 28% and 26 of 48. Run it with:
// `bun pilot/pi/crowd-backtest.ts` (no arguments; it reads the committed fixtures).
// Labels are the implementing agent's single pass from the source tables (stadium
// concerts to stadium_concert, football to stadium_football, arena to arena_show);
// the human steps' two-teammate pass re-labels each row on the live history sheet.
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import {
  runBacktest,
  summarizeBacktest,
  baselineFor,
  type DailyExits,
  type HistoryLabel
} from '../apps-script/src/crowd.ts'
import {
  parseArenaConcerts,
  parseArenaLiveEvents,
  parseFootballResults,
  parseStadiumConcerts,
  type ParsedShow
} from '../apps-script/src/crowd-history.ts'

const fixtures = join(import.meta.dir, '..', 'fixtures')

function wikitext(name: string): { text: string; rev: string } {
  const body = JSON.parse(readFileSync(join(fixtures, name), 'utf8')) as {
    query: { pages: { revisions: { revid: number; slots: { main: { content: string } } }[] }[] }
  }
  const revision = body.query.pages[0]?.revisions[0]
  if (!revision) throw new Error(`no revision in ${name}`)
  return { text: revision.slots.main.content, rev: String(revision.revid) }
}

function labelled(shows: ParsedShow[], cls: HistoryLabel['cls']): HistoryLabel[] {
  return shows.map((show) => ({ date: show.date, cls, labelA: cls, labelB: cls }))
}

function main(): void {
  const daily = JSON.parse(readFileSync(join(fixtures, 'rapidrail-sp17-daily.json'), 'utf8')) as DailyExits
  const stadium = wikitext('bukit-jalil-stadium-20261106T1922Z.json')
  const arena = wikitext('unifi-arena-20261106T1922Z.json')
  const football = wikitext('malaysia-results-20261106T1922Z.json')

  const labels: HistoryLabel[] = [
    ...labelled(parseStadiumConcerts(stadium.text, '', stadium.rev), 'stadium_concert'),
    ...labelled(parseFootballResults(football.text, '', football.rev), 'stadium_football'),
    ...labelled(parseArenaConcerts(arena.text, '', arena.rev), 'arena_show'),
    ...labelled(parseArenaLiveEvents(arena.text, '', arena.rev), 'arena_show')
  ]

  const nights = runBacktest(daily, labels)
  const summary = summarizeBacktest(nights)
  const pct = (value: number | null): string => (value === null ? 'n/a' : `${(value * 100).toFixed(1)}%`)

  console.log(`revisions: stadium ${stadium.rev}, arena ${arena.rev}, football ${football.rev}`)
  console.log(`labelled show-nights: ${labels.length}`)
  console.log(`backtest nights: ${summary.n} (source: 48)`)
  console.log(`median absolute error: ${pct(summary.medianAe)} (source: 20%)`)
  console.log(`mean absolute error: ${pct(summary.meanAe)} (source: 28%)`)
  console.log(`in band: ${summary.inBand} of ${summary.n} (source: 26 of 48)`)
  console.log(`relerr p10/p90: ${summary.relP10?.toFixed(3) ?? 'n/a'} / ${summary.relP90?.toFixed(3) ?? 'n/a'}`)
  console.log(
    `SIG-7 baselines: 2026-11-04 ${baselineFor(daily, '2026-11-04')}, 2026-11-05 ${baselineFor(daily, '2026-11-05')}`
  )
  for (const night of nights) {
    const ae = night.relErr === null ? 'n/a' : `${(Math.abs(night.relErr) * 100).toFixed(1)}%`
    console.log(
      `${night.night}: forecast ${night.forecast} band ${night.bandLow}-${night.bandHigh} actual ${night.actual} ae ${ae} ${night.inBand ? 'in' : 'out'}`
    )
  }
}

if (import.meta.main) main()
