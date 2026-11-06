import { describe, expect, test } from 'bun:test'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import {
  dedupeShows,
  expandDates,
  parseArenaConcerts,
  parseArenaLiveEvents,
  parseFootballResults,
  parseStadiumConcerts,
  parseWikiResponse,
  runHistoryBuild,
  settleClass,
  stripWiki,
  wikiApiUrl,
  type HistoryBuildRow
} from './crowd-history.ts'

const fixtures = join(import.meta.dir, '..', '..', 'fixtures')
const stadiumText = JSON.parse(readFileSync(join(fixtures, 'bukit-jalil-stadium-20261106T1922Z.json'), 'utf8')).query
  .pages[0].revisions[0].slots.main.content as string
const arenaText = JSON.parse(readFileSync(join(fixtures, 'unifi-arena-20261106T1922Z.json'), 'utf8')).query.pages[0]
  .revisions[0].slots.main.content as string
const footballText = JSON.parse(readFileSync(join(fixtures, 'malaysia-results-20261106T1922Z.json'), 'utf8')).query
  .pages[0].revisions[0].slots.main.content as string

describe('MediaWiki plumbing', () => {
  test('builds the API URL for a title', () => {
    expect(wikiApiUrl('Unifi Arena')).toContain('titles=Unifi%20Arena')
  })

  test('reads revid, timestamp and wikitext', () => {
    const revision = parseWikiResponse(
      JSON.stringify({
        query: { pages: [{ revisions: [{ revid: 1, timestamp: 't', slots: { main: { content: 'x' } } }] }] }
      })
    )
    expect(revision).toEqual({ revId: 1, timestamp: 't', wikitext: 'x' })
  })

  test('rejects unusable shapes', () => {
    expect(() => parseWikiResponse('not json')).toThrow('not JSON')
    expect(() => parseWikiResponse('{}')).toThrow('no pages')
    expect(() => parseWikiResponse(JSON.stringify({ query: { pages: [{ revisions: [] }] } }))).toThrow('no revisions')
  })

  test('strips links, templates and refs', () => {
    expect(stripWiki('[[Jacky Cheung|Jacky]]')).toBe('Jacky')
    expect(stripWiki('[[Bukit Jalil]]')).toBe('Bukit Jalil')
    expect(stripWiki('{{ill|Soul Power II|zh|xxx}}')).toBe('xxx')
    expect(stripWiki('{{flagdeco|MAS}} Malaysia')).toBe('Malaysia')
    expect(stripWiki('a<ref>{{x|y}}</ref> b')).toBe('a b')
  })
})

describe('expandDates', () => {
  test('singles, ampersands and same-month ranges', () => {
    expect(expandDates('15 January 2023', null)).toEqual(['2023-01-15'])
    expect(expandDates('4 & 5 November 2026', null)).toEqual(['2026-11-04', '2026-11-05'])
    expect(expandDates('23–25 December 2023', null)).toEqual(['2023-12-23', '2023-12-24', '2023-12-25'])
  })

  test('comma ranges borrow the month, header years apply', () => {
    expect(expandDates('15–17, 22–24  August', 2025)).toEqual([
      '2025-08-15',
      '2025-08-16',
      '2025-08-17',
      '2025-08-22',
      '2025-08-23',
      '2025-08-24'
    ])
    expect(expandDates('12-13 April', 2025)).toEqual(['2025-04-12', '2025-04-13'])
    expect(expandDates('12-13 April', null)).toEqual([])
  })

  test('cross-month ranges walk day by day', () => {
    expect(expandDates('30 November–1 December 2024', null)).toEqual(['2024-11-30', '2024-12-01'])
  })
})

describe('stadium concerts', () => {
  test('carries rowspan dates and splits & nights', () => {
    const text = `== Entertainment uses ==
{| class="wikitable"
|+ Notable Music Performances at the National Stadium
! Date !! Main act(s) !! Tour / Concert Name !! Notes
|-
| 7 December 2019 || [[JJ Lin]] || Sanctuary ||
|-
|rowspan="2" |13 April 2019 || [[One Ok Rock]] || Eye of the Storm World Tour ||
|-
|| [[Ed Sheeran]] || ÷ Tour ||
|-
| 4 & 5 November 2026 || [[The Weeknd]] || After Hours til Dawn Tour ||
|}
== Sporting events ==`
    expect(parseStadiumConcerts(text, 'u', '1')).toEqual([
      { date: '2019-04-13', venue: 'stadium', show: 'One Ok Rock', sourceUrl: 'u', sourceRevision: '1' },
      { date: '2019-04-13', venue: 'stadium', show: 'Ed Sheeran', sourceUrl: 'u', sourceRevision: '1' },
      { date: '2019-12-07', venue: 'stadium', show: 'JJ Lin', sourceUrl: 'u', sourceRevision: '1' },
      { date: '2026-11-04', venue: 'stadium', show: 'The Weeknd', sourceUrl: 'u', sourceRevision: '1' },
      { date: '2026-11-05', venue: 'stadium', show: 'The Weeknd', sourceUrl: 'u', sourceRevision: '1' }
    ])
  })

  test('drops postponed rows', () => {
    const text = `== Entertainment uses ==
{| class="wikitable"
|-
|27 September 2026
|[[Post Malone]]
|BIG ASS World Tour{{refn|group="note"|Postponed}} ||
|}
== Sporting events ==`
    expect(parseStadiumConcerts(text, 'u', '1')).toEqual([])
  })

  test('on the capture: 39 nights, Weeknd and Siti present, Post Malone absent', () => {
    const shows = parseStadiumConcerts(stadiumText, 'u', '1381307107')
    expect(shows).toHaveLength(40)
    expect(shows.filter((show) => show.show === 'The Weeknd').map((show) => show.date)).toEqual([
      '2026-11-04',
      '2026-11-05'
    ])
    expect(shows.find((show) => show.date === '2026-01-10')?.show).toBe('Siti Nurhaliza')
    expect(shows.some((show) => show.date === '2026-09-27')).toBe(false)
    expect(shows.every((show) => show.sourceRevision === '1381307107')).toBe(true)
  })
})

describe('arena concerts', () => {
  test('tracks year headers and drops cancelled rows', () => {
    const text = `=== Live Concerts===
{| class="wikitable sortable"
! Date !! Main act(s) !! Tour / Concert Name !! Notes
|-
! colspan="4" |2025
|-
|12-13 April
|[[Zhou Shen]]
|x
|
|-
|- style="background:#eed4cf;"
| 18 January 2020 || [[Winner (band)|Winner]] || Cross Tour ||
|}
==References==`
    expect(parseArenaConcerts(text, 'u', '2')).toEqual([
      { date: '2025-04-12', venue: 'arena', show: 'Zhou Shen', sourceUrl: 'u', sourceRevision: '2' },
      { date: '2025-04-13', venue: 'arena', show: 'Zhou Shen', sourceUrl: 'u', sourceRevision: '2' }
    ])
  })

  test('on the capture: BABYMONSTER and 5SOS nights present, Seventeen 2020 absent', () => {
    const shows = parseArenaConcerts(arenaText, 'u', '1381135293')
    expect(shows).toHaveLength(135)
    expect(shows.find((show) => show.date === '2026-11-14')?.show).toBe('Babymonster')
    expect(shows.find((show) => show.date === '2026-11-17')?.show).toBe('5 Seconds of Summer')
    expect(shows.some((show) => show.show === 'Seventeen')).toBe(false)
  })
})

describe('arena live events', () => {
  test('keeps dated bullets, skips undated ones', () => {
    const text = `===Live Events===
*[[Gymnastics]] – [[1998 Commonwealth Games]]
*[[Manny Pacquiao vs. Lucas Matthysse]], 15 July 2018
* [[MLBB M6 World Championship]], 14 - 15 December 2024
=== Live Concerts===`
    expect(parseArenaLiveEvents(text, 'u', '3')).toEqual([
      {
        date: '2018-07-15',
        venue: 'arena',
        show: 'Manny Pacquiao vs. Lucas Matthysse',
        sourceUrl: 'u',
        sourceRevision: '3'
      },
      { date: '2024-12-14', venue: 'arena', show: 'MLBB M6 World Championship', sourceUrl: 'u', sourceRevision: '3' },
      { date: '2024-12-15', venue: 'arena', show: 'MLBB M6 World Championship', sourceUrl: 'u', sourceRevision: '3' }
    ])
  })

  test('on the capture: 30 nights led by awards and fight nights', () => {
    const shows = parseArenaLiveEvents(arenaText, 'u', '1381135293')
    expect(shows).toHaveLength(30)
    expect(shows.find((show) => show.date === '2025-02-15')?.show).toBe('Anugerah Juara Lagu 39')
  })
})

describe('football results', () => {
  test('keeps Bukit Jalil home nights only', () => {
    const text = `===2023===
{{football box collapsible
| date = 3 January 2023
| team1 = Malaysia {{flagdeco|MAS}}
| team2 = {{fb|SGP}}
| stadium = [[Bukit Jalil Stadium]]
}}
{{football box collapsible
| date = 10 January 2023
| team1 = {{fb-rt|THA}}
| team2 = {{flagdeco|MAS}} Malaysia
| stadium = [[Thammasat Stadium]]
}}`
    expect(parseFootballResults(text, 'u', '4')).toEqual([
      { date: '2023-01-03', venue: 'stadium', show: 'Malaysia vs Singapore', sourceUrl: 'u', sourceRevision: '4' }
    ])
  })

  test('on the capture: 14 Bukit Jalil nights with expanded country names', () => {
    const shows = parseFootballResults(footballText, 'u', '1378642889')
    expect(shows).toHaveLength(21)
    expect(shows.find((show) => show.date === '2025-09-04')?.show).toBe('Malaysia vs Singapore')
  })
})

describe('settleClass and dedupe', () => {
  test('fills class only on two agreeing labels', () => {
    expect(settleClass('arena_show', 'arena_show')).toBe('arena_show')
    expect(settleClass('arena_show', 'other')).toBe('')
    expect(settleClass('', '')).toBe('')
  })

  test('dedupes and sorts by night', () => {
    const show = { date: '2023-01-03', venue: 'stadium' as const, show: 'x', sourceUrl: 'u', sourceRevision: '1' }
    expect(dedupeShows([show, show])).toEqual([show])
  })
})

describe('runHistoryBuild', () => {
  test('writes one blank-labelled row per past show-night, never rewrites', () => {
    const bodies = ['stadium', 'arena', 'football']
    let calls = 0
    const stored: HistoryBuildRow[] = [
      {
        night_date: '2023-01-03',
        venue: 'stadium',
        show: 'Malaysia vs Singapore',
        class: 'x',
        source_url: 'u',
        source_revision: '1',
        label_a: 'x',
        label_b: 'x'
      }
    ]
    const appended: HistoryBuildRow[] = []
    const report = runHistoryBuild(
      {
        fetch: () => {
          const body = bodies[calls] ?? ''
          calls += 1
          return JSON.stringify({
            query: { pages: [{ revisions: [{ revid: calls, timestamp: 't', slots: { main: { content: body } } }] }] }
          })
        },
        readHistory: () => stored,
        appendHistory: (rows) => void appended.push(...rows)
      },
      '2023-01-04'
    )
    expect(report.revisions.map((revision) => revision.revId)).toEqual([1, 2, 3])
    expect(appended).toEqual([])
    expect(report.appended).toBe(0)
    expect(report.parsed).toBe(0)
  })

  test('on the captures: 109 past show-nights from 1 January 2023', () => {
    const bodies = [
      readFileSync(join(fixtures, 'bukit-jalil-stadium-20261106T1922Z.json'), 'utf8'),
      readFileSync(join(fixtures, 'unifi-arena-20261106T1922Z.json'), 'utf8'),
      readFileSync(join(fixtures, 'malaysia-results-20261106T1922Z.json'), 'utf8')
    ]
    let calls = 0
    const appended: HistoryBuildRow[] = []
    const report = runHistoryBuild(
      {
        fetch: () => bodies[calls++] ?? '',
        readHistory: () => [],
        appendHistory: (rows) => void appended.push(...rows)
      },
      '2026-11-07'
    )
    expect(report.revisions.map((revision) => revision.revId)).toEqual([1381307107, 1381135293, 1378642889])
    expect(report.appended).toBe(116)
    expect(appended).toHaveLength(116)
    expect(appended.every((row) => row.night_date >= '2023-01-01' && row.night_date < '2026-11-07')).toBe(true)
    expect(appended.every((row) => row.class === '' && row.label_a === '' && row.label_b === '')).toBe(true)
    const venues = appended.filter((row) => row.venue === 'stadium').length
    expect(venues).toBe(35)
  })
})
