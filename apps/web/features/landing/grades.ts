import { loadEnv } from '@skyclause/config'

// Grades read for the FAQ (#185, #187): GET /v1/public/{org}/{project}/grades for PILOT_PROJECT (§6, D4).
// Unset or empty reads n=0; a failed read returns an error so the FAQ shows it rather than a fallback.
export type GradesState =
  | { kind: 'empty'; n: 0 }
  | { kind: 'grades'; n: number; x: number | null; low: number | null; high: number | null; metric: string }
  | { kind: 'error'; message: string }

export function pilotRefFromEnv(env: Record<string, string | undefined>): { org: string; project: string } | null {
  let raw: string | undefined
  try {
    raw = loadEnv('web', env as never).PILOT_PROJECT
  } catch {
    raw = env.PILOT_PROJECT
  }
  if (!raw?.trim()) return null
  const parts = raw.trim().split('/')
  if (parts.length !== 2 || !parts[0] || !parts[1]) return null
  return { org: parts[0], project: parts[1] }
}

function parseMetrics(
  data: unknown
): Array<{ n: number; x: number | null; low: number | null; high: number | null; metric: string }> {
  if (!data || typeof data !== 'object') return []
  const rows: unknown[] = Array.isArray(data) ? data : []
  const out: Array<{ n: number; x: number | null; low: number | null; high: number | null; metric: string }> = []
  for (const row of rows) {
    if (!row || typeof row !== 'object') continue
    const r = row as Record<string, unknown>
    const n = typeof r.n === 'number' ? r.n : 0
    const x = typeof r.x === 'number' ? r.x : null
    const low = typeof r.low === 'number' ? r.low : null
    const high = typeof r.high === 'number' ? r.high : null
    const metric = typeof r.metric === 'string' ? r.metric : ''
    out.push({ n, x, low, high, metric })
  }
  return out
}

export async function readGrades(
  fetcher: typeof fetch = fetch,
  env: Record<string, string | undefined> = process.env
): Promise<GradesState> {
  const ref = pilotRefFromEnv(env)
  if (!ref) return { kind: 'empty', n: 0 }
  const apiOrigin = env.API_ORIGIN ?? ''
  const url = apiOrigin
    ? `${apiOrigin}/v1/public/${encodeURIComponent(ref.org)}/${encodeURIComponent(ref.project)}/grades`
    : `/v1/public/${encodeURIComponent(ref.org)}/${encodeURIComponent(ref.project)}/grades`
  try {
    const res = await fetcher(url, { cache: 'no-store' })
    if (!res.ok) return { kind: 'error', message: `Grades request failed (${res.status})` }
    const body = (await res.json()) as { data?: unknown }
    const metrics = parseMetrics(body.data)
    const totalN = metrics.reduce((sum, m) => sum + m.n, 0)
    if (totalN === 0) return { kind: 'empty', n: 0 }
    // Show the first metric with n>0, with its Wilson interval from the API.
    const first = metrics.find((m) => m.n > 0) ?? metrics[0]!
    return { kind: 'grades', n: totalN, x: first.x, low: first.low, high: first.high, metric: first.metric }
  } catch (error) {
    return { kind: 'error', message: error instanceof Error ? error.message : String(error) }
  }
}
