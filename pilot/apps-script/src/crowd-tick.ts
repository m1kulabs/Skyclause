// The hourly Crowd forecast tick (#69): frozen forecasts, verdicts, shadow rows and
// crossing files. Pure except for the store ports; Apps Script and Drive stay in gas.ts.
import { toMytIso } from '../../shared/time.ts'
import {
  agreedClass,
  arrivalFromIso,
  assembleNight,
  baselineFor,
  exitToIso,
  forecastNight,
  nightIdOf,
  roundHalfUp,
  runBacktest,
  summarizeBacktest,
  SURGE_THRESHOLD,
  upliftSamples,
  verdictFor,
  type DailyExits,
  type HistoryClass,
  type HistoryLabel,
  type NightForecast,
  type NightListing,
  type NightVerdict
} from './crowd.ts'
import { newUuidV7 } from './jps.ts'
import type { Cell, Row } from './schema.ts'
import type { RawFile } from './sweep.ts'

export const SP17_SOURCE_ID = 'SP17'
export const RAPIDRAIL_KIND = 'rapidrail_od'
export const SP17_METRIC = 'sp17_exits'
// The newest night older than this makes the input stale (#68: 2-day staleness).
export const SP17_STALE_AFTER_MIN = 2880

export interface CrowdTickStore {
  readReadings(): Row<'readings'>[]
  readPolls(): Row<'polls'>[]
  readHistory(): Row<'history'>[]
  readListings(): Row<'listings'>[]
  readForecasts(): Row<'forecasts'>[]
  readClauses(): Pick<Row<'clauses'>, 'pack' | 'key' | 'threshold' | 'op' | 'enabled' | 'Proposes'>[]
  appendForecast(row: Row<'forecasts'>): void
  replaceCrowdShadow(rows: Row<'crowd_shadow'>[]): void
  crowdFiles(): RawFile[]
  writeCrowdFile(name: string, text: string): void
}

export interface CrowdTickReport {
  tEval: string
  forecastsAppended: string[]
  shadowRows: number
  crossingFile: string | null
  verdicts: Record<string, NightVerdict>
}

function cellText(cell: Cell | undefined): string {
  if (cell === undefined || cell === '' || cell === null) return ''
  if (cell instanceof Date) return Number.isNaN(cell.getTime()) ? '' : toMytIso(cell)
  return String(cell)
}

function cellNumber(cell: Cell | undefined): number | null {
  if (typeof cell === 'number' && Number.isFinite(cell)) return cell
  if (typeof cell === 'string' && cell.trim() !== '') {
    const parsed = Number(cell)
    return Number.isFinite(parsed) ? parsed : null
  }
  return null
}

function isTrue(cell: Cell | undefined): boolean {
  return cell === true || (typeof cell === 'string' && cell.trim().toUpperCase() === 'TRUE')
}

// Latest revision per night from the SP17 readings at or before tEval.
export function dailyFromReadings(readings: readonly Row<'readings'>[], tEval: string): DailyExits {
  const best = new Map<string, { value: number; revision: number }>()
  for (const row of readings) {
    if (cellText(row.source_id) !== SP17_SOURCE_ID) continue
    if (cellText(row.metric) !== SP17_METRIC) continue
    const observed = cellText(row.observed_at)
    if (!observed || observed > tEval) continue
    const night = observed.slice(0, 10)
    if (!/^\d{4}-\d{2}-\d{2}$/.test(night)) continue
    const value = cellNumber(row.value)
    if (value === null) continue
    const revisionRaw = cellNumber(row.revision)
    const revision = revisionRaw === null ? 0 : Math.floor(revisionRaw)
    const current = best.get(night)
    if (!current || revision >= current.revision) best.set(night, { value, revision })
  }
  return Object.fromEntries([...best].map(([night, entry]) => [night, entry.value]))
}

function newestObservedAt(readings: readonly Row<'readings'>[], tEval: string): string | null {
  let newest: string | null = null
  for (const row of readings) {
    if (cellText(row.source_id) !== SP17_SOURCE_ID || cellText(row.metric) !== SP17_METRIC) continue
    const observed = cellText(row.observed_at)
    if (!observed || observed > tEval) continue
    if (newest === null || observed > newest) newest = observed
  }
  return newest
}

function latestErrorReceivedAt(polls: readonly Row<'polls'>[]): string | null {
  let latest: string | null = null
  for (const row of polls) {
    if (cellText(row.source_id) !== SP17_SOURCE_ID) continue
    if (cellText(row.outcome) !== 'error') continue
    const received = cellText(row.received_at)
    if (!received) continue
    if (latest === null || received > latest) latest = received
  }
  return latest
}

function historyLabels(rows: readonly Row<'history'>[]): HistoryLabel[] {
  return rows.map((row) => ({
    date: cellText(row.night_date),
    cls: cellText(row.class),
    labelA: cellText(row.label_a),
    labelB: cellText(row.label_b)
  }))
}

function listingClasses(listings: readonly Row<'listings'>[]): { known: HistoryClass[]; unknownClass: boolean } {
  const known: HistoryClass[] = []
  let unknownClass = false
  for (const row of listings) {
    const cls = cellText(row.class)
    if (cls === 'stadium_concert' || cls === 'stadium_football' || cls === 'arena_show' || cls === 'other') {
      if (!known.includes(cls)) known.push(cls)
    } else unknownClass = true
  }
  return { known, unknownClass }
}

function toNightListing(row: Row<'listings'>): NightListing {
  return {
    listing_id: cellText(row.listing_id),
    venue: cellText(row.venue),
    show: cellText(row.show),
    doors: cellText(row.doors_myt),
    showTime: cellText(row.show_myt),
    showEnd: cellText(row.show_end_myt),
    singleSource: isTrue(row.single_source)
  }
}

function latestForecastFor(forecasts: readonly Row<'forecasts'>[], nightId: string): Row<'forecasts'> | null {
  let best: Row<'forecasts'> | null = null
  let bestAt = ''
  for (const row of forecasts) {
    if (cellText(row.night_id) !== nightId) continue
    const created = cellText(row.created_at)
    if (best === null || created >= bestAt) {
      best = row
      bestAt = created
    }
  }
  return best
}

// Previous verdict per night from the newest crossing file naming it; `normal` when none.
export function previousVerdicts(files: readonly RawFile[]): Record<string, NightVerdict> {
  const stamped: { scope: string; to: NightVerdict; tEval: string; crossingId: string }[] = []
  for (const file of files) {
    let parsed: unknown
    try {
      parsed = JSON.parse(file.text)
    } catch {
      continue
    }
    if (typeof parsed !== 'object' || parsed === null) continue
    const record = parsed as { pack?: unknown; t_eval?: unknown; crossing_id?: unknown; changes?: unknown }
    if (record.pack !== 'crowd' || typeof record.t_eval !== 'string' || !Array.isArray(record.changes)) continue
    for (const change of record.changes) {
      if (typeof change !== 'object' || change === null) continue
      const entry = change as { scope?: unknown; to?: unknown }
      if (typeof entry.scope !== 'string') continue
      const to: NightVerdict = entry.to === 'surge_night' || entry.to === 'no_call' ? entry.to : 'normal'
      stamped.push({
        scope: entry.scope,
        to,
        tEval: record.t_eval,
        crossingId: typeof record.crossing_id === 'string' ? record.crossing_id : ''
      })
    }
  }
  stamped.sort((a, b) => (a.tEval < b.tEval ? -1 : a.tEval > b.tEval ? 1 : a.crossingId < b.crossingId ? -1 : 1))
  const verdicts: Record<string, NightVerdict> = {}
  for (const entry of stamped) verdicts[entry.scope] = entry.to
  return verdicts
}

function crossingName(tEval: string, taken: Set<string>): { file: string; id: string } {
  const stamp = `${tEval.slice(0, 4)}${tEval.slice(5, 7)}${tEval.slice(8, 10)}-${tEval.slice(11, 13)}${tEval.slice(14, 16)}`
  for (let n = 1; n < 100; n++) {
    const nn = String(n).padStart(2, '0')
    const file = `crossing-${stamp}-${nn}.json`
    if (!taken.has(file)) return { file, id: `X-${stamp}-${nn}` }
  }
  throw new Error(`too many crowd crossing files for ${stamp}`)
}

interface NightInput {
  name: string
  value: number | string
  unit?: string
  source_id?: string
  observed_at?: string
  age_min?: number | string
  state?: string
}

interface CrossingChange {
  scope: string
  night: {
    night_id: string
    venue: string
    show: string
    doors_myt: string
    show_myt: string
    show_end_myt: string
    listing_ids: string[]
  }
  from: string
  to: string
  fired: string[]
  blocked: string[]
  inputs: NightInput[]
}

function readingBlocked(newest: string | null, latestError: string | null, tEvalMs: number): boolean {
  if (newest === null) return true
  if (latestError !== null && latestError > newest) return true
  return Math.max(0, Math.floor((tEvalMs - Date.parse(newest)) / 60_000)) > SP17_STALE_AFTER_MIN
}

export function runCrowdForecast(store: CrowdTickStore, now: Date, thresholdOverride?: number): CrowdTickReport {
  const tEvalMs = Math.floor(now.getTime() / 60_000) * 60_000
  const tEval = toMytIso(new Date(tEvalMs))
  const readings = store.readReadings()
  const polls = store.readPolls()
  const labels = historyLabels(store.readHistory())
  const forecasts = store.readForecasts()

  const daily = dailyFromReadings(readings, tEval)
  const newest = newestObservedAt(readings, tEval)
  const latestError = latestErrorReceivedAt(polls)
  const stale = readingBlocked(newest, latestError, tEvalMs)

  // The backtest has run once labelled history exists; its relerr percentiles switch
  // new rows to the relerr band (#69 G7).
  const summary = summarizeBacktest(runBacktest(daily, labels))
  const relErr =
    summary.relP10 !== null && summary.relP90 !== null ? { p10: summary.relP10, p90: summary.relP90 } : null

  const surgeClause = store
    .readClauses()
    .find((row) => row.pack === 'crowd' && row.key === 'surge_night' && cellText(row.enabled).toUpperCase() !== 'FALSE')
  const clauseThreshold = cellNumber(surgeClause?.threshold)
  const threshold =
    thresholdOverride ??
    (surgeClause && clauseThreshold !== null && cellText(surgeClause.op) === '>=' ? clauseThreshold : SURGE_THRESHOLD)
  const proposes = new Map(store.readClauses().map((row) => [cellText(row.key), cellText(row.Proposes)] as const))
  const propose = (key: string, fallback: string): string => proposes.get(key) || fallback

  const byNight = new Map<string, Row<'listings'>[]>()
  for (const row of store.readListings()) {
    if (cellText(row.state) !== 'listed') continue
    const night = cellText(row.night_date)
    if (!/^\d{4}-\d{2}-\d{2}$/.test(night)) continue
    const group = byNight.get(night) ?? []
    group.push(row)
    byNight.set(night, group)
  }

  const previous = previousVerdicts(store.crowdFiles())
  const report: CrowdTickReport = { tEval, forecastsAppended: [], shadowRows: 0, crossingFile: null, verdicts: {} }
  const changes: CrossingChange[] = []
  const shadow: Row<'crowd_shadow'>[] = []

  for (const [night, rows] of [...byNight].sort(([a], [b]) => (a < b ? -1 : 1))) {
    const nightId = nightIdOf(night)
    const listings = rows
      .slice()
      .sort((a, b) => (cellText(a.listing_id) < cellText(b.listing_id) ? -1 : 1))
      .map(toNightListing)
    const assembled = assembleNight(listings, night)
    const arrivalMs = Date.parse(assembled.arrivalFrom)
    const frozen = arrivalMs <= tEvalMs
    const { known, unknownClass } = listingClasses(rows)

    let uplift: number | null
    let verdict: NightVerdict
    let blocked: string[]
    let computed: NightForecast | null
    const latest = latestForecastFor(forecasts, nightId)
    if (frozen) {
      // Arrival started: no new row. The verdict stands on the latest frozen forecast.
      computed = null
      uplift = latest ? cellNumber(latest.uplift) : null
      if (latest !== null) blocked = []
      else blocked = stale ? ['rapidrail_od', 'forecast'] : ['forecast']
      verdict = verdictFor(uplift, blocked, threshold)
    } else if (stale) {
      // Stale or erroring readings: no values are asserted, so the blocked input is rapidrail_od.
      computed = null
      uplift = null
      blocked = ['rapidrail_od']
      verdict = 'no_call'
    } else {
      computed = forecastNight(daily, labels, known, night, relErr)
      uplift = computed.uplift
      blocked = []
      if (computed.baseline === null) blocked.push('baseline')
      if (computed.uplift === null) blocked.push('uplift')
      if (unknownClass) blocked.push('class')
      verdict = verdictFor(computed.uplift, blocked, threshold)
    }

    if (!frozen) {
      const listingIds = JSON.stringify(assembled.listingIds)
      const same =
        latest !== null &&
        cellNumber(latest.baseline) === (computed?.baseline ?? null) &&
        cellNumber(latest.uplift) === (computed?.uplift ?? null) &&
        cellNumber(latest.forecast) === (computed?.forecast ?? null) &&
        cellNumber(latest.band_low) === (computed?.bandLow ?? null) &&
        cellNumber(latest.band_high) === (computed?.bandHigh ?? null) &&
        cellText(latest.listing_ids) === listingIds
      if (!same) {
        store.appendForecast({
          forecast_id: newUuidV7(now),
          night_id: nightId,
          listing_ids: listingIds,
          baseline: computed?.baseline ?? '',
          uplift: computed?.uplift ?? '',
          forecast: computed?.forecast ?? '',
          band_low: computed?.bandLow ?? '',
          band_high: computed?.bandHigh ?? '',
          band_method: computed?.bandMethod ?? 'uplift_p10_p90',
          created_at: tEval,
          provenance: `hourly forecast tick, entered ${tEval.slice(0, 10)}`
        })
        report.forecastsAppended.push(nightId)
      }
    }

    report.verdicts[nightId] = verdict
    const from = previous[nightId] ?? 'normal'
    const inputState =
      newest === null ? 'stale' : latestError !== null && latestError > newest ? 'error' : stale ? 'stale' : 'fresh'
    const ageMin = newest === null ? '' : Math.max(0, Math.floor((tEvalMs - Date.parse(newest)) / 60_000))
    if (from !== verdict) {
      const inputs: NightInput[] = []
      const baseline = computed?.baseline ?? cellNumber(latest?.baseline)
      const upliftValue = computed?.uplift ?? cellNumber(latest?.uplift)
      const forecastValue = computed?.forecast ?? cellNumber(latest?.forecast)
      const bandLow = computed?.bandLow ?? cellNumber(latest?.band_low)
      const bandHigh = computed?.bandHigh ?? cellNumber(latest?.band_high)
      for (const [name, value] of [
        ['site.night.baseline', baseline],
        ['site.night.uplift', upliftValue],
        ['site.night.forecast', forecastValue],
        ['site.night.band_low', bandLow],
        ['site.night.band_high', bandHigh]
      ] as const) {
        if (value === null || value === undefined) continue
        inputs.push({
          name,
          value,
          unit: 'exits',
          source_id: SP17_SOURCE_ID,
          observed_at: newest ?? '',
          age_min: ageMin,
          state: inputState
        })
      }
      inputs.push({
        name: 'site.night.arrival_from',
        value: assembled.arrivalFrom,
        unit: 'time-myt',
        source_id: 'listings',
        observed_at: tEval,
        age_min: 0,
        state: 'fresh'
      })
      if (assembled.exitTo !== null) {
        inputs.push({
          name: 'site.night.exit_to',
          value: assembled.exitTo,
          unit: 'time-myt',
          source_id: 'listings',
          observed_at: tEval,
          age_min: 0,
          state: 'fresh'
        })
      }
      changes.push({
        scope: nightId,
        night: {
          night_id: nightId,
          venue: assembled.venue,
          show: assembled.show,
          doors_myt: assembled.doors,
          show_myt: assembled.showTime,
          show_end_myt: assembled.showEnd,
          listing_ids: assembled.listingIds
        },
        from,
        to: verdict,
        fired: verdict === 'surge_night' ? ['surge_night'] : [],
        blocked,
        inputs
      })
    }

    const firedKeys: string[] = []
    if (verdict === 'surge_night') firedKeys.push('surge_night')
    if (listings.some((listing) => listing.singleSource)) firedKeys.push('single_source_listing')
    const silent = blocked.includes('rapidrail_od')
    if (silent) firedKeys.push('silent_input')
    const recommendations = firedKeys
      .map((key) =>
        propose(
          key,
          key === 'surge_night'
            ? 'Surge night; an entry on the conditions calendar'
            : key === 'single_source_listing'
              ? 'Flag it in the bundle; the approver confirms'
              : 'No call for clauses needing it'
        )
      )
      .join('; ')
    const clauseCell = (key: string, fired: boolean): string =>
      fired ? 'fired' : blocked.length > 0 ? `blocked:${blocked[0] ?? 'rapidrail_od'}` : 'not'
    shadow.push({
      scope: nightId,
      surge_night: clauseCell('surge_night', verdict === 'surge_night'),
      arrival_clash: 'not',
      exit_clash: 'not',
      after_last_shuttle: 'not',
      single_source_listing: clauseCell('single_source_listing', firedKeys.includes('single_source_listing')),
      silent_input: clauseCell('silent_input', silent),
      verdict,
      recommendations,
      blocked_inputs: JSON.stringify(blocked),
      snapshot_id: tEval
    })
  }

  store.replaceCrowdShadow(shadow)
  report.shadowRows = shadow.length

  if (changes.length > 0) {
    const taken = new Set(store.crowdFiles().map((file) => file.name))
    const { file, id } = crossingName(tEval, taken)
    store.writeCrowdFile(
      file,
      JSON.stringify(
        {
          crossing_id: id,
          pack: 'crowd',
          replay: false,
          t_eval: tEval,
          snapshot_id: tEval,
          changes
        },
        null,
        2
      )
    )
    report.crossingFile = file
  }
  return report
}

// The two frozen Weeknd forecasts, recorded with their written-at times and the
// Fanfall source idea as provenance (#69, decision 17). Idempotent: a rerun that
// finds the night and written-at time adds nothing, and no crossing is written.
export interface WeekndReport {
  appended: string[]
  skipped: string[]
}

const WEEKND_ROWS: {
  nightId: string
  listingIds: string[]
  baseline: number
  uplift: number
  forecast: number
  bandLow: number
  bandHigh: number
  createdAt: string
}[] = [
  {
    nightId: 'N-20261104',
    listingIds: ['L-20261104-stadium-the-weeknd'],
    baseline: 3928,
    uplift: 23116,
    forecast: 27044,
    bandLow: 19315,
    bandHigh: 32100,
    createdAt: '2026-11-04T01:07:00+08:00'
  },
  {
    nightId: 'N-20261105',
    listingIds: ['L-20261105-stadium-the-weeknd'],
    baseline: 3881,
    uplift: 23116,
    forecast: 26997,
    bandLow: 19268,
    bandHigh: 32053,
    createdAt: '2026-11-05T07:25:00+08:00'
  }
]

export function recordWeekndForecasts(store: Pick<CrowdTickStore, 'readForecasts' | 'appendForecast'>): WeekndReport {
  const report: WeekndReport = { appended: [], skipped: [] }
  const existing = store.readForecasts()
  for (const row of WEEKND_ROWS) {
    const present = existing.some(
      (candidate) => cellText(candidate.night_id) === row.nightId && cellText(candidate.created_at) === row.createdAt
    )
    if (present) {
      report.skipped.push(row.nightId)
      continue
    }
    store.appendForecast({
      forecast_id: newUuidV7(new Date(row.createdAt)),
      night_id: row.nightId,
      listing_ids: JSON.stringify(row.listingIds),
      baseline: row.baseline,
      uplift: row.uplift,
      forecast: row.forecast,
      band_low: row.bandLow,
      band_high: row.bandHigh,
      band_method: 'uplift_p10_p90',
      created_at: row.createdAt,
      provenance: `Fanfall source idea, entered ${row.createdAt.slice(0, 10)}`
    })
    report.appended.push(row.nightId)
  }
  return report
}
