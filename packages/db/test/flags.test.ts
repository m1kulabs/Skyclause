import { randomUUID } from 'node:crypto'
import { expect, test } from 'vitest'
import { featureFlag } from '../src/schema'
import { isFlagEnabled, withPublicReader, withSystem, withTenant } from '../src'
import { makeOrganization } from './factories'
import { memberOf, refusal } from './harness'

test('an organisation’s flag row overrides the global one, and a flag with neither is off', async () => {
  const [a, b] = [(await makeOrganization()).id, (await makeOrganization()).id]
  const key = `pack_crowd_${randomUUID()}`
  await withSystem('flag:set', (tx) =>
    tx.insert(featureFlag).values([
      { key, orgId: null, enabled: false },
      { key, orgId: a, enabled: true }
    ])
  )
  expect(await withTenant({ orgId: a, principal: memberOf(a) }, (tx) => isFlagEnabled(tx, key, a))).toBe(true)
  expect(await withTenant({ orgId: a, principal: memberOf(a) }, (tx) => isFlagEnabled(tx, key))).toBe(false)
  expect(await withTenant({ orgId: b, principal: memberOf(b) }, (tx) => isFlagEnabled(tx, key, b))).toBe(false)
  // B can't read A's row, so asking for A's flag from B's transaction gives the global value.
  expect(await withTenant({ orgId: b, principal: memberOf(b) }, (tx) => isFlagEnabled(tx, key, a))).toBe(false)
  expect(await withSystem('test', (tx) => isFlagEnabled(tx, key, a))).toBe(true)
  expect(await withPublicReader((tx) => isFlagEnabled(tx, key))).toBe(false)
  expect(await withSystem('test', (tx) => isFlagEnabled(tx, `missing_${randomUUID()}`))).toBe(false)
})

test('feature_flag is read-only to app', async () => {
  const a = (await makeOrganization()).id
  expect(
    await refusal(
      withTenant({ orgId: a, principal: memberOf(a) }, (tx) =>
        tx.insert(featureFlag).values({ key: `x_${randomUUID()}`, orgId: a, enabled: true })
      )
    )
  ).toMatch(/permission denied for table feature_flag/)
})
