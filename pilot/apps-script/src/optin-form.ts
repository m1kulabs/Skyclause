// WIN-1 opt-in form (#50): a Google Form created by Apps Script code, and the
// submit handler that copies each response into `windows` and `subscribers`.
// Pure except for the ports, so tests use fakes; gas.ts holds the live ports.
import { toMytIso } from '../../shared/time.ts'
import type { Row } from './schema.ts'
import type { DrivePort, PropertyPort } from './setup.ts'

export const OPTIN_FORM_TITLE = 'Skyclause pilot — declare your windows'
export const OPTIN_RESPONSES_TITLE = 'Skyclause responses'
// The extra column after the questions in the response sheet; a reject writes its reason there.
export const REJECT_COLUMN = 'reject_reason'

export const OPTIN_KINDS = [
  { label: 'Class', value: 'class' },
  { label: 'Event', value: 'event' },
  { label: 'Commute wave', value: 'commute_wave' }
] as const

export const OPTIN_ROLES = [
  { label: 'Commuting student', value: 'commuting_student' },
  { label: 'Student club events lead', value: 'club_events_lead' },
  { label: 'Lecturer', value: 'lecturer' },
  { label: 'Hackathon reviewer', value: 'reviewer' },
  { label: 'Other', value: 'other' }
] as const

export const OPTIN_LANGUAGE = { label: 'English', value: 'en' } as const
export const OPTIN_LANGUAGE_HELP = 'Bahasa Melayu notices come later.'
export const OPTIN_EMAIL_HELP = 'No sign-in needed.'
export const OPTIN_CONSENT_CHOICE = 'I consent to the PDPA notice above.'
export const OPTIN_CONSENT_HELP = 'The form cannot submit without consent.'

// The question titles, in form order; the PDPA notice sits between language and consent as a section header.
export const OPTIN_TITLES = {
  title: 'Window title',
  kind: 'Kind',
  date: 'Date',
  start: 'Start (MYT)',
  end: 'End (MYT)',
  email: 'Email',
  role: 'Role',
  language: 'Notice language',
  notice: 'PDPA notice',
  consent: 'Consent'
} as const

// P0 carries the English notice only (PUB-7 is P1); the owner reviews it and fills the inbox before sharing.
export function pdpaNotice(inbox: string): string {
  return (
    'Skyclause pilot collects your email, role, notice language and the windows you declare, ' +
    'only to email you notices for those windows and keep a record of what was sent. ' +
    "It's held in the team's Google Workspace and may be processed outside Malaysia. " +
    'The AI that drafts notices sees only IDs for you and your window, never your email or window title. ' +
    'We keep it until you unsubscribe, plus 30 days. Reply "unsubscribe" to any notice to stop. ' +
    `Questions: ${inbox}. Skyclause is not a safety or emergency service. In an emergency, call 999.`
  )
}

export function optinDescription(): string {
  return (
    'Declare the windows you want Skyclause pilot notices for. ' +
    'A response is copied only when the end is after the start; a commute wave may end when it starts. ' +
    'Anything else is kept with a reason and no rows are written. ' +
    'Consent below is required: this form cannot submit without it.'
  )
}

export type OptinFieldSpec =
  | { item: 'text'; title: string; required: boolean; help?: string; email?: boolean }
  | { item: 'choice'; title: string; required: boolean; choices: readonly string[]; help?: string }
  | { item: 'date'; title: string; required: boolean; help?: string }
  | { item: 'time'; title: string; required: boolean; help?: string }
  | { item: 'section'; title: string; description: string }
  | { item: 'checkbox'; title: string; required: boolean; choices: readonly string[]; help?: string }

// The WIN-1 fields in order, with the kinds, roles and language the ticket decides.
export function optinFieldSpecs(inbox: string): OptinFieldSpec[] {
  return [
    { item: 'text', title: OPTIN_TITLES.title, required: true },
    { item: 'choice', title: OPTIN_TITLES.kind, required: true, choices: OPTIN_KINDS.map((kind) => kind.label) },
    { item: 'date', title: OPTIN_TITLES.date, required: true },
    { item: 'time', title: OPTIN_TITLES.start, required: true },
    { item: 'time', title: OPTIN_TITLES.end, required: true },
    { item: 'text', title: OPTIN_TITLES.email, required: true, help: OPTIN_EMAIL_HELP, email: true },
    { item: 'choice', title: OPTIN_TITLES.role, required: true, choices: OPTIN_ROLES.map((role) => role.label) },
    {
      item: 'choice',
      title: OPTIN_TITLES.language,
      required: true,
      choices: [OPTIN_LANGUAGE.label],
      help: OPTIN_LANGUAGE_HELP
    },
    { item: 'section', title: OPTIN_TITLES.notice, description: pdpaNotice(inbox) },
    {
      item: 'checkbox',
      title: OPTIN_TITLES.consent,
      required: true,
      choices: [OPTIN_CONSENT_CHOICE],
      help: OPTIN_CONSENT_HELP
    }
  ]
}

export function nextId(prefix: 'W-' | 'S-', existing: readonly string[]): string {
  let max = 0
  for (const id of existing) {
    const match = new RegExp(`^${prefix}(\\d+)$`).exec(id)
    if (match?.[1]) max = Math.max(max, parseInt(match[1], 10))
  }
  return `${prefix}${String(max + 1).padStart(4, '0')}`
}

export interface OptinSubmission {
  // The 1-based row of the response in the response sheet.
  rowNumber: number
  // One trimmed answer per question title.
  values: Record<string, string>
  submittedAt: Date
}

export interface OptinStores {
  windowIds(): string[]
  subscriberIds(): string[]
  subscriberByEmail(email: string): Row<'subscribers'> | null
  appendWindow(row: Row<'windows'>): void
  appendSubscriber(row: Row<'subscribers'>): void
  updateSubscriber(email: string, patch: Pick<Row<'subscribers'>, 'role' | 'language' | 'consent_at'>): void
  writeReject(rowNumber: number, reason: string): void
}

export type OptinResult = { ok: true; windowId: string; subscriberId: string } | { ok: false; reason: string }

const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/
const TIME_PATTERN = /^([01]\d|2[0-3]):([0-5]\d)$/
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

function reject(stores: OptinStores, rowNumber: number, reason: string): OptinResult {
  stores.writeReject(rowNumber, reason)
  return { ok: false, reason }
}

// Copies one form response into `windows` and `subscribers`. Personal fields stay out of agent ranges (NFR-11):
// the windows row holds the subscriber ID, never the email. A reject writes the reason into the response row and
// nothing else, and sends no email, because sending needs an approval.
export function runOptinSubmit(submission: OptinSubmission, stores: OptinStores): OptinResult {
  const { rowNumber, values } = submission
  const at = (title: string): string => (values[title] ?? '').trim()

  const title = at(OPTIN_TITLES.title)
  if (!title) return reject(stores, rowNumber, 'rejected: title is missing')

  const kind = OPTIN_KINDS.find((candidate) => candidate.label === at(OPTIN_TITLES.kind))
  if (!kind) return reject(stores, rowNumber, 'rejected: kind is missing or unknown')

  const date = at(OPTIN_TITLES.date)
  if (!DATE_PATTERN.test(date) || Number.isNaN(Date.parse(`${date}T00:00:00+08:00`)))
    return reject(stores, rowNumber, 'rejected: date is missing or not yyyy-MM-dd')

  const start = at(OPTIN_TITLES.start)
  const end = at(OPTIN_TITLES.end)
  const startMatch = TIME_PATTERN.exec(start)
  const endMatch = TIME_PATTERN.exec(end)
  if (!startMatch || !endMatch) return reject(stores, rowNumber, 'rejected: start or end is missing or not HH:mm')
  const startMin = parseInt(startMatch[1] ?? '0', 10) * 60 + parseInt(startMatch[2] ?? '0', 10)
  const endMin = parseInt(endMatch[1] ?? '0', 10) * 60 + parseInt(endMatch[2] ?? '0', 10)
  if (endMin < startMin) return reject(stores, rowNumber, `rejected: end ${end} is before start ${start}`)
  if (endMin === startMin && kind.value !== 'commute_wave')
    return reject(stores, rowNumber, `rejected: end equals start and kind is not commute_wave`)

  const email = at(OPTIN_TITLES.email).toLowerCase()
  if (!EMAIL_PATTERN.test(email)) return reject(stores, rowNumber, 'rejected: email is missing or not an email')

  const role = OPTIN_ROLES.find((candidate) => candidate.label === at(OPTIN_TITLES.role))
  if (!role) return reject(stores, rowNumber, 'rejected: role is missing or unknown')

  if (at(OPTIN_TITLES.language) !== OPTIN_LANGUAGE.label)
    return reject(stores, rowNumber, 'rejected: notice language is missing or unknown')

  if (!at(OPTIN_TITLES.consent)) return reject(stores, rowNumber, 'rejected: consent is missing')

  const submittedAt = toMytIso(submission.submittedAt)
  const existing = stores.subscriberByEmail(email)
  const subscriberId = String(existing?.subscriber_id ?? nextId('S-', stores.subscriberIds()))
  if (existing) stores.updateSubscriber(email, { role: role.value, language: 'en', consent_at: submittedAt })
  else
    stores.appendSubscriber({
      subscriber_id: subscriberId,
      email,
      role: role.value,
      language: 'en',
      consent_at: submittedAt,
      unsubscribed_at: ''
    })

  const windowId = nextId('W-', stores.windowIds())
  stores.appendWindow({
    window_id: windowId,
    subscriber_id: subscriberId,
    kind: kind.value,
    date,
    start_myt: `${date}T${start}:00+08:00`,
    end_myt: `${date}T${end}:00+08:00`,
    language: 'en',
    status: 'active',
    declared_at: submittedAt,
    title
  })
  return { ok: true, windowId, subscriberId }
}

export interface WindowFormPort {
  // The form linked from the response spreadsheet, if one answers there.
  linkedForm(): { id: string; publishedUrl: string } | null
  createForm(title: string, description: string, fields: OptinFieldSpec[]): { id: string; publishedUrl: string }
  // Adds the reject-reason column after the questions when it is missing.
  ensureRejectColumn(): void
}

export interface CreateWindowFormReport {
  formId: string
  publishedUrl: string
  created: boolean
}

// Idempotent: a form already linked from the response spreadsheet is reused, so no new Script Property is needed.
export function runCreateWindowForm(form: WindowFormPort, inbox: string): CreateWindowFormReport {
  const linked = form.linkedForm()
  if (linked) {
    form.ensureRejectColumn()
    return { formId: linked.id, publishedUrl: linked.publishedUrl, created: false }
  }
  const created = form.createForm(OPTIN_FORM_TITLE, optinDescription(), optinFieldSpecs(inbox))
  form.ensureRejectColumn()
  return { formId: created.id, publishedUrl: created.publishedUrl, created: true }
}

// Idempotent: the responses workbook is found by name or created, and its ID stored, like runSetup's workbooks.
export function ensureResponsesSheetId(ports: { properties: PropertyPort; drive: DrivePort }): string {
  const existing = ports.properties.get('RESPONSES_SHEET_ID')
  if (existing) return existing
  const rootId =
    ports.properties.get('ROOT_FOLDER_ID') ??
    ports.drive.findRootFolder('Skyclause pilot') ??
    ports.drive.createRootFolder('Skyclause pilot')
  const found = ports.drive.findSpreadsheet(rootId, OPTIN_RESPONSES_TITLE)
  const sheetId = found ?? ports.drive.createSpreadsheet(rootId, OPTIN_RESPONSES_TITLE, 'Form Responses 1')
  ports.properties.set('RESPONSES_SHEET_ID', sheetId)
  return sheetId
}
