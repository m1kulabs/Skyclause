import { OrganizationHeaders } from '../../common'
import { createRoute } from '../../create-route'
import { ProjectSourceParams, projectErrors } from './_shared'

export const unbindSource = createRoute({
  method: 'delete',
  path: '/v1/projects/{id}/sources/{sourceId}',
  operationId: 'unbindSource',
  tags: ['Sources'],
  request: { headers: OrganizationHeaders, params: ProjectSourceParams },
  responses: {
    204: { description: 'Source unbound' },
    ...projectErrors
  },
  x: { owner: 'b-source-binding', statement: 'sources.manage', idempotent: false }
})
