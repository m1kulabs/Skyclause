import { ApiProblem } from '../../lib/api-fetch'
import { CADENCE, dayStart, daylight, deviceTime, nextMark, uuid7, validHours, type Frame, type Setup } from './model'
import type { CameraStore } from './storage'

export interface CameraEvent {
  key: string
  vars?: Record<string, string | number>
}
interface IngestReply {
  source_id: string
  accepted: number
  received_at: string
  camera_day_start: string
  camera_day_end: string
}
type Reply = IngestReply | { ok: true; duplicate: true }
interface Ports {
  store: CameraStore
  now(): number
  online(): boolean
  visible(): boolean
  capture(setup: Setup): Promise<Pick<Frame, 'jpeg' | 'ratio_near' | 'ratio_far' | 'flag'>>
  post(frame: Frame, token: string, signal?: AbortSignal): Promise<Reply>
  emit(event: CameraEvent): void
}

/** A single foreground loop serialises capture, durable writes and ordered delivery. */
export class CameraRunner {
  private busy = false
  private retryAt = 0
  private stopped = false
  private request?: AbortController
  constructor(private ports: Ports) {}
  stop() {
    this.stopped = true
    this.request?.abort()
  }

  async step() {
    if (this.busy || this.stopped) return
    this.busy = true
    try {
      await this.run()
    } catch {
      if (!this.stopped) this.ports.emit({ key: 'storageError' })
    } finally {
      this.busy = false
    }
  }

  private async run() {
    const p = this.ports
    let setup = await p.store.setup()
    if (!setup?.reference || !setup.token || !setup.consent) return
    const now = p.now()
    if (!daylight(now, setup.start, setup.end) || now < (setup.blockedUntil ?? 0)) {
      p.emit({
        key: 'afterDusk',
        vars: { at: Math.max(setup.blockedUntil ?? 0, nextMark(now, setup.start, setup.end)) }
      })
      return
    }
    if (!p.visible()) return
    const mark = dayStart(now, setup.start) + Math.floor((now - dayStart(now, setup.start)) / CADENCE) * CADENCE
    if (now - mark < 5000 && mark > (setup.lastMark ?? 0)) {
      let captured: Awaited<ReturnType<Ports['capture']>>
      try {
        captured = await p.capture(setup)
      } catch {
        p.emit({ key: 'captureError' })
        return
      }
      // A permission prompt or slow camera may cross dusk; never enqueue a night frame.
      if (this.stopped || !daylight(p.now(), setup.start, setup.end)) return
      const frame: Frame = {
        ...captured,
        capture_id: uuid7(now),
        device_time: deviceTime(now),
        distance_km: setup.distance_km,
        buffered:
          !p.online() ||
          now < this.retryAt ||
          setup.rejectedToken === setup.token ||
          (await p.store.frames()).length > 0,
        attempts: 0
      }
      await p.store.put(frame)
      setup = { ...setup, ...(await p.store.setup()), lastMark: mark }
      await p.store.saveSetup(setup)
    }
    const frames = await p.store.frames()
    p.emit({ key: 'queue', vars: { n: frames.length } })
    if (!p.online()) {
      if (frames.length) p.emit({ key: 'offline', vars: { n: frames.length, at: Date.parse(frames[0]!.device_time) } })
      return
    }
    if (setup.rejectedToken === setup.token) {
      p.emit({ key: 'tokenRejected' })
      return
    }
    if (now < this.retryAt) return
    for (const frame of frames) {
      if (this.stopped || !p.online() || !p.visible() || !daylight(p.now(), setup.start, setup.end)) break
      const sending = { ...frame, buffered: frame.buffered || frame.attempts > 0 }
      // Persist the attempt before HTTP; a crash after sending makes the next delivery buffered.
      await p.store.put({ ...sending, attempts: frame.attempts + 1 })
      this.request = new AbortController()
      const timeout = setTimeout(() => this.request?.abort(), 20_000)
      const started = p.now()
      try {
        const reply = await p.post(sending, setup.token, this.request.signal)
        if ('camera_day_start' in reply && validHours(reply.camera_day_start, reply.camera_day_end)) {
          setup = { ...setup, ...(await p.store.setup()), start: reply.camera_day_start, end: reply.camera_day_end }
          await p.store.saveSetup(setup)
          p.emit({ key: 'hours', vars: { start: setup.start, end: setup.end } })
        }
        await p.store.remove(frame.capture_id)
        this.retryAt = 0
        p.emit({
          key: 'posted',
          vars: {
            at: Date.parse(frame.device_time),
            ratio_far: frame.ratio_far,
            ratio_near: frame.ratio_near,
            s: Math.max(0, p.now() - started) / 1000
          }
        })
      } catch (error) {
        if (this.stopped) return
        const status = error instanceof ApiProblem ? error.status : 0
        if (status === 401) {
          await p.store.saveSetup({ ...setup, ...(await p.store.setup()), rejectedToken: setup.token })
          p.emit({ key: 'tokenRejected' })
          break
        }
        if (status === 422) {
          await p.store.remove(frame.capture_id)
          const problem = (error as ApiProblem).body
          setup = { ...setup, ...(await p.store.setup()) }
          const outside =
            String(problem.type).endsWith('outside_daylight') ||
            problem.code === 'outside_daylight' ||
            problem.reason === 'outside_daylight'
          if (validHours(String(problem.camera_day_start), String(problem.camera_day_end))) {
            setup = { ...setup, start: String(problem.camera_day_start), end: String(problem.camera_day_end) }
          }
          if (outside) {
            const start = dayStart(p.now(), setup.start)
            setup = { ...setup, blockedUntil: start > p.now() ? start : start + 86_400_000 }
          }
          await p.store.saveSetup(setup)
          p.emit({
            key: 'dropped',
            vars: {
              reason: outside
                ? 'outside_daylight'
                : String(problem.detail ?? problem.title ?? problem.type ?? 'HTTP 422')
            }
          })
          if (outside) break
          continue
        }
        this.retryAt = p.now() + Math.min(300_000, 5000 * 2 ** Math.min(frame.attempts, 6))
        p.emit({ key: 'uploadFailed', vars: { at: p.now(), status } })
        break
      } finally {
        clearTimeout(timeout)
        this.request = undefined
      }
    }
    p.emit({ key: 'queue', vars: { n: (await p.store.frames()).length } })
  }
}
