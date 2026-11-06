import { z } from '@hono/zod-openapi'

// Supply the JSON Schema types explicitly so zod-to-openapi does not expand z.json() recursively.
// The runtime validator and inferred type still accept only JSON values, at any nesting depth.
export const JsonValue = z.json().openapi({ type: ['string', 'number', 'boolean', 'object', 'array', 'null'] })

export const Problem = z.object({
  type: z.url(),
  title: z.string(),
  status: z.number().int(),
  detail: z.string(),
  instance: z.string()
})
export type Problem = z.infer<typeof Problem>
export const ProblemContent = { 'application/problem+json': { schema: Problem } }
export const problemResponse = (description: string) => ({ description, content: ProblemContent })

export const ProblemResponse = problemResponse('Request failed')

export const OrganizationHeaders = z.object({ 'Skyclause-Organization': z.string().min(1) })
// D2: scoped keys and grants carry their organisation; sessions must select one.
export const ScopedOrganizationHeaders = z.object({
  'Skyclause-Organization': OrganizationHeaders.shape['Skyclause-Organization']
    .optional()
    .describe('Required for sessions; organisation slug or ID')
})
export const IdempotencyHeaders = z.object({ 'Idempotency-Key': z.string().min(1) })
export const IdempotentOrganizationHeaders = OrganizationHeaders.extend(IdempotencyHeaders.shape)
export const ScopedIdempotentOrganizationHeaders = ScopedOrganizationHeaders.extend(IdempotencyHeaders.shape)
export const OrganizationStreamHeaders = OrganizationHeaders.extend({ 'Last-Event-ID': z.string().optional() })

export const IdParams = z.object({ id: z.string() })
export const NonEmptyIdParams = z.object({ id: z.string().min(1) })
export const UuidIdParams = z.object({ id: z.uuidv7() })

export const ProblemResponses = {
  400: {
    description: 'organization-required or validation-failed.',
    content: ProblemContent
  },
  401: { description: 'Authentication required.', content: ProblemContent },
  403: {
    description: 'insufficient-scope: permission denied.',
    content: ProblemContent
  },
  404: {
    description: 'Resource not found, including a row in another organisation.',
    content: ProblemContent
  },
  429: {
    description: 'rate-limited or budget-exhausted.',
    headers: z.object({ 'Retry-After': z.string().regex(/^\d+$/).describe('Retry delay in seconds') }),
    content: ProblemContent
  }
}

export const CommonErrors = {
  400: problemResponse('Invalid request'),
  401: problemResponse('Authentication required'),
  403: problemResponse('Insufficient permission'),
  404: problemResponse('Resource not found in this organisation'),
  429: problemResponse('Rate limit exceeded')
}

export const CommonProblems = {
  401: { ...ProblemResponse, description: 'Authentication required' },
  403: { ...ProblemResponse, description: 'insufficient-scope' },
  404: { ...ProblemResponse, description: 'Resource not found or inaccessible' },
  422: { ...ProblemResponse, description: 'validation-failed or idempotency-mismatch' },
  429: {
    ...ProblemResponse,
    description: 'rate-limited',
    headers: z.object({ 'Retry-After': z.string().regex(/^\d+$/) })
  }
}

export const ReauthProblems = {
  ...CommonProblems,
  401: problemResponse('Authentication required or reauth-required')
}

export const GuestProblems = {
  403: problemResponse('Bot check failed'),
  404: CommonProblems[404],
  422: CommonProblems[422],
  429: CommonProblems[429]
}

export const SessionErrors = {
  401: problemResponse('A signed-in session is required.'),
  429: problemResponse('The request is rate limited.')
}

export const SubscriberProblems = {
  ...CommonProblems,
  410: problemResponse('link-expired: subscriber token has expired or was revoked')
}
