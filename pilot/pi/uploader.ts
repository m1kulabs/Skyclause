import { toMytIso } from '../shared/time.ts'
import type { PostResult } from '../shared/device-post.ts'
import type { PiPoll, PiRow } from './ridership.ts'
import { FsyncJsonlBuffer } from './buffer.ts'

export interface PiHeartbeatRow {
  kind: 'heartbeat'
  row_id: string
  device_time: string
  posted_at: string
}

export type PiBufferedRowData = (PiRow & { row_id: string }) | PiHeartbeatRow

export interface BufferedPiRow {
  row_id: string
  device_id: string
  row: PiBufferedRowData
  poll: PiPoll
}

export interface PiRowsAttempt {
  kind: 'pi_rows'
  device_id: string
  rows: [PiBufferedRowData]
  poll: PiPoll
}

export interface OrderedPiUploaderDeps {
  buffer: FsyncJsonlBuffer<BufferedPiRow>
  post: (body: PiRowsAttempt) => Promise<PostResult>
  now: () => Date
}

export class OrderedPiUploader {
  private active: Promise<void> | null = null

  constructor(private readonly deps: OrderedPiUploaderDeps) {}

  flush(): Promise<void> {
    if (this.active) return this.active.then(() => this.flush())
    const active = this.uploadRows()
    this.active = active
    void active.then(
      () => {
        if (this.active === active) this.active = null
      },
      () => {
        if (this.active === active) this.active = null
      }
    )
    return active
  }

  private async uploadRows(): Promise<void> {
    for (;;) {
      const next = await this.deps.buffer.peek()
      if (!next) return

      const body = this.attempt(next.value)
      const result = await this.deps.post(body)
      if (!result.ok) throw new Error(result.error)
      await this.deps.buffer.acknowledge(next.endOffset)
    }
  }

  private attempt(entry: BufferedPiRow): PiRowsAttempt {
    const postedAt = toMytIso(this.deps.now())
    const row = stampPostedAt(entry.row, postedAt)
    return {
      kind: 'pi_rows',
      device_id: entry.device_id,
      rows: [row],
      poll: { ...entry.poll, poll_id: entry.row_id, received_at: postedAt }
    }
  }
}

function stampPostedAt(row: PiBufferedRowData, postedAt: string): PiBufferedRowData {
  if (row.kind === 'heartbeat') return { ...row, posted_at: postedAt }
  let note: unknown
  try {
    note = JSON.parse(row.note)
  } catch {
    throw new Error('Pi row note is not valid JSON')
  }
  if (typeof note !== 'object' || note === null || Array.isArray(note)) throw new Error('Pi row note is not an object')
  return { ...row, note: JSON.stringify({ ...note, posted_at: postedAt }) }
}
