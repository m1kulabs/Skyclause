import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname } from 'node:path'
import { toMytIso } from '../shared/time.ts'
import type { PostResult } from '../shared/device-post.ts'
import { blankState, type PiRow, type PiRowsPost, type RidershipState } from './ridership.ts'
import { readParquetRecords, runOnce, type FetchResult, type RunDeps } from './ridership-run.ts'
import { FsyncJsonlBuffer } from './buffer.ts'
import { ntpSynchronized } from './clock.ts'
import { ReductionSchedule } from './reduction-schedule.ts'
import { OrderedPiUploader, type BufferedPiRow, type PiRowsAttempt } from './uploader.ts'

const HTTP_TIMEOUT_MS = 15_000

export interface PiAgentCycleDeps {
  deviceId: string
  buffer: FsyncJsonlBuffer<BufferedPiRow>
  uploader: OrderedPiUploader
  isNtpSynchronized: () => Promise<boolean>
  now: () => Date
  newRowId: () => string
  runReduction?: (now: Date) => Promise<void>
}

export async function runPiAgentCycle(deps: PiAgentCycleDeps): Promise<boolean> {
  if (!(await deps.isNtpSynchronized())) return false

  const now = deps.now()
  const deviceTime = toMytIso(now)
  const rowId = deps.newRowId()
  await deps.buffer.append({
    row_id: rowId,
    device_id: deps.deviceId,
    row: { kind: 'heartbeat', row_id: rowId, device_time: deviceTime, posted_at: deviceTime },
    poll: {
      poll_id: rowId,
      started_at: deviceTime,
      received_at: deviceTime,
      http_status: 200,
      latency_ms: 0,
      outcome: 'ok'
    }
  })
  try {
    await deps.runReduction?.(now)
  } finally {
    await deps.uploader.flush()
  }
  return true
}

export interface PiAgentConfig {
  ingestUrl: string
  token: string
  deviceId: string
}

export function readPiAgentConfig(environment: Record<string, string | undefined>): PiAgentConfig {
  const ingestUrl = environment.INGEST_URL?.trim() ?? ''
  const token = environment.PI_TOKEN?.trim() ?? ''
  const deviceId = environment.DEVICE_ID?.trim() ?? ''
  const missing = [
    ['INGEST_URL', ingestUrl],
    ['PI_TOKEN', token],
    ['DEVICE_ID', deviceId]
  ]
    .filter(([, value]) => !value)
    .map(([name]) => name)
  if (missing.length > 0) throw new Error(`${missing.join(', ')} must be set`)
  if (deviceId !== 'pi-01') throw new Error('DEVICE_ID must be pi-01')
  return { ingestUrl, token, deviceId }
}

export function runPiAgent(config = readPiAgentConfig(process.env)): Promise<void> {
  const bufferPath = process.env.PI_BUFFER_PATH ?? '/var/lib/skyclause-pi/rows.jsonl'
  const statePath = process.env.RIDERSHIP_STATE_PATH ?? '/var/lib/skyclause-pi/ridership-state.json'
  const buffer = new FsyncJsonlBuffer<BufferedPiRow>(bufferPath)
  const uploader = new OrderedPiUploader({
    buffer,
    now: () => new Date(),
    post: (body) => postToPilot(config.ingestUrl, config.token, body)
  })
  const schedule = new ReductionSchedule()
  mkdirSync(dirname(statePath), { recursive: true })

  const loadState = (): RidershipState => {
    try {
      return JSON.parse(readFileSync(statePath, 'utf8')) as RidershipState
    } catch {
      return blankState()
    }
  }
  const saveState = (state: RidershipState): void => {
    writeFileSync(statePath, `${JSON.stringify(state, null, 2)}\n`)
  }
  const runDeps: RunDeps = {
    fetchFn: (url) => fetch(url, { signal: AbortSignal.timeout(HTTP_TIMEOUT_MS) }) as Promise<FetchResult>,
    readParquet: readParquetRecords,
    postFn: async (_url, _token, body) => {
      await appendPiRows(buffer, uploader, body, config.deviceId)
      return { ok: true, duplicate: false } satisfies PostResult
    },
    loadState,
    saveState,
    randomId: () => crypto.randomUUID(),
    nowMs: () => Date.now(),
    log: (line) => console.log(line),
    summary: () => undefined
  }
  const options = {
    runner: 'pi',
    deviceId: config.deviceId,
    ingestUrl: config.ingestUrl,
    token: config.token,
    backfill: false,
    start: '2023-01-01',
    end: null
  }

  return runForever(async () => {
    await runPiAgentCycle({
      deviceId: config.deviceId,
      buffer,
      uploader,
      isNtpSynchronized: ntpSynchronized,
      now: () => new Date(),
      newRowId: () => crypto.randomUUID(),
      runReduction: async (now) => {
        if (!schedule.due(now, loadState())) return
        schedule.attempted(now)
        await runOnce(runDeps, options)
      }
    })
  })
}

async function runForever(cycle: () => Promise<void>): Promise<void> {
  for (;;) {
    try {
      await cycle()
    } catch (error) {
      console.error(error instanceof Error ? error.message : String(error))
    }
    await Bun.sleep(60_000 - (Date.now() % 60_000))
  }
}

async function appendPiRows(
  buffer: FsyncJsonlBuffer<BufferedPiRow>,
  uploader: OrderedPiUploader,
  body: PiRowsPost,
  deviceId: string
): Promise<void> {
  for (const source of body.rows) {
    const rowId = crypto.randomUUID()
    const row = { ...source, row_id: rowId } as PiRow & { row_id: string }
    await buffer.append({
      row_id: rowId,
      device_id: deviceId,
      row,
      poll: { ...body.poll, poll_id: rowId }
    })
  }
  await uploader.flush()
}

async function postToPilot(url: string, token: string, body: PiRowsAttempt): Promise<PostResult> {
  const response = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'text/plain;charset=utf-8' },
    body: JSON.stringify({ ...body, token }),
    signal: AbortSignal.timeout(HTTP_TIMEOUT_MS)
  })
  const text = await response.text()
  let result: unknown
  try {
    result = JSON.parse(text)
  } catch {
    throw new Error(`the pilot answered HTTP ${response.status} with a body that isn't JSON`)
  }
  if (!response.ok) throw new Error(`the pilot answered HTTP ${response.status}`)
  if (typeof result !== 'object' || result === null || !('ok' in result))
    throw new Error('the pilot returned an invalid post reply')
  const reply = result as { ok?: unknown; duplicate?: unknown; error?: unknown }
  if (typeof reply.ok !== 'boolean') throw new Error('the pilot returned an invalid post reply')
  if (reply.ok && typeof reply.duplicate !== 'boolean') throw new Error('the pilot returned an invalid post reply')
  if (!reply.ok && typeof reply.error !== 'string') throw new Error('the pilot returned an invalid post reply')
  return reply as PostResult
}

if (import.meta.main) {
  runPiAgent().catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : String(error))
    process.exitCode = 1
  })
}
