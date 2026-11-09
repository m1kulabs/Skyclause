import {
  UuidIdParams as IdParams,
  OrganizationHeaders as OrganizationHeader,
  CommonErrors as commonErrors
} from '../../common'
import { z } from '@hono/zod-openapi'
import { createRoute } from '../../create-route'
import { LocalDate, Page, PageQuery } from '../../shared'
import { WindowFields, WindowView } from './_shared'

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
