import { ScopedOrganizationHeaders as OrganizationHeaders, IdParams as ProjectParams } from '../../common'
import { createRoute } from '../../create-route'
import { Project } from '../../shared'
import { organizationErrors } from './_shared'

export const getProject = createRoute({
  method: 'get',
  path: '/v1/projects/{id}',
  operationId: 'getProject',
  tags: ['Projects'],
  request: { headers: OrganizationHeaders, params: ProjectParams },
  responses: {
    200: { description: 'Project details', content: { 'application/json': { schema: Project } } },
    ...organizationErrors
  },
  x: { owner: 'b-projects-api', statement: 'project.view', idempotent: false }
})
