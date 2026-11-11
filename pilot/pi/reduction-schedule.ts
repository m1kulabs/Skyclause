import { toMytIso } from '../shared/time.ts'
import type { RidershipState } from './ridership.ts'

// The Rapid Rail file for night D arrives on D+1. Retry from noon every
// half-hour until the Pi's state records D as posted.
export class ReductionSchedule {
  private day = ''
  private lastSlot = -1

  due(now: Date, state: RidershipState): boolean {
    const myt = toMytIso(now)
    const day = myt.slice(0, 10)
    const minuteOfDay = Number(myt.slice(11, 13)) * 60 + Number(myt.slice(14, 16))
    if (minuteOfDay < 12 * 60 || minuteOfDay % 30 !== 0) return false
    if (this.day !== day) {
      this.day = day
      this.lastSlot = -1
    }

    const targetNight = new Date(Date.parse(`${day}T00:00:00Z`) - 86_400_000).toISOString().slice(0, 10)
    if (state.nights[targetNight]) return false
    return Math.floor((minuteOfDay - 12 * 60) / 30) > this.lastSlot
  }

  attempted(now: Date): void {
    const myt = toMytIso(now)
    this.day = myt.slice(0, 10)
    const minuteOfDay = Number(myt.slice(11, 13)) * 60 + Number(myt.slice(14, 16))
    this.lastSlot = Math.floor((minuteOfDay - 12 * 60) / 30)
  }
}
