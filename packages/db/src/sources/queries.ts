import type { SourceKind } from '@skyclause/contracts'
import { and, asc, desc, eq, gt, inArray, isNotNull, isNull, lte, or, sql } from 'drizzle-orm'
import type { SystemPrincipal, Tx } from '../client'
import { night, project, projectSource, source } from '../schema'
import { poll, reading } from '../schema/partitioned'
import type { JsonValue, BoundSource, CrowdPeriodDto, SourceRequestWrite } from './types'

/** Enumerate tenant scopes first; the caller opens each tenant after this system transaction returns. */
export async function listSourceOrganisations(tx: Tx<SystemPrincipal>): Promise<string[]> {
  const rows = await tx
    .selectDistinct({ orgId: project.orgId })
    .from(project)
    .where(isNull(project.archivedAt))
    .orderBy(asc(project.orgId))
  return rows.map(({ orgId }) => orgId)
}

export async function previousSourceDigest(
  tx: Tx,
  sourceId: string,
  purpose: SourceRequestWrite['purpose']
): Promise<string | null> {
  const [latest] = await tx
    .select({ digest: poll.bodySha256 })
    .from(poll)
    .where(and(eq(poll.sourceId, sourceId), eq(poll.purpose, purpose), inArray(poll.outcome, ['ok', 'unchanged'])))
    .orderBy(desc(poll.startedAt), desc(poll.id))
    .limit(1)
  return latest?.digest ?? null
}

/** Tenant reads preserve catalogue/device RLS and collapse multiple binding roles into one project reference. */
export async function boundSources(tx: Tx, kind: SourceKind): Promise<BoundSource[]> {
  const rows = await tx
    .select({ source, orgId: projectSource.orgId, projectId: projectSource.projectId })
    .from(projectSource)
    .innerJoin(project, eq(project.id, projectSource.projectId))
    .innerJoin(source, eq(source.id, projectSource.sourceId))
    .where(and(eq(source.kind, kind), isNull(project.archivedAt)))
    .orderBy(asc(source.id), asc(projectSource.projectId))
  const found = new Map<string, BoundSource>()
  for (const row of rows) {
    let entry = found.get(row.source.id)
    if (!entry) {
      entry = {
        ...row.source,
        meta: row.source.meta as BoundSource['meta'],
        bindings: [],
        previousBodySha256: await previousSourceDigest(tx, row.source.id, 'poll')
      }
      found.set(entry.id, entry)
    }
    if (!entry.bindings.some(({ projectId }) => projectId === row.projectId)) {
      entry.bindings.push({ orgId: row.orgId, projectId: row.projectId })
    }
  }
  return [...found.values()]
}

/** Only complete half-open intervals contain now; nullable exits and missing ends remain unknown. */
export async function openCrowdPeriods(tx: Tx, now: Date): Promise<CrowdPeriodDto[]> {
  const rows = await tx
    .select({ night })
    .from(night)
    .innerJoin(project, eq(project.id, night.projectId))
    .where(
      and(
        isNull(project.archivedAt),
        inArray(night.state, ['upcoming', 'in_progress']),
        isNotNull(night.arrivalStart),
        or(
          and(lte(night.arrivalStart, now), gt(night.arrivalEnd, now)),
          and(lte(night.exitStart, now), gt(night.exitEnd, now))
        )
      )
    )
    .orderBy(asc(night.id))
  return rows.map(({ night: row }) => ({
    id: row.id,
    projectId: row.projectId,
    state: row.state as CrowdPeriodDto['state'],
    arrivalStart: row.arrivalStart!.toISOString(),
    arrivalEnd: row.arrivalEnd?.toISOString() ?? null,
    exitStart: row.exitStart?.toISOString() ?? null,
    exitEnd: row.exitEnd?.toISOString() ?? null
  }))
}

/** Plan complete upcoming intervals, including starts between consecutive refreshes. */
export async function plannedCrowdPeriods(tx: Tx): Promise<CrowdPeriodDto[]> {
  const rows = await tx
    .select({ night })
    .from(night)
    .innerJoin(project, eq(project.id, night.projectId))
    .where(
      and(isNull(project.archivedAt), inArray(night.state, ['upcoming', 'in_progress']), isNotNull(night.arrivalStart))
    )
    .orderBy(asc(night.id))
  return rows.map(({ night: row }) => ({
    id: row.id,
    projectId: row.projectId,
    state: row.state as CrowdPeriodDto['state'],
    arrivalStart: row.arrivalStart!.toISOString(),
    arrivalEnd: row.arrivalEnd?.toISOString() ?? null,
    exitStart: row.exitStart?.toISOString() ?? null,
    exitEnd: row.exitEnd?.toISOString() ?? null
  }))
}

/** Public group coverage only. Global prior attempts include unbound sources and error polls. */
export async function sourceBackfillCoverage(
  tx: Tx<SystemPrincipal>,
  query: {
    kind: SourceKind
    groupByMeta: string
    groupValue: JsonValue
    sourceIds: string[]
    required: Array<{ metric: string; observedAt: Date }>
  }
): Promise<{ hasBackfillPoll: boolean; missingSourceIds: string[] }> {
  if (tx.principal?.kind !== 'system' || tx.orgId !== null)
    throw new Error('Source coverage requires unscoped system scope')
  if (
    !query.groupByMeta ||
    !query.required.length ||
    query.required.some((r) => !r.metric || !Number.isFinite(r.observedAt.getTime()))
  )
    throw new Error('Invalid source coverage requirements')
  const publicGroup = and(
    eq(source.kind, query.kind),
    isNull(source.ownerOrgId),
    sql`${source.meta} -> ${query.groupByMeta} = ${JSON.stringify(query.groupValue)}::jsonb`
  )
  const prior = await tx
    .select({ id: poll.id })
    .from(poll)
    .innerJoin(source, eq(source.id, poll.sourceId))
    .where(and(publicGroup, eq(poll.purpose, 'backfill')))
    .limit(1)
  const ids = [...new Set(query.sourceIds)]
  if (!ids.length) return { hasBackfillPoll: prior.length > 0, missingSourceIds: [] }
  const rows = await tx
    .selectDistinct({ sourceId: reading.sourceId, metric: reading.metric, observedAt: reading.observedAt })
    .from(reading)
    .innerJoin(source, eq(source.id, reading.sourceId))
    .where(
      and(
        publicGroup,
        inArray(source.id, ids),
        or(...query.required.map((r) => and(eq(reading.metric, r.metric), eq(reading.observedAt, r.observedAt))))
      )
    )
  const keys = new Set(rows.map((r) => JSON.stringify([r.sourceId, r.metric, r.observedAt.toISOString()])))
  return {
    hasBackfillPoll: prior.length > 0,
    missingSourceIds: ids.filter((id) =>
      query.required.some((r) => !keys.has(JSON.stringify([id, r.metric, r.observedAt.toISOString()])))
    )
  }
}
