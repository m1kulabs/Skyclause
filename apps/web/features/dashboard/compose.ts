import type { Mode, Pack, ProjectRef } from '@skyclause/contracts'
import type { StripWindow } from '@skyclause/elements'
import { formatDateKeyAt } from '@skyclause/i18n/format'
import { ApiProblem } from '../../lib/api-fetch'
import { verdictState, wilsonInterval } from './model'
import type {
  Dashboard,
  DashboardBundle,
  DashboardGrade,
  DashboardNight,
  DashboardDay,
  DashboardProject,
  DashboardReview,
  DashboardWindow,
  dashboardApi
} from './operations'

/** A project whose read for a block failed while the other projects' reads landed. */
export interface UnreadProject {
  project: ProjectRef
  status: number | null
  at: string
  /** On a 429, when the API said to try again. */
  retryAt?: string | null
}

/**
 * One dashboard block: what its reads found (and which projects' reads failed, when some did), or the status it
 * failed with and when (null when it never answered). A rate-limited read keeps when to try again.
 */
export type BlockRead<Item> =
  | { ok: true; data: Item[]; n: number; next_action?: string | null; unread?: UnreadProject[] }
  | { ok: false; status: number | null; at: string; retryAt?: string | null }

export interface ReviewEntry {
  summary: DashboardReview
  detail: DashboardBundle
}

/** A window today that is above Normal, drawn on the day strip with the state its latest call or verdict gives it. */
export interface TodayWindow {
  project: ProjectRef
  window: Pick<DashboardWindow, 'id' | 'title' | 'starts_at' | 'ends_at'>
  state: StripWindow['state']
  /** Not reviewed: an engine verdict, or a call still drafted. */
  draft: boolean
}

type DashboardSignal = Dashboard['signal_health']['data'][number]
/** A source's health; a source with no state yet has none, never one made up for it. */
export type SignalEntry = Omit<DashboardSignal, 'state'> & { state: DashboardSignal['state'] | null }

/** A show night or a forecast storm afternoon ahead; a storm afternoon has a day but no time of its own. */
export interface UpcomingEntry {
  project: ProjectRef
  pack: Pack
  date: string
  starts_at: string | null
  mode: Mode | null
  show_name?: string | null
  warning?: Dashboard['upcoming_risks']['data'][number]['warning']
  storm?: { wording: string; source_url: string } | null
}

export type GradeEntry = Dashboard['yesterday_grades']['data'][number]

export interface DashboardBlocks {
  needs_review: BlockRead<ReviewEntry>
  windows_at_risk: BlockRead<TodayWindow>
  signal_health: BlockRead<SignalEntry>
  upcoming_risks: BlockRead<UpcomingEntry>
  yesterday_grades: BlockRead<GradeEntry>
}

/** The projects a composed dashboard reads: the most recently active, so a large organisation stays quick. */
export const COMPOSED_PROJECT_CAP = 6
/** Each composed read gets this long; one that takes longer fails its own block only. */
export const COMPOSED_READ_TIMEOUT_MS = 6_000
/** Rows each block asks a project for: the view draws at most 50. */
const ROWS = 50
const DAY_MS = 86_400_000

type Api = typeof dashboardApi

const ok = <Item>(data: Item[]): BlockRead<Item> => ({ ok: true, data, n: data.length })

function failed(error: unknown, at: string): { ok: false; status: number | null; at: string; retryAt?: string | null } {
  const status = error instanceof ApiProblem ? error.status : null
  return { ok: false, status, at, ...(error instanceof ApiProblem && error.retryAt ? { retryAt: error.retryAt } : {}) }
}

/** Whether the project runs `pack`: only a pack that is on is read or shown (Crowd's show nights, Sky's storm days). */
const runs = (project: DashboardProject, pack: 'sky' | 'crowd') =>
  project.packs.some((item) => item.pack === pack && item.enabled)

/** The project's ref as the blocks carry it. */
function refOf(project: DashboardProject, org: string): ProjectRef {
  return { id: project.id, slug: project.slug, org_slug: org }
}

/** When a project last had a bundle: its latest bundle's review start or its newest call's draft. */
function lastActive(project: DashboardProject): number {
  const bundle = project.summary?.latest_bundle
  if (!bundle) return 0
  const times = [bundle.needs_review_at, ...bundle.calls.map((call) => call.drafted_at)]
    .filter((value): value is string => !!value)
    .map((value) => Date.parse(value))
  return times.length ? Math.max(...times) : 0
}

/**
 * The organisation's live projects, the most recently active first: a project whose latest bundle needs review, then
 * by its last bundle, then by name.
 */
export function mostRecentlyActive(projects: readonly DashboardProject[]): DashboardProject[] {
  const reviewing = (project: DashboardProject) => (project.summary?.latest_bundle?.state === 'needs_review' ? 0 : 1)
  return projects
    .filter((project) => !project.archived_at)
    .sort((a, b) => reviewing(a) - reviewing(b) || lastActive(b) - lastActive(a) || a.name.localeCompare(b.name, 'en'))
}

const SEVERITY: Record<string, number> = { error: 0, stale: 1, probation: 2, pending: 3, recovered: 4, off_hours: 5 }
const severity = (entry: SignalEntry) => SEVERITY[entry.state?.state ?? 'pending'] ?? 6

/** Sources in trouble first (error, then stale), the oldest reading first within each. */
function sortSignals(entries: SignalEntry[]): SignalEntry[] {
  return entries.sort((a, b) => severity(a) - severity(b) || (b.age_s ?? -1) - (a.age_s ?? -1))
}

/** Yesterday's graded windows and nights for one project, one card per pack: how often the call agreed, with its n. */
function gradeEntries(
  project: ProjectRef,
  grades: readonly DashboardGrade[],
  packs: ReadonlyArray<'sky' | 'crowd'>
): GradeEntry[] {
  const graded = grades.filter((grade) => grade.outcome !== 'pending')
  return packs.flatMap((pack) => {
    const own = graded.filter((grade) => grade.pack === pack)
    if (!own.length) return []
    const agreed = own.filter((grade) => grade.agrees).length
    const interval = wilsonInterval(agreed, own.length)
    return [
      {
        project,
        grade: own[0]!,
        metric: {
          metric: 'agreement',
          x: agreed,
          n: own.length,
          low: interval?.low ?? null,
          high: interval?.high ?? null
        }
      }
    ]
  })
}

function upcomingEntries(
  project: ProjectRef,
  today: string,
  nights: readonly DashboardNight[],
  days: readonly DashboardDay[]
): UpcomingEntry[] {
  const shows: UpcomingEntry[] = nights
    .filter((night) => night.date >= today && night.state !== 'unlisted')
    .map((night) => ({
      project,
      pack: 'crowd',
      date: night.date,
      starts_at: night.show,
      mode: null,
      show_name: night.show_name ?? null
    }))
  const storms: UpcomingEntry[] = days
    .filter((day) => day.date >= today && day.storm_afternoon)
    .map((day) => ({ project, pack: 'sky', date: day.date, starts_at: null, mode: null, storm: day.storm_afternoon }))
  return [...shows, ...storms]
}

/**
 * The organisation dashboard composed from the reads that are built, for while `getDashboard` is not: for each of
 * the most recently active projects (at most COMPOSED_PROJECT_CAP), its bundles needing review, today's windows above
 * Normal, its sources, its show nights and forecast storm afternoons ahead, and yesterday's grades. The reads run
 * together, each with its own timeout; a block whose read failed for any of those projects says so, and only that
 * block.
 */
export async function composeDashboard(
  api: Api,
  input: {
    org: string
    projects: readonly DashboardProject[]
    headers: Headers
    signal?: AbortSignal
    now: Date
    timeoutMs?: number
    /** One block's Retry: only that block's reads are made; the others come back empty and are not used. */
    only?: keyof DashboardBlocks
  }
): Promise<{ blocks: DashboardBlocks; shown: DashboardProject[] }> {
  const { org, headers, now } = input
  const shown = mostRecentlyActive(input.projects).slice(0, COMPOSED_PROJECT_CAP)
  const timeoutMs = input.timeoutMs ?? COMPOSED_READ_TIMEOUT_MS
  const signal = () =>
    input.signal ? AbortSignal.any([input.signal, AbortSignal.timeout(timeoutMs)]) : AbortSignal.timeout(timeoutMs)
  const common = () => ({ org, headers, signal: signal(), cache: 'no-store' as const })
  const wanted = (key: keyof DashboardBlocks) => !input.only || input.only === key
  /** A read this composition does not need: an empty page, never a request. */
  const skipped = () => Promise.resolve({ data: [], next_cursor: null } as never)

  const perProject = await Promise.all(
    shown.map(async (project) => {
      const params = { id: project.id }
      const today = formatDateKeyAt(now, project.time_zone)
      const yesterday = formatDateKeyAt(new Date(now.getTime() - DAY_MS), project.time_zone)
      const [bundles, windows, sources, days, nights, grades] = await Promise.allSettled([
        wanted('needs_review')
          ? api('listProjectBundles', { ...common(), params, query: { state: 'needs_review', limit: ROWS } })
          : skipped(),
        wanted('windows_at_risk')
          ? api('listWindows', {
              ...common(),
              params,
              query: { from: today, to: today, at_risk: 'true', include: 'calls', limit: ROWS }
            })
          : skipped(),
        wanted('signal_health')
          ? api('listProjectSources', { ...common(), params, query: { limit: ROWS } })
          : skipped(),
        // A project without Sky has no storm afternoons, and one without Crowd no show nights: each read is skipped,
        // as an empty one.
        wanted('upcoming_risks') && runs(project, 'sky')
          ? api('listProjectDays', { ...common(), params, query: { limit: ROWS } })
          : skipped(),
        wanted('upcoming_risks') && runs(project, 'crowd')
          ? api('listNights', { ...common(), params, query: { limit: 200 } })
          : skipped(),
        wanted('yesterday_grades')
          ? api('listGrades', { ...common(), params, query: { from: yesterday, to: yesterday, limit: 200 } })
          : skipped()
      ])
      const packs = (['sky', 'crowd'] as const).filter((pack) => runs(project, pack))
      return { project, ref: refOf(project, org), packs, today, bundles, windows, sources, days, nights, grades }
    })
  )

  const at = new Date().toISOString()
  /**
   * Joins one block's rows across the projects. A project whose read failed is named beside the others' rows; the block
   * fails only when every project's read failed.
   */
  function block<Item>(rows: (entry: (typeof perProject)[number]) => Item[] | PromiseRejectedResult): BlockRead<Item> {
    const items: Item[] = []
    const unread: UnreadProject[] = []
    let first: PromiseRejectedResult | null = null
    for (const entry of perProject) {
      const result = rows(entry)
      if (Array.isArray(result)) {
        items.push(...result)
        continue
      }
      first ??= result
      const { status, retryAt } = failed(result.reason, at)
      unread.push({ project: entry.ref, status, at, ...(retryAt ? { retryAt } : {}) })
    }
    if (first && unread.length === perProject.length) return failed(first.reason, at)
    return unread.length ? { ok: true, data: items, n: items.length, unread } : ok(items)
  }

  /** The joined rows, sorted, keeping the projects that could not be read. */
  const sorted = <Item>(read: BlockRead<Item>, order: (items: Item[]) => Item[]): BlockRead<Item> =>
    read.ok ? { ...read, data: order(read.data), n: read.data.length } : read

  const needsReview = block<ReviewEntry>(({ bundles, ref }) =>
    bundles.status === 'rejected'
      ? bundles
      : bundles.value.data.map((detail) => {
          const due = detail.sla_due_at ?? detail.needs_review_at ?? now.toISOString()
          return {
            summary: {
              id: detail.id,
              project: ref,
              pack: detail.pack,
              sla_due_at: due,
              seconds_remaining: Math.floor((Date.parse(due) - now.getTime()) / 1000)
            },
            detail
          }
        })
  )

  const windowsAtRisk = block<TodayWindow>(({ windows, ref, packs }) =>
    windows.status === 'rejected'
      ? windows
      : windows.value.data
          .filter((window) => !window.cancelled_at)
          .map((window) => {
            const calls = packs.map((pack) => window.latest_calls[pack]).filter((call) => call !== null)
            const risky = calls.find((call) => call.mode !== null && call.mode !== 'normal') ?? calls[0]
            return {
              project: ref,
              window,
              state: risky ? (risky.mode ?? 'no_call') : null,
              draft: risky?.state === 'drafted'
            }
          })
  )

  const signals = block<SignalEntry>(({ sources, ref }) =>
    sources.status === 'rejected'
      ? sources
      : sources.value.data.map((source) => ({
          project: ref,
          source,
          state: source.state,
          age_s: source.age_s
        }))
  )

  const upcoming = block<UpcomingEntry>(({ nights, days, ref, today }) =>
    nights.status === 'rejected'
      ? nights
      : days.status === 'rejected'
        ? days
        : upcomingEntries(ref, today, nights.value.data, days.value.data)
  )

  const yesterdayGrades = block<GradeEntry>(({ grades, ref, packs }) =>
    grades.status === 'rejected' ? grades : gradeEntries(ref, grades.value.data, packs)
  )

  return {
    shown,
    blocks: {
      needs_review: sorted(needsReview, (items) =>
        items.sort((a, b) => a.summary.seconds_remaining - b.summary.seconds_remaining)
      ),
      windows_at_risk: sorted(windowsAtRisk, (items) =>
        items.sort((a, b) => a.window.starts_at.localeCompare(b.window.starts_at))
      ),
      signal_health: sorted(signals, sortSignals),
      upcoming_risks: sorted(upcoming, (items) =>
        items.sort((a, b) => a.date.localeCompare(b.date) || (a.starts_at ?? '').localeCompare(b.starts_at ?? ''))
      ),
      yesterday_grades: yesterdayGrades
    }
  }
}

/** getDashboard's answer as the same blocks; its windows are engine verdicts, so none of them is reviewed. */
export function dashboardBlocks(dashboard: Dashboard, bundles: ReviewEntry[]): DashboardBlocks {
  return {
    needs_review: {
      ok: true,
      data: bundles,
      n: dashboard.needs_review.n,
      next_action: dashboard.needs_review.next_action
    },
    windows_at_risk: {
      ok: true,
      n: dashboard.windows_at_risk.n,
      next_action: dashboard.windows_at_risk.next_action,
      data: dashboard.windows_at_risk.data.map(({ project, window, verdict }) => ({
        project,
        window,
        state: verdictState(verdict),
        draft: true
      }))
    },
    signal_health: { ok: true, ...dashboard.signal_health },
    upcoming_risks: {
      ok: true,
      n: dashboard.upcoming_risks.n,
      next_action: dashboard.upcoming_risks.next_action,
      data: dashboard.upcoming_risks.data.map((item) => ({ ...item, storm: null }))
    },
    yesterday_grades: { ok: true, ...dashboard.yesterday_grades }
  }
}
