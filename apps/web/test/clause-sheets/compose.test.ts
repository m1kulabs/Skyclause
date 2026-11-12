import '@skyclause/auth/test/harness/database'
import { randomUUID } from 'node:crypto'
import { api, v1 } from '../../lib/api'
import { clauseSheetPorts } from '../../../../packages/api/src/services/clause-sheets/ports'
import { createProjectRecord, withTenant } from '@skyclause/db'
import { addMember, makeAccount, makeApiKey, makeOrg, signIn, TEST_AUTH_ENV } from '@skyclause/auth/testing'
import { memberOf } from '@skyclause/db/test/harness/index'
import { expect, test } from 'vitest'

test('web composition serves raw drafts with real auth and checks drafts against installed evaluator definitions', async () => {
  const org = await makeOrg(),
    account = await makeAccount()
  await addMember(org.id, account.id, 'owner')
  const session = await signIn(account.id)
  const made = await withTenant({ orgId: org.id, principal: memberOf(org.id) }, (tx) =>
    createProjectRecord(
      tx,
      {
        name: 'Web clause composition',
        slug: `web-clause-${randomUUID().slice(0, 8)}`,
        siteName: 'APU',
        siteLat: 3.0553,
        siteLon: 101.7005,
        packs: ['sky']
      },
      new Date()
    )
  )
  expect(clauseSheetPorts()).toMatchObject({
    registry: expect.any(Object),
    snapshots: expect.any(Object),
    recordedAt: null
  })
  const id = made.sheets[0]!.id
  const content = made.versions[0]!.content
  const headers = {
    Cookie: session.cookie,
    Origin: TEST_AUTH_ENV.APP_ORIGIN,
    'Skyclause-Organization': org.id,
    'Content-Type': 'application/json',
    'Idempotency-Key': randomUUID()
  }
  const savedResponse = await v1.fetch(
    new Request(`${TEST_AUTH_ENV.API_ORIGIN}/v1/clause-sheets/${id}/drafts`, {
      method: 'POST',
      headers,
      body: JSON.stringify({ content })
    })
  )
  expect(savedResponse.status, await savedResponse.clone().text()).toBe(201)
  const draft = (await savedResponse.json()) as { id: string }
  expect(draft).toMatchObject({
    validation_status: 'checked',
    check: expect.objectContaining({ ok: true, publishable: true, issues: [] }),
    content
  })
  const response = await api.fetch(
    new Request(`${TEST_AUTH_ENV.APP_ORIGIN}/api/clause-sheets/${id}/publish-preview?draft_id=${draft.id}`, { headers })
  )
  expect(response.status).toBe(200)
  expect(await response.json()).toMatchObject({ publishable: true, errors: [] })
  const key = await makeApiKey({ orgId: org.id, accountId: account.id, scopes: ['admin'] })
  const keyHeaders = {
    Authorization: `Bearer ${key.key}`,
    'Skyclause-Organization': org.id,
    'Content-Type': 'application/json',
    'Idempotency-Key': randomUUID()
  }
  const keyedSave = await v1.fetch(
    new Request(`${TEST_AUTH_ENV.API_ORIGIN}/v1/clause-sheets/${id}/drafts`, {
      method: 'POST',
      headers: keyHeaders,
      body: JSON.stringify({ content })
    })
  )
  expect(keyedSave.status).toBe(201)
  const keyedPreview = await api.fetch(
    new Request(`${TEST_AUTH_ENV.APP_ORIGIN}/api/clause-sheets/${id}/publish-preview?draft_id=${draft.id}`, {
      headers: keyHeaders
    })
  )
  expect(keyedPreview.status).toBe(403)
  const payload = JSON.stringify({ draft_id: draft.id, preview_hash: 'unavailable' })
  for (const origin of [undefined, 'https://foreign.example']) {
    const cookieHeaders: Record<string, string> = { ...headers, 'Idempotency-Key': randomUUID() }
    delete cookieHeaders.Origin
    if (origin) cookieHeaders.Origin = origin
    const refused = await api.fetch(
      new Request(`${TEST_AUTH_ENV.APP_ORIGIN}/api/clause-sheets/${id}/publish`, {
        method: 'POST',
        headers: cookieHeaders,
        body: payload
      })
    )
    expect(refused.status).toBe(403)
  }
  const bearerHeaders = {
    Authorization: `Bearer ${session.token}`,
    'Skyclause-Organization': org.id,
    'Content-Type': 'application/json',
    'Idempotency-Key': randomUUID()
  }
  const bearerPublish = await api.fetch(
    new Request(`${TEST_AUTH_ENV.APP_ORIGIN}/api/clause-sheets/${id}/publish`, {
      method: 'POST',
      headers: bearerHeaders,
      body: payload
    })
  )
  expect(bearerPublish.status, await bearerPublish.clone().text()).toBe(409)
  expect(await bearerPublish.json()).toMatchObject({
    status: 409,
    type: 'https://docs.skyclause.m1ku.tech/problems/preview-stale'
  })
})
