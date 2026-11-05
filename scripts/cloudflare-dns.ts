// Creates or updates one DNS record under skyclause.m1ku.tech in the Cloudflare zone m1ku.tech,
// following #118's rules: names under skyclause.m1ku.tech only, DNS only (not proxied), comment
// `owner: skyclause`, and never a record someone else owns.

const api = 'https://api.cloudflare.com/client/v4'
const zoneName = 'm1ku.tech'
const base = 'skyclause.m1ku.tech'
const comment = 'owner: skyclause'
const label = /^[a-z0-9_](?:[a-z0-9_-]{0,61}[a-z0-9])?$/

export type RecordType = 'CNAME' | 'TXT'

export interface WantedRecord {
  type: RecordType
  name: string
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
  comment?: string | null
}

/** Lowercases `name`, drops a trailing dot, and throws unless it is skyclause.m1ku.tech or under it. */
function ownName(name: string): string {
  const fqdn = name.toLowerCase().replace(/\.$/, '')
  const labels = fqdn.split('.')
  if ((fqdn !== base && !fqdn.endsWith(`.${base}`)) || !labels.every((part) => label.test(part))) {
    throw new Error(`${name} is not skyclause.m1ku.tech or a name under it`)
  }
  return fqdn
}

/** The content to store: a CNAME target as a lowercase hostname without the trailing dot, a TXT value as given. */
function validContent(wanted: WantedRecord): string {
  if (wanted.type === 'CNAME') {
    const target = wanted.content.toLowerCase().replace(/\.$/, '')
    const labels = target.split('.')
    if (labels.length < 2 || !labels.every((part) => label.test(part))) {
      throw new Error(`CNAME content ${wanted.content} is not a hostname`)
    }
    return target
  }
  if (wanted.content.length === 0 || wanted.content.length > 2048) {
    throw new Error('TXT content must be 1 to 2048 characters')
  }
  return wanted.content
}

export async function upsertRecord(wanted: WantedRecord, options: UpsertOptions): Promise<UpsertResult> {
  const name = ownName(wanted.name)
  const content = validContent(wanted)
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
  const records = `/zones/${zone[0]!.id}/dns_records`

  const atName = (
    await call<CloudflareRecord[]>(`${records}?${new URLSearchParams({ name, per_page: '100' })}`)
  ).filter((record) => record.name.toLowerCase() === name)
  for (const record of atName) {
    if (record.comment !== comment) {
      throw new Error(`${name} already has a ${record.type} record (${record.id}) whose comment is not ${comment}`)
    }
  }

  const proxied = wanted.type === 'CNAME' ? { proxied: false } : {}
  const body = JSON.stringify({ type: wanted.type, name, content, ...proxied, ttl: 1, comment })
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
    const updated = await call<CloudflareRecord>(`${records}/${cname.id}`, { method: 'PATCH', body })
    return { action: 'updated', id: updated.id }
  }

  // Cloudflare may return TXT content wrapped in quotes.
  const same = others.find(
    (record) => record.type === wanted.type && record.content.replace(/^"(.*)"$/, '$1') === content
  )
  if (same) return { action: 'unchanged', id: same.id }

  if (options.dryRun) return { action: 'created', id: null }
  const created = await call<CloudflareRecord>(records, { method: 'POST', body })
  return { action: 'created', id: created.id }
}
