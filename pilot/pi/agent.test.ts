import { mkdtemp, rm, readFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, test } from 'bun:test'
import type { PostResult } from '../shared/device-post.ts'
import { runPiAgentCycle } from './agent.ts'
import { FsyncJsonlBuffer } from './buffer.ts'
import { ntpSynchronized, parseNtpSynchronized } from './clock.ts'
import { OrderedPiUploader, type BufferedPiRow, type PiRowsAttempt } from './uploader.ts'

const DEVICE_TIME = '2026-11-09T12:00:00+08:00'
const ATTEMPT_TIME = '2026-11-09T12:01:00+08:00'

function heartbeat(rowId: string): BufferedPiRow {
  return {
    row_id: rowId,
    device_id: 'pi-01',
    row: { kind: 'heartbeat', row_id: rowId, device_time: DEVICE_TIME, posted_at: DEVICE_TIME },
    poll: {
      poll_id: rowId,
      started_at: DEVICE_TIME,
      received_at: DEVICE_TIME,
      http_status: 200,
      latency_ms: 0,
      outcome: 'ok'
    }
  }
}

async function withBuffer(run: (path: string) => Promise<void>): Promise<void> {
  const directory = await mkdtemp(join(tmpdir(), 'skyclause-pi-'))
  try {
    await run(join(directory, 'rows.jsonl'))
  } finally {
    await rm(directory, { recursive: true, force: true })
  }
}

function uploader(
  buffer: FsyncJsonlBuffer<BufferedPiRow>,
  post: (body: PiRowsAttempt) => Promise<PostResult>,
  now: () => Date = () => new Date(ATTEMPT_TIME)
): OrderedPiUploader {
  return new OrderedPiUploader({ buffer, post, now })
}

describe('Pi durable row buffer', () => {
  test('parses the systemd NTP synchronization property', () => {
    expect(parseNtpSynchronized('NTPSynchronized=yes\n')).toBe(true)
    expect(parseNtpSynchronized('NTPSynchronized=no\n')).toBe(false)
  })

  test('reads synchronization through an injectable timedatectl result', async () => {
    await expect(ntpSynchronized(async () => ({ output: 'NTPSynchronized=yes\n', status: 0 }))).resolves.toBe(true)
    await expect(ntpSynchronized(async () => ({ output: 'NTPSynchronized=yes\n', status: 1 }))).resolves.toBe(false)
  })

  test('a row appended before a process restart is available to upload', async () => {
    await withBuffer(async (path) => {
      const beforeRestart = new FsyncJsonlBuffer<BufferedPiRow>(path)
      await beforeRestart.append(heartbeat('row-before-restart'))

      const posted: string[] = []
      const afterRestart = new FsyncJsonlBuffer<BufferedPiRow>(path)
      await uploader(afterRestart, async (body) => {
        posted.push(body.rows[0]?.row_id ?? '')
        return { ok: true, duplicate: false }
      }).flush()

      expect(posted).toEqual(['row-before-restart'])
      expect(await afterRestart.peek()).toBeNull()
    })
  })

  test('uploads rows in append order', async () => {
    await withBuffer(async (path) => {
      const buffer = new FsyncJsonlBuffer<BufferedPiRow>(path)
      await buffer.append(heartbeat('first'))
      await buffer.append(heartbeat('second'))
      const posted: string[] = []

      await uploader(buffer, async (body) => {
        posted.push(body.rows[0]?.row_id ?? '')
        return { ok: true, duplicate: false }
      }).flush()

      expect(posted).toEqual(['first', 'second'])
    })
  })

  test('a failed post retries the same row_id and refreshes posted_at', async () => {
    await withBuffer(async (path) => {
      const buffer = new FsyncJsonlBuffer<BufferedPiRow>(path)
      await buffer.append(heartbeat('stable-row-id'))
      const posted: { rowId: string; deviceTime: string; postedAt: string }[] = []
      const times = [new Date(ATTEMPT_TIME), new Date('2026-11-09T12:02:00+08:00')]
      let calls = 0
      const post = async (body: PiRowsAttempt) => {
        const row = body.rows[0]
        if (row?.kind !== 'heartbeat') throw new Error('expected heartbeat')
        posted.push({ rowId: row.row_id, deviceTime: row.device_time, postedAt: row.posted_at })
        calls++
        return calls === 1 ? ({ ok: false, error: 'offline' } as const) : ({ ok: true, duplicate: false } as const)
      }
      const clock = () => times[Math.min(calls, times.length - 1)] as Date
      const instance = uploader(buffer, post, clock)

      await expect(instance.flush()).rejects.toThrow('offline')
      await instance.flush()

      expect(posted).toEqual([
        { rowId: 'stable-row-id', deviceTime: DEVICE_TIME, postedAt: ATTEMPT_TIME },
        { rowId: 'stable-row-id', deviceTime: DEVICE_TIME, postedAt: '2026-11-09T12:02:00+08:00' }
      ])
    })
  })

  test('a duplicate reply advances the durable offset and truncates the acknowledged line', async () => {
    await withBuffer(async (path) => {
      const buffer = new FsyncJsonlBuffer<BufferedPiRow>(path)
      await buffer.append(heartbeat('already-stored'))

      await uploader(buffer, async () => ({ ok: true, duplicate: true })).flush()

      expect(await buffer.peek()).toBeNull()
      expect(await readFile(path, 'utf8')).toBe('')
    })
  })

  test('a retried SP17 row keeps device_time and stamps posted_at for the attempt', async () => {
    await withBuffer(async (path) => {
      const buffer = new FsyncJsonlBuffer<BufferedPiRow>(path)
      await buffer.append({
        row_id: 'sp17-row',
        device_id: 'pi-01',
        row: {
          kind: 'sp17_exits',
          row_id: 'sp17-row',
          observed_at: '2026-11-08T00:00:00+08:00',
          value: 114,
          revision: 1,
          note: JSON.stringify({
            runner: 'pi',
            device_time: DEVICE_TIME,
            posted_at: DEVICE_TIME,
            header_age_s: 60,
            data_as_of: '2026-11-09 08:00'
          })
        },
        poll: {
          poll_id: 'sp17-row',
          started_at: DEVICE_TIME,
          received_at: DEVICE_TIME,
          http_status: 200,
          latency_ms: 0,
          outcome: 'ok'
        }
      })

      await uploader(buffer, async (body) => {
        const row = body.rows[0]
        if (row?.kind !== 'sp17_exits') throw new Error('expected SP17 row')
        expect(body.poll.poll_id).toBe('sp17-row')
        expect(JSON.parse(row.note)).toMatchObject({ device_time: DEVICE_TIME, posted_at: ATTEMPT_TIME })
        return { ok: true, duplicate: false }
      }).flush()
    })
  })

  test('does not create or upload rows before NTP synchronization', async () => {
    await withBuffer(async (path) => {
      const buffer = new FsyncJsonlBuffer<BufferedPiRow>(path)
      let posted = 0
      const instance = uploader(buffer, async () => {
        posted++
        return { ok: true, duplicate: false }
      })

      await runPiAgentCycle({
        deviceId: 'pi-01',
        buffer,
        uploader: instance,
        isNtpSynchronized: async () => false,
        now: () => new Date(DEVICE_TIME),
        newRowId: () => 'must-not-be-created'
      })

      expect(await buffer.peek()).toBeNull()
      expect(posted).toBe(0)
    })
  })

  test('creates one timestamped heartbeat after NTP synchronization', async () => {
    await withBuffer(async (path) => {
      const buffer = new FsyncJsonlBuffer<BufferedPiRow>(path)
      let sent: PiRowsAttempt | null = null
      const instance = uploader(buffer, async (body) => {
        sent = body
        return { ok: true, duplicate: false }
      })

      await runPiAgentCycle({
        deviceId: 'pi-01',
        buffer,
        uploader: instance,
        isNtpSynchronized: async () => true,
        now: () => new Date(DEVICE_TIME),
        newRowId: () => 'heartbeat-row'
      })

      expect(sent).toMatchObject({
        kind: 'pi_rows',
        device_id: 'pi-01',
        rows: [{ kind: 'heartbeat', row_id: 'heartbeat-row', device_time: DEVICE_TIME, posted_at: ATTEMPT_TIME }],
        poll: { poll_id: 'heartbeat-row', started_at: DEVICE_TIME, received_at: ATTEMPT_TIME, outcome: 'ok' }
      })
    })
  })
})
