import { OrganizationHeaders, IdParams as ProjectParams, problemResponse } from '../../common'
import { createRoute } from '../../create-route'
import { ProjectVerdicts } from './_shared'

export const getProjectVerdicts = createRoute({
  method: 'get',
  path: '/v1/projects/{id}/verdicts',
  operationId: 'getProjectVerdicts',
  tags: ['Verdicts'],
  request: { headers: OrganizationHeaders, params: ProjectParams },
  responses: {
    200: {
      description: 'Latest verdicts for each enabled pack',
      content: { 'application/json': { schema: ProjectVerdicts } }
    },
    400: problemResponse('The organization header is missing or invalid.'),
    401: problemResponse('Authentication is required.'),
    403: problemResponse('The principal lacks project.view permission.'),
    404: problemResponse('The project is unavailable in this organization.'),
    429: problemResponse('The request rate limit was exceeded.')
  },
  x: { owner: 'b-signals-api', statement: 'project.view', idempotent: false }
})
