import type { RegisterAuditCheck } from '@skyclause/contracts'
import { bundle, crossing, member, projectGate, run, type Tx } from '@skyclause/db'
import { and, arrayContains, asc, eq, gte, inArray, lte, or } from 'drizzle-orm'
import { startsRun } from './start-rule'

// #151, SIG-12's 5-minute case (platform: noticed at the next batch, D45): a crossing that met the start rule with no
// bundle 5 minutes later. `b-auditor` (#132) notifies once per open key and once on recovery. Registered once #132
// replaces `registerAuditCheck`'s placeholder, which would throw at worker start.

const GRACE_MS = 5 * 60_000
/** A crossing a day old no longer needs a bundle; its finding closes then. */
const HORIZON_MS = 24 * 60 * 60_000

type Finding = Awaited<ReturnType<Parameters<RegisterAuditCheck>[0]['run']>>[number]

export const crossingWithoutBundle: Parameters<RegisterAuditCheck>[0] = {
  name: 'crossing_without_bundle',
  scope: 'org',
  run: async (handle, now) => {
    const tx = handle as Tx
    const t = Date.parse(now)
    const crossings = await tx
      .select()
      .from(crossing)
      .where(and(gte(crossing.at, new Date(t - HORIZON_MS)), lte(crossing.at, new Date(t - GRACE_MS))))
      .orderBy(asc(crossing.at), asc(crossing.id))
    const findings: Finding[] = []
    let admins: string[] | undefined
    for (const c of crossings) {
      if ((await projectGate(tx, c.projectId)) !== 'open') continue
      const key = `crossing:${c.id}`
      const serving = await tx
        .select({ id: run.id })
        .from(run)
        .where(or(eq(run.dedupeKey, key), arrayContains(run.coalescedKeys, [key])))
      const met =
        serving.length > 0 ||
        (await startsRun(tx, {
          projectId: c.projectId,
          pack: c.pack,
          scope: { kind: c.scopeKind, id: c.scopeId },
          to: c.to,
          verdictHash: c.verdictHash
        }))
      if (!met) continue
      // Any bundle counts: one in Needs review, or one closed as all-Normal (CAL-5), which never enters it.
      const [drafted] = serving.length
        ? await tx
            .select({ id: bundle.id })
            .from(bundle)
            .where(
              inArray(
                bundle.runId,
                serving.map((r) => r.id)
              )
            )
            .limit(1)
        : []
      if (drafted) continue
      admins ??= (
        await tx
          .select({ userId: member.userId })
          .from(member)
          .where(and(eq(member.organizationId, tx.orgId!), inArray(member.role, ['owner', 'admin'])))
          .orderBy(asc(member.userId))
      ).map((m) => m.userId)
      findings.push({ key, projectId: c.projectId, accountIds: admins, ref: { type: 'crossing', id: c.id } })
    }
    return findings
  }
}
