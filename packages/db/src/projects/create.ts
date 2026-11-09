import { canonicalHash } from '@skyclause/clauses'
import crowdDefault from '@skyclause/clauses/defaults/crowd.json' with { type: 'json' }
import skyDefault from '@skyclause/clauses/defaults/sky.json' with { type: 'json' }
import { RESERVED_SLUGS, SLUG_REGEX, type Pack, type TxHandle } from '@skyclause/contracts'
import { and, eq, ne, sql } from 'drizzle-orm'
import { track } from '../analytics'
import { DEFAULT_SLA_S } from '../bundles'
import type { Tx } from '../client'
import { clauseSheet, project, projectPack, sheetVersion } from '../schema'
import { getProjectSettingsRecord, normalizeProjectRow, UUID_REGEX } from './queries'

const ALL_PACKS: readonly Pack[] = ['sky', 'crowd']
const RESERVED_SET = new Set<string>(RESERVED_SLUGS)
const DEFAULT_SHEETS: Record<Pack, unknown> = {
  sky: skyDefault,
  crowd: crowdDefault
}

export class ProjectSlugError extends Error {
  readonly field = 'slug' as const
  constructor(
    readonly code: 'slug-reserved' | 'slug-taken' | 'validation-failed',
    readonly reason: 'reserved' | 'taken' | 'invalid',
    readonly slug: string,
    message: string
  ) {
    super(message)
    this.name = 'ProjectSlugError'
  }
}

export class ProjectTimeZoneError extends Error {
  readonly field = 'time_zone' as const
  constructor() {
    super('time_zone must name a supported PostgreSQL time zone.')
    this.name = 'ProjectTimeZoneError'
  }
}

async function validateProjectTimeZone(tx: Tx, timeZone: string): Promise<void> {
  const result = await tx.execute<{ valid: boolean }>(sql`
    SELECT EXISTS (SELECT 1 FROM pg_timezone_names WHERE lower(name) = lower(${timeZone})) AS valid
  `)
  if (!result.rows[0]?.valid) throw new ProjectTimeZoneError()
}

export function validateProjectSlug(slug: string): void {
  if (!SLUG_REGEX.test(slug)) {
    throw new ProjectSlugError('validation-failed', 'invalid', slug, `The slug "${slug}" is invalid.`)
  }
  if (RESERVED_SET.has(slug)) {
    throw new ProjectSlugError('slug-reserved', 'reserved', slug, `The slug "${slug}" is reserved.`)
  }
}

export interface CreateProjectRecordInput {
  name: string
  slug: string
  siteName: string
  siteLat: number
  siteLon: number
  timeZone?: string
  packs: Pack[]
  semesterEndsOn?: string | null
  cameraDayStart?: string | null
  cameraDayEnd?: string | null
  warningAreaTerms?: string[]
}

export interface UpdateProjectRecordInput {
  name?: string
  slug?: string
  timeZone?: string
  public?: boolean
  semesterEndsOn?: string | null
  siteName?: string | null
  siteLat?: number | null
  siteLon?: number | null
  cameraDayStart?: string | null
  cameraDayEnd?: string | null
  warningAreaTerms?: string[]
}

/**
 * #137 atomic project creation in the caller's tenant transaction: writes `project`, both `project_pack` rows
 * (Sky follows `input.packs`, Crowd always starts disabled per D18/PRJ-3, SLA defaults 600/7200 per PRJ-7),
 * both default sheets as version 1 published by `system` (`published_by = null`, no ledger entry per D18),
 * and tracks `project_created`.
 */
export async function createProjectRecord(handle: TxHandle, input: CreateProjectRecordInput, now: Date = new Date()) {
  const tx = handle as Tx
  const orgId = tx.orgId!
  validateProjectSlug(input.slug)
  await validateProjectTimeZone(tx, input.timeZone ?? 'Asia/Kuala_Lumpur')

  await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtextextended(${`project-slug:${orgId}:${input.slug}`}, 0))`)

  const [created] = await tx
    .insert(project)
    .values({
      orgId,
      name: input.name,
      slug: input.slug,
      timeZone: input.timeZone ?? 'Asia/Kuala_Lumpur',
      public: false,
      semesterEndsOn: input.semesterEndsOn ?? null,
      siteName: input.siteName,
      siteLat: input.siteLat,
      siteLon: input.siteLon,
      archivedAt: null,
      cameraDayStart: input.cameraDayStart ?? null,
      cameraDayEnd: input.cameraDayEnd ?? null,
      warningAreaTerms: input.warningAreaTerms ?? [],
      createdAt: now,
      updatedAt: now
    })
    .onConflictDoNothing({ target: [project.orgId, project.slug] })
    .returning()

  if (!created) {
    throw new ProjectSlugError(
      'slug-taken',
      'taken',
      input.slug,
      `The slug "${input.slug}" is already taken in this organisation.`
    )
  }

  const sheets: Array<typeof clauseSheet.$inferSelect> = []
  const versions: Array<typeof sheetVersion.$inferSelect> = []
  const packs: Array<typeof projectPack.$inferSelect> = []

  for (const pack of ALL_PACKS) {
    const content = DEFAULT_SHEETS[pack]
    const contentHash = canonicalHash(content)

    const [sheet] = await tx
      .insert(clauseSheet)
      .values({
        orgId,
        projectId: created.id,
        pack,
        liveVersionId: null,
        createdAt: now,
        updatedAt: now
      })
      .returning()

    const [version] = await tx
      .insert(sheetVersion)
      .values({
        orgId,
        sheetId: sheet!.id,
        n: 1,
        status: 'published',
        content,
        contentHash,
        publishedBy: null,
        publishedAt: now,
        createdAt: now,
        updatedAt: now
      })
      .returning()

    const [updatedSheet] = await tx
      .update(clauseSheet)
      .set({ liveVersionId: version!.id, updatedAt: now })
      .where(eq(clauseSheet.id, sheet!.id))
      .returning()

    const [packRow] = await tx
      .insert(projectPack)
      .values({
        orgId,
        projectId: created.id,
        pack,
        // Sky is enabled when chosen; Crowd always starts off until PRJ-3's sources are bound (#138).
        enabled: pack === 'sky' ? input.packs.includes('sky') : false,
        sheetId: updatedSheet!.id,
        schedule: null,
        slaS: DEFAULT_SLA_S[pack],
        createdAt: now,
        updatedAt: now
      })
      .returning()

    sheets.push(updatedSheet!)
    versions.push(version!)
    packs.push(packRow!)
  }

  await track(tx, 'project_created', { packs: input.packs }, { projectId: created.id })

  return {
    project: normalizeProjectRow(created),
    packs,
    sheets,
    versions
  }
}

export async function updateProjectRecord(
  handle: TxHandle,
  projectId: string,
  patch: UpdateProjectRecordInput,
  now: Date = new Date()
) {
  if (!UUID_REGEX.test(projectId)) return null
  const tx = handle as Tx
  const orgId = tx.orgId!

  const [existing] = await tx.select().from(project).where(eq(project.id, projectId)).for('update')
  if (!existing) return null

  if (patch.timeZone !== undefined) await validateProjectTimeZone(tx, patch.timeZone)

  if (patch.slug !== undefined) {
    validateProjectSlug(patch.slug)
    if (patch.slug !== existing.slug) {
      await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtextextended(${`project-slug:${orgId}:${patch.slug}`}, 0))`)
      const [conflict] = await tx
        .select({ id: project.id })
        .from(project)
        .where(and(eq(project.orgId, orgId), eq(project.slug, patch.slug), ne(project.id, projectId)))
      if (conflict) {
        throw new ProjectSlugError(
          'slug-taken',
          'taken',
          patch.slug,
          `The slug "${patch.slug}" is already taken in this organisation.`
        )
      }
    }
  }

  const updates: Partial<typeof project.$inferInsert> = { updatedAt: now }
  if (patch.name !== undefined) updates.name = patch.name
  if (patch.slug !== undefined) updates.slug = patch.slug
  if (patch.timeZone !== undefined) updates.timeZone = patch.timeZone
  if (patch.public !== undefined) updates.public = patch.public
  if (patch.semesterEndsOn !== undefined) updates.semesterEndsOn = patch.semesterEndsOn
  if (patch.siteName !== undefined) updates.siteName = patch.siteName
  if (patch.siteLat !== undefined) updates.siteLat = patch.siteLat
  if (patch.siteLon !== undefined) updates.siteLon = patch.siteLon
  if (patch.cameraDayStart !== undefined) updates.cameraDayStart = patch.cameraDayStart
  if (patch.cameraDayEnd !== undefined) updates.cameraDayEnd = patch.cameraDayEnd
  if (patch.warningAreaTerms !== undefined) updates.warningAreaTerms = patch.warningAreaTerms

  await tx.update(project).set(updates).where(eq(project.id, projectId))
  return getProjectSettingsRecord(tx, projectId)
}

export async function archiveProjectRecord(handle: TxHandle, projectId: string, now: Date = new Date()) {
  if (!UUID_REGEX.test(projectId)) return null
  const tx = handle as Tx
  const [existing] = await tx.select().from(project).where(eq(project.id, projectId)).for('update')
  if (!existing) return null

  if (existing.archivedAt === null) {
    await tx.update(project).set({ archivedAt: now, updatedAt: now }).where(eq(project.id, projectId))
  }
  return getProjectSettingsRecord(tx, projectId)
}

export async function restoreProjectRecord(handle: TxHandle, projectId: string, now: Date = new Date()) {
  if (!UUID_REGEX.test(projectId)) return null
  const tx = handle as Tx
  const [existing] = await tx.select().from(project).where(eq(project.id, projectId)).for('update')
  if (!existing) return null

  if (existing.archivedAt !== null) {
    await tx.update(project).set({ archivedAt: null, updatedAt: now }).where(eq(project.id, projectId))
  }
  return getProjectSettingsRecord(tx, projectId)
}
