import {
  ScopedOrganizationHeaders as OrganizationHeaders,
  NonEmptyIdParams as IdParams,
  ProblemResponses
} from '../../common'
import { createRoute } from '../../create-route'
import { EvidenceRequest, Page, PageQuery } from '../../shared'

// The project's requests, newest first, without their packs; guests and share links see only their own.
export const listEvidenceRequests = createRoute({
  method: 'get',
  path: '/v1/projects/{id}/evidence-requests',
  operationId: 'listEvidenceRequests',
  tags: ['evidence-requests'],
  request: { headers: OrganizationHeaders, params: IdParams, query: PageQuery },
  responses: {
    ...ProblemResponses,
    200: { description: 'Success', content: { 'application/json': { schema: Page(EvidenceRequest) } } }
  },
  x: { owner: 'c-evidence', statement: 'evidence.request', idempotent: false }
})
