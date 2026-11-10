import type { SourceKind } from '@skyclause/contracts'
import { and, asc, desc, eq, gt, inArray, isNotNull, isNull, lte, or } from 'drizzle-orm'
import type { SystemPrincipal, Tx } from '../client'
import { night, project, projectSource, source } from '../schema'
import { poll } from '../schema/partitioned'
import type { BoundSource, CrowdPeriodDto } from './types'

/** Enumerate tenant scopes first; the caller opens each tenant after this system transaction returns. */
export async function listSourceOrganisations(tx: Tx<SystemPrincipal>): Promise<string[]> {
  const rows = await tx
    .selectDistinct({ orgId: project.orgId })
    .from(project)
    .where(isNull(project.archivedAt))
    .orderBy(asc(project.orgId))
  return rows.map(({ orgId }) => orgId)
}

export async function previousSourceDigest(tx: Tx, sourceId: string): Promise<string | null> {
  const [latest] = await tx
    .select({ digest: poll.bodySha256 })
    .from(poll)
    .where(and(eq(poll.sourceId, sourceId), inArray(poll.outcome, ['ok', 'unchanged'])))
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
        previousBodySha256: await previousSourceDigest(tx, row.source.id)
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
