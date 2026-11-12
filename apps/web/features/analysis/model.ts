import type { AnalysisMetric } from '@skyclause/contracts'

export type Locale = 'en' | 'ms'
export const tabs = ['sky', 'crowd', 'agreement', 'delays', 'review'] as const
export const periods = ['7d', '30d', '90d', 'all'] as const
export type Tab = (typeof tabs)[number]
export type Period = (typeof periods)[number]
export interface AnalysisState {
  tab: Tab
  period: Period
  pack: 'sky' | 'crowd'
  sheet: string
  subject: 'version' | 'draft'
  version: string
  from: string
  to: string
  step: string
  project: string
}

const date = (value: string | null) => {
  if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return ''
  const parsed = Date.parse(value)
  return Number.isFinite(parsed) && new Date(parsed).toISOString().slice(0, 10) === value ? value : ''
}
export function analysisState(search: Pick<URLSearchParams, 'get'>): AnalysisState {
  const tab = tabs.find((value) => value === search.get('tab')) ?? 'sky'
  return {
    tab,
    period: periods.find((value) => value === search.get('period')) ?? '30d',
    pack: tab === 'crowd' ? 'crowd' : tab === 'sky' ? 'sky' : search.get('pack') === 'crowd' ? 'crowd' : 'sky',
    sheet: search.get('sheet') ?? '',
    subject: search.get('subject') === 'draft' ? 'draft' : 'version',
    version: search.get('version') ?? '',
    from: date(search.get('from')),
    to: date(search.get('to')),
    step: /^(reading|PT[1-9]\d*M)$/.test(search.get('step') ?? '') ? search.get('step')! : 'reading',
    project: search.get('project') ?? ''
  }
}

export function analysisQuery(state: Pick<AnalysisState, 'period' | 'pack'>) {
  return { period: state.period, pack: state.pack }
}

export interface LivePoint {
  kind: 'live'
  at: string
  value: number | null
  metric: AnalysisMetric
}
export interface ReplayPoint {
  kind: 'replay'
  at: string
  value: number | null
  metric?: AnalysisMetric
  verdict: string
}
export interface LiveSeries {
  kind: 'live'
  points: LivePoint[]
}
export interface ReplaySeries {
  kind: 'replay'
  points: ReplayPoint[]
}

/**
 * A long replay drawn at a readable density: at most `limit` points, each the highest count in its run of steps, so a
 * peak is never smoothed away. `size` is how many steps each drawn point stands for (1 when nothing is thinned).
 */
export function thinned<Point extends { value: number | null }>(points: readonly Point[], limit = 400) {
  if (points.length <= limit) return { points: [...points], size: 1 }
  const size = Math.ceil(points.length / limit)
  const drawn: Point[] = []
  for (let start = 0; start < points.length; start += size) {
    const run = points.slice(start, start + size)
    drawn.push(run.reduce((best, point) => ((point.value ?? -Infinity) > (best.value ?? -Infinity) ? point : best)))
  }
  return { points: drawn, size }
}

export function axisTicks(max: number): number[] {
  const rough = Math.max(max, 0.01) / 3
  const magnitude = 10 ** Math.floor(Math.log10(rough))
  const step = [1, 2, 5, 10].map((value) => value * magnitude).find((value) => value > rough)!
  return [0, step, step * 2, step * 3]
}

/** The figure that answers each tab's "were the calls right?", in order of preference. */
const LEADS: Record<Tab, readonly string[]> = {
  sky: ['precision'],
  crowd: ['band_coverage', 'precision'],
  agreement: ['agreement', 'agent_shadow_agreement'],
  delays: ['crossing_to_approved_p50'],
  review: ['no_call']
}

/** Splits a tab's figures into the one that leads and the rows that follow it. */
export function leadAndRows<Item extends { metric: string }>(tab: Tab, figures: readonly Item[]) {
  const lead = LEADS[tab].map((name) => figures.find((item) => item.metric === name)).find(Boolean) ?? figures[0]
  return { lead, rows: figures.filter((item) => item !== lead) }
}

export function metricForTab(tab: Tab, metric: string): boolean {
  if (tab === 'agreement') return ['agreement', 'agent_shadow_agreement'].includes(metric)
  const delay = /(?:minutes|delay|approval|evidence|sent|crossing|p50|p95)/.test(metric)
  return tab === 'delays'
    ? delay
    : tab === 'review'
      ? metric === 'no_call'
      : !delay && !['agreement', 'agent_shadow_agreement'].includes(metric)
}
