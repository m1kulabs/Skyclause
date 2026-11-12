import {
  OrganizationHeaders,
  IdempotentOrganizationHeaders,
  IdParams as ProjectParams,
  IdParams as SourceParams,
  problemResponse,
  Problem
} from '../common'
import { z } from '@hono/zod-openapi'
import { createRoute } from '../create-route'
import { Instant, Page, PageQuery, Poll, Reading, Source, SourceRole, SourceState } from '../shared'

const ProjectSourceParams = ProjectParams.extend({ sourceId: ProjectParams.shape.id })
const PageRequest = z.object({ ...PageQuery.shape })
// PostgreSQL has no year zero and stores microseconds: reject unsupported bounds rather than rounding.
const HistoryInstant = Instant.regex(/^(?!0000)\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,6})?Z$/).openapi({
  format: 'date-time'
})
const HistoryRequest = PageRequest.extend({ from: HistoryInstant.optional(), to: HistoryInstant.optional() })
function orderedHistoryRange({ from, to }: { from?: string; to?: string }) {
  if (from === undefined || to === undefined) return true
  const position = (value: string) => {
    const [seconds, fraction = ''] = value.slice(0, -1).split('.')
    return `${seconds}.${fraction.padEnd(6, '0')}`
  }
  return position(from) < position(to)
}
const historyRangeError = { path: ['to'], message: 'to must be after from' }
const SourceReadingsRequest = HistoryRequest.refine(orderedHistoryRange, historyRangeError)
const SourcePollsRequest = HistoryRequest.extend({ outcome: z.enum(['ok', 'unchanged', 'error']).optional() }).refine(
  orderedHistoryRange,
  historyRangeError
)
const PollHistory = Poll.extend({
  message: z.string().nullable().optional(),
  purpose: z.string().optional(),
  received_at: Instant.nullable().optional()
})
const ProjectSource = Source.extend({
  project_id: z.string(),
  role: SourceRole,
  state: SourceState.nullable(),
  latest_reading: Reading.nullable(),
  age_s: z.number().int().nonnegative().nullable(),
  recent_errors: z.array(Poll),
  // #173 needs the camera's current probation count and agreement beside its source state.
  probation: z
    .object({
      source_id: z.string(),
      probation: z.boolean(),
      labeller_ids: z.array(z.string()),
      n: z.number().int().nonnegative(),
      obscured_frames: z.number().int().nonnegative(),
      agreement: z.number().min(0).max(1).nullable()
    })
    .optional()
})
const ProjectSourceHealth = ProjectSource.extend({
  history: z
    .array(z.object({ start_at: Instant, end_at: Instant, status: z.enum(['received', 'missed', 'error']) }))
    .length(48)
    .describe(
      '48 ascending rolling half-open cadence intervals ending at request time. Only normal polls count by actual started_at; any error wins over success or unchanged. APIMS uses 3600-second slots. Missed means no recorded normal outcome, not proof of a missed scheduler invocation; device readings do not fill poll slots.'
    )
    .optional(),
  last_error: Poll.extend({ message: z.string().nullable(), purpose: z.string() })
    .nullable()
    .describe(
      'Newest retained error of any purpose, ordered by actual started_at then id descending; purpose distinguishes diagnostic backfill errors from normal polls.'
    )
    .optional()
})
export const PackPrerequisitesProblem = Problem.extend({ missing: z.array(SourceRole) })
export const packPrerequisitesResponse = {
  description: 'The enabled Crowd pack requires these source roles.',
  content: { 'application/problem+json': { schema: PackPrerequisitesProblem } }
}

const DeviceCredential = z.object({
  source_id: z.string(),
  token: z.string(),
  scope: z.literal('ingest')
})

const projectErrors = {
  400: problemResponse('The organization header is missing or invalid.'),
  401: problemResponse('Authentication is required.'),
  403: problemResponse('The principal lacks permission for this operation.'),
  404: problemResponse('The project or source is unavailable in this organization.'),
  422: problemResponse('The request is invalid.'),
  429: problemResponse('The request rate limit was exceeded.')
}

export const bindSource = createRoute({
  method: 'post',
  path: '/v1/projects/{id}/sources',
  operationId: 'bindSource',
  tags: ['Sources'],
  request: {
    headers: IdempotentOrganizationHeaders,
    params: ProjectParams,
    body: { content: { 'application/json': { schema: z.object({ source_id: z.string() }) } } }
  },
  responses: {
    201: { description: 'Bound source', content: { 'application/json': { schema: ProjectSource } } },
    ...projectErrors
  },
  x: { owner: 'b-source-binding', statement: 'sources.manage', idempotent: true }
})

export const unbindSource = createRoute({
  method: 'delete',
  path: '/v1/projects/{id}/sources/{sourceId}',
  operationId: 'unbindSource',
  tags: ['Sources'],
  request: { headers: OrganizationHeaders, params: ProjectSourceParams },
  responses: {
    204: { description: 'Source unbound' },
    409: packPrerequisitesResponse,
    ...projectErrors
  },
  x: { owner: 'b-source-binding', statement: 'sources.manage', idempotent: false }
})

export const rotateDeviceToken = createRoute({
  method: 'post',
  path: '/v1/sources/{id}/rotate-token',
  operationId: 'rotateDeviceToken',
  tags: ['Sources'],
  request: { headers: IdempotentOrganizationHeaders, params: SourceParams },
  responses: {
    200: {
      description: 'Replacement device credential',
      content: { 'application/json': { schema: DeviceCredential } }
    },
    ...projectErrors
  },
  x: { owner: 'b-device-ingest', statement: 'sources.manage', idempotent: true }
})

export const listProjectSources = createRoute({
  method: 'get',
  path: '/v1/projects/{id}/sources',
  operationId: 'listProjectSources',
  tags: ['Sources'],
  request: { headers: OrganizationHeaders, params: ProjectParams, query: PageRequest },
  responses: {
    200: {
      description: 'Project source health and recent errors',
      content: { 'application/json': { schema: Page(ProjectSourceHealth) } }
    },
    ...projectErrors
  },
  x: { owner: 'b-signals-api', statement: 'project.view', idempotent: false }
})

export const listSourceReadings = createRoute({
  method: 'get',
  path: '/v1/sources/{id}/readings',
  operationId: 'listSourceReadings',
  tags: ['Readings'],
  request: { headers: OrganizationHeaders, params: SourceParams, query: SourceReadingsRequest },
  responses: {
    200: { description: 'Source readings', content: { 'application/json': { schema: Page(Reading) } } },
    ...projectErrors
  },
  x: { owner: 'b-signals-api', statement: 'project.view', idempotent: false }
})

export const listSourcePolls = createRoute({
  method: 'get',
  path: '/v1/sources/{id}/polls',
  operationId: 'listSourcePolls',
  tags: ['Polls'],
  request: { headers: OrganizationHeaders, params: SourceParams, query: SourcePollsRequest },
  responses: {
    200: { description: 'Source poll history', content: { 'application/json': { schema: Page(PollHistory) } } },
    ...projectErrors
  },
  x: { owner: 'b-signals-api', statement: 'project.view', idempotent: false }
})

export const routes = [
  bindSource,
  unbindSource,
  rotateDeviceToken,
  listProjectSources,
  listSourceReadings,
  listSourcePolls
] as const
