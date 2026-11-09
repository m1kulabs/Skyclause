// #146 LED-8: the pilot-archive job on the test database, with an in-memory bucket in place of ARCHIVE_BUCKET.
import { createHash } from 'node:crypto'
import { appendLedger, listPilotArchive, systemPrincipal, withTenant, type Tx } from '@skyclause/db'
import { makeOrganization, makeProject } from '@skyclause/db/test/factories/index'
import { asLogin, expectOneAudit, memberOf } from '@skyclause/db/test/harness/index'
import { beforeAll, expect, test } from 'vitest'
import { archivePilotRecords, type ArchiveBucket } from '../src/pilot-archive/run'

let orgId: string
let orgSlug: string
const inOrg = <T>(fn: (tx: Tx) => Promise<T>) => withTenant({ orgId, principal: memberOf(orgId) }, fn)
const sha256 = (text: string) => createHash('sha256').update(text).digest('hex')

/** The bucket's objects by name, each with its bytes and custom metadata. */
function memoryBucket(objects: Record<string, { bytes: string; metadata: Record<string, string> }>) {
  const store = new Map(Object.entries(objects))
  const bucket: ArchiveBucket = {
    async list(prefix) {
      return [...store].filter(([name]) => name.startsWith(prefix)).map(([name, { metadata }]) => ({ name, metadata }))
    },
    async sha256(name) {
      return sha256(store.get(name)!.bytes)
    },
    async copy(from, to) {
      if (store.has(to)) return 'exists'
      store.set(to, store.get(from)!)
      return 'copied'
    }
  }
  return { store, bucket }
}

const ledgerCount = () =>
  asLogin('postgres', async (client) => Number((await client.query('SELECT count(*) FROM ledger_entry')).rows[0].count))

beforeAll(async () => {
  const org = await makeOrganization()
  orgId = org.id
  orgSlug = org.slug
})

test('copies each incoming file under the organisation, records it once for PILOT_PROJECT, and never touches the ledger', async () => {
  const project = await inOrg((tx) => makeProject(tx))
  await inOrg((tx) => appendLedger(tx, { projectId: project.id, kind: 'grade', refs: {}, body: {} }))
  const files = {
    'incoming/ledger.csv': {
      bytes: 'seq,kind\n1,call_approved\n',
      kind: 'sheets_ledger',
      at: '2026-11-17T18:00:00+08:00'
    },
    'incoming/register.csv': { bytes: 'key,summary\nSKY-1,storm\n', kind: 'jira_register', at: '2026-11-17T10:05:00Z' },
    'incoming/ana@apu.edu.my traces.jsonl': { bytes: '{"run":1}\n', kind: 'run_traces', at: '2026-11-17T10:10:00Z' }
  }
  const { store, bucket } = memoryBucket(
    Object.fromEntries(
      Object.entries(files).map(([name, f]) => [
        name,
        { bytes: f.bytes, metadata: { kind: f.kind, 'captured-at': f.at } }
      ])
    )
  )
  const before = await ledgerCount()

  const results = await archivePilotRecords(bucket, `${orgSlug}/${project.slug}`)

  const expected = Object.values(files).map((f, i) => ({
    kind: f.kind,
    sha256: sha256(f.bytes),
    objectPath: `orgs/${orgId}/pilot/${f.kind}/${sha256(f.bytes)}-${['ledger.csv', 'register.csv', 'ana_apu.edu.my_traces.jsonl'][i]}`
  }))
  expect(results).toEqual(expected.map((e) => ({ ...e, copied: 'copied', created: true })))
  for (const { objectPath } of expected) expect(store.get(objectPath)?.bytes).toBeDefined()
  expect(store.get(expected[0]!.objectPath)?.bytes).toBe(files['incoming/ledger.csv'].bytes)
  const rows = await withTenant({ orgId, principal: systemPrincipal('test') }, (tx) => listPilotArchive(tx, project.id))
  expect(rows.map(({ kind, sha256, objectPath, capturedAt }) => ({ kind, sha256, objectPath, capturedAt }))).toEqual(
    expect.arrayContaining([
      { ...expected[0]!, capturedAt: new Date('2026-11-17T10:00:00Z') },
      { ...expected[1]!, capturedAt: new Date('2026-11-17T10:05:00Z') },
      { ...expected[2]!, capturedAt: new Date('2026-11-17T10:10:00Z') }
    ])
  )
  expect(rows).toHaveLength(3)
  expect(await ledgerCount()).toBe(before)

  // A second run finds every copy and row in place: nothing new is copied, recorded or audited.
  const again = await archivePilotRecords(bucket, `${orgSlug}/${project.slug}`)
  expect(again.map(({ copied, created }) => ({ copied, created }))).toEqual(
    expected.map(() => ({ copied: 'exists', created: false }))
  )
  expect(
    await withTenant({ orgId, principal: systemPrincipal('test') }, (tx) => listPilotArchive(tx, project.id))
  ).toHaveLength(3)
  expect(await ledgerCount()).toBe(before)
  for (const row of rows) {
    expect(await expectOneAudit('staff.action', { orgId, projectId: project.id, targetId: row.id })).toMatchObject({
      actor_type: 'system',
      actor_id: 'pilot-archive',
      target_type: 'pilot_archive',
      after: { kind: row.kind, sha256: row.sha256, object_path: row.objectPath }
    })
  }
})

test('refuses the run, writing nothing, when any incoming object lacks a valid kind or captured-at', async () => {
  const project = await inOrg((tx) => makeProject(tx))
  const { store, bucket } = memoryBucket({
    'incoming/a.csv': { bytes: 'a', metadata: { kind: 'sheets_ledger', 'captured-at': '2026-11-17T10:00:00Z' } },
    'incoming/b.csv': { bytes: 'b', metadata: { kind: 'emails', 'captured-at': '2026-11-17T10:00:00Z' } },
    'incoming/c.csv': { bytes: 'c', metadata: { kind: 'run_traces' } }
  })
  await expect(archivePilotRecords(bucket, `${orgSlug}/${project.slug}`)).rejects.toThrow(
    /incoming\/b\.csv: .*kind.*incoming\/c\.csv: .*captured-at/
  )
  expect(store.size).toBe(3)
  expect(
    await withTenant({ orgId, principal: systemPrincipal('test') }, (tx) => listPilotArchive(tx, project.id))
  ).toEqual([])
})

test('fails on an empty incoming/ or a PILOT_PROJECT naming no project', async () => {
  const project = await inOrg((tx) => makeProject(tx))
  await expect(archivePilotRecords(memoryBucket({}).bucket, `${orgSlug}/${project.slug}`)).rejects.toThrow(
    'nothing under incoming/'
  )
  await expect(archivePilotRecords(memoryBucket({}).bucket, `${orgSlug}/no-such-project`)).rejects.toThrow(
    'names no project'
  )
  await expect(archivePilotRecords(memoryBucket({}).bucket, project.slug)).rejects.toThrow('{org}/{project}')
})
