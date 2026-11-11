// Preloaded into the real `bun scripts/cloudflare-record.ts` by the Resend wizard's test: it replaces global fetch with
// the Cloudflare DNS API (https://developers.cloudflare.com/api/resources/dns/subresources/records/) over the records
// in $FAKE_STATE/cloudflare.json, so the real record script's rules run against a double. Every request is logged to
// $FAKE_STATE/cloudflare.calls.
import { appendFileSync, readFileSync, writeFileSync } from 'node:fs'

interface DnsRecord {
  id: string
  type: string
  name: string
  content: string
  priority?: number
  proxied?: boolean
  comment?: string | null
}

const dir = process.env.FAKE_STATE!
const statePath = `${dir}/cloudflare.json`
const state = JSON.parse(readFileSync(statePath, 'utf8')) as { next: number; records: DnsRecord[] }

const reply = (result: unknown) => Response.json({ success: true, errors: [], messages: [], result })

globalThis.fetch = (async (input: string | URL | Request, init?: RequestInit) => {
  const url = new URL(String(input))
  const method = init?.method ?? 'GET'
  appendFileSync(`${dir}/cloudflare.calls`, `${method} ${url.pathname}${url.search}\n`)
  const headers = init?.headers as { authorization?: string } | undefined
  if (
    url.origin !== 'https://api.cloudflare.com' ||
    headers?.authorization !== `Bearer ${process.env.M1KU_CLOUDFLARE_API_TOKEN}`
  ) {
    appendFileSync(`${dir}/unexpected`, `cloudflare ${method} ${url}\n`)
    return Response.json({ success: false, errors: [{ code: 10000, message: 'Authentication error' }], result: null })
  }
  const path = url.pathname.replace('/client/v4', '')
  if (method === 'GET' && path === '/zones') return reply([{ id: 'zone-1', name: url.searchParams.get('name') }])
  if (method === 'GET' && path === '/zones/zone-1/dns_records') {
    return reply(state.records.filter((record) => record.name === url.searchParams.get('name')))
  }
  if (method === 'POST' && path === '/zones/zone-1/dns_records') {
    const created = { ...JSON.parse(String(init?.body)), id: `record-${state.next++}` } as DnsRecord
    state.records.push(created)
    writeFileSync(statePath, JSON.stringify(state))
    return reply(created)
  }
  const patch = /^\/zones\/zone-1\/dns_records\/(.+)$/.exec(path)
  if (method === 'PATCH' && patch) {
    const record = state.records.find((candidate) => candidate.id === patch[1])!
    Object.assign(record, JSON.parse(String(init?.body)))
    writeFileSync(statePath, JSON.stringify(state))
    return reply(record)
  }
  appendFileSync(`${dir}/unexpected`, `cloudflare ${method} ${url}\n`)
  return Response.json({ success: false, errors: [{ code: 7003, message: 'No route' }], result: null })
}) as typeof fetch
