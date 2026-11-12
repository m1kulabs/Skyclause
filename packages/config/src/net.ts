// @skyclause/config/net (Spec §1): safeFetch and the SSRF guard. Owned by #115.
//
// Every fetch of a user-supplied URL (ICS feeds, webhooks, future sources)
// resolves once, pins the connection to the checked address, and re-checks
// every redirect hop. Literal IP spellings never touch DNS.
import { lookup as dnsLookup } from 'node:dns/promises'
import http from 'node:http'
import https from 'node:https'

export type AssertPublicUrl = (
  url: string | URL,
  o?: { https?: boolean; lookup?: DnsLookup }
) => Promise<{ url: URL; addresses: string[] }>

export type SafeFetch = (
  url: string | URL,
  init?: RequestInit & {
    timeoutMs?: number
    maxBytes?: number
    redirects?: 'error' | 'follow'
    maxRedirects?: number
    https?: boolean
    lookup?: DnsLookup
  }
) => Promise<Response>

/** Resolves a hostname to all A/AAAA addresses. Injected in tests; never called for IP literals. */
export type DnsLookup = (host: string) => Promise<string[]>

/** Thrown when a URL fails the guard; the route maps it to 422 `unsafe-url`. */
export class UnsafeUrlError extends Error {
  readonly slug = 'unsafe-url' as const
  readonly status = 422

  constructor(detail: string) {
    super(`unsafe URL: ${detail}`)
    this.name = 'UnsafeUrlError'
  }
}

const unsafe = (detail: string): never => {
  throw new UnsafeUrlError(detail)
}

// Parsing: inet_aton spellings (decimal, 0-octal, 0x-hex; 1-4 parts) and IPv6
// with :: compression and a flexible embedded IPv4 tail, so mapped spellings
// of blocked ranges (including single-integer tails) are still refused.

type Parsed = { kind: 'v4'; bytes: [number, number, number, number] } | { kind: 'v6'; bytes: number[] }

function partValue(part: string): number | null {
  let value: number
  if (/^0[xX][0-9a-fA-F]+$/.test(part)) value = parseInt(part.slice(2), 16)
  else if (/^0[0-7]*$/.test(part)) value = parseInt(part, 8)
  else if (/^[1-9][0-9]*$/.test(part)) value = parseInt(part, 10)
  else return null
  return Number.isSafeInteger(value) && value >= 0 ? value : null
}

function parseV4(host: string): [number, number, number, number] | null {
  const parts = host.split('.')
  if (parts.length < 1 || parts.length > 4) return null
  const values: number[] = []
  for (const part of parts) {
    const value = partValue(part)
    if (value === null) return null
    values.push(value)
  }
  const [a = 0, b = 0, c = 0, d = 0] = values
  if (values.length === 4) {
    if (values.some((v) => v > 255)) return null
    return [a, b, c, d]
  }
  if (values.length === 3) {
    if (a > 255 || b > 255 || c > 65535) return null
    return [a, b, (c >> 8) & 255, c & 255]
  }
  if (values.length === 2) {
    if (a > 255 || b > 16777215) return null
    return [a, (b >> 16) & 255, (b >> 8) & 255, b & 255]
  }
  if (d > 4294967295) return null
  return [(d >>> 24) & 255, (d >>> 16) & 255, (d >>> 8) & 255, d & 255]
}

function parseV6Tail(group: string): number[] | null {
  if (!/^[0-9a-fA-F]{1,4}$/.test(group)) return null
  const value = parseInt(group, 16)
  return [(value >> 8) & 255, value & 255]
}

function parseV6(host: string): number[] | null {
  if (host.includes('%')) return 'scoped' as unknown as null
  const halves = host.split('::')
  if (halves.length > 2) return null
  const expand = (side: string): number[] | null => {
    if (side === '') return []
    const out: number[] = []
    const groups = side.split(':')
    for (let i = 0; i < groups.length; i++) {
      const group = groups[i]!
      if (group.includes('.')) {
        // An embedded IPv4 tail only ends the address.
        if (i !== groups.length - 1) return null
        const v4 = parseV4(group)
        if (!v4) return null
        out.push(...v4)
      } else {
        const bytes = parseV6Tail(group)
        if (!bytes) return null
        out.push(...bytes)
      }
    }
    return out.length % 2 === 0 || side.includes('.') ? out : null
  }
  if (halves.length === 1) {
    const bytes = expand(halves[0]!)
    return bytes && bytes.length === 16 ? bytes : null
  }
  const [head, tail] = halves as [string, string]
  const headBytes = expand(head) ?? []
  const tailBytes = expand(tail) ?? []
  if (headBytes === null || tailBytes === null) return null
  const missing = 16 - headBytes.length - tailBytes.length
  if (missing < 2) return null
  return [...headBytes, ...new Array(missing).fill(0), ...tailBytes]
}

function parseIp(host: string): Parsed | 'scoped' | null {
  const bare = host.startsWith('[') && host.endsWith(']') ? host.slice(1, -1) : host
  if (bare.includes(':')) {
    if (bare.includes('.') && !bare.includes('::') && bare.split(':').length < 3) return null
    const v6 = parseV6(bare)
    if (v6 === ('scoped' as unknown)) return 'scoped'
    return v6 ? { kind: 'v6', bytes: v6 } : null
  }
  if (!/^[0-9a-fA-FxX.]+$/.test(bare)) return null
  const v4 = parseV4(bare)
  return v4 ? { kind: 'v4', bytes: v4 } : null
}

// The ticket's refused set, checked on raw bytes so no spelling slips through.
function v4Blocked([a, b, c]: [number, number, number, number]): boolean {
  void c
  return (
    a === 0 || // 0.0.0.0/8
    a === 10 || // 10/8
    (a === 100 && b >= 64 && b <= 127) || // 100.64/10
    a === 127 || // 127/8
    (a === 169 && b === 254) || // 169.254/16
    (a === 172 && b >= 16 && b <= 31) || // 172.16/12
    (a === 192 && b === 0 && c === 0) || // 192.0.0/24 (not 192.0.2/24)
    (a === 192 && b === 168) || // 192.168/16
    (a === 198 && b >= 18 && b <= 19) || // 198.18/15
    a >= 224 // 224/4 and above
  )
}

const NAT64_PREFIX = [0, 100, 255, 155, 0, 0, 0, 0, 0, 0, 0, 0]

function v6Blocked(bytes: number[]): boolean {
  const isZero = (from: number, to: number) => bytes.slice(from, to).every((b) => b === 0)
  if (isZero(0, 16)) return true // ::
  if (isZero(0, 15) && bytes[15] === 1) return true // ::1
  if ((bytes[0]! & 0xfe) === 0xfc) return true // fc00::/7
  if (bytes[0] === 0xfe && (bytes[1]! & 0xc0) === 0x80) return true // fe80::/10
  if (bytes[0] === 0xff) return true // ff00::/8
  const mapped = isZero(0, 10) && bytes[10] === 0xff && bytes[11] === 0xff
  const nat64 = NAT64_PREFIX.every((b, i) => bytes[i] === b)
  if (mapped || nat64) {
    return v4Blocked([bytes[12]!, bytes[13]!, bytes[14]!, bytes[15]!])
  }
  return false
}

function compressV6(bytes: number[]): string {
  // RFC 5952 section 5: an IPv4-mapped address renders its tail dotted-decimal.
  if (bytes.slice(0, 10).every((b) => b === 0) && bytes[10] === 0xff && bytes[11] === 0xff) {
    return `::ffff:${bytes[12]}.${bytes[13]}.${bytes[14]}.${bytes[15]}`
  }
  const groups: number[] = []
  for (let i = 0; i < 16; i += 2) groups.push((bytes[i]! << 8) | bytes[i + 1]!)
  let best = -1
  let bestLen = 0
  for (let i = 0; i < 8;) {
    if (groups[i] !== 0) {
      i += 1
      continue
    }
    let j = i
    while (j < 8 && groups[j] === 0) j += 1
    if (j - i > bestLen) {
      best = i
      bestLen = j - i
    }
    i = j
  }
  const text = groups.map((g) => g.toString(16)).join(':')
  if (bestLen < 2) return text
  const head = groups
    .slice(0, best)
    .map((g) => g.toString(16))
    .join(':')
  const tail = groups
    .slice(best + bestLen)
    .map((g) => g.toString(16))
    .join(':')
  return `${head}::${tail}`
}

const defaultLookup: DnsLookup = async (host) => {
  const records = await dnsLookup(host, { all: true })
  return records.map((record) => record.address)
}

function parseUrl(input: string | URL): URL {
  try {
    return new URL(input)
  } catch {
    return unsafe(`${String(input).slice(0, 120)} is not a URL`)
  }
}

async function resolveHost(host: string, lookup: DnsLookup): Promise<string[]> {
  let addresses: string[]
  try {
    addresses = await lookup(host)
  } catch {
    return unsafe(`${host} did not resolve`)
  }
  if (addresses.length === 0) return unsafe(`${host} did not resolve`)
  for (const address of addresses) {
    const parsedAddress = parseIp(address)
    if (parsedAddress === null || parsedAddress === 'scoped') {
      return unsafe(`${host} resolves to ${address}, which is not checked`)
    }
    const blocked = parsedAddress.kind === 'v4' ? v4Blocked(parsedAddress.bytes) : v6Blocked(parsedAddress.bytes)
    if (blocked) return unsafe(`${host} resolves to a non-public address`)
  }
  return addresses
}

export const assertPublicUrl: AssertPublicUrl = async (url, o) => {
  const parsed = parseUrl(url)
  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    return unsafe(`only http and https URLs are fetched, not ${parsed.protocol}`)
  }
  if (o?.https && parsed.protocol === 'http:') return unsafe('http: is refused when https is required')
  const host = parsed.hostname.replace(/\.$/, '')
  if (!host) return unsafe('the URL has no host')
  if (host.toLowerCase() === 'metadata.google.internal') return unsafe('the metadata endpoint is never fetched')
  const literal = parseIp(host)
  if (literal === 'scoped') return unsafe('scoped addresses are never fetched')
  if (literal) {
    const blocked = literal.kind === 'v4' ? v4Blocked(literal.bytes) : v6Blocked(literal.bytes)
    if (blocked) return unsafe(`${host} is not a public address`)
    const normalized = literal.kind === 'v4' ? literal.bytes.join('.') : compressV6(literal.bytes)
    return { url: parsed, addresses: [normalized] }
  }
  return { url: parsed, addresses: await resolveHost(host, o?.lookup ?? defaultLookup) }
}

// Fetching: one hop per checked address set, the socket pinned to those
// addresses by a lookup override, so a DNS answer that changes between check
// and connect is never consulted.

interface Pinned {
  url: URL
  addresses: string[]
}

export interface FetchPinnedOptions {
  timeoutMs?: number
  maxBytes?: number
  redirects?: 'error' | 'follow'
  maxRedirects?: number
  https?: boolean
  lookup?: DnsLookup
  method?: string
  headers?: HeaderInput
  body?: string | Uint8Array | URLSearchParams
  /**
   * @internal Re-checks each redirect hop; the guard by default. Tests pass a
   * stub to prove redirect mechanics against a local server, and use the real
   * guard in the policy tests below.
   */
  recheck?: (url: URL, o?: { https?: boolean; lookup?: DnsLookup }) => Promise<Pinned>
}

/** @internal Test and advanced use: fetch already-checked addresses (the guard is proved separately). */
export async function fetchPinned(checked: Pinned, init: FetchPinnedOptions = {}): Promise<Response> {
  const timeoutMs = init.timeoutMs ?? 10_000
  const maxBytes = init.maxBytes ?? 5 * 1024 * 1024
  const redirects = init.redirects ?? 'follow'
  const maxRedirects = init.maxRedirects ?? 5
  const deadline = Date.now() + timeoutMs
  let current = stripCredentials(checked)
  let method = init.method ?? 'GET'
  const headers = toNodeHeaders(init.headers)
  let body = toBodyBytes(init.body)

  for (let hop = 0; ; hop++) {
    const response = await requestOnce(current, { method, headers, body, maxBytes, deadline })
    const location = response.headers.get('location')
    if (!isRedirect(response.status) || !location) return response
    await response.arrayBuffer().catch(() => undefined)
    if (redirects === 'error')
      throw Object.assign(new Error('safeFetch: redirect refused'), { code: 'SAFEFETCH_REDIRECT' })
    if (hop >= maxRedirects)
      throw Object.assign(new Error('safeFetch: too many redirects'), { code: 'SAFEFETCH_REDIRECT' })
    let next: URL
    try {
      next = new URL(location, current.url)
    } catch {
      throw Object.assign(new Error('safeFetch: bad redirect location'), { code: 'SAFEFETCH_REDIRECT' })
    }
    if (
      (response.status === 303 && method !== 'HEAD') ||
      ((response.status === 301 || response.status === 302) && method === 'POST')
    ) {
      method = 'GET'
      body = undefined
      delete headers['content-length']
      delete headers['content-type']
    }
    // The re-check: every hop resolves fresh and refuses through the guard.
    const recheck = init.recheck ?? assertPublicUrl
    current = stripCredentials(await recheck(next, { https: init.https, lookup: init.lookup }))
  }
}

/** Credentials never ride along, on the first hop or a redirect's Location. */
function stripCredentials<T extends Pinned>(checked: T): T {
  checked.url.username = ''
  checked.url.password = ''
  return checked
}

const isRedirect = (status: number) =>
  status === 301 || status === 302 || status === 303 || status === 307 || status === 308

/** What `fetchPinned` accepts for headers; the package has no DOM lib, so this spells out `HeadersInit`. */
export type HeaderInput = Headers | Array<[string, string]> | Record<string, string | readonly string[]>

function toNodeHeaders(headers: HeaderInput | undefined): Record<string, string | string[]> {
  if (!headers) return {}
  if (headers instanceof Headers) {
    const out: Record<string, string | string[]> = {}
    headers.forEach((value, key) => {
      const seen = out[key]
      out[key] = seen === undefined ? value : `${seen}, ${value}`
    })
    return out
  }
  if (Array.isArray(headers)) {
    const out: Record<string, string | string[]> = {}
    for (const [key, value] of headers) out[key.toLowerCase()] = value
    return out
  }
  return Object.fromEntries(
    Object.entries(headers).map(([key, value]): [string, string | string[]] => [
      key.toLowerCase(),
      typeof value === 'string' ? value : value.join(', ')
    ])
  )
}

function toBodyBytes(body: FetchPinnedOptions['body']): Buffer | undefined {
  if (body === undefined) return undefined
  if (typeof body === 'string') return Buffer.from(body)
  if (body instanceof Uint8Array) return Buffer.from(body)
  return Buffer.from(body.toString())
}

const failover = (error: unknown): boolean =>
  typeof error === 'object' &&
  error !== null &&
  !('code' in error && String((error as { code: unknown }).code).startsWith('SAFEFETCH_'))

function requestOnce(
  checked: Pinned,
  o: {
    method: string
    headers: Record<string, string | string[]>
    body: Buffer | undefined
    maxBytes: number
    deadline: number
  }
): Promise<Response> {
  const remaining = [...checked.addresses]
  return new Promise((resolve, reject) => {
    const attempt = () => {
      const ip = remaining.shift()!
      const family = ip.includes(':') ? 6 : 4
      const transport = checked.url.protocol === 'https:' ? https : http
      const request = transport.request(
        checked.url,
        {
          method: o.method,
          headers:
            o.method === 'GET' || o.method === 'HEAD'
              ? o.headers
              : { ...o.headers, 'content-length': String(o.body?.length ?? 0) },
          // The pin: connect only to a checked address, whatever DNS says now.
          // autoSelectFamily asks with all:true, so answer in the shape asked.
          lookup: (_hostname, options, callback) => {
            if (typeof options === 'object' && options !== null && 'all' in options && options.all) {
              callback(null, [{ address: ip, family }] as never)
              return
            }
            callback(null, ip, family)
          }
        },
        (incoming) => {
          let settled = false
          const chunks: Buffer[] = []
          let size = 0
          incoming.on('data', (chunk: Buffer) => {
            size += chunk.length
            if (size > o.maxBytes) {
              settled = true
              request.destroy(
                Object.assign(new Error(`safeFetch: response exceeds ${o.maxBytes} bytes`), { code: 'SAFEFETCH_BODY' })
              )
              return
            }
            chunks.push(chunk)
          })
          incoming.on('end', () => {
            if (settled) return
            clearTimeout(timer)
            const headers = new Headers()
            for (let i = 0; i < incoming.rawHeaders.length; i += 2) {
              try {
                headers.append(incoming.rawHeaders[i]!, incoming.rawHeaders[i + 1]!)
              } catch {
                // Skip a malformed header rather than failing the fetch.
              }
            }
            const status = incoming.statusCode ?? 200
            resolve(
              new Response(status === 204 || status === 205 || status === 304 ? null : Buffer.concat(chunks), {
                status,
                statusText: incoming.statusMessage ?? '',
                headers
              })
            )
          })
        }
      )
      const remainingMs = o.deadline - Date.now()
      const timer = setTimeout(
        () => {
          request.destroy(Object.assign(new Error('safeFetch: timed out'), { code: 'SAFEFETCH_TIMEOUT' }))
        },
        Math.max(remainingMs, 0)
      )
      if (typeof timer.unref === 'function') timer.unref()
      request.on('error', (error: unknown) => {
        clearTimeout(timer)
        if (remaining.length > 0 && failover(error)) {
          attempt()
          return
        }
        reject(error)
      })
      if (o.body && o.method !== 'GET' && o.method !== 'HEAD') request.write(o.body)
      request.end()
    }
    attempt()
  })
}

export const safeFetch: SafeFetch = async (url, init) => {
  const checked = await assertPublicUrl(url, { https: init?.https, lookup: init?.lookup })
  return fetchPinned(checked, {
    timeoutMs: init?.timeoutMs,
    maxBytes: init?.maxBytes,
    redirects: init?.redirects,
    maxRedirects: init?.maxRedirects,
    https: init?.https,
    lookup: init?.lookup,
    method: init?.method,
    headers: init?.headers as HeaderInput | undefined,
    body: init?.body as FetchPinnedOptions['body']
  })
}
