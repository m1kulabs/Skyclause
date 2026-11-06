// Crowd history from Wikipedia (#69): the stadium, arena and national football team
// results pages through the MediaWiki API become one `history` row per past show-night.
// Pure functions only; the Apps Script one-off in main.ts wires fetch and the sheets.
import type { HistoryClass } from './crowd.ts'
import type { Cell } from './schema.ts'

export type ComplexVenue = 'stadium' | 'arena'

// One parsed show-night before sheet mapping.
export interface ParsedShow {
  date: string
  venue: ComplexVenue
  show: string
  sourceUrl: string
  sourceRevision: string
}

export interface HistoryBuildRow {
  night_date: string
  venue: string
  show: string
  class: string
  source_url: string
  source_revision: string
  label_a: string
  label_b: string
}

export interface WikiPage {
  venue: ComplexVenue | 'football'
  title: string
  url: string
}

export const WIKI_PAGES: WikiPage[] = [
  {
    venue: 'stadium',
    title: 'Bukit Jalil National Stadium',
    url: 'https://en.wikipedia.org/wiki/Bukit_Jalil_National_Stadium'
  },
  { venue: 'arena', title: 'Unifi Arena', url: 'https://en.wikipedia.org/wiki/Unifi_Arena' },
  {
    venue: 'football',
    title: 'Malaysia national football team results (2020–present)',
    url: 'https://en.wikipedia.org/wiki/Malaysia_national_football_team_results_(2020%E2%80%93present)'
  }
]

export function wikiApiUrl(title: string): string {
  return `https://en.wikipedia.org/w/api.php?action=query&prop=revisions&rvprop=ids%7Ctimestamp%7Ccontent&rvslots=main&format=json&formatversion=2&titles=${encodeURIComponent(title)}`
}

export interface WikiRevision {
  revId: number
  timestamp: string
  wikitext: string
}

// The MediaWiki response shape the builder reads; anything else is a schema error,
// never silently an empty history.
export function parseWikiResponse(body: string): WikiRevision {
  let parsed: unknown
  try {
    parsed = JSON.parse(body)
  } catch {
    throw new Error('the MediaWiki response is not JSON')
  }
  if (typeof parsed !== 'object' || parsed === null) throw new Error('the MediaWiki response is not an object')
  const pages = (parsed as { query?: { pages?: unknown } }).query?.pages
  if (!Array.isArray(pages) || pages.length === 0) throw new Error('the MediaWiki response has no pages')
  const revisions = (pages[0] as { revisions?: unknown }).revisions
  if (!Array.isArray(revisions) || revisions.length === 0) throw new Error('the MediaWiki response has no revisions')
  const first = revisions[0] as { revid?: unknown; timestamp?: unknown; slots?: unknown }
  const content = (first.slots as { main?: { content?: unknown } } | undefined)?.main?.content
  if (typeof first.revid !== 'number' || typeof first.timestamp !== 'string' || typeof content !== 'string') {
    throw new Error('the MediaWiki revision is missing revid, timestamp or content')
  }
  return { revId: first.revid, timestamp: first.timestamp, wikitext: content }
}

function stripRefs(text: string): string {
  return text.replace(/<ref[^>]*>.*?<\/ref>/gis, '').replace(/<ref[^/]*\/>/gi, '')
}

// Innermost-first template removal, so nested templates collapse fully.
function stripTemplates(text: string): string {
  let out = text
  for (let round = 0; round < 20; round++) {
    const next = out.replace(/\{\{[^{}]*\}\}/g, (match) => {
      const inner = match.slice(2, -2)
      if (/^(flagdeco|flagicon)/i.test(inner.trim())) return ''
      const parts = inner.split('|')
      return (parts[parts.length - 1] ?? '').trim()
    })
    if (next === out) return out
    out = next
  }
  return out
}

export function stripWiki(text: string): string {
  return stripTemplates(stripRefs(text))
    .replace(/\[\[([^|\]]+)\|([^\]]+)\]\]/g, '$2')
    .replace(/\[\[([^\]]+)\]\]/g, '$1')
    .replace(/'''?/g, '')
    .replace(/<[^>]+>/g, '')
    .replace(/\s+/g, ' ')
    .trim()
}

const MONTHS: Record<string, number> = {
  january: 1,
  february: 2,
  march: 3,
  april: 4,
  may: 5,
  june: 6,
  july: 7,
  august: 8,
  september: 9,
  october: 10,
  november: 11,
  december: 12
}

function toDate(year: number, month: number, day: number): string | null {
  if (!Number.isInteger(year) || !Number.isInteger(month) || !Number.isInteger(day)) return null
  if (month < 1 || month > 12 || day < 1 || day > 31) return null
  const iso = `${String(year).padStart(4, '0')}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`
  const check = new Date(`${iso}T00:00:00Z`)
  if (check.getUTCFullYear() !== year || check.getUTCMonth() + 1 !== month || check.getUTCDate() !== day) return null
  return iso
}

interface DayMonth {
  day: number
  month: number | null
  year: number | null
}

function parseDayMonth(part: string): DayMonth | null {
  const match = /(\d{1,2})(?:st|nd|rd|th)?\s*([A-Za-z]+)?(?:\s+(\d{4}))?/.exec(part.trim())
  if (!match) return null
  const month = match[2]?.toLowerCase()
  return {
    day: Number(match[1]),
    month: month ? (MONTHS[month] ?? null) : null,
    year: match[3] ? Number(match[3]) : null
  }
}

// Expand one date cell to nights: `4 & 5 November 2026`, `23–25 December 2023`,
// `15–17, 22–24 August`, `30 November–1 December 2024`, each `12-13 April` under a
// year header. Dateless parts borrow the nearest month and year in the cell.
export function expandDates(cell: string, headerYear: number | null): string[] {
  const normalized = cell.replace(/[–—]/g, '-').trim()
  if (!normalized) return []
  const years = [...normalized.matchAll(/\d{4}/g)].map((match) => Number(match[0]))
  const months = [...normalized.toLowerCase().matchAll(/[a-z]+/g)]
    .map((match) => MONTHS[match[0]] ?? null)
    .filter((month): month is number => month !== null)
  const fallbackYear = years[years.length - 1] ?? headerYear
  if (fallbackYear === null || fallbackYear === undefined) return []
  const out: string[] = []
  const pushRange = (from: DayMonth, to: DayMonth | null, month: number | null, year: number | null): void => {
    const startMonth = from.month ?? to?.month ?? month
    const startYear = from.year ?? to?.year ?? year
    if (startMonth === null || startMonth === undefined || startYear === null || startYear === undefined) return
    const endMonth = to?.month ?? startMonth
    // A December-to-January range with no explicit years rolls into next year.
    const endYear = to?.year ?? (endMonth < startMonth ? startYear + 1 : startYear)
    const endDay = to ? to.day : from.day
    // Walk day by day so cross-month ranges like 30 November–1 December work.
    let cursor = toDate(startYear, startMonth, from.day)
    for (let step = 0; step < 62 && cursor; step++) {
      if (!out.includes(cursor)) out.push(cursor)
      if (cursor === toDate(endYear, endMonth, endDay)) break
      const next = new Date(Date.parse(`${cursor}T00:00:00Z`) + 86_400_000).toISOString().slice(0, 10)
      if (next <= cursor) break
      cursor = next
    }
  }
  for (const chunk of normalized.split(',')) {
    const ampParts = chunk.split('&').map((part) => part.trim())
    if (ampParts.length > 1) {
      const parsed = ampParts.map((part) => parseDayMonth(part))
      if (parsed.some((part) => part === null)) continue
      const items = parsed as DayMonth[]
      const last = items[items.length - 1] as DayMonth
      for (const item of items) pushRange(item, null, last.month ?? months[months.length - 1] ?? null, fallbackYear)
      continue
    }
    const dash = chunk.split('-').map((part) => part.trim())
    if (dash.length > 2) continue
    const from = parseDayMonth(dash[0] ?? '')
    const to = dash.length === 2 ? parseDayMonth(dash[1] ?? '') : null
    if (!from || (dash.length === 2 && !to)) continue
    pushRange(from, to, months[months.length - 1] ?? null, fallbackYear)
  }
  return out.sort()
}

// Split a wikitable section into its row chunks, keeping each `|-` separator line
// with the row it opens so cancelled markers survive.
function tableRows(section: string): { separator: string; body: string }[] {
  const parts = section.split(/^(\|-[^\n]*)$/gm)
  const rows: { separator: string; body: string }[] = []
  for (let index = 1; index + 1 < parts.length; index += 2) {
    rows.push({ separator: parts[index] ?? '', body: parts[index + 1] ?? '' })
  }
  return rows
}

// Cell texts of one row chunk: `||` and per-line `|` forms, with `rowspan`-style
// attributes dropped.
function rowCells(body: string): string[] {
  const cells: string[] = []
  for (const line of body.split('\n')) {
    const trimmed = line.trim()
    if (!trimmed || trimmed.startsWith('|}') || trimmed.startsWith('|+') || trimmed.startsWith('!')) {
      const header = /^!\s*colspan="\d+"\s*\|(.*)$/.exec(trimmed)
      if (header) cells.push(`YEAR:${header[1]?.trim() ?? ''}`)
      continue
    }
    if (!trimmed.startsWith('|')) continue
    // Split on `||` first so a leading `||` keeps its empty first cell (rowspan
    // continuations inherit the date); strip one `|` from single-pipe lines.
    const parts = trimmed.startsWith('||') ? trimmed.split('||') : trimmed.replace(/^\|/, '').split('||')
    for (const cell of parts) {
      const attr = /^\s*[a-z]+\s*=\s*"[^"]*"\s*\|(.*)$/is.exec(cell)
      cells.push((attr?.[1] ?? cell).trim())
    }
  }
  return cells
}

function sectionBetween(wikitext: string, from: string, to: string): string {
  const start = wikitext.indexOf(from)
  if (start === -1) return ''
  const end = wikitext.indexOf(to, start + from.length)
  return wikitext.slice(start, end === -1 ? undefined : end)
}

function isCancelled(separator: string, rowText: string): boolean {
  return /eed4cf/i.test(separator) || /cancel/i.test(rowText)
}

function isPostponed(rowText: string): boolean {
  return /postponed/i.test(rowText)
}

// The stadium's "Notable Music Performances" table: every row is a stadium concert.
export function parseStadiumConcerts(wikitext: string, sourceUrl: string, sourceRevision: string): ParsedShow[] {
  const section = sectionBetween(wikitext, '== Entertainment uses ==', '== Sporting events ==')
  const shows: ParsedShow[] = []
  let carriedDate = ''
  for (const { body } of tableRows(section)) {
    const cells = rowCells(body)
    if (cells.length === 0 || cells.some((cell) => cell.startsWith('YEAR:'))) continue
    if (isPostponed(body)) continue
    const dateCell = stripWiki(cells[0] ?? '')
    const dateText = dateCell || carriedDate
    if (dateCell) carriedDate = dateCell
    const act = stripWiki(cells[1] ?? '')
    if (!dateText || !act) continue
    for (const date of expandDates(dateText, null)) {
      shows.push({ date, venue: 'stadium', show: act, sourceUrl, sourceRevision })
    }
  }
  return dedupeShows(shows)
}

// The arena's "Live Concerts" table: every row is an arena show under a year header.
export function parseArenaConcerts(wikitext: string, sourceUrl: string, sourceRevision: string): ParsedShow[] {
  const section = sectionBetween(wikitext, '=== Live Concerts===', '==References==')
  const shows: ParsedShow[] = []
  let year: number | null = null
  for (const { separator, body } of tableRows(section)) {
    const cells = rowCells(body)
    const yearCell = cells.find((cell) => cell.startsWith('YEAR:'))
    if (yearCell) {
      const parsed = Number(yearCell.slice('YEAR:'.length).trim())
      year = Number.isInteger(parsed) ? parsed : year
      continue
    }
    if (cells.length === 0 || isCancelled(separator, body)) continue
    const dateText = stripWiki(cells[0] ?? '')
    const act = stripWiki(cells[1] ?? '')
    if (!dateText || !act) continue
    for (const date of expandDates(dateText, year)) {
      shows.push({ date, venue: 'arena', show: act, sourceUrl, sourceRevision })
    }
  }
  return dedupeShows(shows)
}

// The arena's "Live Events" bullets with a trailing date: awards, expos, fight nights.
export function parseArenaLiveEvents(wikitext: string, sourceUrl: string, sourceRevision: string): ParsedShow[] {
  const section = sectionBetween(wikitext, '===Live Events===', '=== Live Concerts===')
  const shows: ParsedShow[] = []
  for (const line of section.split('\n')) {
    const trimmed = line.trim()
    if (!trimmed.startsWith('*')) continue
    const text = stripWiki(trimmed.replace(/^\*\s*/, ''))
    const dateMatch =
      /,?\s*(\d{1,2}(?:st|nd|rd|th)?(?:\s*[-–—&]\s*\d{1,2}(?:st|nd|rd|th)?)?\s+[A-Za-z]+\s+\d{4}|\d{1,2}(?:st|nd|rd|th)?\s*[-–—]\s*\d{1,2}(?:st|nd|rd|th)?\s+[A-Za-z]+\s+\d{4})\s*$/.exec(
        text
      )
    if (!dateMatch) continue
    const show = text.slice(0, dateMatch.index).replace(/,\s*$/, '').trim()
    if (!show) continue
    for (const date of expandDates(dateMatch[1] ?? '', null)) {
      shows.push({ date, venue: 'arena', show, sourceUrl, sourceRevision })
    }
  }
  return dedupeShows(shows)
}

// Split the brace-nested football boxes; the page mixes `footballbox` and `football box`.
function footballBoxes(wikitext: string): string[] {
  const boxes: string[] = []
  const starts: number[] = []
  for (const variant of ['{{footballbox collapsible', '{{football box collapsible']) {
    let index = wikitext.indexOf(variant)
    while (index !== -1) {
      starts.push(index)
      index = wikitext.indexOf(variant, index + 1)
    }
  }
  starts.sort((a, b) => a - b)
  for (const index of starts) {
    let depth = 0
    let cursor = index
    while (cursor < wikitext.length) {
      if (wikitext.startsWith('{{', cursor)) {
        depth += 1
        cursor += 2
      } else if (wikitext.startsWith('}}', cursor)) {
        depth -= 1
        cursor += 2
        if (depth === 0) break
      } else cursor += 1
    }
    boxes.push(wikitext.slice(index, cursor))
  }
  return boxes
}

function boxField(box: string, name: string): string {
  const match = new RegExp(`\\|\\s*${name}\\s*=\\s*(.*)`).exec(box)
  return expandTeamCode(stripWiki(match?.[1]?.split('\n')[0] ?? ''))
}

// The `{{fb|…}}` templates carry FIFA trigrammes; expand the ones this page uses so
// the show names read as countries. Unknown codes pass through as written.
const TEAM_CODES: Record<string, string> = {
  BAN: 'Bangladesh',
  BHR: 'Bahrain',
  BRU: 'Brunei',
  CPV: 'Cape Verde',
  IND: 'India',
  KGZ: 'Kyrgyzstan',
  LAO: 'Laos',
  LBN: 'Lebanon',
  MAS: 'Malaysia',
  NEP: 'Nepal',
  OMN: 'Oman',
  PHI: 'Philippines',
  SGP: 'Singapore',
  SIN: 'Singapore',
  THA: 'Thailand',
  TJK: 'Tajikistan',
  TKM: 'Turkmenistan',
  TLS: 'Timor-Leste',
  TPE: 'Chinese Taipei',
  VIE: 'Vietnam'
}

function expandTeamCode(name: string): string {
  const trimmed = name.trim()
  if (/^[A-Z]{3}$/.test(trimmed)) return TEAM_CODES[trimmed] ?? trimmed
  return trimmed
}

// Home internationals at the complex: Malaysia on either side, stadium naming Bukit Jalil.
export function parseFootballResults(wikitext: string, sourceUrl: string, sourceRevision: string): ParsedShow[] {
  const shows: ParsedShow[] = []
  for (const box of footballBoxes(wikitext)) {
    const stadium = boxField(box, 'stadium')
    if (!stadium.includes('Bukit Jalil')) continue
    const dateText = boxField(box, 'date')
    const team1 = boxField(box, 'team1')
      .replace(/\s+Malaysia\s*$/, 'Malaysia')
      .trim()
    const team2 = boxField(box, 'team2')
      .replace(/\s+Malaysia\s*$/, 'Malaysia')
      .trim()
    if (!dateText || !team1 || !team2) continue
    if (!/malaysia/i.test(`${team1} ${team2}`)) continue
    for (const date of expandDates(dateText, null)) {
      shows.push({ date, venue: 'stadium', show: `${team1} vs ${team2}`, sourceUrl, sourceRevision })
    }
  }
  return dedupeShows(shows)
}

export function dedupeShows(shows: readonly ParsedShow[]): ParsedShow[] {
  const seen = new Set<string>()
  const out: ParsedShow[] = []
  for (const show of [...shows].sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0))) {
    const key = `${show.date}|${show.venue}|${show.show}`
    if (seen.has(key)) continue
    seen.add(key)
    out.push(show)
  }
  return out
}

// Class when both labels agree, blank otherwise; the tick fills it after labelling.
export function settleClass(labelA: string, labelB: string): HistoryClass | '' {
  const label = labelA.trim()
  if (!label || label !== labelB.trim()) return ''
  return (['stadium_concert', 'stadium_football', 'arena_show', 'other'] as const).includes(label as HistoryClass)
    ? (label as HistoryClass)
    : ''
}

export interface HistoryBuildPorts {
  fetch(url: string): string
  readHistory(): { night_date: Cell; venue: Cell; show: Cell }[]
  appendHistory(rows: HistoryBuildRow[]): void
}

export interface HistoryBuildReport {
  revisions: { page: string; revId: number; timestamp: string }[]
  parsed: number
  appended: number
  today: string
}

// The one-off history build: current revisions of the three pages become one row per
// past show-night from 1 January 2023. Labels stay blank for the two-teammate pass;
// existing nights are never rewritten.
export function runHistoryBuild(ports: HistoryBuildPorts, today: string, from = '2023-01-01'): HistoryBuildReport {
  const revisions: HistoryBuildReport['revisions'] = []
  const parsed: ParsedShow[] = []
  for (const page of WIKI_PAGES) {
    const body = ports.fetch(wikiApiUrl(page.title))
    const revision = parseWikiResponse(body)
    revisions.push({ page: page.title, revId: revision.revId, timestamp: revision.timestamp })
    const args = [revision.wikitext, page.url, String(revision.revId)] as const
    if (page.venue === 'stadium') parsed.push(...parseStadiumConcerts(...args))
    else if (page.venue === 'arena') parsed.push(...parseArenaConcerts(...args), ...parseArenaLiveEvents(...args))
    else parsed.push(...parseFootballResults(...args))
  }
  const existing = new Set(
    ports
      .readHistory()
      .map((row) => `${String(row.night_date ?? '')}|${String(row.venue ?? '')}|${String(row.show ?? '')}`)
  )
  const fresh = dedupeShows(parsed).filter((show) => show.date >= from && show.date < today)
  const rows: HistoryBuildRow[] = fresh
    .filter((show) => !existing.has(`${show.date}|${show.venue}|${show.show}`))
    .map((show) => ({
      night_date: show.date,
      venue: show.venue,
      show: show.show,
      class: '',
      source_url: show.sourceUrl,
      source_revision: show.sourceRevision,
      label_a: '',
      label_b: ''
    }))
  if (rows.length > 0) ports.appendHistory(rows)
  return { revisions, parsed: fresh.length, appended: rows.length, today }
}
