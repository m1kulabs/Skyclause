import {
  UuidIdParams as ProjectParams,
  OrganizationHeaders as OrganizationHeader,
  CommonErrors as commonErrors
} from '../../common'
import { createRoute } from '../../create-route'
import { IcsFeed, Page, PageQuery } from '../../shared'

export const listIcsFeeds = createRoute({
  method: 'get',
  path: '/v1/projects/{id}/ics-feeds',
  operationId: 'listIcsFeeds',
  tags: ['ics-feeds'],
  request: { params: ProjectParams, headers: OrganizationHeader, query: PageQuery },
  responses: {
    200: {
      description: 'ICS calendars imported by the project',
      content: { 'application/json': { schema: Page(IcsFeed) } }
    },
    ...commonErrors
  },
  x: { owner: 'b-windows-api', statement: 'project.view', idempotent: false }
})
