import { IdempotentOrganizationHeaders, IdParams as ProjectParams } from '../../common'
import { z } from '@hono/zod-openapi'
import { createRoute } from '../../create-route'
import { ProjectSource, projectErrors } from './_shared'

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
