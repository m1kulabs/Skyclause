import { expect, test } from 'vitest'
import { upsertRecord } from './cloudflare-dns'

interface StoredRecord {
  id: string
  type: string
  name: string
  content: string
  proxied?: boolean
  priority?: number
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

test('creates an MX from "<priority> <host>", with the priority apart and no proxied flag', async () => {
  const cf = fakeCloudflare()

  const result = await upsertRecord(
    { type: 'MX', name: 'in.skyclause.m1ku.tech', content: '10 inbound-smtp.ap-southeast-2.amazonaws.com' },
    { token: 'test-token', fetch: cf.fetch }
  )

  expect(result).toEqual({ action: 'created', id: 'new-1' })
  expect(cf.records).toEqual([
    {
      id: 'new-1',
      type: 'MX',
      name: 'in.skyclause.m1ku.tech',
      content: 'inbound-smtp.ap-southeast-2.amazonaws.com',
      priority: 10,
      ttl: 1,
      comment: 'owner: skyclause'
    }
  ])
})

test('leaves our own matching MX unchanged', async () => {
  const cf = fakeCloudflare([
    {
      id: 'ours',
      type: 'MX',
      name: 'bounce.notices.skyclause.m1ku.tech',
      content: 'feedback-smtp.ap-southeast-2.amazonses.com',
      priority: 10,
      comment: 'owner: skyclause'
    }
  ])

  const result = await upsertRecord(
    {
      type: 'MX',
      name: 'bounce.notices.skyclause.m1ku.tech',
      content: '10 feedback-smtp.ap-southeast-2.amazonses.com'
    },
    { token: 'test-token', fetch: cf.fetch }
  )

  expect(result).toEqual({ action: 'unchanged', id: 'ours' })
  expect(cf.writes).toEqual([])
})

test('updates our one MX in place, since SES wants exactly one MX at a MAIL FROM name', async () => {
  const cf = fakeCloudflare([
    {
      id: 'ours',
      type: 'MX',
      name: 'bounce.notices.skyclause.m1ku.tech',
      content: 'feedback-smtp.ap-southeast-1.amazonses.com',
      priority: 10,
      comment: 'owner: skyclause'
    }
  ])

  const result = await upsertRecord(
    {
      type: 'MX',
      name: 'bounce.notices.skyclause.m1ku.tech',
      content: '10 feedback-smtp.ap-southeast-2.amazonses.com'
    },
    { token: 'test-token', fetch: cf.fetch }
  )

  expect(result).toEqual({ action: 'updated', id: 'ours' })
  expect(cf.records).toHaveLength(1)
  expect(cf.records[0]).toMatchObject({ content: 'feedback-smtp.ap-southeast-2.amazonses.com', priority: 10 })
})

test.each(['inbound-smtp.ap-southeast-2.amazonaws.com', '10', 'ten inbound-smtp.example.com', '70000 mx.example.com'])(
  'refuses MX content %j that is not "<priority 0-65535> <host>"',
  async (content) => {
    const cf = fakeCloudflare()
    await expect(
      upsertRecord({ type: 'MX', name: 'in.skyclause.m1ku.tech', content }, { token: 'test-token', fetch: cf.fetch })
    ).rejects.toThrow(/MX content/)
    expect(cf.calls).toEqual([])
  }
)

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

test("creates a mapping's DNS-only A and AAAA records side by side, then leaves them unchanged", async () => {
  const cf = fakeCloudflare()
  const options = { token: 'test-token', fetch: cf.fetch }
  const wanted = [
    { type: 'A' as const, name: 'skyclause.m1ku.tech', content: '216.239.32.21' },
    { type: 'A' as const, name: 'skyclause.m1ku.tech', content: '216.239.34.21' },
    { type: 'AAAA' as const, name: 'skyclause.m1ku.tech', content: '2001:4860:4802:32::15' }
  ]

  for (const record of wanted) await expect(upsertRecord(record, options)).resolves.toMatchObject({ action: 'created' })
  for (const record of wanted)
    await expect(upsertRecord(record, options)).resolves.toMatchObject({ action: 'unchanged' })

  expect(cf.writes).toEqual([
    'POST A skyclause.m1ku.tech',
    'POST A skyclause.m1ku.tech',
    'POST AAAA skyclause.m1ku.tech'
  ])
  expect(cf.records[2]).toEqual({
    id: 'new-3',
    type: 'AAAA',
    name: 'skyclause.m1ku.tech',
    content: '2001:4860:4802:32::15',
    proxied: false,
    ttl: 1,
    comment: 'owner: skyclause'
  })
})

test.each([
  { type: 'A' as const, content: '2001:4860:4802:32::15' },
  { type: 'A' as const, content: '216.239.32' },
  { type: 'AAAA' as const, content: '216.239.32.21' },
  { type: 'AAAA' as const, content: 'ghs.googlehosted.com' }
])('refuses $type content $content that is not an address of that family', async (wanted) => {
  const cf = fakeCloudflare()

  await expect(
    upsertRecord({ ...wanted, name: 'skyclause.m1ku.tech' }, { token: 'test-token', fetch: cf.fetch })
  ).rejects.toThrow(/content/)
  expect(cf.calls).toEqual([])
})

test('compares a TXT value case-sensitively, so a mixed-case value already there stays unchanged', async () => {
  const cf = fakeCloudflare([
    { id: 'ours', type: 'TXT', name: 'skyclause.m1ku.tech', content: '"Token=AbC"', comment: 'owner: skyclause' }
  ])

  await expect(
    upsertRecord(
      { type: 'TXT', name: 'skyclause.m1ku.tech', content: 'Token=AbC' },
      { token: 'test-token', fetch: cf.fetch }
    )
  ).resolves.toEqual({ action: 'unchanged', id: 'ours' })
  expect(cf.writes).toEqual([])
})

test('replaces our one TXT with the same v= tag in place, since a name may hold only one DMARC or SPF record', async () => {
  const cf = fakeCloudflare([
    {
      id: 'dmarc',
      type: 'TXT',
      name: '_dmarc.notices.skyclause.m1ku.tech',
      content: '"v=DMARC1; p=quarantine"',
      comment: 'owner: skyclause'
    }
  ])

  const result = await upsertRecord(
    {
      type: 'TXT',
      name: '_dmarc.notices.skyclause.m1ku.tech',
      content: 'v=DMARC1; p=quarantine; rua=mailto:dmarc@in.skyclause.m1ku.tech'
    },
    { token: 'test-token', fetch: cf.fetch }
  )

  expect(result).toEqual({ action: 'updated', id: 'dmarc' })
  expect(cf.writes).toEqual(['PATCH dmarc'])
  expect(cf.records).toHaveLength(1)
  expect(cf.records[0]).toMatchObject({ content: 'v=DMARC1; p=quarantine; rua=mailto:dmarc@in.skyclause.m1ku.tech' })
})

test('refuses a v= TXT when our name already holds two with that tag, rather than pick one', async () => {
  const cf = fakeCloudflare(
    ['"v=spf1 -all"', '"v=spf1 include:amazonses.com ~all"'].map((content, i) => ({
      id: `spf-${i}`,
      type: 'TXT',
      name: 'bounce.notices.skyclause.m1ku.tech',
      content,
      comment: 'owner: skyclause'
    }))
  )

  await expect(
    upsertRecord(
      { type: 'TXT', name: 'bounce.notices.skyclause.m1ku.tech', content: 'v=spf1 include:amazonses.com -all' },
      { token: 'test-token', fetch: cf.fetch }
    )
  ).rejects.toThrow(/2 TXT records with v=spf1/)
  expect(cf.writes).toEqual([])
})
