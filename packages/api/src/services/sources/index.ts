import { createHash } from 'node:crypto'
import { type Can, type Operations, type Page } from '@skyclause/contracts'
import { listCatalogueSources as catalogueRoute } from '@skyclause/contracts/api/v1/catalogue'
import { listSourcePickerRecords } from '@skyclause/db'
import { z } from 'zod'
import { decodeCursor, page } from '../../pagination'
import { ApiError, validationFailed } from '../../problems'
import type { ServiceContext } from '../../tenancy'
import { serializeCatalogueSource, type CatalogueSourceView } from './serialize'

export type { CatalogueSourceView, BoundSourceView } from './serialize'
export type SourcesAccess = { can: Can; now: Date }
export type CatalogueQuery = z.infer<Operations['listCatalogueSources']['request']['query']>

const querySchema = catalogueRoute.request.query
const Cursor = z
  .object({ v: z.literal(1), filter_hash: z.string(), distance_km: z.number().nonnegative().nullable(), id: z.uuid() })
  .strict()

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
