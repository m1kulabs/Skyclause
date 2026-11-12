import ICAL from 'ical.js'
import type {
  CalendarDocument,
  CalendarIssue,
  CalendarOccurrence,
  CalendarOptions,
  ParsedCalendar
} from './calendar-types'
import { parseLocalDate, validateWindowFields } from './validation'

const MAX_BYTES = 5 * 1024 * 1024
const MAX_EVENTS = 10000
const MAX_STEPS = 100000
const MAX_OCCURRENCES = 10000
const DAY = 86400000
const eventProperties = new Set([
  'uid',
  'summary',
  'dtstart',
  'dtend',
  'duration',
  'rrule',
  'rdate',
  'exdate',
  'recurrence-id',
  'status'
])
const zoneProperties = new Set(['tzid'])
const observanceProperties = new Set(['dtstart', 'tzoffsetfrom', 'tzoffsetto', 'rrule', 'rdate'])
const timeProperties = new Set(['dtstart', 'dtend', 'recurrence-id', 'rdate', 'exdate'])

type Jcal = [string, unknown[][], Jcal[]]

/** Whole-document errors, including resource limits, expose structured issues to the import service. */
export class CalendarParseError extends Error {
  constructor(public readonly issues: CalendarIssue[]) {
    super(issues.map((issue) => issue.detail).join('; '))
    this.name = 'CalendarParseError'
  }
}

function fail(detail: string, pointer = '/', uid: string | null = null, recurrenceId: string | null = null): never {
  throw new CalendarParseError([{ uid, recurrenceId, pointer, detail }])
}

function record(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
}

/** Rebuild the component tree; never persist arbitrary source properties or parameters. */
function normalized(value: unknown, strict: boolean, parent?: string): Jcal {
  if (
    !Array.isArray(value) ||
    value.length !== 3 ||
    typeof value[0] !== 'string' ||
    !Array.isArray(value[1]) ||
    !Array.isArray(value[2])
  )
    fail('Invalid calendar component structure.')
  const [name, properties, children] = value
  const allowed =
    name === 'vcalendar' && !parent
      ? new Set(['version'])
      : name === 'vevent' && parent === 'vcalendar'
        ? eventProperties
        : name === 'vtimezone' && parent === 'vcalendar'
          ? zoneProperties
          : (name === 'standard' || name === 'daylight') && parent === 'vtimezone'
            ? observanceProperties
            : null
  if (!allowed) fail('Unsupported calendar component.')
  const output: Jcal = [name, [], []]
  for (const property of properties) {
    if (
      !Array.isArray(property) ||
      property.length < 4 ||
      typeof property[0] !== 'string' ||
      !record(property[1]) ||
      typeof property[2] !== 'string'
    )
      fail('Invalid calendar property structure.')
    if (property[0] === 'exrule') fail('Unsupported EXRULE cannot be normalized safely.')
    if (!allowed.has(property[0])) {
      if (strict) fail('Stored calendar contains a non-permitted property.')
      continue
    }
    const params: Record<string, string> = {}
    for (const [key, entry] of Object.entries(property[1])) {
      if ((key === 'tzid' && timeProperties.has(property[0])) || (key === 'range' && property[0] === 'recurrence-id')) {
        if (typeof entry !== 'string') fail('Invalid calendar property parameter.')
        params[key] = entry
      } else if (strict) fail('Stored calendar contains a non-permitted parameter.')
    }
    output[1].push([property[0], params, property[2], ...structuredClone(property.slice(3))])
  }
  if (name === 'standard' || name === 'daylight') {
    const dates = output[1].filter((property) => property[0] === 'rdate')
    const onset = output[1].find((property) => property[0] === 'dtstart')
    if (dates.length || output[1].some((property) => property[0] === 'rrule')) {
      // Pinned timezone hydration reads one value per RDATE and otherwise omits DTSTART onset.
      const onsets = new Map<string, unknown[]>()
      for (const property of dates)
        for (const value of property.slice(3)) {
          const single = [...property.slice(0, 3), value]
          onsets.set(JSON.stringify(single), single)
        }
      if (onset) {
        const first = ['rdate', onset[1], onset[2], onset[3]]
        onsets.set(JSON.stringify(first), first)
      }
      output[1] = [...output[1].filter((property) => property[0] !== 'rdate'), ...onsets.values()]
    }
  }
  for (const child of children) {
    if (
      !strict &&
      Array.isArray(child) &&
      !(
        (name === 'vcalendar' && ['vevent', 'vtimezone'].includes(child[0])) ||
        (name === 'vtimezone' && ['standard', 'daylight'].includes(child[0]))
      )
    )
      continue
    output[2].push(normalized(child, strict, name))
  }
  if (name === 'vcalendar') {
    const referenced = new Set(
      output[2]
        .filter((child) => child[0] === 'vevent')
        .flatMap((child) =>
          child[1].flatMap((property) => {
            const params = property[1]
            return record(params) && typeof params.tzid === 'string' ? [params.tzid] : []
          })
        )
    )
    output[2] = output[2].filter((child) => {
      if (child[0] !== 'vtimezone') return true
      const tzid = child[1].find((property) => property[0] === 'tzid')?.[3]
      if (typeof tzid === 'string' && referenced.has(tzid)) return true
      if (strict) fail('Stored calendar contains an unreferenced VTIMEZONE.')
      return false
    })
  }
  return output
}

function checkBytes(text: string) {
  if (Buffer.byteLength(text, 'utf8') > MAX_BYTES) fail('Calendar exceeds 5 MiB UTF-8.')
}

function checkOptions(options: CalendarOptions) {
  try {
    // eslint-disable-next-line no-restricted-properties -- Identifier validation only; no presentation formatting.
    new Intl.DateTimeFormat('en', { timeZone: options.projectTz })
  } catch {
    fail('Invalid project timezone.', '/projectTz')
  }
  const start = options.now.getTime()
  const through = options.through.getTime()
  if (!Number.isFinite(start) || !Number.isFinite(through) || through < start || through > start + 90 * DAY)
    fail('Expansion must stay within now and 90 elapsed days.', '/through')
}

/** Check balanced component boundaries; ICAL's permissive parser alone accepts missing END lines. */
function checkEnvelope(text: string) {
  const stack: string[] = []
  let roots = 0
  let events = 0
  for (const line of text.replace(/\r?\n[ \t]/g, '').split(/\r?\n/)) {
    if (!line) continue
    if (line.startsWith('BEGIN:')) {
      const name = line.slice(6).toLowerCase()
      if (!stack.length && (name !== 'vcalendar' || ++roots !== 1)) fail('Expected one VCALENDAR document.')
      if (stack.length >= 4) fail('Calendar components are nested too deeply.')
      stack.push(name)
      if (name === 'vevent' && ++events > MAX_EVENTS) fail('Calendar exceeds 10,000 VEVENTs.')
    } else if (line.startsWith('END:')) {
      if (stack.pop() !== line.slice(4).toLowerCase()) fail('Mismatched calendar component boundary.')
    } else if (!stack.length) fail('Content outside VCALENDAR.')
  }
  if (stack.length || roots !== 1) fail('Incomplete VCALENDAR document.')
}

function validTime(value: unknown, type: unknown): boolean {
  if (typeof value !== 'string' || parseLocalDate(value.slice(0, 10)) === null) return false
  return type === 'date'
    ? value.length === 10
    : type === 'date-time' && /^(?!0000)\d{4}-\d{2}-\d{2}T(?:[01]\d|2[0-3]):[0-5]\d:[0-5]\dZ?$/.test(value)
}

function checkRule(value: unknown, zoneRule: boolean) {
  if (
    !record(value) ||
    !['SECONDLY', 'MINUTELY', 'HOURLY', 'DAILY', 'WEEKLY', 'MONTHLY', 'YEARLY'].includes(String(value.freq))
  )
    throw new Error('Invalid recurrence frequency.')
  const selectors = Object.keys(value).filter((key) => key.startsWith('by'))
  const values = (key: string) => (Array.isArray(value[key]) ? value[key] : [value[key]])
  if (selectors.some((key) => new Set(values(key)).size !== values(key).length))
    throw new Error('Stored duplicate recurrence selectors are unsupported to bound constructor work.')
  if (zoneRule) {
    if (
      value.freq !== 'YEARLY' ||
      selectors.some((key) => !['bymonth', 'byday', 'bymonthday'].includes(key)) ||
      ('byday' in value && 'bymonthday' in value) ||
      ('byday' in value &&
        !values('byday').every(
          (day) => typeof day === 'string' && /^(?:-1|[1-4])?(?:MO|TU|WE|TH|FR|SA|SU)$/.test(day)
        )) ||
      ('bymonthday' in value &&
        !values('bymonthday').every(
          (day) => Number.isInteger(day) && Math.abs(Number(day)) >= 1 && Math.abs(Number(day)) <= 28
        ))
    )
      throw new Error('VTIMEZONE recurrence requires a provably nonempty yearly selector at the DTSTART clock.')
  } else if (
    selectors.some((key) => value.freq !== 'WEEKLY' || key !== 'byday') ||
    (value.freq === 'WEEKLY' &&
      'byday' in value &&
      !values('byday').every((day) => typeof day === 'string' && /^(?:MO|TU|WE|TH|FR|SA|SU)$/.test(day)))
  ) {
    throw new Error(
      `${['SECONDLY', 'MINUTELY', 'HOURLY'].includes(String(value.freq)) ? 'Subdaily' : 'Filtered'} recurrence selectors cannot be bounded safely.`
    )
  }
  // Bound every civil normalization advance before constructing a library iterator.
  const maxInterval: Record<string, number> = {
    SECONDLY: 31622400,
    MINUTELY: 527040,
    HOURLY: 8784,
    DAILY: 366,
    WEEKLY: 52,
    MONTHLY: 12,
    YEARLY: 1
  }
  if (Number(value.interval ?? 1) > maxInterval[String(value.freq)]!)
    throw new Error('Recurrence INTERVAL may advance at most one civil year.')
  const ranges: Record<string, [number, number, boolean]> = {
    bysecond: [0, 59, false],
    byminute: [0, 59, false],
    byhour: [0, 23, false],
    bymonth: [1, 12, false],
    bymonthday: [-31, 31, true],
    byyearday: [-366, 366, true],
    byweekno: [-53, 53, true],
    bysetpos: [-366, 366, true]
  }
  for (const [key, entry] of Object.entries(value)) {
    if (key === 'freq') continue
    if (key === 'count' || key === 'interval') {
      if (!Number.isSafeInteger(entry) || Number(entry) <= 0) throw new Error('Invalid recurrence count or interval.')
    } else if (key === 'until') {
      if (!validTime(entry, 'date-time') && !validTime(entry, 'date')) throw new Error('Invalid recurrence UNTIL.')
    } else if (key === 'wkst') {
      if (!/^(MO|TU|WE|TH|FR|SA|SU)$/.test(String(entry))) throw new Error('Invalid recurrence week start.')
    } else if (key === 'byday') {
      const days = Array.isArray(entry) ? entry : [entry]
      if (
        days.length > 366 ||
        !days.every(
          (day) => typeof day === 'string' && /^(?:[+-]?(?:[1-9]|[1-4]\d|5[0-3]))?(?:MO|TU|WE|TH|FR|SA|SU)$/.test(day)
        )
      )
        throw new Error('Invalid recurrence BYDAY.')
    } else if (key in ranges) {
      const [min, max, nonzero] = ranges[key]!
      const numbers = Array.isArray(entry) ? entry : [entry]
      if (
        numbers.length > max - min + 1 ||
        !numbers.every(
          (number) =>
            Number.isInteger(number) && Number(number) >= min && Number(number) <= max && (!nonzero || number !== 0)
        )
      )
        throw new Error('Invalid recurrence selector.')
    } else throw new Error('Unsupported recurrence property.')
  }
  if (value.count !== undefined && value.until !== undefined)
    throw new Error('Recurrence cannot combine COUNT and UNTIL.')
}

function durationSeconds(value: unknown): number {
  if (
    typeof value !== 'string' ||
    !/^P(?:\d+W|(?:\d+D)?(?:T(?:\d+H)?(?:\d+M)?(?:\d+S)?)?)$/.test(value) ||
    value === 'P' ||
    value === 'PT'
  )
    throw new Error('Invalid event duration.')
  const units: Record<string, number> = { W: 604800, D: 86400, H: 3600, M: 60, S: 1 }
  let seconds = 0
  for (const part of value.matchAll(/(\d+)([WDHMS])/g)) {
    const amount = Number(part[1])
    if (!Number.isSafeInteger(amount) || amount > 43200)
      throw new Error('DURATION must be finite and between zero and 12 hours.')
    seconds += amount * units[part[2]!]!
    if (seconds > 43200) throw new Error('DURATION must be finite and between zero and 12 hours.')
  }
  return seconds
}

function checkComponent(component: ICAL.Component, zones: Set<string>) {
  const repeated = new Set<string>()
  for (const property of component.getAllProperties()) {
    if (!['rdate', 'exdate'].includes(property.name) && repeated.has(property.name))
      throw new Error(`Duplicate ${property.name} property.`)
    repeated.add(property.name)
    const raw: unknown[] = property.toJSON()
    if (timeProperties.has(property.name)) {
      if (!raw.slice(3).every((value) => validTime(value, raw[2])))
        throw new Error(`Invalid ${property.name} date or time.`)
      const tzid = property.getParameter('tzid')
      if (
        component.name !== 'vevent' &&
        property.name === 'dtstart' &&
        (raw[2] !== 'date-time' || tzid || String(raw[3]).endsWith('Z'))
      )
        throw new Error('Source observance DTSTART must be a floating date-time clock.')
      if (tzid && (!zones.has(String(tzid)) || raw.slice(3).some((value) => String(value).endsWith('Z'))))
        throw new Error('TZID requires its own source VTIMEZONE and local date-time values.')
    } else if (property.name === 'rrule') {
      checkRule(raw[3], component.name !== 'vevent')
      if (
        component.name !== 'vevent' &&
        record(raw[3]) &&
        raw[3].bymonth !== undefined &&
        raw[3].byday === undefined &&
        raw[3].bymonthday === undefined
      ) {
        const start = component.getFirstProperty('dtstart')?.toJSON()[3]
        if (!validTime(start, 'date-time')) throw new Error('Invalid source observance DTSTART.')
        const day = Number(String(start).slice(8, 10))
        const months = Array.isArray(raw[3].bymonth) ? raw[3].bymonth : [raw[3].bymonth]
        const minimumDays = [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31]
        if (months.some((month) => day > minimumDays[Number(month) - 1]!))
          throw new Error('Source yearly month selection cannot guarantee its DTSTART monthday.')
      }
    } else if (property.name === 'duration') {
      if (raw[2] !== 'duration') throw new Error('Invalid event duration type.')
      durationSeconds(raw[3])
    } else if (property.name === 'tzoffsetfrom' || property.name === 'tzoffsetto') {
      if (
        raw[2] !== 'utc-offset' ||
        typeof raw[3] !== 'string' ||
        !/^[+-](?:[01]\d|2[0-3]):[0-5]\d(?::[0-5]\d)?$/.test(raw[3])
      )
        throw new Error('Invalid VTIMEZONE offset.')
      const parts = /^([+-])(\d{2}):(\d{2})(?::(\d{2}))?$/.exec(String(raw[3]))!
      const minutes = (Number(parts[2]) * 60 + Number(parts[3])) * (parts[1] === '-' ? -1 : 1)
      if (Number(parts[4] ?? 0) !== 0 || minutes < -720 || minutes > 840)
        throw new Error(
          'VTIMEZONE offset must be whole minutes within -12:00 and +14:00 for exact pinned-library representation.'
        )
    } else if (raw[2] !== 'text' || raw.length !== 4 || typeof raw[3] !== 'string')
      throw new Error(`Invalid ${property.name} value.`)
  }
  const recurrenceId = component.getFirstProperty('recurrence-id')
  if (recurrenceId?.getParameter('range')) throw new Error('RANGE recurrence exceptions are unsupported.')
  if (component.hasProperty('dtend') && component.hasProperty('duration'))
    throw new Error('Use DTEND or DURATION, not both.')
}

function civilTimestamp(time: ICAL.Time): number {
  return parseLocalDate(time.toString().slice(0, 10))! + ((time.hour * 60 + time.minute) * 60 + time.second) * 1000
}

function assertSourceCoverage(time: ICAL.Time) {
  if (time.zone === ICAL.Timezone.utcTimezone || time.zone === ICAL.Timezone.localTimezone) return
  const first = time.zone.changes[0] as
    | {
        year: number
        month: number
        day: number
        hour: number
        minute: number
        second: number
        utcOffset: number
        prevUtcOffset: number
      }
    | undefined
  if (!first) throw new Error('Source VTIMEZONE has no coverage.')
  const date = [
    String(first.year).padStart(4, '0'),
    String(first.month).padStart(2, '0'),
    String(first.day).padStart(2, '0')
  ].join('-')
  const midnight = parseLocalDate(date)
  if (midnight === null) throw new Error('Source VTIMEZONE has unrepresentable coverage.')
  // This guard matches the pinned lookup's first local boundary; it never invents an offset.
  const boundary =
    midnight +
    ((first.hour * 60 + first.minute) * 60 + first.second + Math.min(first.utcOffset, first.prevUtcOffset)) * 1000
  if (civilTimestamp(time) < boundary) throw new Error('Source VTIMEZONE has no coverage before its first onset.')
}

function sourceFrame(time: ICAL.Time, frame: ICAL.Time): ICAL.Time {
  if (
    time.isDate !== frame.isDate ||
    (time.zone === ICAL.Timezone.localTimezone) !== (frame.zone === ICAL.Timezone.localTimezone)
  )
    throw new Error('Recurrence date must match the master source value type and floating frame.')
  assertSourceCoverage(time)
  const originalInstant = time.zone === ICAL.Timezone.localTimezone ? undefined : time.toUnixTime()
  const converted = time.convertToZone(frame.zone)
  assertSourceCoverage(converted)
  if (originalInstant !== undefined && converted.toUnixTime() !== originalInstant)
    throw new Error('Recurrence value cannot round-trip exactly through its master source frame.')
  return converted
}

/** Include TZID in civil identities; UTC and project-floating timestamps retain their source spelling. */
function identity(time: ICAL.Time): string {
  const key =
    time.zone === ICAL.Timezone.utcTimezone || time.zone === ICAL.Timezone.localTimezone
      ? time.toString()
      : `${time.zone.tzid}:${time.toString()}`
  if (Buffer.byteLength(key, 'utf8') > 1024) fail('Recurrence identity exceeds 1024 UTF-8 bytes.')
  return key
}

async function instants(
  start: ICAL.Time,
  end: ICAL.Time,
  options: CalendarOptions,
  ensureSourceCoverage: (year: number) => void
) {
  if (start.isDate || end.isDate) throw new Error('All-day events are unsupported.')
  if (!validTime(start.toString(), 'date-time') || !validTime(end.toString(), 'date-time'))
    throw new Error('Unrepresentable event date-time.')
  const floatingStart = start.zone === ICAL.Timezone.localTimezone
  const floatingEnd = end.zone === ICAL.Timezone.localTimezone
  if (floatingStart !== floatingEnd) throw new Error('Start and end must use compatible timezones.')
  if (!floatingStart) {
    ensureSourceCoverage(Math.max(start.year, end.year))
    assertSourceCoverage(start)
    assertSourceCoverage(end)
    return { startsAt: start.toJSDate(), endsAt: end.toJSDate() }
  }
  return options.resolveLocalSpan({
    date: start.toString().slice(0, 10),
    start: start.toString().slice(11, 19),
    end: end.toString().slice(11, 19),
    endDayOffset: (parseLocalDate(end.toString().slice(0, 10))! - parseLocalDate(start.toString().slice(0, 10))!) / DAY,
    tz: options.projectTz
  })
}

export async function parseCalendar(text: string, options: CalendarOptions): Promise<ParsedCalendar> {
  checkBytes(text)
  checkEnvelope(text)
  let jcal: Jcal
  try {
    jcal = normalized(ICAL.parse(text), false)
  } catch (error) {
    if (error instanceof CalendarParseError) throw error
    fail('Malformed iCalendar document.')
  }
  return expandCalendar({ version: 1, jcal }, options)
}

/** Revalidate the serialized whitelist and expand from DTSTART, including historical iterator steps. */
export async function expandCalendar(document: CalendarDocument, options: CalendarOptions): Promise<ParsedCalendar> {
  checkOptions(options)
  let saved: string
  try {
    saved = JSON.stringify(document)
  } catch {
    fail('Invalid stored calendar document.')
  }
  checkBytes(saved)
  if (document?.version !== 1) fail('Unsupported stored calendar version.')
  const jcal = normalized(document.jcal, true)
  const root = new ICAL.Component(jcal)
  if (root.getFirstPropertyValue('version') !== '2.0') fail('Expected iCalendar VERSION:2.0.')
  const components = root.getAllSubcomponents('vevent')
  if (components.length > MAX_EVENTS) fail('Calendar exceeds 10,000 VEVENTs.')
  let steps = 0
  const consumeStep = () => {
    if (++steps > MAX_STEPS) fail('Calendar exceeds 100,000 iterator steps.')
  }
  const zones = new Set<string>()
  for (const zone of root.getAllSubcomponents('vtimezone')) {
    const tzid = zone.getFirstPropertyValue('tzid')
    if (typeof tzid !== 'string' || !tzid.trim() || zones.has(tzid)) fail('Invalid or duplicate source VTIMEZONE TZID.')
    zones.add(tzid)
    try {
      checkComponent(zone, zones)
      const observances = zone.getAllSubcomponents()
      if (!observances.length) throw new Error('VTIMEZONE requires an observance.')
      for (const observance of observances) {
        checkComponent(observance, zones)
        for (const required of ['dtstart', 'tzoffsetfrom', 'tzoffsetto'])
          if (!observance.hasProperty(required)) throw new Error(`VTIMEZONE requires ${required}.`)
      }
    } catch {
      fail('Invalid source VTIMEZONE definition.')
    }
  }
  let verifiedCoverageYear = -1
  const ensureSourceCoverage = (year: number) => {
    if (!zones.size || year <= verifiedCoverageYear) return
    // Match pinned Timezone._ensureCoverage exactly without changing its global minimum year.
    const minimumYear =
      ICAL.Timezone._minimumExpansionYear === -1 ? ICAL.Time.now().year : ICAL.Timezone._minimumExpansionYear
    const coverageYear = Math.max(year, minimumYear) + ICAL.Timezone.EXTRA_COVERAGE
    try {
      for (const zone of root.getAllSubcomponents('vtimezone')) {
        for (const observance of zone.getAllSubcomponents()) {
          const start = observance.getFirstPropertyValue('dtstart')
          if (!(start instanceof ICAL.Time)) throw new Error('Invalid source observance DTSTART.')
          const property = observance.getFirstProperty('rrule')
          const rule = property?.getFirstValue()
          const dates = observance.getAllProperties('rdate')
          if (!rule && !dates.length) consumeStep()
          for (const date of dates) date.getValues().forEach(() => consumeStep())
          if (rule) {
            if (!(rule instanceof ICAL.Recur)) throw new Error('Invalid source observance RRULE.')
            const copy = rule.clone()
            // Pinned Timezone adjusts UTC UNTIL by the previous offset before iterating.
            if (copy.until?.zone === ICAL.Timezone.utcTimezone) {
              const offset = observance.getFirstPropertyValue('tzoffsetfrom')
              if (!(offset instanceof ICAL.UtcOffset)) throw new Error('Invalid source observance offset.')
              copy.until.adjust(0, 0, 0, offset.factor * (offset.hours * 3600 + offset.minutes * 60))
              copy.until.zone = ICAL.Timezone.localTimezone
            }
            const iterator = copy.iterator(start)
            for (let occurrence = iterator.next(); occurrence; occurrence = iterator.next()) {
              consumeStep()
              if (occurrence.year > coverageYear) break
            }
          }
        }
      }
      // Hydration repeats only the work verified above. Prefill once so ordinary lookups cannot
      // repeatedly replay historical rules behind the public event iterator's counter.
      for (const tzid of zones) {
        const zone = root.getTimeZoneByID(tzid)
        zone.utcOffset(ICAL.Time.fromData({ year, month: 1, day: 1, hour: 0, minute: 0, second: 0 }, zone))
        if (!zone.changes.some((change) => change.year <= coverageYear))
          fail('Source VTIMEZONE has no covered transitions.')
      }
      verifiedCoverageYear = coverageYear
    } catch (error) {
      if (error instanceof CalendarParseError) throw error
      fail('Invalid source VTIMEZONE recurrence.')
    }
  }
  let requestedYear = Math.max(options.now.getUTCFullYear(), options.through.getUTCFullYear())
  for (const component of components) {
    for (const property of component.getAllProperties()) {
      const raw: unknown[] = property.toJSON()
      const values = timeProperties.has(property.name)
        ? raw.slice(3)
        : property.name === 'rrule' && record(raw[3])
          ? [raw[3].until]
          : []
      for (const value of values)
        if (validTime(value, 'date-time') || validTime(value, 'date'))
          requestedYear = Math.max(requestedYear, Number(String(value).slice(0, 4)))
    }
  }
  ensureSourceCoverage(requestedYear)
  const result: ParsedCalendar = {
    document: { version: 1, jcal },
    occurrences: [],
    skipped: [],
    protectedIdentities: []
  }
  const protectedKeys = new Set<string>()
  const protect = (uid: string, recurrenceId: string | null) => {
    const key = JSON.stringify([uid, recurrenceId])
    if (!protectedKeys.has(key)) {
      protectedKeys.add(key)
      result.protectedIdentities.push({ uid, recurrenceId })
    }
  }
  const skip = (uid: string | null, recurrenceId: string | null, detail: string, pointer: string) => {
    result.skipped.push({ uid, recurrenceId, detail, pointer })
    if (uid !== null) protect(uid, recurrenceId)
  }
  const groups = new Map<string, Array<{ component: ICAL.Component; pointer: string }>>()
  for (const [index, component] of components.entries()) {
    const pointer = `/vevents/${index}`
    if (component.getAllProperties('uid').length !== 1 || component.getAllProperties('recurrence-id').length > 1)
      fail('Missing or duplicate source identity.', pointer)
    const uid = component.getFirstPropertyValue('uid')
    if (
      typeof uid !== 'string' ||
      !uid.trim() ||
      [...uid].some((character) => character.charCodeAt(0) < 32 || character.charCodeAt(0) === 127) ||
      Buffer.byteLength(uid, 'utf8') > 1024
    ) {
      fail('UID must be nonempty text of at most 1024 UTF-8 bytes without controls.', `${pointer}/uid`)
    }
    const entries = groups.get(uid) ?? []
    entries.push({ component, pointer })
    groups.set(uid, entries)
  }
  const normalizeRdates = (component: ICAL.Component, frame: ICAL.Time) => {
    const properties = component.getAllProperties('rdate')
    if (!properties.length) return
    const distinct = new Map<string, ICAL.Time>()
    for (const property of properties)
      for (const value of property.getValues()) {
        consumeStep() // Raw preprocessing work is bounded even when every value is a duplicate.
        if (!(value instanceof ICAL.Time)) throw new Error('Unsupported RDATE value.')
        const canonical = sourceFrame(value, frame)
        distinct.set(identity(canonical), canonical)
      }
    if (!component.hasProperty('rrule') && !distinct.has(identity(frame))) {
      consumeStep()
      distinct.set(identity(frame), frame)
    }
    const sorted = [...distinct.values()].sort((a, b) => a.compare(b))
    const property = new ICAL.Property('rdate')
    if (frame.zone !== ICAL.Timezone.utcTimezone && frame.zone !== ICAL.Timezone.localTimezone)
      property.setParameter('tzid', frame.zone.tzid)
    property.setValues(sorted)
    component.removeAllProperties('rdate')
    component.addProperty(property)
  }
  // Validate every identity before event validation/cancellation can bypass an ambiguous source entry.
  const overrideKeys = new Map<ICAL.Component, string>()
  for (const [uid, entries] of groups) {
    const masters = entries.filter(({ component }) => !component.hasProperty('recurrence-id'))
    if (masters.length > 1) fail('Duplicate UID master identity.', entries[0]!.pointer, uid)
    const property = masters[0]?.component.getFirstProperty('dtstart')
    const raw = property?.toJSON()
    const sourceTzid = property?.getParameter('tzid')
    const sourceTime =
      property && raw && validTime(raw[3], raw[2]) && (!sourceTzid || zones.has(String(sourceTzid)))
        ? property.getFirstValue()
        : undefined
    const frame = sourceTime instanceof ICAL.Time ? sourceTime : undefined
    const identities = new Set<string>()
    for (const override of entries.filter(({ component }) => component.hasProperty('recurrence-id'))) {
      try {
        const id = override.component.getFirstProperty('recurrence-id')!
        const rawId = id.toJSON()
        const tzid = id.getParameter('tzid')
        if (!validTime(rawId[3], rawId[2]) || (tzid && (!zones.has(String(tzid)) || String(rawId[3]).endsWith('Z'))))
          fail('Invalid RECURRENCE-ID or missing source VTIMEZONE.', override.pointer, uid)
        const time = id.getFirstValue()
        if (!(time instanceof ICAL.Time)) fail('Invalid RECURRENCE-ID.', override.pointer, uid)
        if (
          frame &&
          (time.isDate !== frame.isDate ||
            (time.zone === ICAL.Timezone.localTimezone) !== (frame.zone === ICAL.Timezone.localTimezone))
        )
          fail('RECURRENCE-ID must match the master source frame.', override.pointer, uid)
        const key = identity(frame ? sourceFrame(time, frame) : time)
        if (identities.has(key)) fail('Duplicate recurrence identity.', override.pointer, uid, key)
        identities.add(key)
        overrideKeys.set(override.component, key)
      } catch (error) {
        if (error instanceof CalendarParseError) throw error
        fail('Invalid RECURRENCE-ID; source identity cannot be represented.', override.pointer, uid)
      }
    }
  }
  for (const [uid, entries] of groups) {
    const masters = entries.filter(({ component }) => !component.hasProperty('recurrence-id'))
    const overrides = entries.filter(({ component }) => component.hasProperty('recurrence-id'))
    const local: CalendarOccurrence[] = []
    let master: ICAL.Event | undefined
    const exceptions = new Map<string, { event?: ICAL.Event; pointer: string; cancelled: boolean }>()
    const durations = new Map<ICAL.Event, number>()
    const elapsedDuration = async (event: ICAL.Event): Promise<number> => {
      const cached = durations.get(event)
      if (cached !== undefined) return cached
      let startsAt: Date
      let endsAt: Date
      if (event.component.hasProperty('dtend')) {
        const start = event.startDate
        const end = event.endDate // Explicit property: no duration addition/normalization.
        if (Math.abs(civilTimestamp(end) - civilTimestamp(start)) > 2 * DAY)
          throw new Error('Explicit event civil span exceeds the safely supported two-day bound.')
        ;({ startsAt, endsAt } = await instants(start, end, options, ensureSourceCoverage))
      } else {
        ;({ startsAt } = await instants(event.startDate, event.startDate, options, ensureSourceCoverage))
        const raw = event.component.getFirstProperty('duration')?.toJSON()
        endsAt = new Date(startsAt.getTime() + durationSeconds(raw?.[3] ?? 'PT0S') * 1000)
      }
      const issues = validateWindowFields(
        { starts_at: startsAt.toISOString(), ends_at: endsAt.toISOString(), kind: options.kind, tz: options.projectTz },
        startsAt
      )
      if (issues.length) throw new Error(issues.map((issue) => issue.detail).join('; '))
      const duration = endsAt.getTime() - startsAt.getTime()
      durations.set(event, duration)
      return duration
    }
    try {
      if (overrides.some(({ component }) => component.getFirstProperty('recurrence-id')?.getParameter('range')))
        throw new Error('RANGE recurrence exceptions are unsupported; the complete series is protected.')
      const masterEntry = masters[0]
      if (masterEntry) {
        checkComponent(masterEntry.component, zones)
        if (masterEntry.component.getFirstPropertyValue('status') === 'CANCELLED') continue
        master = new ICAL.Event(masterEntry.component, { exceptions: [], strictExceptions: true })
        if (!master.startDate) throw new Error('DTSTART is required.')
        normalizeRdates(masterEntry.component, master.startDate)
        await elapsedDuration(master)
      }
      for (const override of overrides) {
        const key = overrideKeys.get(override.component)!
        try {
          checkComponent(override.component, zones)
          const cancelled = override.component.getFirstPropertyValue('status') === 'CANCELLED'
          const event = cancelled ? undefined : new ICAL.Event(override.component, { exceptions: [] })
          if (event && !event.startDate) throw new Error('DTSTART is required.')
          exceptions.set(key, { event, cancelled, pointer: override.pointer })
          if (event && master) master.relateException(event)
        } catch (error) {
          skip(uid, key, error instanceof Error ? error.message : 'Invalid exception.', override.pointer)
          exceptions.set(key, { cancelled: true, pointer: override.pointer })
        }
      }
      const add = async (event: ICAL.Event, key: string, start: ICAL.Time, recurring: boolean, pointer: string) => {
        const title = event.summary
        if (typeof title !== 'string' || !title.trim() || title.length > 200)
          throw new Error('SUMMARY must contain between 1 and 200 characters.')
        const { startsAt } = await instants(start, start, options, ensureSourceCoverage)
        const endsAt = new Date(startsAt.getTime() + (await elapsedDuration(event)))
        const issues = validateWindowFields(
          {
            starts_at: startsAt.toISOString(),
            ends_at: endsAt.toISOString(),
            kind: options.kind,
            tz: options.projectTz
          },
          startsAt
        )
        if (issues.length) throw new Error(issues.map((issue) => issue.detail).join('; '))
        if (startsAt < options.now || startsAt > options.through) {
          protect(uid, key)
          return
        }
        local.push({ uid, recurrenceId: key, recurring, startsAt, endsAt, title: title.trim(), tz: options.projectTz })
        if (result.occurrences.length + local.length > MAX_OCCURRENCES)
          fail('Calendar exceeds 10,000 occurrences.', pointer)
      }
      if (master) {
        // Exclude after enumeration so skipped historical rule positions consume the same step budget.
        const iterationComponent = new ICAL.Component(structuredClone(master.component.toJSON()))
        iterationComponent.parent = root
        iterationComponent.removeAllProperties('exdate')
        const iteratorEvent = new ICAL.Event(iterationComponent, { exceptions: [] })
        const iterator = iteratorEvent.iterator()
        const excludedDates = new Set<string>()
        const excludedTimes = new Set<number>()
        for (const property of master.component.getAllProperties('exdate')) {
          for (const entry of property.getValues()) {
            if (!(entry instanceof ICAL.Time)) throw new Error('Invalid EXDATE.')
            if (entry.isDate) excludedDates.add(entry.toString())
            else excludedTimes.add(sourceFrame(entry, master.startDate).toUnixTime())
          }
        }
        const seen = new Set<string>()
        while (true) {
          const next = iterator.next()
          if (!next) break
          consumeStep()
          const time = sourceFrame(next, master.startDate)
          const key = master.isRecurring() ? identity(time) : ''
          if (seen.has(key)) continue
          seen.add(key)
          const details = master.getOccurrenceDetails(time)
          const { startsAt } = await instants(time, time, options, ensureSourceCoverage)
          // Explicit exceptions are processed independently, including moves from beyond this boundary.
          if (
            !exceptions.has(key) &&
            !excludedDates.has(time.toString().slice(0, 10)) &&
            !excludedTimes.has(time.toUnixTime())
          ) {
            await add(master, key, details.startDate, master.isRecurring(), masters[0]!.pointer)
          }
          if (startsAt > options.through) break
        }
      }
      for (const [key, exception] of exceptions) {
        if (!exception.event || exception.cancelled) continue
        try {
          await add(exception.event, key, exception.event.startDate, true, exception.pointer)
        } catch (error) {
          if (error instanceof CalendarParseError) throw error
          skip(uid, key, error instanceof Error ? error.message : 'Invalid exception.', exception.pointer)
        }
      }
      result.occurrences.push(...local)
    } catch (error) {
      if (error instanceof CalendarParseError) throw error
      skip(uid, null, error instanceof Error ? error.message : 'Invalid calendar event.', entries[0]!.pointer)
    }
  }
  result.occurrences.sort(
    (a, b) =>
      a.startsAt.getTime() - b.startsAt.getTime() ||
      a.uid.localeCompare(b.uid) ||
      a.recurrenceId.localeCompare(b.recurrenceId)
  )
  // RDATE canonicalization can remove a zone's last event reference. Reconcile the already
  // validated whitelist before persisting, so our own document remains valid for strict reloads.
  result.document = { version: 1, jcal: normalized(jcal, false) }
  checkBytes(JSON.stringify(result.document))
  return result
}
