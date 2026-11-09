import {
  ScopedOrganizationHeaders as OrganizationHeaders,
  NonEmptyIdParams as IdParams,
  ProblemResponses
} from '../../common'
import { z } from '@hono/zod-openapi'
import { createRoute } from '../../create-route'
import { Page } from '../../shared'
import { PilotArchive } from './_shared'

export const getPilotArchive = createRoute({
  method: 'get',
  path: '/v1/projects/{id}/pilot-archive',
  operationId: 'getPilotArchive',
  tags: ['pilot-archive'],
  request: { headers: OrganizationHeaders, params: IdParams },
  responses: {
    ...ProblemResponses,
    200: {
      description: 'Success',
      content: {
        // #146: the link's label, "Pilot archive (Gemini Enterprise, November 2026)".
        'application/json': { schema: Page(PilotArchive).extend({ label: z.string().optional() }) }
      }
    }
  },
  x: { owner: 'c-ledger-chain', statement: 'ledger.view', idempotent: false }
})
