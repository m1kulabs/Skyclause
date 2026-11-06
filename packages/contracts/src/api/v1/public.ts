import { z } from '@hono/zod-openapi'
import { ROLES } from '../../auth'
import { createRoute } from '../create-route'
import {
  AnalysisMetric,
  Grade,
  InputValue,
  Instant,
  LedgerEntry,
  LocalDate,
  Mode,
  Pack,
  Page,
  PageQuery,
  Problem,
  PublicProjectState,
  Verdicts
} from '../shared'

const problemResponse = (description: string) => ({
  description,
  content: { 'application/problem+json': { schema: Problem } }
})

const orgProjectParams = z.object({ org: z.string().min(1), project: z.string().min(1) })

const publicCallSchema = z.object({
  id: z.string(),
  pack: Pack,
  state: z.enum(['approved', 'sent']),
  mode: Mode.nullable(),
  watch: z.boolean(),
  window: z.object({ starts_at: Instant, ends_at: Instant }).nullable(),
  fired: z.array(z.object({ clause: z.string(), inputs: z.array(InputValue) })),
  approver_role: z.enum(ROLES),
  approval_delay_s: z.number().int().nonnegative(),
  clause_version_n: z.number().int().nonnegative(),
  approved_at: Instant,
  sent_at: Instant.nullable(),
  grade: Grade.nullable()
})

const publicCalendarEntrySchema = z.object({
  id: z.string(),
  call_id: z.string(),
  pack: Pack,
  kind: z.enum(['class', 'event', 'commute_wave']),
  starts_at: Instant,
  ends_at: Instant,
  mode: Mode.nullable(),
  watch: z.boolean(),
  permalink: z.string()
})

const publicLedgerEntrySchema = LedgerEntry.pick({
  id: true,
  project_id: true,
  seq: true,
  kind: true,
  refs: true,
  prev_hash: true,
  hash: true,
  at: true,
  corrects: true
}).extend({ derived_values: z.array(InputValue) })

const publicGradeMetricSchema = AnalysisMetric.extend({ pack: Pack })

const publicProjectStatusSchema = PublicProjectState.extend({
  verdicts: z.array(Verdicts),
  strip: z.array(InputValue)
})

const publicServiceStatusSchema = z.object({
  components: z.array(
    z.object({
      scope: z.enum(['ours', 'source']),
      component: z.string(),
      source_id: z.string().nullable(),
      ok: z.boolean(),
      checked_at: Instant
    })
  ),
  incidents: z.array(
    z.object({
      id: z.string(),
      scope: z.enum(['ours', 'source']),
      component: z.string(),
      source_id: z.string().nullable(),
      status: z.string(),
      body: z.string(),
      created_at: Instant,
      resolved_at: Instant.nullable()
    })
  )
})

const localTime = z.string().regex(/^(?:[01]\d|2[0-3]):[0-5]\d$/)
const publicEvaluationRequestSchema = z.object({ date: LocalDate, start_time: localTime, end_time: localTime })
const publicEvaluationResponseSchema = z.object({
  label: z.literal('Clause engine verdict: not reviewed, not sent'),
  evaluated_at: Instant,
  verdicts: z.array(Verdicts),
  strip: z.array(InputValue)
})

const publicStateEventSchema = z.object({
  event: z.literal('state'),
  data: z.object({ state_version: z.string() })
})

export const getPublicProjectStatus = createRoute({
  method: 'get',
  path: '/v1/public/{org}/{project}/status',
  operationId: 'getPublicProjectStatus',
  tags: ['Public project'],
  request: { params: orgProjectParams },
  responses: {
    200: {
      description: 'Published project state, verdicts and derived inputs.',
      content: { 'application/json': { schema: publicProjectStatusSchema } }
    },
    404: problemResponse('The public project was not found.'),
    429: problemResponse('The public request rate limit was exceeded.')
  },
  x: { owner: 'd-public-api', statement: 'public', idempotent: false }
})

export const listPublicProjectCalls = createRoute({
  method: 'get',
  path: '/v1/public/{org}/{project}/calls',
  operationId: 'listPublicProjectCalls',
  tags: ['Public calls'],
  request: { params: orgProjectParams, query: PageQuery },
  responses: {
    200: {
      description: 'Approved and sent calls published by the project.',
      content: { 'application/json': { schema: Page(publicCallSchema) } }
    },
    404: problemResponse('The public project was not found.'),
    429: problemResponse('The public request rate limit was exceeded.')
  },
  x: { owner: 'd-public-api', statement: 'public', idempotent: false }
})

export const listPublicLedgerEntries = createRoute({
  method: 'get',
  path: '/v1/public/{org}/{project}/ledger',
  operationId: 'listPublicLedgerEntries',
  tags: ['Public ledger'],
  request: { params: orgProjectParams, query: PageQuery },
  responses: {
    200: {
      description: 'Public ledger entries with derived values and no raw source readings.',
      content: { 'application/json': { schema: Page(publicLedgerEntrySchema) } }
    },
    404: problemResponse('The public project was not found.'),
    429: problemResponse('The public request rate limit was exceeded.')
  },
  x: { owner: 'd-public-api', statement: 'public', idempotent: false }
})

export const listPublicGrades = createRoute({
  method: 'get',
  path: '/v1/public/{org}/{project}/grades',
  operationId: 'listPublicGrades',
  tags: ['Public grades'],
  request: { params: orgProjectParams, query: PageQuery },
  responses: {
    200: {
      description: 'Published grade metrics with sample counts and Wilson intervals.',
      content: { 'application/json': { schema: Page(publicGradeMetricSchema) } }
    },
    404: problemResponse('The public project was not found.'),
    429: problemResponse('The public request rate limit was exceeded.')
  },
  x: { owner: 'd-public-api', statement: 'public', idempotent: false }
})

export const listPublicCalendarEntries = createRoute({
  method: 'get',
  path: '/v1/public/{org}/{project}/calendar-entries',
  operationId: 'listPublicCalendarEntries',
  tags: ['Public calendar'],
  request: { params: orgProjectParams, query: PageQuery },
  responses: {
    200: {
      description: 'Upcoming published conditions calendar entries.',
      content: { 'application/json': { schema: Page(publicCalendarEntrySchema) } }
    },
    404: problemResponse('The public project was not found.'),
    429: problemResponse('The public request rate limit was exceeded.')
  },
  x: { owner: 'd-public-api', statement: 'public', idempotent: false }
})

export const getPublicCall = createRoute({
  method: 'get',
  path: '/v1/public/calls/{callId}',
  operationId: 'getPublicCall',
  tags: ['Public calls'],
  request: { params: z.object({ callId: z.string().min(1) }) },
  responses: {
    200: {
      description: 'A public call without recipient or approver identity data.',
      content: { 'application/json': { schema: publicCallSchema } }
    },
    404: problemResponse('The public call was not found.'),
    429: problemResponse('The public request rate limit was exceeded.')
  },
  x: { owner: 'd-public-api', statement: 'public', idempotent: false }
})

export const getPublicWindow = createRoute({
  method: 'get',
  path: '/v1/public/windows/{id}',
  operationId: 'getPublicWindow',
  tags: ['Public calendar'],
  request: { params: z.object({ id: z.string().min(1) }) },
  responses: {
    200: {
      description: 'A published conditions calendar entry without a window title.',
      content: { 'application/json': { schema: publicCalendarEntrySchema } }
    },
    404: problemResponse('The public window was not found.'),
    429: problemResponse('The public request rate limit was exceeded.')
  },
  x: { owner: 'd-public-api', statement: 'public', idempotent: false }
})

export const getPublicServiceStatus = createRoute({
  method: 'get',
  path: '/v1/public/status',
  operationId: 'getPublicServiceStatus',
  tags: ['Public status'],
  responses: {
    200: {
      description: 'Service components, source status and incident history.',
      content: { 'application/json': { schema: publicServiceStatusSchema } }
    },
    429: problemResponse('The public request rate limit was exceeded.')
  },
  x: { owner: 'd-public-api', statement: 'public', idempotent: false }
})

export const streamPublicProjectState = createRoute({
  method: 'get',
  path: '/v1/public/{org}/{project}/stream',
  operationId: 'streamPublicProjectState',
  tags: ['Public project'],
  request: {
    params: orgProjectParams,
    headers: z.object({ 'Last-Event-ID': z.string().optional() })
  },
  responses: {
    200: {
      description: 'Public project state version changes as server-sent events.',
      content: { 'text/event-stream': { schema: publicStateEventSchema } }
    },
    404: problemResponse('The public project was not found.'),
    429: problemResponse('The public request rate limit was exceeded.')
  },
  x: { owner: 'd-org-api', statement: 'public', idempotent: false }
})

export const evaluatePublicProject = createRoute({
  method: 'post',
  path: '/v1/public/{org}/{project}/evaluate',
  operationId: 'evaluatePublicProject',
  tags: ['Public project'],
  request: {
    params: orgProjectParams,
    body: {
      required: true,
      content: { 'application/json': { schema: publicEvaluationRequestSchema } }
    }
  },
  responses: {
    200: {
      description: 'Derived-only clause engine verdicts and input strip for a requested local window.',
      content: { 'application/json': { schema: publicEvaluationResponseSchema } }
    },
    400: problemResponse('The requested date or local times are invalid.'),
    404: problemResponse('The public project was not found.'),
    429: problemResponse('The public request rate limit was exceeded.')
  },
  x: { owner: 'd-commons', statement: 'public', idempotent: false }
})

export const routes = [
  getPublicProjectStatus,
  listPublicProjectCalls,
  listPublicLedgerEntries,
  listPublicGrades,
  listPublicCalendarEntries,
  getPublicCall,
  getPublicWindow,
  getPublicServiceStatus,
  streamPublicProjectState,
  evaluatePublicProject
] as const
