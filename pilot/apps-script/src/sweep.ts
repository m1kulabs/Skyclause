// The 5-minute sweeper (#62): crossing notifications (CAL-10), ledger sealing (LED-1), the delay line
// (CAL-12), the drafted-notice post-check (CAL-3) and the 06:40 weekday heads-up. Pure except for the ports,
// so tests use fakes; gas.ts holds the Apps Script adapters.
import { toMytIso } from '../../shared/time.ts'
import { columnsOf, type Cell, type Row } from './schema.ts'

// A file from `crossings/sky/`, `crossings/crowd/` or `crossings-replay/sky/`, as read from Drive.
export interface RawFile {
  id: string
  name: string
  text: string
}

export interface CrossingInput {
  name: string
  value: number | string
  unit?: string
  source_id?: string
  observed_at?: string
  age_min?: number | string
  state?: string
}

export interface CrossingChange {
  scope: string
  window?: { kind?: string; date?: string; start_myt?: string; end_myt?: string }
  from?: string
  to?: string
  fired?: string[]
  blocked?: string[]
  inputs?: CrossingInput[]
}

// The #47 "Crossing file" shape: the clause engine's verdict per change, which the CAL-10 body quotes.
export interface CrossingFile {
  id: string
  name: string
  crossing_id: string
  t_eval: string
  snapshot_id: string
  pack: string
  replay: boolean
  clause_version?: number | string | null
  replay_clause_content_json?: string
  changes: CrossingChange[]
}

export interface SentMessage {
  subject: string
  date: string
  threadId?: string
}

export interface SweepPorts {
  now: () => Date
  sha256Hex: (text: string) => string
  skyFiles: () => RawFile[]
  crowdFiles: () => RawFile[]
  replayFiles: () => RawFile[]
  rota: () => Row<'rota'>[]
  notifications: () => Row<'notifications'>[]
  ledger: () => Row<'ledger'>[]
  indicators: () => Row<'indicators'>[]
  clauseVersions: () => Row<'clause_versions'>[]
  windows: () => Row<'windows'>[]
  shadow: () => Row<'shadow'>[]
  sent: () => SentMessage[]
  calendarDescription: (url: string) => string | null
  teamAlertEmails: () => string[]
  sendMail: (to: string[], subject: string, body: string) => string
  appendNotification: (row: Row<'notifications'>) => void
  fillLedger: (rowIndex: number, cells: { sent_at: string; recorded_at: string; hash: string }) => void
  appendCalendarDescription: (url: string, line: string) => void
}

export interface SweepResult {
  now: string
  crossingsNotified: string[]
  crossingsSkipped: string[]
  sealed: number[]
  waiting: number[]
  delayLinesAppended: string[]
  unresolvedCalendar: string[]
  mismatches: { callId: string; number: number; line: string }[]
  morningSent: boolean
}

// Ledger rows that wait for an owner's Sent message before they seal, and how long they wait.
const MESSAGE_KINDS = ['call_approved', 'call_edited', 'notice_sent']
const SEAL_WAIT_MS = 30 * 60 * 1000

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function cellText(cell: Cell | undefined): string {
  if (cell === undefined || cell === '') return ''
  if (cell instanceof Date) return Number.isNaN(cell.getTime()) ? '' : toMytIso(cell)
  return String(cell)
}

function stringList(value: unknown): string[] {
  if (!Array.isArray(value)) return []
  const out: string[] = []
  for (const entry of value) {
    if (typeof entry === 'string' && entry) out.push(entry)
    else if (isRecord(entry)) {
      const named = entry.clause ?? entry.key ?? entry.name
      if (typeof named === 'string' && named) out.push(named)
    }
  }
  return out
}

function crossingInput(value: unknown): CrossingInput | null {
  if (!isRecord(value) || typeof value.name !== 'string' || !value.name) return null
  if (typeof value.value !== 'number' && typeof value.value !== 'string') return null
  const input: CrossingInput = { name: value.name, value: value.value }
  if (typeof value.unit === 'string') input.unit = value.unit
  if (typeof value.source_id === 'string') input.source_id = value.source_id
  if (typeof value.observed_at === 'string') input.observed_at = value.observed_at
  if (typeof value.age_min === 'number' || typeof value.age_min === 'string') input.age_min = value.age_min
  if (typeof value.state === 'string') input.state = value.state
  return input
}

// Null when the file is not a Sky crossing at all (wrong pack, bad JSON, no ID): the sweep skips it.
export function parseCrossingFile(raw: RawFile): CrossingFile | null {
  let json: unknown
  try {
    json = JSON.parse(raw.text)
  } catch {
    return null
  }
  if (!isRecord(json) || json.pack !== 'sky') return null
  if (typeof json.crossing_id !== 'string' || !json.crossing_id) return null
  if (typeof json.t_eval !== 'string' || Number.isNaN(Date.parse(json.t_eval))) return null
  const changes: CrossingChange[] = []
  if (Array.isArray(json.changes)) {
    for (const entry of json.changes) {
      if (!isRecord(entry) || typeof entry.scope !== 'string' || !entry.scope) continue
      const change: CrossingChange = { scope: entry.scope }
      if (isRecord(entry.window)) {
        change.window = {}
        if (typeof entry.window.kind === 'string') change.window.kind = entry.window.kind
        if (typeof entry.window.date === 'string') change.window.date = entry.window.date
        if (typeof entry.window.start_myt === 'string') change.window.start_myt = entry.window.start_myt
        if (typeof entry.window.end_myt === 'string') change.window.end_myt = entry.window.end_myt
      }
      if (typeof entry.from === 'string') change.from = entry.from
      if (typeof entry.to === 'string') change.to = entry.to
      const fired = stringList(entry.fired)
      if (fired.length > 0) change.fired = fired
      const blocked = stringList(entry.blocked)
      if (blocked.length > 0) change.blocked = blocked
      if (Array.isArray(entry.inputs)) {
        const inputs = entry.inputs.map(crossingInput).filter((input): input is CrossingInput => input !== null)
        if (inputs.length > 0) change.inputs = inputs
      }
      changes.push(change)
    }
  }
  return {
    id: raw.id,
    name: raw.name,
    crossing_id: json.crossing_id,
    t_eval: json.t_eval,
    snapshot_id: typeof json.snapshot_id === 'string' && json.snapshot_id ? json.snapshot_id : json.t_eval,
    pack: 'sky',
    replay: json.replay === true,
    ...(Object.prototype.hasOwnProperty.call(json, 'clause_version')
      ? {
          clause_version:
            json.clause_version === null ||
            typeof json.clause_version === 'number' ||
            typeof json.clause_version === 'string'
              ? json.clause_version
              : ''
        }
      : {}),
    ...(typeof json.replay_clause_content_json === 'string'
      ? { replay_clause_content_json: json.replay_clause_content_json }
      : {}),
    changes
  }
}

// The rota row whose date, start and end cover the moment, or null with nobody on duty.
export function approverForMoment(rota: Row<'rota'>[], moment: string): Row<'rota'> | null {
  const ms = Date.parse(moment)
  if (Number.isNaN(ms)) return null
  const myt = toMytIso(new Date(ms))
  const date = myt.slice(0, 10)
  const hm = myt.slice(11, 16)
  return (
    rota.find((row) => {
      const start = cellText(row.start)
      const end = cellText(row.end)
      return cellText(row.date) === date && start !== '' && end !== '' && start <= hm && hm <= end
    }) ?? null
  )
}

function mytTime(moment: string): string {
  const ms = Date.parse(moment)
  return Number.isNaN(ms) ? '' : toMytIso(new Date(ms)).slice(11, 16)
}

export function crossingSubject(file: CrossingFile): string {
  return `Needs review: ${file.crossing_id} at ${mytTime(file.t_eval)} (Skyclause pilot)`
}

function describeInput(input: CrossingInput): string {
  const parts = [`${input.name} ${input.value}${input.unit ? ` ${input.unit}` : ''}`]
  if (typeof input.source_id === 'string' && input.source_id) parts.push(`from ${input.source_id}`)
  if (input.age_min !== undefined && input.age_min !== '') parts.push(`${input.age_min} min old`)
  if (typeof input.state === 'string' && input.state) parts.push(input.state)
  return parts.join(', ')
}

// CAL-10: the crossing ID and time, then per change its scope, from, to and fired and blocked clauses with
// values and ages. No titles and no addresses: windows column J and the subscribers tab are never read.
export function crossingBody(file: CrossingFile): string {
  const lines = [`Crossing ${file.crossing_id} at ${file.t_eval} needs review.`]
  for (const change of file.changes) {
    const fired = change.fired && change.fired.length > 0 ? change.fired.join(', ') : 'none'
    const blocked = change.blocked && change.blocked.length > 0 ? change.blocked.join(', ') : 'none'
    const inputs = change.inputs && change.inputs.length > 0 ? change.inputs.map(describeInput).join(' · ') : 'none'
    lines.push(
      `- ${change.scope}: ${change.from ?? '?'} → ${change.to ?? '?'}. Fired: ${fired}. Blocked: ${blocked}. Inputs: ${inputs}.`
    )
  }
  lines.push('Needs Review is expected in the Runs tab in about 5–10 minutes. Approve only there.')
  return lines.join('\n')
}

function parseMs(value: string | undefined): number | null {
  if (!value) return null
  const ms = Date.parse(value)
  return Number.isNaN(ms) ? null : ms
}

function formatMoment(value: string | undefined): string {
  const ms = parseMs(value)
  return ms === null ? '—' : toMytIso(new Date(ms)).slice(11, 16)
}

// CAL-12: "Crossing 15:05 · drafted 15:12 (+7 min) · approved 15:18 (+6 min) · sent 15:19 (+1 min)". Schedule
// and request runs read "Trigger" with the snapshot time; a blank time prints "—" with no minutes beside it.
// approved_at reads as recorded_at, stamped at sealing, because workflows never write it.
export function formatDelayLine(times: {
  trigger: string
  crossingAt?: string
  snapshotId?: string
  draftedAt?: string
  approvedAt?: string
  sentAt?: string
}): string {
  const first = times.trigger === 'crossing' ? 'Crossing' : 'Trigger'
  const moments = [
    times.crossingAt || (times.trigger === 'crossing' ? '' : (times.snapshotId ?? '')),
    times.draftedAt ?? '',
    times.approvedAt ?? '',
    times.sentAt ?? ''
  ].map((value) => ({ text: value ?? '', ms: parseMs(value ?? '') }))
  const labels = [first, 'drafted', 'approved', 'sent']
  const parts: string[] = []
  let previous: number | null = null
  for (let i = 0; i < moments.length; i++) {
    const moment = moments[i]
    if (!moment || moment.ms === null) {
      parts.push(`${labels[i]} —`)
      continue
    }
    const shown = formatMoment(moment.text)
    if (i > 0 && previous !== null)
      parts.push(`${labels[i]} ${shown} (+${Math.round((moment.ms - previous) / 60000)} min)`)
    else parts.push(`${labels[i]} ${shown}`)
    previous = moment.ms
  }
  return parts.join(' · ')
}

// A row is sealed once hash is set; the sweep never touches a sealed row.
function isSealed(row: Row<'ledger'>): boolean {
  return cellText(row.hash) !== ''
}

// The canonical JSON of the row's columns other than hash, in schema order. Hash chains over the sealed
// values, so sent_at and recorded_at are filled before this runs; the owner can still edit cells in Sheets,
// and the chain then detects the edit rather than preventing it.
export function canonicalLedgerRow(row: Row<'ledger'>): string {
  const values = columnsOf('ledger')
    .filter((column) => column !== 'hash')
    .map((column) => {
      const cell = row[column]
      if (cell === undefined || cell === '') return ''
      if (cell instanceof Date) return Number.isNaN(cell.getTime()) ? '' : toMytIso(cell)
      return cell
    })
  return JSON.stringify(values)
}

// Recomputes the chain and names the first bad row: its sheet row number and entry ID. Unsealed rows carry
// no hash yet and are skipped; the next sealed row chains from the last sealed hash before it.
export function verifyLedgerChain(
  rows: Row<'ledger'>[],
  sha256Hex: (text: string) => string
): { ok: true } | { ok: false; row: number; entry_id: string } {
  let previous = ''
  for (let i = 0; i < rows.length; i++) {
    const row = rows[i]
    if (!row) continue
    const stored = cellText(row.hash)
    if (stored === '') continue
    if (sha256Hex(previous + canonicalLedgerRow(row)) !== stored) {
      return { ok: false, row: i + 2, entry_id: cellText(row.entry_id) }
    }
    previous = stored
  }
  return { ok: true }
}

// The earliest Sent message with exactly this subject, sent after notBefore (null lifts the bound).
function findSentAt(sent: SentMessage[], subject: string, notBefore: number | null): string | null {
  let best: { ms: number; date: string } | null = null
  for (const message of sent) {
    if (message.subject !== subject) continue
    const ms = Date.parse(message.date)
    if (Number.isNaN(ms)) continue
    if (notBefore !== null && ms < notBefore) continue
    if (!best || ms < best.ms) best = { ms, date: message.date }
  }
  return best?.date ?? null
}

// The ledger `body` column holds the call as JSON with its notice as sent (subject and body); a message row
// holds just {"language", "subject", "body"}. Null when the row carries no notice (a Normal or rejected call).
export function noticeText(body: Cell | undefined): { subject: string; body: string } | null {
  if (typeof body !== 'string' || !body) return null
  let parsed: unknown
  try {
    parsed = JSON.parse(body)
  } catch {
    return null
  }
  if (!isRecord(parsed)) return null
  const firstNotice = Array.isArray(parsed.notices) ? parsed.notices[0] : null
  const candidates: unknown[] = [parsed.notice, firstNotice ?? null, parsed]
  for (const candidate of candidates) {
    if (isRecord(candidate) && typeof candidate.subject === 'string' && typeof candidate.body === 'string') {
      return { subject: candidate.subject, body: candidate.body }
    }
  }
  return null
}

// Numbers embedded in words (station IDs like 0232901RF, call IDs) are not notice numbers.
export function extractNumbers(text: string): number[] {
  const matches = text.match(/(?<![A-Za-z0-9])\d+(?:\.\d+)?(?![A-Za-z0-9])/g) ?? []
  return matches.map(Number).filter((n) => Number.isFinite(n))
}

// Fixed template lines carry numbers nobody's input explains, so the post-check leaves them out: the footer,
// the Hybrid line and the "Approved by …" line. The replay file's clauses-off note is not fixed and stays in.
function isFixedLine(line: string): boolean {
  const trimmed = line.trim()
  return (
    trimmed.startsWith('Approved by ') ||
    trimmed.includes('never excuses attendance') ||
    trimmed.includes('not a safety or emergency service') ||
    trimmed.startsWith('Not affiliated with APU') ||
    trimmed.startsWith('Reply "unsubscribe"')
  )
}

function addNumber(set: Set<number>, value: unknown): void {
  const n = typeof value === 'number' ? value : typeof value === 'string' && value.trim() !== '' ? Number(value) : NaN
  if (Number.isFinite(n)) set.add(n)
}

// Allowed-side texts (indicator names, ISO times, window dates) never hold station or call IDs, so digit runs
// count even next to letters: the 60 in `w.rain_max_60m_mm`, the 4 in `w.rain_max_4h_mm` and the 15 after the T
// in an ISO time. Notice-side extraction stays strict so IDs never count as numbers.
function addTextNumbers(set: Set<number>, value: unknown): void {
  if (typeof value !== 'string' || !value) return
  const matches = value.match(/\d+(?:\.\d+)?/g) ?? []
  for (const match of matches) {
    const n = Number(match)
    if (Number.isFinite(n)) set.add(n)
  }
}

function collectThresholds(node: unknown, underThreshold: boolean, out: Set<number>): void {
  if (typeof node === 'string') {
    if (!underThreshold) return
    const text = node.trim()
    if (text.startsWith('{') || text.startsWith('[')) {
      try {
        collectThresholds(JSON.parse(text), true, out)
      } catch {
        // Malformed threshold cells contribute no evidence.
      }
    } else addNumber(out, text)
    return
  }
  if (typeof node === 'number') {
    if (underThreshold && Number.isFinite(node)) out.add(node)
    return
  }
  if (Array.isArray(node)) {
    for (const entry of node) collectThresholds(entry, underThreshold, out)
    return
  }
  if (isRecord(node)) {
    for (const [key, value] of Object.entries(node))
      collectThresholds(value, underThreshold || /threshold/i.test(key), out)
  }
}

// The clause version in force: the latest saved_at at or before the snapshot, else the earliest version.
function versionInForce(versions: Row<'clause_versions'>[], snapshotMs: number | null): Row<'clause_versions'> | null {
  let best: Row<'clause_versions'> | null = null
  let bestMs = -Infinity
  let earliest: Row<'clause_versions'> | null = null
  let earliestMs = Infinity
  for (const version of versions) {
    const ms = parseMs(cellText(version.saved_at))
    if (ms === null) continue
    if (ms < earliestMs) {
      earliestMs = ms
      earliest = version
    }
    if (snapshotMs !== null && ms <= snapshotMs && ms > bestMs) {
      bestMs = ms
      best = version
    }
  }
  return best ?? earliest
}

// CAL-3: every remaining number in the notice subject and body must equal one of the allowed numbers:
// an indicator value or age_min for the row's snapshot_id and scope (the window or site), the indicator's
// observed time, the snapshot time, the window's date, start or end, a threshold in the clause version in
// force, or a number in an indicator name (60, 4). Numbers compare as decimals: 39 equals 39.0.
export function checkNoticeNumbers(
  notice: { subject: string; body: string },
  allowed: Set<number>
): { number: number; line: string } | null {
  const lines = `${notice.subject}\n${notice.body}`.split('\n').filter((line) => !isFixedLine(line))
  for (const line of lines) {
    for (const n of extractNumbers(line)) {
      if (!allowed.has(n)) return { number: n, line: line.trim() }
    }
  }
  return null
}

function positiveVersion(value: unknown): number | null {
  const number =
    typeof value === 'number' ? value : typeof value === 'string' && value.trim() !== '' ? Number(value) : NaN
  return Number.isSafeInteger(number) && number > 0 ? number : null
}

function allowedLiveNumbers(
  row: Row<'ledger'>,
  indicators: Row<'indicators'>[],
  versions: Row<'clause_versions'>[],
  windows: Row<'windows'>[],
  crossing: CrossingFile | undefined
): Set<number> {
  const allowed = new Set<number>()
  const snapshot = cellText(row.snapshot_id)
  const scope = cellText(row['window_id or night_id'])
  for (const indicator of indicators) {
    if (cellText(indicator.snapshot_id) !== snapshot) continue
    const indicatorScope = cellText(indicator.scope)
    if (indicatorScope !== scope && indicatorScope !== 'site') continue
    addNumber(allowed, indicator.value)
    addNumber(allowed, indicator.age_min)
    addTextNumbers(allowed, cellText(indicator.name))
    addTextNumbers(allowed, cellText(indicator.observed_at))
  }
  addTextNumbers(allowed, snapshot)
  const window = windows.find((entry) => cellText(entry.window_id) === scope)
  if (window) {
    addTextNumbers(allowed, cellText(window.date))
    addTextNumbers(allowed, cellText(window.start_myt))
    addTextNumbers(allowed, cellText(window.end_myt))
  }
  const pin = crossing?.clause_version
  const pinnedVersion = positiveVersion(pin)
  const version =
    pin === undefined || pin === null
      ? versionInForce(versions, parseMs(snapshot))
      : pinnedVersion === null
        ? null
        : versions.find((entry) => positiveVersion(entry.version_n) === pinnedVersion)
  if (version) {
    const raw = cellText(version.content_json)
    if (raw) {
      try {
        collectThresholds(JSON.parse(raw), false, allowed)
      } catch {
        // An unparseable version contributes no thresholds; the numbers then fail loudly below.
      }
    }
  }
  return allowed
}

// A replay row (its source_ref names a file in crossings-replay/sky/) is checked against that file's inputs
// for the call's window (plus site-wide changes) instead of the indicators tab.
function allowedReplayNumbers(
  row: Row<'ledger'>,
  file: CrossingFile | null,
  sha256Hex: (text: string) => string
): Set<number> {
  const allowed = new Set<number>()
  if (!file || file.snapshot_id !== cellText(row.snapshot_id)) return allowed
  const scope = cellText(row['window_id or night_id'])
  const matching = file.changes.filter((change) => change.scope === scope || change.scope === 'site')
  if (matching.length === 0) return allowed
  for (const change of matching) {
    for (const input of change.inputs ?? []) {
      addNumber(allowed, input.value)
      addNumber(allowed, input.age_min)
      addTextNumbers(allowed, input.name)
      addTextNumbers(allowed, input.observed_at)
    }
    if (change.window) {
      addTextNumbers(allowed, change.window.date)
      addTextNumbers(allowed, change.window.start_myt)
      addTextNumbers(allowed, change.window.end_myt)
    }
  }
  addTextNumbers(allowed, file.snapshot_id)
  const content = file.replay_clause_content_json
  const hash =
    typeof file.clause_version === 'string' ? /^replay:([a-f0-9]{64})$/.exec(file.clause_version)?.[1] : undefined
  if (content !== undefined && hash !== undefined && sha256Hex(content) === hash) {
    try {
      collectThresholds(JSON.parse(content), false, allowed)
    } catch {
      // Invalid embedded content contributes no thresholds; trace evidence remains usable.
    }
  }
  return allowed
}

// "06:40 on a weekday" in MYT, returning the date. Apps Script time triggers drift by minutes, so the first sweep
// from 06:40 to before 07:00 owns it; the `needs_review_expected` log keeps it to one email.
export function weekdayMorningDate(now: Date): string | null {
  const myt = toMytIso(now)
  const time = myt.slice(11, 16)
  if (time < '06:40' || time >= '07:00') return null
  const [year, month, day] = myt.slice(0, 10).split('-').map(Number)
  if (!year || !month || !day) return null
  const weekday = new Date(Date.UTC(year, month - 1, day)).getUTCDay()
  return weekday >= 1 && weekday <= 5 ? myt.slice(0, 10) : null
}

export function runSweep(ports: SweepPorts): SweepResult {
  const nowDate = ports.now()
  const nowIso = toMytIso(nowDate)
  const nowMs = nowDate.getTime()
  const result: SweepResult = {
    now: nowIso,
    crossingsNotified: [],
    crossingsSkipped: [],
    sealed: [],
    waiting: [],
    delayLinesAppended: [],
    unresolvedCalendar: [],
    mismatches: [],
    morningSent: false
  }

  const teamEmails = ports.teamAlertEmails()
  const logged = ports.notifications()
  const rota = ports.rota()
  const hasLog = (kind: string, ref: string) =>
    logged.some((row) => cellText(row.kind) === kind && cellText(row.ref) === ref)

  // CAL-10: one email per new live crossing file, to the approver on duty, else to the team.
  const skyFiles = ports.skyFiles().map((raw) => ({ raw, file: parseCrossingFile(raw) }))
  const liveById = new Map<string, CrossingFile>()
  for (const { file } of skyFiles) {
    if (file && !file.replay) liveById.set(file.crossing_id, file)
  }
  const rawFiles = [...skyFiles, ...ports.crowdFiles().map((raw) => ({ raw, file: parseCrossingFile(raw) }))]
  for (const { raw, file } of rawFiles) {
    if (!file) {
      result.crossingsSkipped.push(raw.name)
      continue
    }
    if (
      file.replay ||
      file.changes.length === 0 ||
      file.changes.every((change) => (change.to ?? 'normal') === 'normal')
    ) {
      result.crossingsSkipped.push(file.name)
      continue
    }
    if (hasLog('crossing', file.crossing_id)) {
      result.crossingsSkipped.push(file.name)
      continue
    }
    const duty = approverForMoment(rota, file.t_eval)
    const to = duty ? [cellText(duty.email)].filter((address) => address !== '') : teamEmails
    if (to.length === 0) {
      result.crossingsSkipped.push(file.name)
      continue
    }
    const id = ports.sendMail(to, crossingSubject(file), crossingBody(file))
    ports.appendNotification({
      at: nowIso,
      kind: 'crossing',
      to: to.join(', '),
      ref: file.crossing_id,
      gmail_message_id: id
    })
    logged.push({ at: nowIso, kind: 'crossing', to: to.join(', '), ref: file.crossing_id, gmail_message_id: id })
    result.crossingsNotified.push(file.crossing_id)
  }

  // The 06:40 weekday heads-up: a non-Normal shadow verdict for a window dated today emails the approver
  // on duty (kind needs_review_expected, the date as ref).
  const morning = weekdayMorningDate(nowDate)
  if (morning && !hasLog('needs_review_expected', morning)) {
    const windows = ports.windows()
    const shadow = ports.shadow()
    const flagged = shadow.filter((row) => {
      if (cellText(row.verdict) === 'normal' || cellText(row.verdict) === '') return false
      return windows.some(
        (entry) => cellText(entry.window_id) === cellText(row.scope) && cellText(entry.date) === morning
      )
    })
    if (flagged.length > 0) {
      const duty = approverForMoment(rota, `${morning}T06:40:00+08:00`)
      const to = duty ? [cellText(duty.email)].filter((address) => address !== '') : teamEmails
      if (to.length > 0) {
        const lines = flagged.map((row) => {
          const scope = cellText(row.scope)
          const window = windows.find((entry) => cellText(entry.window_id) === scope)
          const when = window
            ? `${cellText(window.kind)} ${cellText(window.date)} ${cellText(window.start_myt)}–${cellText(window.end_myt)}`
            : cellText(scope)
          return `- ${scope}: shadow ${cellText(row.verdict)} (${when})`
        })
        const id = ports.sendMail(
          to,
          `Expected needs review: ${morning} (Skyclause pilot)`,
          `The shadow check is non-Normal for ${flagged.length} window(s) dated ${morning}. The 06:45 run may need review.\n${lines.join('\n')}`
        )
        ports.appendNotification({
          at: nowIso,
          kind: 'needs_review_expected',
          to: to.join(', '),
          ref: morning,
          gmail_message_id: id
        })
        logged.push({
          at: nowIso,
          kind: 'needs_review_expected',
          to: to.join(', '),
          ref: morning,
          gmail_message_id: id
        })
        result.morningSent = true
      }
    }
  }

  // LED-1, CAL-12 and CAL-3: seal each new ledger row in sheet order, then its line and its check.
  const rows = ports.ledger()
  const indicators = ports.indicators()
  const versions = ports.clauseVersions()
  const ledgerWindows = ports.windows()
  const replayByName = new Map<string, CrossingFile | null>()
  for (const raw of ports.replayFiles()) {
    replayByName.set(raw.name, parseCrossingFile(raw))
  }
  const sent = ports.sent()

  let previous = ''
  for (let i = 0; i < rows.length; i++) {
    const row = rows[i]
    if (!row) continue
    const stored = cellText(row.hash)
    if (stored !== '') {
      previous = stored
      continue
    }
    const kind = cellText(row.kind)
    const snapshot = cellText(row.snapshot_id)
    const snapshotMs = parseMs(snapshot)
    let sentAt = ''

    if (MESSAGE_KINDS.includes(kind) || kind === 'evidence_reply') {
      if (snapshotMs === null) {
        // No time anchor to wait from: the row sends nothing verifiable, so it seals at once.
      } else if (kind === 'evidence_reply') {
        const sourceRef = cellText(row.source_ref)
        const reply = sent
          .filter(
            (message) =>
              message.threadId === sourceRef &&
              !Number.isNaN(Date.parse(message.date)) &&
              Date.parse(message.date) >= snapshotMs
          )
          .sort((a, b) => Date.parse(a.date) - Date.parse(b.date))[0]
        if (reply) sentAt = reply.date
        else if (nowMs - snapshotMs <= SEAL_WAIT_MS) {
          result.waiting.push(i + 2)
          continue
        }
      } else {
        const notice = noticeText(row.body)
        const found = notice ? findSentAt(sent, notice.subject, snapshotMs) : null
        if (found) sentAt = found
        else if (nowMs - snapshotMs <= SEAL_WAIT_MS) {
          result.waiting.push(i + 2)
          continue
        }
      }
    }

    const recordedAt = nowIso
    const sealed: Row<'ledger'> = { ...row, sent_at: sentAt, recorded_at: recordedAt }
    const hash = ports.sha256Hex(previous + canonicalLedgerRow(sealed))
    ports.fillLedger(i, { sent_at: sentAt, recorded_at: recordedAt, hash })
    row.hash = hash
    row.sent_at = sentAt
    row.recorded_at = recordedAt
    previous = hash
    result.sealed.push(i + 2)

    // CAL-12: the line is appended once to the call's calendar entry, which stands in for the call page.
    const callId = cellText(row.call_id)
    const url = cellText(row.calendar_event_url)
    if ((kind === 'call_approved' || kind === 'call_edited') && url !== '') {
      const line = formatDelayLine({
        trigger: cellText(row.trigger),
        crossingAt: cellText(row.crossing_at),
        snapshotId: snapshot,
        draftedAt: cellText(row.drafted_at),
        approvedAt: recordedAt,
        sentAt
      })
      const description = ports.calendarDescription(url)
      if (description === null) {
        if (!result.unresolvedCalendar.includes(url)) result.unresolvedCalendar.push(url)
      } else if (!description.includes(line)) {
        ports.appendCalendarDescription(url, line)
        result.delayLinesAppended.push(url)
      }
    }

    // CAL-3: every number in the call's notice, checked once per call (the log stops repeats).
    if ((kind === 'call_approved' || kind === 'call_edited') && callId !== '' && !hasLog('cal3_mismatch', callId)) {
      const notice = noticeText(row.body)
      if (notice) {
        const sourceRef = cellText(row.source_ref)
        const allowed = replayByName.has(sourceRef)
          ? allowedReplayNumbers(row, replayByName.get(sourceRef) ?? null, ports.sha256Hex)
          : allowedLiveNumbers(row, indicators, versions, ledgerWindows, liveById.get(sourceRef))
        if (allowed) {
          const bad = checkNoticeNumbers(notice, allowed)
          if (bad) {
            const id = ports.sendMail(
              teamEmails,
              `CAL-3 mismatch: ${callId} (Skyclause pilot)`,
              `Call ${callId} has a number with no source in its snapshot.\nNumber: ${bad.number}\nLine: ${bad.line}\nSnapshot: ${snapshot}`
            )
            ports.appendNotification({
              at: nowIso,
              kind: 'cal3_mismatch',
              to: teamEmails.join(', '),
              ref: callId,
              gmail_message_id: id
            })
            logged.push({
              at: nowIso,
              kind: 'cal3_mismatch',
              to: teamEmails.join(', '),
              ref: callId,
              gmail_message_id: id
            })
            result.mismatches.push({ callId, number: bad.number, line: bad.line })
          }
        }
      }
    }
  }

  return result
}
