import { z } from '@hono/zod-openapi'
import { createRoute } from '../create-route'
import { Problem } from '../shared'

const OrganizationHeaders = z.object({
  'Skyclause-Organization': z.string().min(1),
  'Idempotency-Key': z.string().min(1)
})
const ProjectParams = z.object({ id: z.string() })
const DeviceInput = z.object({ kind: z.enum(['camera', 'pi']), name: z.string().min(1) })
const DeviceCredential = z.object({
  source_id: z.string(),
  token: z.string(),
  scope: z.literal('ingest')
})
const CreatedDevice = DeviceCredential.extend({ kind: z.enum(['camera', 'pi']), name: z.string() })

const problemResponse = (description: string) => ({
  description,
  content: { 'application/problem+json': { schema: Problem } }
})

export const createDevice = createRoute({
  method: 'post',
  path: '/v1/projects/{id}/devices',
  operationId: 'createDevice',
  tags: ['Devices'],
  request: {
    headers: OrganizationHeaders,
    params: ProjectParams,
    body: { content: { 'application/json': { schema: DeviceInput } } }
  },
  responses: {
    201: {
      description: 'Device source and one-time credential',
      content: { 'application/json': { schema: CreatedDevice } }
    },
    400: problemResponse('The organization header is missing or invalid.'),
    401: problemResponse('Authentication is required.'),
    403: problemResponse('The principal lacks sources.manage permission.'),
    404: problemResponse('The project is unavailable in this organization.'),
    422: problemResponse('The device request is invalid.'),
    429: problemResponse('The request rate limit was exceeded.')
  },
  x: { owner: 'b-device-ingest', statement: 'sources.manage', idempotent: true }
})

export const routes = [createDevice] as const
