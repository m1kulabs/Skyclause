import {
  UuidIdParams as IdParams,
  OrganizationHeaders as OrganizationHeader,
  CommonErrors as commonErrors
} from '../../common'
import { z } from '@hono/zod-openapi'
import { createRoute } from '../../create-route'
import { SheetDiffEntry } from './_shared'

export const getClauseSheetDiff = createRoute({
  method: 'get',
  path: '/v1/clause-sheets/{id}/diff',
  operationId: 'getClauseSheetDiff',
  tags: ['clause-sheets'],
  request: { params: IdParams, headers: OrganizationHeader },
  responses: {
    200: {
      description: 'Clause changes against the live version',
      content: { 'application/json': { schema: z.array(SheetDiffEntry) } }
    },
    ...commonErrors
  },
  x: { owner: 'b-clause-sheets-api', statement: 'project.view', idempotent: false }
})
