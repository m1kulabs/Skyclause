import type { Can, Operations, Pack, Principal, Project, ProjectPack } from '@skyclause/contracts'
import {
  archiveProjectRecord,
  createProjectRecord,
  getProjectRecord,
  getProjectSummaryRecord,
  listProjectRecords,
  ProjectSlugError,
  restoreProjectRecord,
  updateProjectRecord,
  type project,
  type projectPack
} from '@skyclause/db'
import { z } from 'zod'
import { decodeCursor, page } from '../../pagination'
import { ApiError } from '../../problems'
import { instant } from '../../serialize'
import type { ServiceContext } from '../../tenancy'

type Ok<Id extends keyof Operations> = Operations[Id] extends {
  responses: { 200: { content: { 'application/json': { schema: z.ZodType<infer T> } } } }
}
  ? T
  : never

export type ProjectSettingsView = Ok<'updateProject'>
export type ProjectWithSummaryView = Ok<'listProjects'>['data'][number]

export interface CreateProjectInput {
  name: string
  slug: string
  site_name: string
  site_lat: number
  site_lon: number
  time_zone?: string
  packs: Pack[]
  semester_ends_on?: string | null
  camera_day_start?: string | null
  camera_day_end?: string | null
  warning_area_terms?: string[]
}

export interface UpdateProjectInput {
  name?: string
  slug?: string
  time_zone?: string
  public?: boolean
  semester_ends_on?: string | null
  site_name?: string | null
  site_lat?: number | null
  site_lon?: number | null
  camera_day_start?: string | null
  camera_day_end?: string | null
  warning_area_terms?: string[]
  packs?: Array<{
    pack: Pack
    enabled?: boolean
    schedule?: ProjectPack['schedule']
    sla_s?: number | null
  }>
  rota_override?: ProjectSettingsView['rota_override']
}

const notFound = () => new ApiError(404, 'not-found', 'No project with this ID.')

function inScope(principal: Principal, projectId: string): boolean {
  if (principal.kind === 'share_link') return principal.projectId === projectId
  if (principal.kind === 'oauth') return principal.projectIds === 'all' || principal.projectIds.includes(projectId)
  return true
}

function allowedProjectIds(principal: Principal): string[] | undefined {
  if (principal.kind === 'share_link') return [principal.projectId]
  if (principal.kind === 'oauth' && principal.projectIds !== 'all') return principal.projectIds
  return undefined
}

function serializeProjectPack(row: typeof projectPack.$inferSelect): ProjectPack {
  return {
    pack: row.pack,
    enabled: row.enabled,
    sheet_id: row.sheetId,
    schedule: (row.schedule as ProjectPack['schedule']) ?? null,
    sla_s: row.slaS
  }
}

function serializeProject(row: typeof project.$inferSelect, packs: Array<typeof projectPack.$inferSelect>): Project {
  return {
    id: row.id,
    org_id: row.orgId,
    name: row.name,
    slug: row.slug,
    time_zone: row.timeZone,
    public: row.public,
    semester_ends_on: row.semesterEndsOn,
    site_name: row.siteName,
    site_lat: row.siteLat,
    site_lon: row.siteLon,
    archived_at: row.archivedAt ? instant(row.archivedAt) : null,
    camera_day_start: row.cameraDayStart,
    camera_day_end: row.cameraDayEnd,
    warning_area_terms: row.warningAreaTerms,
    packs: packs.map(serializeProjectPack)
  }
}

function toSlugApiError(error: unknown): never {
  if (error instanceof ProjectSlugError) {
    throw new ApiError(422, error.code, error.message, {
      field: 'slug',
      reason: error.reason,
      errors: [{ in: 'body', pointer: '/slug', detail: error.message }]
    })
  }
  throw error
}

const CursorPosition = z.object({ at: z.iso.datetime(), id: z.string() })
function parseCursor(cursor: string | undefined): { createdAt: Date; id: string } | null {
  if (!cursor) return null
  const parsed = CursorPosition.safeParse(decodeCursor(cursor))
  if (!parsed.success) {
    throw new ApiError(422, 'validation-failed', 'The cursor is not one this API issued.', {
      errors: [{ in: 'query', pointer: '/cursor', detail: 'Invalid cursor' }]
    })
  }
  return { createdAt: new Date(parsed.data.at), id: parsed.data.id }
}

/**
 * #137 `POST /api/orgs/{org}/projects` and onboarding seam (#179): runs in the caller's tenant transaction.
 */
export async function createProject(
  ctx: ServiceContext,
  input: CreateProjectInput,
  o: { now?: Date } = {}
): Promise<Project> {
  try {
    const created = await createProjectRecord(
      ctx.tx,
      {
        name: input.name,
        slug: input.slug,
        siteName: input.site_name,
        siteLat: input.site_lat,
        siteLon: input.site_lon,
        timeZone: input.time_zone,
        packs: input.packs,
        semesterEndsOn: input.semester_ends_on,
        cameraDayStart: input.camera_day_start,
        cameraDayEnd: input.camera_day_end,
        warningAreaTerms: input.warning_area_terms
      },
      o.now ?? new Date()
    )
    return serializeProject(created.project, created.packs)
  } catch (error) {
    toSlugApiError(error)
  }
}

/**
 * #137 `GET /v1/projects/{id}`: returns the project if it belongs to the tenant and is within the principal's scope.
 */
export async function getProject(ctx: ServiceContext, id: string, o: { can?: Can } = {}): Promise<Project> {
  if (!inScope(ctx.principal, id)) throw notFound()
  if (o.can && !o.can(ctx.principal, 'project.view', { projectId: id })) throw notFound()
  const record = await getProjectRecord(ctx.tx, id)
  if (!record) throw notFound()
  return serializeProject(record.project, record.packs)
}

/**
 * #137 `GET /v1/projects`: lists projects visible to the principal in the tenant, optionally with D3 summaries.
 */
export async function listProjects(
  ctx: ServiceContext,
  query: { slug?: string; include?: 'summary'; limit: number; cursor?: string },
  o: { now?: Date } = {}
): Promise<{ data: ProjectWithSummaryView[]; next_cursor: string | null }> {
  const cursor = parseCursor(query.cursor)
  const projectIds = allowedProjectIds(ctx.principal)
  const rows = await listProjectRecords(ctx.tx, {
    slug: query.slug,
    projectIds,
    limit: query.limit,
    cursor
  })
  const paged = page(rows, query.limit, (row) => ({
    at: instant(row.project.createdAt),
    id: row.project.id
  }))

  const now = o.now ?? new Date()
  const data: ProjectWithSummaryView[] = []
  for (const row of paged.data) {
    const base = serializeProject(row.project, row.packs)
    if (query.include === 'summary') {
      const summary = await getProjectSummaryRecord(ctx.tx, row.project.id, now)
      data.push({ ...base, summary })
    } else {
      data.push(base)
    }
  }

  return {
    data,
    next_cursor: paged.next_cursor
  }
}

/**
 * #137 `PATCH /api/projects/{id}`: updates #137-owned project fields; changing `public` also requires `public_pages.edit`.
 */
export async function updateProject(
  ctx: ServiceContext,
  id: string,
  patch: UpdateProjectInput,
  o: { can?: Can; now?: Date } = {}
): Promise<ProjectSettingsView> {
  if (!inScope(ctx.principal, id)) throw notFound()
  if (patch.public !== undefined && o.can && !o.can(ctx.principal, 'public_pages.edit', { projectId: id })) {
    throw new ApiError(403, 'insufficient-scope', 'This operation requires public_pages.edit.')
  }
  try {
    const updated = await updateProjectRecord(
      ctx.tx,
      id,
      {
        name: patch.name,
        slug: patch.slug,
        timeZone: patch.time_zone,
        public: patch.public,
        semesterEndsOn: patch.semester_ends_on,
        siteName: patch.site_name,
        siteLat: patch.site_lat,
        siteLon: patch.site_lon,
        cameraDayStart: patch.camera_day_start,
        cameraDayEnd: patch.camera_day_end,
        warningAreaTerms: patch.warning_area_terms
      },
      o.now ?? new Date()
    )
    if (!updated) throw notFound()
    return {
      ...serializeProject(updated.project, updated.packs),
      rota_override: updated.rotaOverride
    }
  } catch (error) {
    toSlugApiError(error)
  }
}

/**
 * #137 `POST /api/projects/{id}/archive` and org deletion seam (#182): idempotently sets `archived_at` in the caller's transaction.
 */
export async function archiveProject(
  ctx: ServiceContext,
  id: string,
  o: { now?: Date } = {}
): Promise<ProjectSettingsView> {
  if (!inScope(ctx.principal, id)) throw notFound()
  const archived = await archiveProjectRecord(ctx.tx, id, o.now ?? new Date())
  if (!archived) throw notFound()
  return {
    ...serializeProject(archived.project, archived.packs),
    rota_override: archived.rotaOverride
  }
}

/**
 * #137 `POST /api/projects/{id}/restore`: idempotently clears `archived_at` in the caller's transaction.
 */
export async function restoreProject(
  ctx: ServiceContext,
  id: string,
  o: { now?: Date } = {}
): Promise<ProjectSettingsView> {
  if (!inScope(ctx.principal, id)) throw notFound()
  const restored = await restoreProjectRecord(ctx.tx, id, o.now ?? new Date())
  if (!restored) throw notFound()
  return {
    ...serializeProject(restored.project, restored.packs),
    rota_override: restored.rotaOverride
  }
}
