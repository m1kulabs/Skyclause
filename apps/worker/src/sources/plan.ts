import {
  boundSources,
  listSourceOrganisations,
  plannedCrowdPeriods,
  previousSourceDigest,
  systemPrincipal,
  withSystem,
  withTenant
} from '@skyclause/db'
import { SourceKind, type CrowdPeriod } from '@skyclause/sources'
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
export const SourcePlan = z.strictObject({
  version: z.literal(1),
  generatedAt: z.iso.datetime(),
  sources: z.array(PlannedSource),
  periods: z.array(PeriodSchema)
})
export type SourcePlan = z.infer<typeof SourcePlan>
export type PlannedSource = z.infer<typeof PlannedSource>
export async function sourceSnapshot(now: Date): Promise<SourcePlan> {
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
  return SourcePlan.parse({ version: 1, generatedAt: now.toISOString(), sources: [...sources.values()], periods })
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
