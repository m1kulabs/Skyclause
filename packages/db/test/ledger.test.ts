// #146 c-ledger-chain: appendLedger and verifyLedger (#79 §1, D11) on the test database.
import { createHash } from 'node:crypto'
import type { Json } from '@skyclause/contracts'
import { eq } from 'drizzle-orm'
import { beforeAll, expect, test } from 'vitest'
import { appendLedger, ledgerEntry, systemPrincipal, verifyLedger, withSystem, withTenant, type Tx } from '../src'
import { makeOrganization, makeProject } from './factories'
import { memberOf, refusal } from './harness'

let orgId: string
const asMember = <T>(fn: (tx: Tx) => Promise<T>) => withTenant({ orgId, principal: memberOf(orgId) }, fn)
const newProject = () => asMember(async (tx) => (await makeProject(tx)).id)

/** D11 by hand: sha256 over prev_hash's 32 bytes and the JCS text, written out here rather than computed. */
const sha256 = (prevHash: string, jcs: string) =>
  createHash('sha256').update(Buffer.from(prevHash, 'hex')).update(jcs, 'utf8').digest('hex')

beforeAll(async () => {
  orgId = (await makeOrganization()).id
})

test('appendLedger chains each entry to the last: seq + 1, prev_hash, and D11’s hash from a zero genesis', async () => {
  const projectId = await newProject()
  const first = await asMember((tx) =>
    appendLedger(tx, { projectId, kind: 'grade', refs: { grade_id: 'g1' }, body: { outcome: 'hit', n: 3 } })
  )
  const second = await asMember((tx) =>
    appendLedger(tx, { projectId, kind: 'call_sent', refs: { call_id: 'c1' }, body: { mode: 'normal' } })
  )
  const rows = await asMember((tx) =>
    tx.query.ledgerEntry.findMany({ where: (l, { eq }) => eq(l.projectId, projectId), orderBy: (l) => l.seq })
  )
  expect(rows.map((row) => [row.id, row.seq])).toEqual([
    [first.id, 1],
    [second.id, 2]
  ])
  const [one, two] = rows as [(typeof rows)[0], (typeof rows)[0]]
  const genesis = '0'.repeat(64)
  expect(one.prevHash).toBe(genesis)
  expect(first.hash).toBe(
    sha256(
      genesis,
      `{"at":"${one.at.toISOString()}","body":{"n":3,"outcome":"hit"},"kind":"grade","refs":{"grade_id":"g1"},"seq":1}`
    )
  )
  expect(one.hash).toBe(first.hash)
  expect(two.prevHash).toBe(first.hash)
  expect(second.hash).toBe(
    sha256(
      first.hash,
      `{"at":"${two.at.toISOString()}","body":{"mode":"normal"},"kind":"call_sent","refs":{"call_id":"c1"},"seq":2}`
    )
  )
})

test('20 concurrent appends on one project take seq 1–20 with no gap, and the chain verifies', async () => {
  const projectId = await newProject()
  const appended = await Promise.all(
    Array.from({ length: 20 }, (_, i) =>
      asMember((tx) => appendLedger(tx, { projectId, kind: 'grade', refs: { grade_id: `g${i}` }, body: { i } }))
    )
  )
  expect(appended.map(({ seq }) => seq).sort((a, b) => a - b)).toEqual(Array.from({ length: 20 }, (_, i) => i + 1))
  const head = appended.find(({ seq }) => seq === 20)!
  expect(await asMember((tx) => verifyLedger(tx, projectId))).toEqual({ ok: true, count: 20, head_hash: head.hash })
})

test('an empty ledger verifies with the genesis hash as its head', async () => {
  const projectId = await newProject()
  expect(await asMember((tx) => verifyLedger(tx, projectId))).toEqual({
    ok: true,
    count: 0,
    head_hash: '0'.repeat(64)
  })
})

test('verifyLedger refuses a transaction without an organisation, where no ledger row is visible', async () => {
  const projectId = await newProject()
  await asMember((tx) => appendLedger(tx, { projectId, kind: 'grade', refs: {}, body: {} }))
  await expect(withSystem('restore-drill', (tx) => verifyLedger(tx, projectId))).rejects.toThrow('withTenant')
})

test('appendLedger refuses an email address anywhere in refs or body (TRD: no personal data)', async () => {
  const projectId = await newProject()
  const append = (refs: Record<string, string>, body: Json) =>
    asMember((tx) => appendLedger(tx, { projectId, kind: 'call_approved', refs, body }))
  await expect(append({}, { approver: 'ana@apu.edu.my' })).rejects.toThrow('email')
  await expect(append({}, { notes: ['sent to ana@apu.edu.my'] })).rejects.toThrow('email')
  await expect(append({ 'ana@apu.edu.my': 'x' }, {})).rejects.toThrow('email')
  await expect(append({ call_id: 'ana@apu.edu.my' }, {})).rejects.toThrow('email')
  expect(await asMember((tx) => verifyLedger(tx, projectId))).toMatchObject({ ok: true, count: 0 })
})

test('corrects names an earlier entry of the same project, and only on a correction', async () => {
  const projectId = await newProject()
  const otherProject = await newProject()
  const old = await asMember((tx) => appendLedger(tx, { projectId, kind: 'grade', refs: {}, body: {} }))
  const elsewhere = await asMember((tx) =>
    appendLedger(tx, { projectId: otherProject, kind: 'grade', refs: {}, body: {} })
  )
  await expect(
    asMember((tx) => appendLedger(tx, { projectId, kind: 'grade', refs: {}, body: {}, corrects: old.id }))
  ).rejects.toThrow("kind 'correction'")
  await expect(
    asMember((tx) => appendLedger(tx, { projectId, kind: 'correction', refs: {}, body: {}, corrects: elsewhere.id }))
  ).rejects.toThrow('names no entry')
  const fix = await asMember((tx) =>
    appendLedger(tx, { projectId, kind: 'correction', refs: { grade_id: 'g' }, body: {}, corrects: old.id })
  )
  expect(fix.seq).toBe(2)
  const [row] = await asMember((tx) => tx.select().from(ledgerEntry).where(eq(ledgerEntry.id, fix.id)))
  expect(row?.corrects).toBe(old.id)
})

test('LED-1: no UPDATE or DELETE on ledger_entry for the app or system roles', async () => {
  const projectId = await newProject()
  const entry = await asMember((tx) => appendLedger(tx, { projectId, kind: 'grade', refs: {}, body: { n: 1 } }))
  const asSystem = <T>(fn: (tx: Tx) => Promise<T>) =>
    withTenant({ orgId, principal: systemPrincipal('ledger-test') }, fn)
  for (const run of [asMember, asSystem]) {
    expect(
      await refusal(
        run((tx) =>
          tx
            .update(ledgerEntry)
            .set({ body: { n: 2 } })
            .where(eq(ledgerEntry.id, entry.id))
        )
      )
    ).toMatch(/permission denied/)
    expect(await refusal(run((tx) => tx.delete(ledgerEntry).where(eq(ledgerEntry.id, entry.id))))).toMatch(
      /permission denied/
    )
  }
  expect(await asMember((tx) => verifyLedger(tx, projectId))).toEqual({ ok: true, count: 1, head_hash: entry.hash })
})
