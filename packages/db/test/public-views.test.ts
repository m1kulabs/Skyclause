// RLS P (#79 §3): public_reader sees public projects' approved calls, their grades and the ledger through views, and
// nothing of a private project or an unapproved call.
import { expect, test } from 'vitest'
import { grade, publicCall, publicGrade, publicLedgerEntry, withPublicReader, withTenant, type Tx } from '../src'
import {
  makeBundle,
  makeCall,
  makeGrade,
  makeLedgerEntry,
  makeNight,
  makeOrganization,
  makeProject,
  makeRun,
  sheetVersionIn
} from './factories'
import { memberOf } from './harness'

/** makeGrade grades a call; a Crowd night's grade has none. */
async function nightGrade(tx: Tx, projectId: string, nightId: string) {
  const sheetVersionId = await sheetVersionIn(tx, projectId)
  const values = {
    orgId: tx.orgId!,
    projectId,
    nightId,
    sheetVersionId,
    pack: 'crowd' as const,
    outcome: 'in_band' as const,
    localDate: '2026-11-14'
  }
  const [row] = await tx
    .insert(grade)
    .values({ ...values, modeDiff: 0, noCall: false, agrees: true, staleInputs: false })
    .returning({ id: grade.id })
  return row!.id
}

test('public_call, public_grade and public_ledger_entry show approved calls, their grades and the ledger of public projects only', async () => {
  const orgId = (await makeOrganization()).id
  const made = await withTenant({ orgId, principal: memberOf(orgId) }, async (tx) => {
    const callsIn = async (isPublic: boolean) => {
      const projectId = (await makeProject(tx, { public: isPublic })).id
      const bundleId = (await makeBundle(tx, { runId: (await makeRun(tx, { projectId })).id })).id
      const approved = await makeCall(tx, { bundleId, approvedAt: new Date(), state: 'sent' })
      const drafted = await makeCall(tx, { bundleId })
      const night = await makeNight(tx, { projectId })
      return {
        approved: approved.id,
        drafted: drafted.id,
        approvedGrade: (await makeGrade(tx, { callId: approved.id })).id,
        draftedGrade: (await makeGrade(tx, { callId: drafted.id })).id,
        nightGrade: await nightGrade(tx, projectId, night.id),
        ledger: (await makeLedgerEntry(tx, { projectId })).id
      }
    }
    return { open: await callsIn(true), closed: await callsIn(false) }
  })
  const seen = await withPublicReader(async (tx) => ({
    calls: (await tx.select({ id: publicCall.id }).from(publicCall)).map(({ id }) => id),
    grades: (await tx.select({ id: publicGrade.id }).from(publicGrade)).map(({ id }) => id),
    ledger: (await tx.select({ id: publicLedgerEntry.id }).from(publicLedgerEntry)).map(({ id }) => id)
  }))
  const ours = new Set([...Object.values(made.open), ...Object.values(made.closed)])
  const mine = (ids: string[]) => ids.filter((id) => ours.has(id)).sort()
  expect({ calls: mine(seen.calls), grades: mine(seen.grades), ledger: mine(seen.ledger) }).toEqual({
    calls: [made.open.approved],
    grades: [made.open.approvedGrade, made.open.nightGrade].sort(),
    ledger: [made.open.ledger]
  })
})
