import { z } from '@hono/zod-openapi'
import { createRoute } from '../create-route'
import { Pack, Page, PageQuery, Problem, Run } from '../shared'

const IdParams = z.object({ id: z.uuidv7() })
const OrganizationHeader = z.object({ 'Skyclause-Organization': z.string().min(1) })
const IdempotentHeaders = OrganizationHeader.extend({ 'Idempotency-Key': z.string().min(1) })
const CreateRunBody = z.object({ pack: Pack, window_ids: z.array(z.uuidv7()).optional() })

const problemResponse = (description: string) => ({
  description,
  content: { 'application/problem+json': { schema: Problem } }
})
const commonErrors = {
  400: problemResponse('Invalid request'),
  401: problemResponse('Authentication required'),
  403: problemResponse('Insufficient permission'),
  404: problemResponse('Resource not found in this organisation'),
  429: problemResponse('Rate limit exceeded')
}

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
    200: { description: 'A run and its current state', content: { 'application/json': { schema: Run } } },
    ...commonErrors
  },
  x: { owner: 'c-run-orchestrator', statement: 'project.view', idempotent: false }
})

export const routes = [listRuns, createRun, getRun] as const
