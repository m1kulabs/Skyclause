import {
  UuidIdParams as IdParams,
  OrganizationHeaders as OrganizationHeader,
  IdempotentOrganizationHeaders as IdempotentHeaders,
  problemResponse,
  CommonErrors as commonErrors
} from '../common'
import { z } from '@hono/zod-openapi'
import { createRoute } from '../create-route'
import { CallState, Instant, LocalDate, Mode, Page, PageQuery, Window as WindowSchema } from '../shared'

const Recurrence = z.object({
  frequency: z.literal('weekly'),
  days_of_week: z.array(z.enum(['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'])).min(1),
  until: LocalDate.optional(),
  count: z.number().int().positive().optional(),
  skip_dates: z.array(LocalDate)
})
const WindowFields = z.object({
  title: z.string().min(1).max(200),
  kind: z.enum(['class', 'event', 'commute_wave']),
  starts_at: Instant,
  ends_at: Instant,
  tz: z.string().min(1),
  recurrence: Recurrence.optional()
})
const WindowCallSummary = z.object({
  id: z.uuidv7(),
  bundle_id: z.uuidv7(),
  state: CallState,
  mode: Mode.nullable()
})
const WindowView = WindowSchema.extend({
  recurrence: Recurrence.nullable().optional(),
  latest_calls: z.object({ sky: WindowCallSummary.nullable(), crowd: WindowCallSummary.nullable() })
})
const WindowReport = z.object({
  window_id: z.uuidv7(),
  report_count: z.number().int().positive(),
  moderation: z.enum(['visible', 'hidden_pending_review', 'removed'])
})

export const listWindows = createRoute({
  method: 'get',
  path: '/v1/projects/{id}/windows',
  operationId: 'listWindows',
  tags: ['windows'],
  request: {
    params: IdParams,
    headers: OrganizationHeader,
    query: PageQuery.extend({
      include: z.literal('calls').optional(),
      from: LocalDate.optional(),
      to: LocalDate.optional(),
      kind: WindowFields.shape.kind.optional(),
      at_risk: z.enum(['true', 'false']).optional()
    })
  },
  responses: {
    200: {
      description: 'Windows and their latest calls for the project',
      content: { 'application/json': { schema: Page(WindowView) } }
    },
    ...commonErrors
  },
  x: { owner: 'b-windows-api', statement: 'project.view', idempotent: false }
})

export const createWindow = createRoute({
  method: 'post',
  path: '/v1/projects/{id}/windows',
  operationId: 'createWindow',
  tags: ['windows'],
  request: {
    params: IdParams,
    headers: IdempotentHeaders,
    body: { content: { 'application/json': { schema: WindowFields } } }
  },
  responses: {
    201: { description: 'A declared window', content: { 'application/json': { schema: WindowView } } },
    ...commonErrors,
    422: problemResponse('The window times or recurrence are invalid')
  },
  x: { owner: 'b-windows-api', statement: 'window.declare', idempotent: true }
})

export const updateWindow = createRoute({
  method: 'patch',
  path: '/v1/windows/{id}',
  operationId: 'updateWindow',
  tags: ['windows'],
  request: {
    params: IdParams,
    headers: OrganizationHeader,
    query: z.object({ scope: z.enum(['occurrence', 'series']).default('occurrence') }),
    body: { content: { 'application/json': { schema: WindowFields.partial() } } }
  },
  responses: {
    200: { description: 'The updated window', content: { 'application/json': { schema: WindowView } } },
    ...commonErrors,
    422: problemResponse('The window times or recurrence are invalid')
  },
  x: { owner: 'b-windows-api', statement: 'window.declare', idempotent: false }
})

export const cancelWindow = createRoute({
  method: 'delete',
  path: '/v1/windows/{id}',
  operationId: 'cancelWindow',
  tags: ['windows'],
  request: {
    params: IdParams,
    headers: OrganizationHeader,
    query: z.object({ scope: z.enum(['occurrence', 'series']).default('occurrence') })
  },
  responses: {
    200: {
      description: 'The cancelled window and its retained call state',
      content: { 'application/json': { schema: WindowView } }
    },
    ...commonErrors
  },
  x: { owner: 'b-windows-api', statement: 'window.declare', idempotent: false }
})

export const createWindowReport = createRoute({
  method: 'post',
  path: '/v1/windows/{id}/reports',
  operationId: 'createWindowReport',
  tags: ['windows'],
  request: { params: IdParams, headers: IdempotentHeaders },
  responses: {
    201: {
      description: 'A guest report and current moderation count',
      content: { 'application/json': { schema: WindowReport } }
    },
    ...commonErrors,
    422: problemResponse('This window cannot be reported')
  },
  x: { owner: 'd-guest-lifecycle', statement: 'guest', idempotent: true }
})

export const routes = [listWindows, createWindow, updateWindow, cancelWindow, createWindowReport] as const
