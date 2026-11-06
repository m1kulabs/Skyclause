import { z } from '@hono/zod-openapi'
import { createRoute } from '../create-route'
import { Instant, Page, Problem } from '../shared'

// D2: sessions select an organisation by slug or ID; scoped keys and grants already carry it.
const OrganizationHeaders = z.object({
  'Skyclause-Organization': z.string().min(1).optional().describe('Required for sessions; organisation slug or ID')
})
const IdParams = z.object({ id: z.string().min(1) })
const ProblemResponses = {
  400: {
    description: 'organization-required or validation-failed.',
    content: { 'application/problem+json': { schema: Problem } }
  },
  401: { description: 'Authentication required.', content: { 'application/problem+json': { schema: Problem } } },
  403: {
    description: 'insufficient-scope: permission denied.',
    content: { 'application/problem+json': { schema: Problem } }
  },
  404: {
    description: 'Resource not found, including a row in another organisation.',
    content: { 'application/problem+json': { schema: Problem } }
  },
  429: {
    description: 'rate-limited or budget-exhausted.',
    headers: z.object({ 'Retry-After': z.string().regex(/^\d+$/).describe('Retry delay in seconds') }),
    content: { 'application/problem+json': { schema: Problem } }
  }
}

// TRD pilot_archive: files stay outside the platform ledger (LED-8).
const PilotArchive = z.object({
  project_id: z.string(),
  kind: z.enum(['sheets_ledger', 'jira_register', 'run_traces']),
  url: z.url(),
  sha256: z.string(),
  captured_at: Instant
})

export const getPilotArchive = createRoute({
  method: 'get',
  path: '/v1/projects/{id}/pilot-archive',
  operationId: 'getPilotArchive',
  tags: ['pilot-archive'],
  request: { headers: OrganizationHeaders, params: IdParams },
  responses: {
    ...ProblemResponses,
    200: { description: 'Success', content: { 'application/json': { schema: Page(PilotArchive) } } }
  },
  x: { owner: 'c-ledger-chain', statement: 'ledger.view', idempotent: false }
})

export const routes = [getPilotArchive] as const
