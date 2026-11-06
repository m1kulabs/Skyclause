// The fallback runner (#68): polls the Rapid Rail metadata, reduces the yearly
// parquet to one SP17 exits count per night, and posts through `pi_rows`.
// Runs on the Pi (scheduled by #72) and on GitHub Actions (`ridership.yml`),
// which takes over when the Pi kill criterion fires.
import { brotliDecompressSync, gunzipSync } from 'node:zlib'
import { readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { decompress as zstdDecompress } from 'fzstd'
import { parquetMetadata, parquetReadObjects } from 'hyparquet'
import {
  blankState,
  buildNote,
  checkPostResult,
  coveredNight,
  EXPECTED_COLUMNS,
  mytToday,
  nightsToPost,
  parseMetadata,
  pendingLine,
  reduceNightlies,
  rememberPosted,
  type NightTotal,
  type PiRow,
  type PiRowsPost,
  type RidershipState
} from './ridership.ts'

export const METADATA_URL =
  'https://raw.githubusercontent.com/data-gov-my/datagovmy-meta/main/data-catalogue/ridership_od_rapidrail_daily.json'

// ZSTD for the 2023, 2024 and 2026 editions, BROTLI for 2025, GZIP in case a
// future edition switches, SNAPPY through hyparquet's own decoder. All run in
// plain `bun` and in the cross-compiled Pi binary: no native addons.
const compressors = {
  ZSTD: (input: Uint8Array) => zstdDecompress(input),
  BROTLI: (input: Uint8Array) => brotliDecompressSync(input),
  GZIP: (input: Uint8Array) => gunzipSync(input)
}

export function parquetUrl(year: number): string {
  return `https://storage.data.gov.my/transportation/rail/rapidrail_${year}_daily.parquet`
}

// The parquet rows as named records for the reducer. A missing column is a
// schema error naming it, before any row is read.
export async function readParquetRecords(
  buffer: ArrayBuffer
): Promise<{ records: Record<string, unknown>[] } | { schemaError: string }> {
  const meta = parquetMetadata(buffer)
  const names = new Set(meta.schema.map((element) => element.name))
  const missing = EXPECTED_COLUMNS.filter((column) => !names.has(column))
  if (missing.length > 0) return { schemaError: `column "${missing[0]}" is missing or renamed` }
  const records = (await parquetReadObjects({ file: buffer, columns: [...EXPECTED_COLUMNS], compressors })) as Record<
    string,
    unknown
  >[]
  return { records }
}

export interface FetchResult {
  status: number
  text: () => Promise<string>
  arrayBuffer: () => Promise<ArrayBuffer>
  headers: { get(name: string): string | null }
}

export interface RunDeps {
  fetchFn: (url: string) => Promise<FetchResult>
  readParquet: (buffer: ArrayBuffer) => Promise<{ records: Record<string, unknown>[] } | { schemaError: string }>
  postFn: (url: string, token: string, body: PiRowsPost) => Promise<unknown>
  loadState: () => RidershipState
  saveState: (state: RidershipState) => void
  randomId: () => string
  nowMs: () => number
  log: (line: string) => void
  summary: (line: string) => void
}

export interface RunOptions {
  runner: string
  deviceId: string
  ingestUrl: string
  token: string
  backfill: boolean
  start: string
  end: string | null
}

// The newest night the file must already cover on a scheduled run: yesterday.
// The schedule starts at 12:00 MYT on D+1, and the file for D lands in the
// afternoon, so before then the run posts the week ending in D-1.
function targetNight(nowMs: number): string {
  const today = mytToday(nowMs)
  return new Date(Date.parse(`${today}T00:00:00Z`) - 86_400_000).toISOString().slice(0, 10)
}

function mytIso(nowMs: number): string {
  return new Date(nowMs + 8 * 60 * 60 * 1_000).toISOString().slice(0, 19) + '+08:00'
}

async function readText(response: FetchResult, what: string): Promise<string> {
  if (response.status !== 200) throw new Error(`${what} returned HTTP ${response.status}`)
  return response.text()
}

// One scheduled attempt: post the newest nights when the file covers last night,
// otherwise log the pending line and post nothing.
export async function runOnce(deps: RunDeps, options: RunOptions): Promise<void> {
  const startedAt = mytIso(deps.nowMs())
  const metaText = await readText(await deps.fetchFn(METADATA_URL), 'the metadata').catch((error: unknown) => {
    throw new Error(`the metadata fetch failed: ${error instanceof Error ? error.message : String(error)}`)
  })
  const parsed = parseMetadata(metaText)
  if ('problem' in parsed) throw new Error(parsed.problem)
  const { dataAsOf, nextUpdate } = parsed.stamps

  const state = deps.loadState()
  if (state.data_as_of === dataAsOf) {
    deps.log(`already posted data_as_of ${dataAsOf}; nothing to do`)
    deps.summary(`Already posted \`data_as_of\` ${dataAsOf}; nothing to do.`)
    return
  }

  if (coveredNight(dataAsOf) < targetNight(deps.nowMs())) {
    const line = pendingLine(nextUpdate)
    deps.log(line)
    deps.summary(line)
    return
  }

  const year = Number(dataAsOf.slice(0, 4))
  const download = await deps.fetchFn(parquetUrl(year))
  if (download.status !== 200) throw new Error(`the ${year} parquet returned HTTP ${download.status}`)
  const buffer = await download.arrayBuffer()
  const lastModified = download.headers.get('last-modified')
  const fetchedMs = deps.nowMs()
  const headerAgeS = lastModified ? Math.max(0, Math.round((fetchedMs - Date.parse(lastModified)) / 1_000)) : 0
  const read = await deps.readParquet(buffer)
  const deviceTime = mytIso(deps.nowMs())
  const postedAt = mytIso(deps.nowMs())
  const latencyMs = Math.max(0, deps.nowMs() - fetchedMs)

  if ('schemaError' in read) {
    await postError(deps, options, {
      startedAt,
      receivedAt: postedAt,
      httpStatus: download.status,
      latencyMs,
      error: read.schemaError,
      deviceTime,
      headerAgeS,
      dataAsOf
    })
    throw new Error(`schema change: ${read.schemaError}`)
  }

  const reduced = reduceNightlies(read.records)
  if ('schemaError' in reduced) {
    await postError(deps, options, {
      startedAt,
      receivedAt: postedAt,
      httpStatus: download.status,
      latencyMs,
      error: reduced.schemaError,
      deviceTime,
      headerAgeS,
      dataAsOf
    })
    throw new Error(`schema change: ${reduced.schemaError}`)
  }

  const { rows, upToDate } = nightsToPost(reduced.nights, dataAsOf, state)
  if (upToDate) {
    deps.saveState({ ...state, data_as_of: dataAsOf })
    deps.log(`data_as_of ${dataAsOf} holds no new nights; nothing to do`)
    deps.summary(`\`data_as_of\` ${dataAsOf} holds no new nights; nothing to do.`)
    return
  }

  await postNights(deps, options, {
    startedAt,
    receivedAt: postedAt,
    httpStatus: download.status,
    latencyMs,
    deviceTime,
    headerAgeS,
    dataAsOf,
    nights: rows
  })
  deps.saveState(rememberPosted({ ...state }, dataAsOf, rows))
  const lines = rows.map((row) => `${row.date}: ${row.value} exits (revision ${row.revision})`)
  for (const line of lines) deps.log(`posted ${line}`)
  deps.summary(`Posted ${rows.length} night(s) at \`data_as_of\` ${dataAsOf}:\n\n- ${lines.join('\n- ')}`)
}

interface NightPost {
  startedAt: string
  receivedAt: string
  httpStatus: number
  latencyMs: number
  deviceTime: string
  headerAgeS: number
  dataAsOf: string
  nights: { date: string; value: number; revision: number }[]
}

async function postNights(deps: RunDeps, options: RunOptions, post: NightPost): Promise<void> {
  const rows: PiRow[] = post.nights.map((night) => ({
    kind: 'sp17_exits' as const,
    observed_at: `${night.date}T00:00:00+08:00`,
    value: night.value,
    revision: night.revision,
    note: buildNote({
      runner: options.runner,
      deviceTime: post.deviceTime,
      postedAt: post.receivedAt,
      headerAgeS: post.headerAgeS,
      dataAsOf: post.dataAsOf
    })
  }))
  const body: PiRowsPost = {
    kind: 'pi_rows',
    device_id: options.deviceId,
    rows,
    poll: {
      poll_id: deps.randomId(),
      started_at: post.startedAt,
      received_at: post.receivedAt,
      http_status: post.httpStatus,
      latency_ms: post.latencyMs,
      outcome: 'ok'
    }
  }
  const reply = await deps.postFn(options.ingestUrl, options.token, body)
  const result = checkPostResult(reply)
  if (!result.ok) throw new Error(`the pilot refused the post: ${result.error}`)
  if (result.duplicate) deps.log('the pilot already holds these rows (duplicate: true)')
}

interface ErrorPost extends Omit<NightPost, 'nights'> {
  error: string
}

async function postError(deps: RunDeps, options: RunOptions, post: ErrorPost): Promise<void> {
  const body: PiRowsPost = {
    kind: 'pi_rows',
    device_id: options.deviceId,
    rows: [
      {
        kind: 'error',
        observed_at: post.deviceTime,
        note: buildNote({
          runner: options.runner,
          deviceTime: post.deviceTime,
          postedAt: post.receivedAt,
          headerAgeS: post.headerAgeS,
          dataAsOf: post.dataAsOf
        })
      }
    ],
    poll: {
      poll_id: deps.randomId(),
      started_at: post.startedAt,
      received_at: post.receivedAt,
      http_status: post.httpStatus,
      latency_ms: post.latencyMs,
      outcome: 'error',
      error: post.error
    }
  }
  const reply = await deps.postFn(options.ingestUrl, options.token, body)
  const result = checkPostResult(reply)
  if (!result.ok) throw new Error(`the pilot refused the error post: ${result.error}`)
  deps.log(`posted one error row: ${post.error}`)
}

// The one-time backfill: every night from `start` to `end` (default the
// metadata's `data_as_of`), oldest first, at most 200 rows per post.
export async function runBackfill(deps: RunDeps, options: RunOptions): Promise<void> {
  const startedAt = mytIso(deps.nowMs())
  const metaText = await readText(await deps.fetchFn(METADATA_URL), 'the metadata')
  const parsed = parseMetadata(metaText)
  if ('problem' in parsed) throw new Error(parsed.problem)
  const end = options.end ?? coveredNight(parsed.stamps.dataAsOf)
  const startYear = Number(options.start.slice(0, 4))
  const endYear = Number(end.slice(0, 4))
  const all: NightTotal[] = []
  let headerAgeS = 0
  for (let year = startYear; year <= endYear; year++) {
    const download = await deps.fetchFn(parquetUrl(year))
    await readText(download, `the ${year} parquet`)
    const buffer = await download.arrayBuffer()
    const lastModified = download.headers.get('last-modified')
    if (lastModified) headerAgeS = Math.max(0, Math.round((deps.nowMs() - Date.parse(lastModified)) / 1_000))
    const read = await deps.readParquet(buffer)
    if ('schemaError' in read) throw new Error(`schema change in the ${year} file: ${read.schemaError}`)
    const reduced = reduceNightlies(read.records)
    if ('schemaError' in reduced) throw new Error(`schema change in the ${year} file: ${reduced.schemaError}`)
    all.push(...reduced.nights.filter((night) => night.date >= options.start && night.date <= end))
  }
  all.sort((a, b) => (a.date < b.date ? -1 : 1))
  const deviceTime = mytIso(deps.nowMs())
  const postedAt = mytIso(deps.nowMs())
  let state = deps.loadState()
  let posted = 0
  for (let at = 0; at < all.length; at += MAX_BACKFILL_ROWS) {
    const chunk = all.slice(at, at + MAX_BACKFILL_ROWS)
    const rows = chunk.map((night) => {
      const known = state.nights[night.date]
      const revision = known && known.value === night.exits ? known.revision : (known?.revision ?? 0) + 1
      return { date: night.date, value: night.exits, revision }
    })
    await postNights(deps, options, {
      startedAt,
      receivedAt: mytIso(deps.nowMs()),
      httpStatus: 200,
      latencyMs: 0,
      deviceTime,
      headerAgeS,
      dataAsOf: parsed.stamps.dataAsOf,
      nights: rows
    })
    state = rememberPosted(state, state.data_as_of ?? parsed.stamps.dataAsOf, rows)
    posted += rows.length
  }
  deps.saveState({ ...state, data_as_of: parsed.stamps.dataAsOf })
  deps.log(`backfilled ${posted} night(s) from ${options.start} to ${end}`)
  deps.summary(`Backfilled ${posted} night(s) from ${options.start} to ${end}.`)
}

export const MAX_BACKFILL_ROWS = 200

function flagValue(args: string[], name: string): string | null {
  const index = args.indexOf(name)
  return index === -1 ? null : (args[index + 1] ?? null)
}

export function parseArgs(args: string[]): Omit<RunOptions, 'ingestUrl' | 'token'> & { stateFile: string } {
  const runner = flagValue(args, '--runner') ?? process.env.RUNNER ?? 'actions'
  return {
    runner,
    deviceId: flagValue(args, '--device-id') ?? (runner === 'actions' ? 'actions' : 'pi'),
    backfill: args.includes('--backfill'),
    start: flagValue(args, '--start') ?? '2023-01-01',
    end: flagValue(args, '--end'),
    stateFile: flagValue(args, '--state-file') ?? join(import.meta.dir, '.ridership-state.json')
  }
}

async function postToPilot(ingestUrl: string, token: string, body: PiRowsPost): Promise<unknown> {
  const response = await fetch(ingestUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'text/plain;charset=utf-8' },
    body: JSON.stringify(body)
  })
  const text = await response.text()
  try {
    return JSON.parse(text)
  } catch {
    throw new Error(`the pilot answered HTTP ${response.status} with a body that isn't JSON`)
  }
}

if (import.meta.main) {
  const args = process.argv.slice(2)
  const parsed = parseArgs(args)
  const ingestUrl = process.env.INGEST_URL ?? ''
  const token = process.env.PI_TOKEN ?? ''
  if (!ingestUrl || !token) {
    console.error('INGEST_URL and PI_TOKEN must be set')
    process.exit(1)
  }
  const stateFile = parsed.stateFile
  const deps: RunDeps = {
    fetchFn: (url) => fetch(url) as Promise<FetchResult>,
    readParquet: readParquetRecords,
    postFn: postToPilot,
    loadState: () => {
      try {
        return JSON.parse(readFileSync(stateFile, 'utf8')) as RidershipState
      } catch {
        return blankState()
      }
    },
    saveState: (state) => void writeFileSync(stateFile, `${JSON.stringify(state, null, 2)}\n`),
    randomId: () => crypto.randomUUID(),
    nowMs: () => Date.now(),
    log: (line) => console.log(line),
    summary: (line) => {
      const file = process.env.GITHUB_STEP_SUMMARY
      if (file) writeFileSync(file, `${line}\n`, { flag: 'a' })
    }
  }
  const options: RunOptions = {
    runner: parsed.runner,
    deviceId: parsed.deviceId,
    ingestUrl,
    token,
    backfill: parsed.backfill,
    start: parsed.start,
    end: parsed.end
  }
  try {
    if (options.backfill) await runBackfill(deps, options)
    else await runOnce(deps, options)
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error))
    process.exit(1)
  }
}
