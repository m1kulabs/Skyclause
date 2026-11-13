import { randomUUID } from 'node:crypto'
import { bundle, crossing, run, systemPrincipal, withTenant, type Tx } from '@skyclause/db'
import { makeBundle, makeCrossing, makeOrganization, makeProject, makeRun } from '@skyclause/db/test/factories/index'
import { and, eq, gte, lt, sql } from 'drizzle-orm'
import { expect, test } from 'vitest'
import { databaseReads } from '../src/sli/reads'

// #600: crossing to needs review looks the crossings a run serves up by ID, and finds exactly the ones that matching
// `'crossing:' || crossing.id` against the run's keys found, whatever the keys hold.

const at = (hhmm: string) => new Date(`2026-11-06T${hhmm}:00Z`)
const window = { from: at('09:00'), to: at('10:00') }

const inOrg = <T>(orgId: string, fn: (tx: Tx) => Promise<T>) =>
  withTenant({ orgId, principal: systemPrincipal('test') }, fn)

/** The read as it was before #600, matching each crossing's key text against the run's keys. */
const byKeyText = (tx: Tx) =>
  tx
    .select({ needsReviewAt: bundle.needsReviewAt, crossingAt: sql<Date>`min(${crossing.at})`.mapWith(crossing.at) })
    .from(bundle)
    .innerJoin(run, eq(run.id, bundle.runId))
    .innerJoin(
      crossing,
      sql`'crossing:' || ${crossing.id} = ANY (array_append(${run.coalescedKeys}, ${run.dedupeKey}))`
    )
    .where(and(gte(bundle.needsReviewAt, window.from), lt(bundle.needsReviewAt, window.to)))
    .groupBy(bundle.id)

const byReview = <T extends { needsReviewAt: Date | null }>(rows: T[]) =>
  rows.sort((a, b) => a.needsReviewAt!.getTime() - b.needsReviewAt!.getTime())

test('a run serves the crossings its keys name in canonical text, and no other key fails the read', async () => {
  const elsewhere = await inOrg((await makeOrganization()).id, (tx) => makeCrossing(tx, { at: at('09:00') }))
  const orgId = (await makeOrganization()).id
  await inOrg(orgId, async (tx) => {
    const { id: projectId } = await makeProject(tx)
    const crossed = async (hhmm: string) => (await makeCrossing(tx, { projectId, at: at(hhmm) })).id
    const reviewed = async (hhmm: string, dedupeKey: string, coalescedKeys: string[] = []) => {
      const { id: runId } = await makeRun(tx, {
        projectId,
        trigger: 'crossing',
        status: 'drafted',
        dedupeKey,
        coalescedKeys
      })
      await makeBundle(tx, { runId, state: 'needs_review', needsReviewAt: at(hhmm) })
    }
    // Its own crossing and an earlier one coalesced into it: the earlier counts.
    await reviewed('09:02', `crossing:${await crossed('09:01')}`, [`crossing:${await crossed('08:58')}`])
    // A coalesced crossing, named twice, among keys of other kinds.
    const twice = await crossed('09:10')
    await reviewed('09:12', `schedule:${randomUUID()}`, [
      `request:${randomUUID()}`,
      `crossing:${twice}`,
      `crossing:${twice}`
    ])
    // Keys that only resemble a crossing's: no crossing matches, and none is cast.
    const resembled = await crossed('09:20')
    await reviewed('09:22', `crossing:${resembled.toUpperCase()}`, [
      `crossing:{${resembled}}`,
      `crossing:${resembled.replaceAll('-', '')}`,
      `crossing:${resembled}\n`,
      ` crossing:${resembled}`,
      `Crossing:${resembled}`,
      'crossing:',
      'crossing:not-a-uuid'
    ])
    // Another organisation's crossing, and one that doesn't exist.
    await reviewed('09:32', `crossing:${elsewhere.id}`, [`crossing:${randomUUID()}`])
    // After the window.
    await reviewed('10:00', `crossing:${await crossed('09:58')}`)
  })

  const expected = [
    { needsReviewAt: at('09:02'), crossingAt: at('08:58') },
    { needsReviewAt: at('09:12'), crossingAt: at('09:10') }
  ]
  expect(byReview(await databaseReads().reviews(window))).toEqual(expected)
  expect(byReview(await inOrg(orgId, byKeyText))).toEqual(expected)
})
