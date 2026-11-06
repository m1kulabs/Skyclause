import { IdParams, IdempotencyHeaders, CommonProblems } from '../common'
import { z } from '@hono/zod-openapi'
import { createRoute } from '../create-route'
import { Instant, Page, PageQuery, Window } from '../shared'

const GuestBlock = z.object({
  id: z.string(),
  subject_kind: z.enum(['device', 'ip']),
  subject_hash: z.string(),
  reason: z.string(),
  created_at: Instant
})
const IncidentUpdate = z.object({ id: z.string(), status: z.string(), body: z.string(), at: Instant })
const Incident = z.object({
  id: z.string(),
  title: z.string(),
  scope: z.enum(['ours', 'source']),
  component: z.string(),
  source_id: z.string().nullable(),
  created_at: Instant,
  resolved_at: Instant.nullable(),
  updates: z.array(IncidentUpdate)
})
const IncidentFields = Incident.pick({ title: true, scope: true, component: true, source_id: true })

export const listModerationReports = createRoute({
  method: 'get',
  path: '/api/admin/moderation/reports',
  operationId: 'listModerationReports',
  tags: ['admin'],
  request: { query: PageQuery },
  responses: {
    ...CommonProblems,
    200: {
      description: 'Success',
      content: {
        'application/json': {
          schema: Page(
            z.object({
              window: Window,
              report_count: z.number().int().nonnegative(),
              first_reported_at: Instant,
              last_reported_at: Instant
            })
          )
        }
      }
    }
  },
  x: { owner: 'd-guest-lifecycle', statement: 'staff', idempotent: false }
})

export const decideModerationWindow = createRoute({
  method: 'post',
  path: '/api/admin/moderation/windows/{id}/decide',
  operationId: 'decideModerationWindow',
  tags: ['admin'],
  request: {
    params: IdParams,
    body: {
      required: true,
      content: {
        'application/json': { schema: z.object({ action: z.enum(['restore', 'remove']), reason: z.string().min(1) }) }
      }
    }
  },
  responses: {
    ...CommonProblems,
    200: { description: 'Success', content: { 'application/json': { schema: Window } } }
  },
  x: { owner: 'd-guest-lifecycle', statement: 'staff', idempotent: false }
})

export const createModerationBlock = createRoute({
  method: 'post',
  path: '/api/admin/moderation/blocks',
  operationId: 'createModerationBlock',
  tags: ['admin'],
  request: {
    headers: IdempotencyHeaders,
    body: {
      required: true,
      content: {
        'application/json': { schema: GuestBlock.pick({ subject_kind: true, subject_hash: true, reason: true }) }
      }
    }
  },
  responses: {
    ...CommonProblems,
    201: { description: 'Device or IP blocked', content: { 'application/json': { schema: GuestBlock } } }
  },
  x: { owner: 'd-guest-lifecycle', statement: 'staff', idempotent: true }
})

export const listIncidents = createRoute({
  method: 'get',
  path: '/api/admin/incidents',
  operationId: 'listIncidents',
  tags: ['admin'],
  request: { query: PageQuery },
  responses: {
    ...CommonProblems,
    200: { description: 'Success', content: { 'application/json': { schema: Page(Incident) } } }
  },
  x: { owner: 'd-public-api', statement: 'staff', idempotent: false }
})

export const createIncident = createRoute({
  method: 'post',
  path: '/api/admin/incidents',
  operationId: 'createIncident',
  tags: ['admin'],
  request: {
    headers: IdempotencyHeaders,
    body: {
      required: true,
      content: { 'application/json': { schema: IncidentFields.extend({ status: z.string(), body: z.string() }) } }
    }
  },
  responses: {
    ...CommonProblems,
    201: { description: 'Incident created', content: { 'application/json': { schema: Incident } } }
  },
  x: { owner: 'd-public-api', statement: 'staff', idempotent: true }
})

export const updateIncident = createRoute({
  method: 'patch',
  path: '/api/admin/incidents/{id}',
  operationId: 'updateIncident',
  tags: ['admin'],
  request: {
    params: IdParams,
    body: {
      required: true,
      content: {
        'application/json': {
          schema: IncidentFields.partial().extend({
            status: z.string(),
            body: z.string(),
            resolved: z.boolean().optional()
          })
        }
      }
    }
  },
  responses: {
    ...CommonProblems,
    200: { description: 'Incident update appended', content: { 'application/json': { schema: Incident } } }
  },
  x: { owner: 'd-public-api', statement: 'staff', idempotent: false }
})

export const routes = [
  listModerationReports,
  decideModerationWindow,
  createModerationBlock,
  listIncidents,
  createIncident,
  updateIncident
] as const
