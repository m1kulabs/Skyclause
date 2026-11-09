import { OrganizationHeaders, IdParams as ProjectParams } from '../../common'
import { createRoute } from '../../create-route'
import { Page } from '../../shared'
import { PageRequest, ProjectSource, projectErrors } from './_shared'

export const listProjectSources = createRoute({
  method: 'get',
  path: '/v1/projects/{id}/sources',
  operationId: 'listProjectSources',
  tags: ['Sources'],
  request: { headers: OrganizationHeaders, params: ProjectParams, query: PageRequest },
  responses: {
    200: {
      description: 'Project source health and recent errors',
      content: { 'application/json': { schema: Page(ProjectSource) } }
    },
    ...projectErrors
  },
  x: { owner: 'b-signals-api', statement: 'project.view', idempotent: false }
})
