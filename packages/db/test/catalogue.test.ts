// RLS C (#79 §3, TRD tenancy): catalogue sources and their polls, readings and state are readable by every role; a
// device source's only inside its organisation.
import type { Principal } from '@skyclause/contracts'
import { inArray, sql } from 'drizzle-orm'
import { beforeAll, expect, test } from 'vitest'
import { poll, reading, source, sourceState, withPublicReader, withSystem, withTenant, type Tx } from '../src'
import { makeOrganization, makePoll, makeReading, makeSource, makeSourceState } from './factories'
import { memberOf, refusal } from './harness'

let a: string
let b: string
const made: Record<'catalogue' | 'device', string> = { catalogue: '', device: '' }

async function rowsOf(tx: Tx<Principal | null>) {
  const ids = Object.values(made)
  const seen = async (rows: Array<{ sourceId: string }>) => ({
    catalogue: rows.some(({ sourceId }) => sourceId === made.catalogue),
    device: rows.some(({ sourceId }) => sourceId === made.device)
  })
  return {
    source: await seen(await tx.select({ sourceId: source.id }).from(source).where(inArray(source.id, ids))),
    poll: await seen(await tx.select({ sourceId: poll.sourceId }).from(poll).where(inArray(poll.sourceId, ids))),
    reading: await seen(
      await tx.select({ sourceId: reading.sourceId }).from(reading).where(inArray(reading.sourceId, ids))
    ),
    sourceState: await seen(
      await tx.select({ sourceId: sourceState.sourceId }).from(sourceState).where(inArray(sourceState.sourceId, ids))
    )
  }
}

const everything = (catalogue: boolean, device: boolean) =>
  Object.fromEntries(['source', 'poll', 'reading', 'sourceState'].map((table) => [table, { catalogue, device }]))

beforeAll(async () => {
  a = (await makeOrganization()).id
  b = (await makeOrganization()).id
  const withRows = async (tx: Tx<Principal>, kind: 'jps_rain' | 'camera') => {
    const { id } = await makeSource(tx, { kind })
    await makePoll(tx, { sourceId: id })
    await makeReading(tx, { sourceId: id })
    await makeSourceState(tx, { sourceId: id })
    return id
  }
  // catalogue-sync and the batch write catalogue rows in withSystem; device ingest writes in its organisation.
  made.catalogue = await withSystem('test-catalogue-sync', (tx) => withRows(tx, 'jps_rain'))
  made.device = await withTenant({ orgId: a, principal: memberOf(a) }, (tx) => withRows(tx, 'camera'))
})

test('a catalogue source and its rows are readable as public_reader and from another organisation; a device source is not', async () => {
  expect(await withPublicReader(rowsOf)).toEqual(everything(true, false))
  expect(await withTenant({ orgId: b, principal: memberOf(b) }, rowsOf)).toEqual(everything(true, false))
})

test('the device source’s organisation reads both, and withSystem reads every source', async () => {
  expect(await withTenant({ orgId: a, principal: memberOf(a) }, rowsOf)).toEqual(everything(true, true))
  expect(await withSystem('test-auditor', rowsOf)).toEqual(everything(true, true))
})

test('an organisation can write neither catalogue rows nor another organisation’s device rows', async () => {
  const asB = <T>(fn: (tx: Tx) => Promise<T>) => withTenant({ orgId: b, principal: memberOf(b) }, fn)
  expect(await refusal(asB((tx) => makeSource(tx, { ownerOrgId: null })))).toMatch(/row-level security/)
  for (const sourceId of [made.catalogue, made.device]) {
    expect(await refusal(asB((tx) => makeReading(tx, { sourceId })))).toMatch(/row-level security/)
    expect(await refusal(asB((tx) => makePoll(tx, { sourceId })))).toMatch(/row-level security/)
  }
  const touched = await asB((tx) =>
    tx.execute(sql`UPDATE source SET name = 'renamed' WHERE id IN (${made.catalogue}, ${made.device})`)
  )
  expect(touched.rowCount).toBe(0)
})

test('public_reader writes no source row', async () => {
  expect(await refusal(withPublicReader((tx) => tx.execute(sql`DELETE FROM source`)))).toMatch(/permission denied/)
})
