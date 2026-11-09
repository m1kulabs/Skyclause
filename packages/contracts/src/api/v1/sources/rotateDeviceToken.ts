import { IdempotentOrganizationHeaders, IdParams as SourceParams } from '../../common'
import { createRoute } from '../../create-route'
import { DeviceCredential, projectErrors } from './_shared'

export const rotateDeviceToken = createRoute({
  method: 'post',
  path: '/v1/sources/{id}/rotate-token',
  operationId: 'rotateDeviceToken',
  tags: ['Sources'],
  request: { headers: IdempotentOrganizationHeaders, params: SourceParams },
  responses: {
    200: {
      description: 'Replacement device credential',
      content: { 'application/json': { schema: DeviceCredential } }
    },
    ...projectErrors
  },
  x: { owner: 'b-device-ingest', statement: 'sources.manage', idempotent: true }
})
