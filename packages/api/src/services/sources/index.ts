import { createHash } from 'node:crypto'
import { type Can, type Operations, type Page, type SourceKind, type SourceRole } from '@skyclause/contracts'
import { listCatalogueSources as catalogueRoute } from '@skyclause/contracts/api/v1/catalogue'
import {
  listSourcePickerRecords,
  lockSourceProject,
  visibleBindingSource,
  lockBindingSource,
  projectBindings,
  sourceBindings,
  insertSourceBinding,
  deleteSourceBinding,
  sourceProjection,
  recordAudit,
  emitEvent,
  track,
  type source
} from '@skyclause/db'
import { z } from 'zod'
import { decodeCursor, page } from '../../pagination'
import { ApiError, validationFailed } from '../../problems'
import type { ServiceContext } from '../../tenancy'
import {
  serializeBoundSource,
  serializeCatalogueSource,
  type BoundSourceView,
  type CatalogueSourceView
} from './serialize'

export type { CatalogueSourceView, BoundSourceView } from './serialize'
export type SourcesAccess = { can: Can; now: Date }
export type CatalogueQuery = z.infer<Operations['listCatalogueSources']['request']['query']>

const querySchema = catalogueRoute.request.query
const Cursor = z
  .object({ v: z.literal(1), filter_hash: z.string(), distance_km: z.number().nonnegative().nullable(), id: z.uuid() })
  .strict()

const sourceRoles = {
  jps_rain: 'rain_gauge',
  apims: 'api_station',
  met_warning: 'warnings',
  met_forecast: 'met_forecast',
  rapidrail_od: 'rail_station',
  golive: 'venue_listings',
  wikipedia: 'venue_listings',
  gtfs_rt: 'bus_feed',
  gtfs_static: 'gtfs_static',
  camera: 'camera',
  pi: 'pi'
} satisfies Record<SourceKind, SourceRole>
const unavailable = () => new ApiError(404, 'not-found', 'The project or source is unavailable.')
type BindingInput = { projectId: string; sourceId: string }

async function bindingSource(ctx: ServiceContext, input: BindingInput, access: SourcesAccess) {
  const { principal, tx } = ctx
  const { projectId, sourceId } = input
  if (!tx.orgId || !z.uuid().safeParse(projectId).success || !z.uuid().safeParse(sourceId).success) throw unavailable()
  if (principal.kind === 'system') {
    if (tx.principal.kind !== 'system') throw unavailable()
  } else {
    if (principal.orgId !== tx.orgId) throw unavailable()
    if (principal.kind === 'share_link' && principal.projectId !== projectId) throw unavailable()
    if (principal.kind === 'oauth' && principal.projectIds !== 'all' && !principal.projectIds.includes(projectId))
      throw unavailable()
  }
  if (!(await lockSourceProject(tx, projectId))) throw unavailable()
  if (principal.kind !== 'system' && !access.can(principal, 'sources.manage', { projectId }))
    throw new ApiError(403, 'insufficient-scope', 'This operation requires sources.manage.')
  let src = await visibleBindingSource(tx, sourceId)
  if (!src) throw unavailable()
  const owned = (row: typeof source.$inferSelect) => {
    const meta = row.meta as Record<string, unknown> | null
    return (
      row.ownerOrgId === tx.orgId &&
      meta !== null &&
      typeof meta === 'object' &&
      typeof meta.project_id === 'string' &&
      meta.project_id === projectId
    )
  }
  if (src.kind === 'camera' || src.kind === 'pi') {
    if (!owned(src)) throw unavailable()
    src = await lockBindingSource(tx, sourceId)
    if (!src || !owned(src)) throw unavailable()
  } else if (src.ownerOrgId !== null) throw unavailable()
  return src
}

/** Shared #128/#179 seam: no HTTP key, nested connection, provider fetch or global state mutation. */
export async function bindSource(
  ctx: ServiceContext,
  input: BindingInput,
  access: SourcesAccess
): Promise<BoundSourceView> {
  const src = await bindingSource(ctx, input, access)
  if (src.kind === 'camera' || src.kind === 'pi') {
    const bindings = await sourceBindings(ctx.tx, src.id)
    if (bindings.some((binding) => binding.projectId !== input.projectId)) throw unavailable()
  }
  const role = sourceRoles[src.kind]
  const previous = (await projectBindings(ctx.tx, input.projectId)).filter((row) => row.sourceId === src.id)
  if (previous.some((row) => row.role !== role))
    throw new ApiError(422, 'validation-failed', 'The existing source binding has an incompatible role.')
  const { created } = await insertSourceBinding(ctx.tx, { ...input, role }, access.now)
  if (created) {
    const data = { source_id: src.id, role }
    await recordAudit(ctx.tx, {
      action: 'source.bound',
      target: { type: 'source', id: src.id },
      projectId: input.projectId,
      before: null,
      after: data
    })
    await emitEvent(ctx.tx, { projectId: input.projectId, type: 'source.bound', data })
    await track(
      ctx.tx,
      'source_bound',
      { adapter: src.kind, cadence_min: src.cadenceS / 60 },
      { projectId: input.projectId }
    )
  }
  const projection = await sourceProjection(ctx.tx, src.id)
  if (!projection) throw unavailable()
  return serializeBoundSource(projection, { project_id: input.projectId, role }, access.now)
}

/** Available-source absent DELETE is a no-op; ownership is checked even without a binding. */
export async function unbindSource(ctx: ServiceContext, input: BindingInput, access: SourcesAccess): Promise<void> {
  const src = await bindingSource(ctx, input, access)
  const bindings = (await projectBindings(ctx.tx, input.projectId)).filter((row) => row.sourceId === src.id)
  if (bindings.some((row) => row.role !== sourceRoles[src.kind]))
    throw new ApiError(422, 'validation-failed', 'The existing source binding has an incompatible role.')
  if (!bindings.length) return
  for (const binding of bindings) {
    if (!(await deleteSourceBinding(ctx.tx, binding.id))) continue
    const data = { source_id: src.id, role: binding.role }
    await recordAudit(ctx.tx, {
      action: 'source.unbound',
      target: { type: 'source', id: src.id },
      projectId: input.projectId,
      before: data,
      after: null
    })
    await emitEvent(ctx.tx, { projectId: input.projectId, type: 'source.unbound', data })
  }
}

/** Catalogue reads stay in the caller's tenant transaction and never materialize evaluator state. */
export async function listCatalogueSources(
  ctx: ServiceContext,
  query: CatalogueQuery,
  access: SourcesAccess
): Promise<Page<CatalogueSourceView>> {
  if (!access.can(ctx.principal, 'project.view'))
    throw new ApiError(403, 'insufficient-scope', 'This operation requires project.view.')
  const parsed = querySchema.safeParse(query)
  if (!parsed.success) throw validationFailed('query', parsed.error)
  const input = parsed.data
  const q = input.q?.trim() || undefined
  const [lat, lon] = input.near?.split(',').map(Number) ?? []
  const near = lat === undefined || lon === undefined ? undefined : { lat, lon }
  const filterHash = createHash('sha256')
    .update(JSON.stringify({ kind: input.kind ?? null, near: near ?? null, q: q ?? null }))
    .digest('hex')
  let cursor: { distanceKm: number | null; id: string } | undefined
  if (input.cursor !== undefined) {
    const position = Cursor.safeParse(decodeCursor(input.cursor))
    if (
      !position.success ||
      position.data.filter_hash !== filterHash ||
      (!near && position.data.distance_km !== null)
    ) {
      throw new ApiError(422, 'validation-failed', 'The cursor does not match this catalogue query.', {
        errors: [{ in: 'query', pointer: '/cursor', detail: 'Invalid cursor' }]
      })
    }
    cursor = { distanceKm: position.data.distance_km, id: position.data.id }
  }
  const principal = ctx.principal
  const scopedIds =
    principal.kind === 'share_link'
      ? [principal.projectId]
      : principal.kind === 'oauth' && principal.projectIds !== 'all'
        ? principal.projectIds
        : undefined
  const projectIds = scopedIds?.filter((projectId) => access.can(principal, 'project.view', { projectId }))
  const rows = await listSourcePickerRecords(ctx.tx, {
    kind: input.kind,
    near,
    q,
    limit: input.limit,
    cursor,
    projectIds
  })
  const result = page(rows, input.limit, (row) => ({
    v: 1,
    filter_hash: filterHash,
    distance_km: row.distanceKm,
    id: row.source.id
  }))
  return { data: result.data.map((row) => serializeCatalogueSource(row, access.now)), next_cursor: result.next_cursor }
}
