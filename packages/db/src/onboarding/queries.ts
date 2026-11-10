import { and, asc, desc, eq, inArray, isNull } from 'drizzle-orm'
import { reading } from '../schema/partitioned'
import {
  member,
  organization,
  project,
  projectChannel,
  projectSource,
  rotaShift,
  source,
  sourceState,
  window
} from '../schema'
import type { Tx } from '../client'

export const ONBOARDING_STEPS = ['organisation', 'project', 'sources', 'window', 'rota', 'channel'] as const
export type OnboardingStep = (typeof ONBOARDING_STEPS)[number]

export interface OnboardingRows {
  organization: typeof organization.$inferSelect
  membership: typeof member.$inferSelect | null
  project: typeof project.$inferSelect | null
  sources: Array<{
    binding: typeof projectSource.$inferSelect
    source: typeof source.$inferSelect
    state: typeof sourceState.$inferSelect | null
    reading: typeof reading.$inferSelect | null
  }>
  window: typeof window.$inferSelect | null
  rota: { shift: typeof rotaShift.$inferSelect; role: string } | null
  channel: typeof projectChannel.$inferSelect | null
  skipped: OnboardingStep[]
}

function parseSkipped(value: unknown): OnboardingStep[] {
  let parsed = value
  if (typeof value === 'string') {
    try {
      parsed = JSON.parse(value)
    } catch {
      return []
    }
  }
  if (!Array.isArray(parsed)) return []
  return parsed.filter((step): step is OnboardingStep => ONBOARDING_STEPS.includes(step as OnboardingStep))
}

/** Reads ORG-6 state from each owning row. All project steps refer to the organisation's first project. */
export async function getOnboardingRows(tx: Tx, orgId: string): Promise<OnboardingRows | null> {
  const [org] = await tx.select().from(organization).where(eq(organization.id, orgId)).limit(1)
  if (!org) return null

  const [membershipRow] = await tx
    .select()
    .from(member)
    .where(eq(member.organizationId, orgId))
    .orderBy(asc(member.createdAt), asc(member.id))
    .limit(1)

  const [firstProject] = await tx
    .select()
    .from(project)
    .where(eq(project.orgId, orgId))
    .orderBy(asc(project.createdAt), asc(project.id))
    .limit(1)

  const sources = firstProject
    ? await tx
        .select({ binding: projectSource, source, state: sourceState })
        .from(projectSource)
        .innerJoin(source, eq(projectSource.sourceId, source.id))
        .leftJoin(sourceState, eq(sourceState.sourceId, source.id))
        .where(eq(projectSource.projectId, firstProject.id))
        .orderBy(asc(projectSource.createdAt), asc(projectSource.id))
    : []
  const sourcesWithReadings = await Promise.all(
    sources.map(async (row) => {
      const [latest] = await tx
        .select()
        .from(reading)
        .where(eq(reading.sourceId, row.source.id))
        .orderBy(desc(reading.observedAt), desc(reading.revision), desc(reading.id))
        .limit(1)
      return { ...row, reading: latest ?? null }
    })
  )

  const [firstWindow] = firstProject
    ? await tx
        .select()
        .from(window)
        .where(and(eq(window.projectId, firstProject.id), eq(window.guest, false)))
        .orderBy(asc(window.createdAt), asc(window.id))
        .limit(1)
    : []

  const [approverShift] = await tx
    .select({ shift: rotaShift, role: member.role })
    .from(rotaShift)
    .innerJoin(member, and(eq(member.organizationId, rotaShift.orgId), eq(member.userId, rotaShift.accountId)))
    .where(
      and(eq(rotaShift.orgId, orgId), isNull(rotaShift.projectId), inArray(member.role, ['owner', 'admin', 'approver']))
    )
    .orderBy(asc(rotaShift.createdAt), asc(rotaShift.id))
    .limit(1)

  const [enabledChannel] = firstProject
    ? await tx
        .select()
        .from(projectChannel)
        .where(and(eq(projectChannel.projectId, firstProject.id), eq(projectChannel.enabled, true)))
        .orderBy(asc(projectChannel.updatedAt), asc(projectChannel.id))
        .limit(1)
    : []

  return {
    organization: org,
    membership: membershipRow ?? null,
    project: firstProject ?? null,
    sources: sourcesWithReadings,
    window: firstWindow ?? null,
    rota: approverShift ?? null,
    channel: enabledChannel ?? null,
    skipped: parseSkipped(org.onboardingSkipped)
  }
}

/** Persists step IDs in auth.organization.onboarding_skipped; this field is a JSON array in the #142 schema. */
export async function setOnboardingSkipped(
  tx: Tx,
  orgId: string,
  step: OnboardingStep,
  skipped: boolean
): Promise<void> {
  const [row] = await tx
    .select({ onboardingSkipped: organization.onboardingSkipped })
    .from(organization)
    .where(eq(organization.id, orgId))
    .limit(1)
  if (!row) return
  const steps = new Set(parseSkipped(row.onboardingSkipped))
  if (skipped) steps.add(step)
  else steps.delete(step)
  await tx
    .update(organization)
    .set({ onboardingSkipped: [...steps] })
    .where(eq(organization.id, orgId))
}
