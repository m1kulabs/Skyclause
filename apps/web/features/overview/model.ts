import { formatDateKeyAt } from '@skyclause/i18n/format'

export type OverviewPackFilter = 'all' | 'sky' | 'crowd'

export interface AtRiskWindow {
  id: string
  starts_at: string
  ends_at?: string
  at_risk?: boolean
  cancelled_at?: string | null
}

export function localDateAt(now: Date, timeZone: string): string {
  return formatDateKeyAt(now, timeZone)
}

/**
 * The windows that overlap the project's local day of `now`, in start order: one that began before midnight and runs
 * into today is today's too. A cancelled window is never one of them.
 */
export function todaysWindows<Window extends AtRiskWindow>(
  windows: readonly Window[],
  timeZone: string,
  now: Date
): Window[] {
  const today = localDateAt(now, timeZone)
  return windows
    .filter((window) => {
      if (window.cancelled_at) return false
      const start = new Date(window.starts_at)
      // The end instant itself belongs to the next minute's day: a window ending at midnight is not tomorrow's.
      const last = window.ends_at ? new Date(Math.max(start.getTime(), Date.parse(window.ends_at) - 1)) : start
      return localDateAt(start, timeZone) <= today && localDateAt(last, timeZone) >= today
    })
    .sort((left, right) => left.starts_at.localeCompare(right.starts_at))
}

export function selectTodayAtRisk<Window extends AtRiskWindow>(
  windows: readonly Window[],
  timeZone: string,
  now: Date,
  limit = 6
): { total: number; windows: Window[] } {
  const matching = todaysWindows(windows, timeZone, now).filter((window) => window.at_risk === true)
  return { total: matching.length, windows: matching.slice(0, limit) }
}

export function overviewFilterState(search: Pick<URLSearchParams, 'get'>): { pack: OverviewPackFilter } {
  const value = search.get('pack')
  return { pack: value === 'sky' || value === 'crowd' ? value : 'all' }
}
