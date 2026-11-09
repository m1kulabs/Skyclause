import {
  UuidIdParams as IdParams,
  OrganizationHeaders as OrganizationHeader,
  CommonErrors as commonErrors
} from '../../common'
import { createRoute } from '../../create-route'
import { Page, PageQuery, Run } from '../../shared'

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
