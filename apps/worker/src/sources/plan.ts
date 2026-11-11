import { createHash } from 'node:crypto'
import {
  boundSources,
  sourceBackfillCoverage,
  listSourceOrganisations,
  plannedCrowdPeriods,
  previousSourceDigest,
  systemPrincipal,
  withSystem,
  withTenant
} from '@skyclause/db'
import { adapters, SourceKind, type SourceAdapter, type CrowdPeriod } from '@skyclause/sources'
import { z } from 'zod'
import { decodeObject, encodeObject, hasCode } from './storage'
import type { SourceObjectStore } from './types'
export const Digest = z.string().regex(/^[a-f0-9]{64}$/)
export const SourceSchema = z.strictObject({
  id: z.uuid(),
  kind: SourceKind,
  externalId: z.string(),
  name: z.string(),
  lat: z.number().finite().nullable(),
  lon: z.number().finite().nullable(),
  url: z.url(),
  meta: z.record(z.string(), z.json())
})
export const PlannedSource = z.strictObject({
  source: SourceSchema,
  bindings: z.array(z.strictObject({ orgId: z.uuid(), projectId: z.uuid() })).min(1),
  previousPollDigest: Digest.nullable(),
  previousBackfillDigest: Digest.nullable()
})
export const PeriodSchema = z.strictObject({
  id: z.uuid(),
  projectId: z.uuid(),
  state: z.enum(['upcoming', 'in_progress']),
  arrivalStart: z.iso.datetime(),
  arrivalEnd: z.iso.datetime().nullable(),
  exitStart: z.iso.datetime().nullable(),
  exitEnd: z.iso.datetime().nullable()
})
export const PlannedBackfillGroup = z.strictObject({
  key: Digest,
  kind: SourceKind,
  sourceIds: z.array(z.uuid()).min(1),
  anchor: z.iso.datetime(),
  requiredObservations: z.array(z.strictObject({ metric: z.string().min(1), observedAt: z.iso.datetime() })).min(1),
  eligible: z.boolean()
})
export type PlannedBackfillGroup = z.infer<typeof PlannedBackfillGroup>
const PlanFields = z.strictObject({
  generatedAt: z.iso.datetime(),
  sources: z.array(PlannedSource),
  periods: z.array(PeriodSchema)
})
export const SourcePlan = z.discriminatedUnion('version', [
  PlanFields.extend({ version: z.literal(1) }),
  PlanFields.extend({ version: z.literal(2), backfillGroups: z.array(PlannedBackfillGroup) })
])
/** Canonical JSON identity; object key order cannot split a public group. */
export function backfillGroupKey(kind: string, meta: string, value: unknown): string {
  const canonical = (v: unknown): unknown =>
    Array.isArray(v)
      ? v.map(canonical)
      : v !== null && typeof v === 'object'
        ? Object.fromEntries(
            Object.entries(v)
              .sort(([a], [b]) => a.localeCompare(b))
              .map(([k, x]) => [k, canonical(x)])
          )
        : v
  return createHash('sha256')
    .update(JSON.stringify([kind, meta, canonical(value)]))
    .digest('hex')
}
export type SourcePlan = z.infer<typeof SourcePlan>
export type PlannedSource = z.infer<typeof PlannedSource>
export async function sourceSnapshot(
  now: Date,
  registry: readonly SourceAdapter<unknown>[] = adapters
): Promise<SourcePlan> {
  const orgs = await withSystem('sources:plan', listSourceOrganisations)
  const sources = new Map<string, PlannedSource>(),
    periods: CrowdPeriod[] = []
  for (const orgId of orgs) {
    const snapshot = await withTenant({ orgId, principal: systemPrincipal('sources:plan') }, async (tx) => {
      const entries: PlannedSource[] = []
      for (const kind of SourceKind.options)
        for (const bound of await boundSources(tx, kind)) {
          if (bound.ownerOrgId !== null) continue
          entries.push({
            source: SourceSchema.parse({
              id: bound.id,
              kind: bound.kind,
              externalId: bound.externalId,
              name: bound.name,
              lat: bound.lat,
              lon: bound.lon,
              url: bound.url,
              meta: bound.meta
            }),
            bindings: bound.bindings,
            previousPollDigest: bound.previousBodySha256,
            previousBackfillDigest: await previousSourceDigest(tx, bound.id, 'backfill')
          })
        }
      return { entries, periods: await plannedCrowdPeriods(tx) }
    })
    for (const entry of snapshot.entries) {
      const existing = sources.get(entry.source.id)
      if (existing) existing.bindings.push(...entry.bindings)
      else sources.set(entry.source.id, entry)
    }
    periods.push(...snapshot.periods)
  }
  const anchor = now.toISOString(),
    backfillGroups: PlannedBackfillGroup[] = []
  for (const adapter of registry) {
    const policy = adapter.groupedBackfill
    if (!policy) continue
    if (adapter.backfill) throw new Error('Adapter cannot declare both backfill policies')
    const groups = new Map<string, PlannedSource[]>()
    for (const entry of sources.values())
      if (entry.source.kind === adapter.kind) {
        const value = entry.source.meta[policy.groupByMeta]
        if (value === undefined) throw new Error('Grouped source is missing metadata')
        const key = backfillGroupKey(adapter.kind, policy.groupByMeta, value)
        groups.set(key, [...(groups.get(key) ?? []), entry])
      }
    const requiredObservations = policy.requiredObservations(anchor)
    for (const [key, entries] of groups) {
      const sourceIds = entries.map((e) => e.source.id).sort()
      const coverage = await withSystem('sources:plan', (tx) =>
        sourceBackfillCoverage(tx, {
          kind: adapter.kind,
          groupByMeta: policy.groupByMeta,
          groupValue: entries[0]!.source.meta[policy.groupByMeta]!,
          sourceIds,
          required: requiredObservations.map((r) => ({ metric: r.metric, observedAt: new Date(r.observedAt) }))
        })
      )
      backfillGroups.push({
        key,
        kind: adapter.kind,
        sourceIds,
        anchor,
        requiredObservations,
        eligible: !coverage.hasBackfillPoll && coverage.missingSourceIds.length > 0
      })
    }
  }
  return SourcePlan.parse({ version: 2, generatedAt: anchor, sources: [...sources.values()], periods, backfillGroups })
}
export async function refreshSourcePlan(now: Date, store: SourceObjectStore, snapshot = sourceSnapshot): Promise<void> {
  const plan = SourcePlan.parse(await snapshot(now))
  for (;;) {
    const current = await store.read('control/plan.json')
    if (current && Date.parse(SourcePlan.parse(decodeObject(current.body)).generatedAt) > now.getTime()) return
    try {
      await store.write('control/plan.json', encodeObject(plan), current?.generation ?? '0')
      return
    } catch (error) {
      if (!hasCode(error, 412)) throw error
    }
  }
}
export async function readSourcePlan(store: SourceObjectStore): Promise<SourcePlan> {
  const saved = await store.read('control/plan.json')
  if (!saved) throw new Error('Source plan is missing; run sources-ingest first')
  return SourcePlan.parse(decodeObject(saved.body))
}
export function activePeriods(periods: CrowdPeriod[], now: Date): CrowdPeriod[] {
  const active = (start: string | null, end: string | null) =>
    start !== null && end !== null && Date.parse(start) <= now.getTime() && now.getTime() < Date.parse(end)
  return periods.filter((p) => active(p.arrivalStart, p.arrivalEnd) || active(p.exitStart, p.exitEnd))
}
