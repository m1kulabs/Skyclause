import { z } from '@hono/zod-openapi'
import { createRoute } from '../create-route'
import { Forecast, Night, Page, PageQuery, Problem } from '../shared'

const IdParams = z.object({ id: z.uuidv7() })
const OrganizationHeader = z.object({ 'Skyclause-Organization': z.string().min(1) })
const NightView = Night.extend({ forecast: Forecast.nullable() })

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

export const listNights = createRoute({
  method: 'get',
  path: '/v1/projects/{id}/nights',
  operationId: 'listNights',
  tags: ['nights'],
  request: { params: IdParams, headers: OrganizationHeader, query: PageQuery },
  responses: {
    200: {
      description: 'Forecast nights for the project',
      content: { 'application/json': { schema: Page(NightView) } }
    },
    ...commonErrors
  },
  x: { owner: 'b-forecast', statement: 'project.view', idempotent: false }
})

export const getNight = createRoute({
  method: 'get',
  path: '/v1/nights/{id}',
  operationId: 'getNight',
  tags: ['nights'],
  request: { params: IdParams, headers: OrganizationHeader },
  responses: {
    200: {
      description: 'A forecast night with its current forecast',
      content: { 'application/json': { schema: NightView } }
    },
    ...commonErrors
  },
  x: { owner: 'b-forecast', statement: 'project.view', idempotent: false }
})

export const routes = [listNights, getNight] as const
