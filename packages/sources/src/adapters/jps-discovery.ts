import type { DiscoveredSource } from '../contract'
import { HttpError, NetworkError, SchemaError, TimeoutError } from '../errors'

const LIST_URL = 'https://infobanjirjpskl.water.gov.my/Rainfall/LatestData/All'
export interface JpsDiscoveryOptions {
  discoveryHttp?: typeof fetch
  userAgent?: string
}

function text(markup: string): string {
  const named: Record<string, string> = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ' }
  return markup
    .replace(/<[^>]*>/g, '')
    .replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (_, entity: string) => {
      if (!entity.startsWith('#')) {
        const decoded = named[entity.toLowerCase()]
        if (decoded === undefined) throw new SchemaError(`Unsupported JPS HTML entity: ${entity}`)
        return decoded
      }
      const code = entity[1]?.toLowerCase() === 'x' ? Number.parseInt(entity.slice(2), 16) : Number(entity.slice(1))
      if (code <= 0 || code > 0x10ffff || (code >= 0xd800 && code <= 0xdfff))
        throw new SchemaError('Invalid JPS HTML entity')
      return String.fromCodePoint(code)
    })
    .replace(/\s+/g, ' ')
    .trim()
}

interface Element {
  tag: string
  attributes: string
  content: string
}

// Consume complete quoted values so attribute-looking text inside a value cannot match.
function attribute(attributes: string, name: string): string | undefined {
  let remaining = attributes
  let value: string | undefined
  while (remaining.trim()) {
    const match = /^\s+([^\s"'<>/=]+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'=<>`]+)))?/.exec(remaining)
    if (!match) throw new SchemaError('Malformed JPS attributes')
    if (match[1]!.toLowerCase() === name) {
      if (value !== undefined) throw new SchemaError(`Duplicate JPS ${name} attribute`)
      value = match[2] ?? match[3] ?? match[4] ?? ''
    }
    remaining = remaining.slice(match[0].length)
  }
  return value
}

// Account for the entire selected table/body/row, not only recognized fragments.
function sections(markup: string, tags: string[], entire = true): Element[] {
  const pattern = new RegExp(
    `<(${tags.join('|')})(?=\\s|>)((?:"[^"]*"|'[^']*'|[^'">])*)>([\\s\\S]*?)<\\/\\1\\s*>`,
    'gi'
  )
  const found = [...markup.matchAll(pattern)]
  if (entire && markup.replace(pattern, '').trim()) throw new SchemaError(`Unexpected JPS ${tags.join('/')} markup`)
  return found.map((match) => ({ tag: match[1]!.toLowerCase(), attributes: match[2]!, content: match[3]! }))
}

export function parseJpsStationList(html: string): DiscoveredSource[] {
  const tables = sections(html, ['table'], false).filter(
    (table) => attribute(table.attributes, 'id') === 'Online-rainfalldata'
  )
  if (tables.length !== 1) throw new SchemaError('Expected one JPS Online-rainfalldata table')
  const parts = sections(tables[0]!.content, ['thead', 'tbody'])
  const heads = parts.filter((part) => part.tag === 'thead')
  const bodies = parts.filter((part) => part.tag === 'tbody')
  if (bodies.length !== 1 || heads.length > 1) throw new SchemaError('Expected one JPS station tbody')
  // A station row moved into the header must not disappear from discovery either.
  for (const head of heads) {
    for (const row of sections(head.content, ['tr'])) sections(row.content, ['th'])
  }
  const rows = sections(bodies[0]!.content, ['tr'])
  if (!rows.length) throw new SchemaError('Empty JPS station table')
  const externalIds = new Set<string>()
  const internalIds = new Set<number>()
  return rows.map((row) => {
    const cells = sections(row.content, ['td'])
    if (cells.length !== 14) throw new SchemaError('Unexpected JPS station cells')
    const externalId = text(cells[1]!.content)
    const name = text(cells[3]!.content)
    const district = text(cells[4]!.content)
    const links = sections(cells[12]!.content, ['a'])
    const href = links.length === 1 ? attribute(links[0]!.attributes, 'href') : undefined
    const idMatch = href ? /^\/Rainfall\/Station\/([1-9]\d*)\?districtId=0$/.exec(href) : null
    const id = idMatch ? Number(idMatch[1]) : NaN
    if (!/^\d+RF$/.test(externalId) || !name || !district || !Number.isSafeInteger(id) || id <= 0) {
      throw new SchemaError('Invalid JPS station ID, name, district or link')
    }
    if (externalIds.has(externalId) || internalIds.has(id)) throw new SchemaError('Conflicting JPS station IDs')
    externalIds.add(externalId)
    internalIds.add(id)
    return {
      externalId,
      name,
      lat: null,
      lon: null,
      url: `https://infobanjirjpskl.water.gov.my/Rainfall/GetRainfallGraph/${id}`,
      meta: { jps_id: id, district }
    }
  })
}

export async function discoverJpsStations(options: JpsDiscoveryOptions = {}): Promise<DiscoveredSource[]> {
  const userAgent = options.userAgent?.trim() || process.env.ADAPTER_USER_AGENT?.trim()
  if (!userAgent) throw new SchemaError('ADAPTER_USER_AGENT is required for JPS discovery')
  const http = options.discoveryHttp ?? globalThis.fetch
  const controller = new AbortController()
  let timer: ReturnType<typeof setTimeout> | undefined
  const deadline = new Promise<never>((_, reject) => {
    timer = setTimeout(() => {
      controller.abort()
      reject(new TimeoutError(LIST_URL))
    }, 20000)
  })
  try {
    const body = await Promise.race([
      deadline,
      (async () => {
        const response = await http(LIST_URL, {
          method: 'GET',
          headers: { Accept: 'text/html', 'User-Agent': userAgent },
          redirect: 'manual',
          signal: controller.signal
        })
        if (!response.ok) throw new HttpError(response.status, LIST_URL)
        return response.text()
      })()
    ])
    return parseJpsStationList(body)
  } catch (error) {
    if (error instanceof SchemaError || error instanceof HttpError || error instanceof TimeoutError) throw error
    if (controller.signal.aborted) throw new TimeoutError(LIST_URL)
    throw new NetworkError(LIST_URL, error)
  } finally {
    clearTimeout(timer)
  }
}
