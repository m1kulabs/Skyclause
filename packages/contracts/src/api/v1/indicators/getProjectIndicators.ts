import { OrganizationHeaders, IdParams as ProjectParams, problemResponse } from '../../common'
import { createRoute } from '../../create-route'
import { IndicatorQuery, IndicatorSnapshot } from './_shared'

export const getProjectIndicators = createRoute({
  method: 'get',
  path: '/v1/projects/{id}/indicators',
  operationId: 'getProjectIndicators',
  tags: ['Indicators'],
  request: { headers: OrganizationHeaders, params: ProjectParams, query: IndicatorQuery },
  responses: {
    200: {
      description: 'Latest indicator snapshot for the selected pack',
      content: { 'application/json': { schema: IndicatorSnapshot } }
    },
    400: problemResponse('The organization header is missing or invalid.'),
    401: problemResponse('Authentication is required.'),
    403: problemResponse('The principal lacks project.view permission.'),
    404: problemResponse('The project is unavailable in this organization.'),
    422: problemResponse('The pack parameter is invalid.'),
    429: problemResponse('The request rate limit was exceeded.')
  },
  x: { owner: 'b-signals-api', statement: 'project.view', idempotent: false }
})
