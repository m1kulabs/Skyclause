import {
  UuidIdParams as IdParams,
  OrganizationHeaders as OrganizationHeader,
  IdempotentOrganizationHeaders as IdempotentHeaders,
  problemResponse,
  CommonErrors as commonErrors
} from '../common'
import { z } from '@hono/zod-openapi'
import { createRoute } from '../create-route'
import { InputValue, Instant, Pack, Page, PageQuery, Run } from '../shared'

const CreateRunBody = z.object({ pack: Pack, window_ids: z.array(z.uuidv7()).optional() })
// #151 (optional, getRun only): when it was triggered, the bundle it drafted, and its trace: CAL-5's line for an
// all-Normal run ("Normal; N inputs fresh", with each fresh input and its age) or its outcome, and each step.
const RunDetail = Run.extend({
  triggered_at: Instant.optional(),
  bundle_id: z.string().nullable().optional(),
  trace: z
    .object({
      text: z.string(),
      inputs: z.array(InputValue),
      steps: z.array(
        z.object({ step: z.string(), status: z.string(), started_at: Instant, finished_at: Instant.nullable() })
      )
    })
    .optional()
})

export const listRuns = createRoute({
  method: 'get',
  path: '/v1/projects/{id}/runs',
  operationId: 'listRuns',
  tags: ['runs'],
  request: { params: IdParams, headers: OrganizationHeader, query: PageQuery },
  responses: {
    200: { description: 'Runs requested for the project', content: { 'application/json': { schema: Page(Run) } } },
    ...commonErrors
  },
  x: { owner: 'c-run-orchestrator', statement: 'project.view', idempotent: false }
})

export const createRun = createRoute({
  method: 'post',
  path: '/v1/projects/{id}/runs',
  operationId: 'createRun',
  tags: ['runs'],
  request: {
    params: IdParams,
    headers: IdempotentHeaders,
    body: { content: { 'application/json': { schema: CreateRunBody } } }
  },
  responses: {
    202: { description: 'A queued run request', content: { 'application/json': { schema: Run } } },
    ...commonErrors,
    422: problemResponse('The run request cannot be fulfilled')
  },
  x: { owner: 'c-run-orchestrator', statement: 'run.request', idempotent: true }
})

export const getRun = createRoute({
  method: 'get',
  path: '/v1/runs/{id}',
  operationId: 'getRun',
  tags: ['runs'],
  request: { params: IdParams, headers: OrganizationHeader },
  responses: {
    200: { description: 'A run and its current state', content: { 'application/json': { schema: RunDetail } } },
    ...commonErrors
  },
  x: { owner: 'c-run-orchestrator', statement: 'project.view', idempotent: false }
})

export const routes = [listRuns, createRun, getRun] as const
