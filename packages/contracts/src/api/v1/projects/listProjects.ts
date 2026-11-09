import { ScopedOrganizationHeaders as OrganizationHeaders } from '../../common'
import { createRoute } from '../../create-route'
import { Page } from '../../shared'
import { ProjectListItem, ProjectListQuery, organizationErrors } from './_shared'

export const listProjects = createRoute({
  method: 'get',
  path: '/v1/projects',
  operationId: 'listProjects',
  tags: ['Projects'],
  request: { headers: OrganizationHeaders, query: ProjectListQuery },
  responses: {
    200: {
      description: 'Projects visible in the selected organization',
      content: { 'application/json': { schema: Page(ProjectListItem) } }
    },
    ...organizationErrors
  },
  x: { owner: 'b-projects-api', statement: 'project.view', idempotent: false }
})
