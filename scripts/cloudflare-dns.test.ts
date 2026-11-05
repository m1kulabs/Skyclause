import { expect, test } from 'vitest'
import { upsertRecord } from './cloudflare-dns'

interface StoredRecord {
  id: string
  type: string
  name: string
  content: string
  proxied?: boolean
  ttl?: number
  comment?: string | null
}

const zoneId = 'zone-m1ku'

/** An in-memory Cloudflare v4 API for the zone m1ku.tech, holding `records`. */
function fakeCloudflare(records: StoredRecord[] = []) {
  const writes: string[] = []
  const calls: string[] = []
  let next = 1
  const reply = (body: unknown, status = 200) =>
    new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } })

  const fetch = async (input: string | URL | Request, init?: RequestInit) => {
    const url = new URL(String(input))
    const method = init?.method ?? 'GET'
    const path = url.pathname.replace('/client/v4', '')
    const body = init?.body ? (JSON.parse(String(init.body)) as Partial<StoredRecord>) : {}
    calls.push(`${method} ${path}`)
    if (new Headers(init?.headers).get('authorization') !== 'Bearer test-token') {
      return reply({ success: false, errors: [{ code: 10000, message: 'Authentication error' }] }, 403)
    }
    if (method === 'GET' && path === '/zones' && url.searchParams.get('name') === 'm1ku.tech') {
      return reply({ success: true, result: [{ id: zoneId, name: 'm1ku.tech' }] })
    }
    if (method === 'GET' && path === `/zones/${zoneId}/dns_records`) {
      return reply({ success: true, result: records.filter((r) => r.name === url.searchParams.get('name')) })
    }
    if (method === 'POST' && path === `/zones/${zoneId}/dns_records`) {
      const record = { id: `new-${next++}`, ...body } as StoredRecord
      records.push(record)
      writes.push(`POST ${record.type} ${record.name}`)
      return reply({ success: true, result: record })
    }
    const patch = path.match(new RegExp(`^/zones/${zoneId}/dns_records/(.+)$`))
    if (method === 'PATCH' && patch) {
      const record = records.find((r) => r.id === patch[1])
      if (!record) return reply({ success: false, errors: [{ code: 81044, message: 'Record not found' }] }, 404)
      Object.assign(record, body)
      writes.push(`PATCH ${record.id}`)
      return reply({ success: true, result: record })
    }
    return reply({ success: false, errors: [{ code: 7003, message: `no route ${method} ${path}` }] }, 404)
  }
  return { fetch, records, writes, calls }
}

test('creates a DNS-only CNAME commented owner: skyclause when the name is unused', async () => {
  const cf = fakeCloudflare([{ id: 'other', type: 'TXT', name: 'm1ku.tech', content: 'v=spf1 -all', comment: null }])

  const result = await upsertRecord(
    { type: 'CNAME', name: 'abc123.skyclause.m1ku.tech', content: 'gv-xyz.dv.googlehosted.com' },
    { token: 'test-token', fetch: cf.fetch }
  )

  expect(result).toEqual({ action: 'created', id: 'new-1' })
  expect(cf.records).toContainEqual({
    id: 'new-1',
    type: 'CNAME',
    name: 'abc123.skyclause.m1ku.tech',
    content: 'gv-xyz.dv.googlehosted.com',
    proxied: false,
    ttl: 1,
    comment: 'owner: skyclause'
  })
  expect(cf.writes).toEqual(['POST CNAME abc123.skyclause.m1ku.tech'])
})

test.each([
  'm1ku.tech',
  'other.m1ku.tech',
  'notskyclause.m1ku.tech',
  'skyclause.m1ku.tech.example.com',
  'app.skyclause.m1ku.tech.example.com',
  '*.skyclause.m1ku.tech',
  'x/../y.skyclause.m1ku.tech',
  'a..skyclause.m1ku.tech',
  ' app.skyclause.m1ku.tech'
])('refuses %s, outside skyclause.m1ku.tech, before calling Cloudflare', async (name) => {
  const cf = fakeCloudflare()

  await expect(
    upsertRecord(
      { type: 'TXT', name, content: 'google-site-verification=abc' },
      { token: 'test-token', fetch: cf.fetch }
    )
  ).rejects.toThrow(/skyclause\.m1ku\.tech/)
  expect(cf.calls).toEqual([])
})

test.each([null, 'owner: other-project', 'owner: skyclause-old', 'Owner: skyclause'])(
  'leaves a CNAME commented %s alone and refuses to replace it',
  async (existingComment) => {
    const existing = {
      id: 'theirs',
      type: 'CNAME',
      name: 'app.skyclause.m1ku.tech',
      content: 'elsewhere.example.net',
      proxied: true,
      comment: existingComment
    }
    const cf = fakeCloudflare([{ ...existing }])

    await expect(
      upsertRecord(
        { type: 'CNAME', name: 'app.skyclause.m1ku.tech', content: 'ghs.googlehosted.com' },
        { token: 'test-token', fetch: cf.fetch }
      )
    ).rejects.toThrow(/not owner: skyclause/)
    expect(cf.writes).toEqual([])
    expect(cf.records).toEqual([existing])
  }
)

test('updates our own CNAME in place when its target changes', async () => {
  const cf = fakeCloudflare([
    {
      id: 'ours',
      type: 'CNAME',
      name: 'app.skyclause.m1ku.tech',
      content: 'old.example.net',
      proxied: false,
      comment: 'owner: skyclause'
    }
  ])

  const result = await upsertRecord(
    { type: 'CNAME', name: 'App.Skyclause.m1ku.tech.', content: 'ghs.googlehosted.com.' },
    { token: 'test-token', fetch: cf.fetch }
  )

  expect(result).toEqual({ action: 'updated', id: 'ours' })
  expect(cf.writes).toEqual(['PATCH ours'])
  expect(cf.records).toEqual([
    {
      id: 'ours',
      type: 'CNAME',
      name: 'app.skyclause.m1ku.tech',
      content: 'ghs.googlehosted.com',
      proxied: false,
      ttl: 1,
      comment: 'owner: skyclause'
    }
  ])
})

test('leaves our own matching CNAME unchanged', async () => {
  const cf = fakeCloudflare([
    {
      id: 'ours',
      type: 'CNAME',
      name: 'app.skyclause.m1ku.tech',
      content: 'ghs.googlehosted.com',
      proxied: false,
      comment: 'owner: skyclause'
    }
  ])

  const result = await upsertRecord(
    { type: 'CNAME', name: 'app.skyclause.m1ku.tech', content: 'ghs.googlehosted.com.' },
    { token: 'test-token', fetch: cf.fetch }
  )

  expect(result).toEqual({ action: 'unchanged', id: 'ours' })
  expect(cf.writes).toEqual([])
})

test.each([
  { wanted: 'CNAME' as const, existing: 'TXT', content: 'ghs.googlehosted.com' },
  { wanted: 'TXT' as const, existing: 'CNAME', content: 'google-site-verification=abc' }
])('refuses a $wanted where our $existing already sits, since a CNAME must be alone', async (c) => {
  const cf = fakeCloudflare([
    { id: 'ours', type: c.existing, name: 'skyclause.m1ku.tech', content: 'x', comment: 'owner: skyclause' }
  ])

  await expect(
    upsertRecord(
      { type: c.wanted, name: 'skyclause.m1ku.tech', content: c.content },
      { token: 'test-token', fetch: cf.fetch }
    )
  ).rejects.toThrow(/CNAME/)
  expect(cf.writes).toEqual([])
})

test('adds a TXT beside our other TXT records, without a proxied flag', async () => {
  const cf = fakeCloudflare([
    { id: 'ours', type: 'TXT', name: 'skyclause.m1ku.tech', content: '"older-token"', comment: 'owner: skyclause' }
  ])

  const result = await upsertRecord(
    { type: 'TXT', name: 'skyclause.m1ku.tech', content: 'google-site-verification=abc' },
    { token: 'test-token', fetch: cf.fetch }
  )

  expect(result).toEqual({ action: 'created', id: 'new-1' })
  expect(cf.records[1]).toEqual({
    id: 'new-1',
    type: 'TXT',
    name: 'skyclause.m1ku.tech',
    content: 'google-site-verification=abc',
    ttl: 1,
    comment: 'owner: skyclause'
  })
})

test('leaves our own TXT unchanged when Cloudflare returns the same value in quotes', async () => {
  const cf = fakeCloudflare([
    {
      id: 'ours',
      type: 'TXT',
      name: 'skyclause.m1ku.tech',
      content: '"google-site-verification=abc"',
      comment: 'owner: skyclause'
    }
  ])

  const result = await upsertRecord(
    { type: 'TXT', name: 'skyclause.m1ku.tech', content: 'google-site-verification=abc' },
    { token: 'test-token', fetch: cf.fetch }
  )

  expect(result).toEqual({ action: 'unchanged', id: 'ours' })
  expect(cf.writes).toEqual([])
})

test("fails with Cloudflare's own error, never the token, when a call is refused", async () => {
  const cf = fakeCloudflare()
  const attempt = upsertRecord(
    { type: 'TXT', name: 'skyclause.m1ku.tech', content: 'google-site-verification=abc' },
    { token: 'wrong-token', fetch: cf.fetch }
  )

  await expect(attempt).rejects.toThrow('Cloudflare GET /zones: 10000 Authentication error')
  await expect(attempt).rejects.not.toThrow(/wrong-token/)
})

test('a dry run reports what it would do and writes nothing', async () => {
  const cf = fakeCloudflare([
    {
      id: 'ours',
      type: 'CNAME',
      name: 'app.skyclause.m1ku.tech',
      content: 'old.example.net',
      proxied: false,
      comment: 'owner: skyclause'
    }
  ])
  const options = { token: 'test-token', fetch: cf.fetch, dryRun: true }

  await expect(
    upsertRecord({ type: 'CNAME', name: 'app.skyclause.m1ku.tech', content: 'ghs.googlehosted.com' }, options)
  ).resolves.toEqual({ action: 'updated', id: 'ours' })
  await expect(
    upsertRecord({ type: 'CNAME', name: 'api.skyclause.m1ku.tech', content: 'ghs.googlehosted.com' }, options)
  ).resolves.toEqual({ action: 'created', id: null })
  expect(cf.writes).toEqual([])
})

test.each([
  { type: 'CNAME' as const, content: 'https://ghs.googlehosted.com/' },
  { type: 'CNAME' as const, content: 'ghs googlehosted com' },
  { type: 'CNAME' as const, content: '' },
  { type: 'TXT' as const, content: '' },
  { type: 'TXT' as const, content: 'x'.repeat(2049) }
])('refuses $type content that is not a valid value, before calling Cloudflare', async (wanted) => {
  const cf = fakeCloudflare()

  await expect(
    upsertRecord({ ...wanted, name: 'abc.skyclause.m1ku.tech' }, { token: 'test-token', fetch: cf.fetch })
  ).rejects.toThrow(/content/)
  expect(cf.calls).toEqual([])
})
