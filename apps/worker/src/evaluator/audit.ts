import { zonedDateTimeParts } from '@skyclause/i18n/format'
import type { RegisterAuditCheck } from '@skyclause/contracts'
import { loadEvaluatorAuditSources } from '@skyclause/db'
import { SOURCE_METRICS } from '@skyclause/sources'

type Row = Awaited<ReturnType<typeof loadEvaluatorAuditSources>>[number]
const silenceS: Partial<Record<Row['source']['kind'], number>> = {
  jps_rain: 600,
  met_warning: 1200,
  apims: 7200,
  camera: 1200,
  pi: 3600
}
function daylightElapsed(row: Row, now: string): number | null {
  if (
    row.source.probation ||
    row.source.ownerOrgId !== row.project.orgId ||
    (row.source.meta as Record<string, unknown>).project_id !== row.project.id
  )
    return null
  const start = row.project.cameraDayStart,
    end = row.project.cameraDayEnd
  if (!start || !end) return null
  const seconds = (value: string) => {
    const [h, m, s] = value.split(':').map(Number)
    return h! * 3600 + m! * 60 + (s ?? 0)
  }
  const parts = zonedDateTimeParts(now, row.project.timeZone)
  const local = parts.hour * 3600 + parts.minute * 60 + parts.second,
    from = seconds(start),
    to = seconds(end)
  if (!Number.isFinite(local) || from >= to || local < from || local >= to) return null
  return local - from
}
function finding(row: Row, prefix: string) {
  return {
    key: prefix + ':' + row.project.id + ':' + row.source.id,
    projectId: row.project.id,
    accountIds: row.accountIds,
    ref: { type: 'source', id: row.source.id }
  }
}
/** Explicit registration only. Production activation waits for the #132 delivery repair. */
export function registerEvaluatorAuditChecks(register: RegisterAuditCheck): void {
  register({
    name: 'evaluator-source-silent',
    scope: 'org',
    async run(tx, now) {
      const found = []
      for (const row of await loadEvaluatorAuditSources(tx, now)) {
        const threshold = silenceS[row.source.kind] ?? row.source.cadenceS * 2
        const basis = Math.max(
          row.boundAt.getTime(),
          row.basis == null ? row.boundAt.getTime() : new Date(row.basis).getTime()
        )
        let age = (Date.parse(now) - basis) / 1000
        if (row.source.kind === 'camera') {
          const daylight = daylightElapsed(row, now)
          if (daylight === null) continue
          age = Math.min(age, daylight)
        }
        if (age >= threshold) found.push(finding(row, 'source'))
      }
      return found
    }
  })
  register({
    name: 'evaluator-rapidrail-overdue',
    scope: 'org',
    async run(tx, now) {
      const found = []
      for (const row of await loadEvaluatorAuditSources(tx, now)) {
        if (row.source.kind !== 'rapidrail_od') continue
        const parsed = SOURCE_METRICS.rapidrail_od.metadata.value_json.safeParse(row.metadata)
        if (parsed.success && Date.parse(now) - Date.parse(parsed.data.next_update_utc) >= 7200000)
          found.push(finding(row, 'rapidrail'))
      }
      return found
    }
  })
}
