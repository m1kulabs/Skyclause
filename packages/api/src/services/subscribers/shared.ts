import { HTTP_PROBLEM_STATUS } from '@skyclause/contracts'
import { consentWriteProblem, PRIVACY_NOTICE_VERSION, type Subscriber } from '@skyclause/contracts'
import { pickableWindowIds, project, subscriber, type Tx } from '@skyclause/db'
import { eq } from 'drizzle-orm'
import { ApiError } from '../../problems'
import { instant } from '../../serialize'

/** The fields a subscriber or an Admin may set (NTC-14). */
export interface SubscriberFields {
  email: string
  role: string
  window_ids: string[]
  channels: Subscriber['channels']
  language: Subscriber['language']
}

/** Every bad link token answers alike: expired, used, of another purpose or unknown. */
export const linkExpired = () => new ApiError(410, 'link-expired', 'This link has expired or was already used.')

/** #79 §2 (`legal.ts`): every consent write waits for the published PDPA notice. */
export function publishedNoticeVersion(): string {
  const problem = consentWriteProblem()
  if (problem) {
    throw new ApiError(problem.status, problem.slug, 'Subscriptions open once the privacy notice is published.')
  }
  return PRIVACY_NOTICE_VERSION!
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
/** IDs in paths and bodies are strings on the wire; one that isn't a UUID names no row. */
export const isUuid = (value: string) => UUID.test(value)

/** The project in this organisation, or 404 (another organisation's project included). */
export async function projectOr404(tx: Tx, projectId: string) {
  const [row] = isUuid(projectId) ? await tx.select().from(project).where(eq(project.id, projectId)) : []
  if (!row) throw new ApiError(HTTP_PROBLEM_STATUS['not-found'], 'not-found', 'No such project.')
  return row
}

/** 422 unless every window is one the subscriber may hold (`pickableWindowIds`). */
export async function checkWindows(tx: Tx, projectId: string, windowIds: string[]) {
  const wanted = [...new Set(windowIds)]
  const known = await pickableWindowIds(tx, projectId, wanted.filter(isUuid))
  const unknown = wanted.find((id) => !known.has(id))
  if (unknown !== undefined) throw unknownWindow(windowIds, unknown)
  return wanted
}

const unknownWindow = (windowIds: string[], id: string) =>
  new ApiError(422, 'validation-failed', 'A window is not one of this project’s.', {
    errors: [{ in: 'body', pointer: `/window_ids/${windowIds.indexOf(id)}`, detail: 'Unknown window' }]
  })

type SubscriberRow = typeof subscriber.$inferSelect

/** The §2 `Subscriber` wire shape of a row. */
export function subscriberWire(row: SubscriberRow): Subscriber {
  return {
    id: row.id,
    project_id: row.projectId,
    email: row.email,
    role: row.role ?? '',
    window_ids: row.windowIds,
    channels: row.channels as Subscriber['channels'],
    language: row.language as Subscriber['language'],
    confirmed_at: row.confirmedAt && instant(row.confirmedAt)
  }
}
