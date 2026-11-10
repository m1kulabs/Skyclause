import { formatDateKeyAt } from '@skyclause/i18n/format'

export type OverviewPackFilter = 'all' | 'sky' | 'crowd'

export interface AtRiskWindow {
  id: string
  starts_at: string
  at_risk?: boolean
}

export function localDateAt(now: Date, timeZone: string): string {
  return formatDateKeyAt(now, timeZone)
}

export function selectTodayAtRisk<Window extends AtRiskWindow>(
  windows: readonly Window[],
  timeZone: string,
  now: Date,
  limit = 6
): { total: number; windows: Window[] } {
  const today = localDateAt(now, timeZone)
  const matching = windows
    .filter((window) => window.at_risk === true && localDateAt(new Date(window.starts_at), timeZone) === today)
    .sort((left, right) => left.starts_at.localeCompare(right.starts_at))
  return { total: matching.length, windows: matching.slice(0, limit) }
}

export function overviewFilterState(search: Pick<URLSearchParams, 'get'>): { pack: OverviewPackFilter } {
  const value = search.get('pack')
  return { pack: value === 'sky' || value === 'crowd' ? value : 'all' }
}
