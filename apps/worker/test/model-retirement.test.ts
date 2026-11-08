import type { TxHandle } from '@skyclause/contracts'
import { expect, test } from 'vitest'
import { modelRetirement } from '../src/agent-evals/retirement'

// models.ts pins gemini-3.8-flash, retiring no earlier than 2 September 2027: 29 days out is 4 August (MYT).
const tx = {} as TxHandle
const finding = {
  key: 'model_retirement:gemini-3.8-flash',
  projectId: null,
  accountIds: [],
  ref: { type: 'model', id: 'gemini-3.8-flash' }
}

test('is one platform check, run once per tick rather than per organisation', () => {
  expect(modelRetirement).toMatchObject({ name: 'model_retirement', scope: 'platform' })
})

test('fires 29 days before the retirement floor', async () => {
  expect(await modelRetirement.run(tx, '2027-08-04T01:00:00Z')).toEqual([finding])
})

test('stays quiet 31 days out', async () => {
  expect(await modelRetirement.run(tx, '2027-08-02T01:00:00Z')).toEqual([])
})

test('counts days by the MYT date: 16:30 UTC on 2 August is 3 August in Kuala Lumpur, 30 days out', async () => {
  expect(await modelRetirement.run(tx, '2027-08-02T15:59:00Z')).toEqual([])
  expect(await modelRetirement.run(tx, '2027-08-02T16:30:00Z')).toEqual([finding])
})

test('keeps the same key open past the floor, so the auditor never recovers it early', async () => {
  expect(await modelRetirement.run(tx, '2027-09-10T00:00:00Z')).toEqual([finding])
})
