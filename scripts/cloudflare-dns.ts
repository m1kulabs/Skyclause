// Creates or updates one DNS record under skyclause.m1ku.tech in the Cloudflare zone m1ku.tech,
// following #118's rules: names under skyclause.m1ku.tech only, DNS only (not proxied), comment
// `owner: skyclause`, and never a record someone else owns.

import { isIP } from 'node:net'

const api = 'https://api.cloudflare.com/client/v4'
const zoneName = 'm1ku.tech'
const base = 'skyclause.m1ku.tech'
const comment = 'owner: skyclause'
const label = /^[a-z0-9_](?:[a-z0-9_-]{0,61}[a-z0-9])?$/

export type RecordType = 'A' | 'AAAA' | 'CNAME' | 'TXT' | 'MX'

export interface WantedRecord {
  type: RecordType
  name: string
  /** An A or AAAA address, a CNAME's target, a TXT's value, or an MX's `<priority> <host>`. */
  content: string
}

export interface UpsertOptions {
  token: string
  fetch?: typeof fetch
  /** Report the action without writing. */
  dryRun?: boolean
}

export interface UpsertResult {
  action: 'created' | 'updated' | 'unchanged'
  /** The record's Cloudflare ID; null for a dry run's create. */
  id: string | null
}

interface CloudflareRecord {
  id: string
  type: string
  name: string
  content: string
  proxied?: boolean
  priority?: number
  comment?: string | null
}

/** `value` lowercased without a trailing dot, or null unless every label is a valid DNS label. */
function hostname(value: string): string | null {
  const name = value.toLowerCase().replace(/\.$/, '')
  return name.split('.').every((part) => label.test(part)) ? name : null
}

/** `name` as a hostname; throws unless it is skyclause.m1ku.tech or under it. */
function ownName(name: string): string {
  const fqdn = hostname(name)
  if (!fqdn || (fqdn !== base && !fqdn.endsWith(`.${base}`))) {
    throw new Error(`${name} is not skyclause.m1ku.tech or a name under it`)
  }
  return fqdn
}

/**
 * The content to store: an A or AAAA address in lowercase, a CNAME target as a lowercase hostname
 * without the trailing dot, a TXT value as given, or an MX host the same way with its priority apart.
 */
function validContent(wanted: WantedRecord): { content: string; priority?: number } {
  if (wanted.type === 'A' || wanted.type === 'AAAA') {
    if (isIP(wanted.content) !== (wanted.type === 'A' ? 4 : 6)) {
      throw new Error(`${wanted.type} content ${wanted.content} is not an IPv${wanted.type === 'A' ? 4 : 6} address`)
    }
    return { content: wanted.content.toLowerCase() }
  }
  if (wanted.type === 'CNAME') {
    const target = hostname(wanted.content)
    if (!target?.includes('.')) throw new Error(`CNAME content ${wanted.content} is not a hostname`)
    return { content: target }
  }
  if (wanted.type === 'MX') {
    const [, priority, host] = wanted.content.match(/^(\d{1,5}) (\S+)$/) ?? []
    const target = host ? hostname(host) : null
    if (!priority || Number(priority) > 65535 || !target?.includes('.')) {
      throw new Error(`MX content ${wanted.content} is not "<priority 0-65535> <host>"`)
    }
    return { content: target, priority: Number(priority) }
  }
  if (wanted.content.length === 0 || wanted.content.length > 2048) {
    throw new Error('TXT content must be 1 to 2048 characters')
  }
  return { content: wanted.content }
}

export async function upsertRecord(wanted: WantedRecord, options: UpsertOptions): Promise<UpsertResult> {
  const name = ownName(wanted.name)
  const { content, priority } = validContent(wanted)
  const call = async <T>(path: string, init: RequestInit = {}): Promise<T> => {
    const response = await (options.fetch ?? fetch)(`${api}${path}`, {
      ...init,
      headers: { authorization: `Bearer ${options.token}`, 'content-type': 'application/json' }
    })
    const body = (await response.json()) as {
      success: boolean
      result: T
      errors?: { code: number; message: string }[]
    }
    if (!body.success) {
      const errors = (body.errors ?? []).map((error) => `${error.code} ${error.message}`).join('; ')
      throw new Error(`Cloudflare ${init.method ?? 'GET'} ${path.split('?')[0]}: ${errors || response.status}`)
    }
    return body.result
  }

  const zones = await call<{ id: string; name: string }[]>(`/zones?${new URLSearchParams({ name: zoneName })}`)
  const zone = zones.filter((candidate) => candidate.name === zoneName)
  if (zone.length !== 1) throw new Error(`expected one Cloudflare zone ${zoneName}, found ${zone.length}`)
  const recordsPath = `/zones/${zone[0]!.id}/dns_records`

  const atName = (
    await call<CloudflareRecord[]>(`${recordsPath}?${new URLSearchParams({ name, per_page: '100' })}`)
  ).filter((record) => record.name.toLowerCase() === name)
  for (const record of atName) {
    if (record.comment !== comment) {
      throw new Error(`${name} already has a ${record.type} record (${record.id}) whose comment is not ${comment}`)
    }
  }

  const proxied = ['A', 'AAAA', 'CNAME'].includes(wanted.type) ? { proxied: false } : {}
  const body = JSON.stringify({ type: wanted.type, name, content, priority, ...proxied, ttl: 1, comment })
  const cname = atName.find((record) => record.type === 'CNAME')
  const others = atName.filter((record) => record.type !== 'CNAME')
  if ((wanted.type === 'CNAME' && others.length > 0) || (wanted.type !== 'CNAME' && cname)) {
    throw new Error(
      `${name} already has ${atName.map((r) => r.type).join(', ')}, and a CNAME must be its name's only record`
    )
  }

  if (wanted.type === 'CNAME' && cname) {
    if (cname.content.toLowerCase() === content && cname.proxied === false) return { action: 'unchanged', id: cname.id }
    if (options.dryRun) return { action: 'updated', id: cname.id }
    const updated = await call<CloudflareRecord>(`${recordsPath}/${cname.id}`, { method: 'PATCH', body })
    return { action: 'updated', id: updated.id }
  }

  if (wanted.type === 'MX') {
    const mx = others.filter((record) => record.type === 'MX')
    const same = mx.find((record) => hostname(record.content) === content && record.priority === priority)
    if (same) return { action: 'unchanged', id: same.id }
    if (mx.length > 1) throw new Error(`${name} already has ${mx.length} MX records; fix them by hand`)
    if (mx[0]) {
      if (options.dryRun) return { action: 'updated', id: mx[0].id }
      const updated = await call<CloudflareRecord>(`${recordsPath}/${mx[0].id}`, { method: 'PATCH', body })
      return { action: 'updated', id: updated.id }
    }
  }

  // Cloudflare may return TXT content wrapped in quotes; addresses compare case-insensitively.
  const stored = (record: CloudflareRecord) =>
    record.type === 'TXT' ? record.content.replace(/^"(.*)"$/, '$1') : record.content.toLowerCase()
  const same = others.find((record) => record.type === wanted.type && stored(record) === content)
  if (same) return { action: 'unchanged', id: same.id }

  if (options.dryRun) return { action: 'created', id: null }
  const created = await call<CloudflareRecord>(recordsPath, { method: 'POST', body })
  return { action: 'created', id: created.id }
}
