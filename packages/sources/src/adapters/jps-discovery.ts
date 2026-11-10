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

// Bound every extraction to the selected table/body/row; never evaluate map JavaScript.
function sections(markup: string, tag: string): string[] {
  const pattern = new RegExp(`<${tag}\\b[^>]*>([\\s\\S]*?)<\\/${tag}\\s*>`, 'gi')
  const found = [...markup.matchAll(pattern)]
  const residue = markup.replace(pattern, '')
  if (new RegExp(`<\\/?${tag}\\b`, 'i').test(residue)) throw new SchemaError(`Malformed JPS ${tag}`)
  return found.map((match) => match[1]!)
}

export function parseJpsStationList(html: string): DiscoveredSource[] {
  const tables = [...html.matchAll(/<table\b([^>]*)>([\s\S]*?)<\/table\s*>/gi)].filter((match) =>
    /\bid\s*=\s*["']Online-rainfalldata["']/i.test(match[1]!)
  )
  if (tables.length !== 1) throw new SchemaError('Expected one JPS Online-rainfalldata table')
  const bodies = sections(tables[0]![2]!, 'tbody')
  if (bodies.length !== 1) throw new SchemaError('Expected one JPS station tbody')
  const rows = sections(bodies[0]!, 'tr')
  if (!rows.length) throw new SchemaError('Empty JPS station table')
  const externalIds = new Set<string>()
  const internalIds = new Set<number>()
  return rows.map((row) => {
    const cells = sections(row, 'td')
    if (cells.length !== 14) throw new SchemaError('Unexpected JPS station cells')
    const externalId = text(cells[1]!)
    const name = text(cells[3]!)
    const district = text(cells[4]!)
    const links = [...row.matchAll(/\bhref\s*=\s*["'](\/Rainfall\/Station\/[^"']*)["']/gi)]
    const idMatch = links.length === 1 ? /^\/Rainfall\/Station\/([1-9]\d*)\?districtId=0$/.exec(links[0]![1]!) : null
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
