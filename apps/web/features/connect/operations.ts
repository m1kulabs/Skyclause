import { Instant, REGISTRY } from '@skyclause/contracts'
import { createApiFetch } from '../../lib/api-fetch'

const config = REGISTRY.find((route) => route.operationId === 'getConnectConfig')!
const verifications = REGISTRY.find((route) => route.operationId === 'listConnectVerifications')!
const activity = REGISTRY.find((route) => route.operationId === 'listConnectActivity')!
const create = REGISTRY.find((route) => route.operationId === 'createOauthClient')!
const memberships = REGISTRY.find((route) => route.operationId === 'listMyMemberships')!

export const connectOperations = {
  listMyMemberships: {
    method: memberships.method,
    path: memberships.path,
    request: { query: memberships.request.query },
    response: memberships.responses[200].content['application/json'].schema
  },
  getConnectConfig: {
    method: config.method,
    path: config.path,
    request: { query: config.request.query },
    response: config.responses[200].content['application/json'].schema
  },
  listConnectVerifications: {
    method: verifications.method,
    path: verifications.path,
    request: { query: verifications.request.query },
    response: verifications.responses[200].content['application/json'].schema
  },
  listConnectActivity: {
    method: activity.method,
    path: activity.path,
    // #208 specifies since; the registry still has only PageQuery on this branch.
    request: { query: activity.request.query.extend({ since: Instant.optional() }) },
    response: activity.responses[200].content['application/json'].schema
  },
  createOauthClient: {
    method: create.method,
    path: create.path,
    request: { params: create.request.params, body: create.request.body.content['application/json'].schema },
    response: create.responses[201].content['application/json'].schema,
    idempotent: true
  }
}

export const apiFetch = createApiFetch(connectOperations)
export const targets = config.request.query.shape.target.options
export type Target = (typeof targets)[number]
export type Transport = 'remote' | 'stdio'
export type Activity = ReturnType<typeof connectOperations.listConnectActivity.response.parse>['data'][number]
export type Verification = ReturnType<typeof connectOperations.listConnectVerifications.response.parse>['data'][number]
export type Tools = ReturnType<typeof connectOperations.getConnectConfig.response.parse>['tools']

/** #199 publishes this envelope; reuse the existing tool schema until its public route lands. */
export async function readTools(origin: string, signal: AbortSignal): Promise<Tools> {
  const response = await fetch(new URL('/mcp/tools.json', origin), { signal, credentials: 'omit', cache: 'no-store' })
  if (!response.ok) throw new Error(`Tools read failed: ${response.status}`)
  const body: unknown = await response.json()
  const tools = typeof body === 'object' && body !== null && 'tools' in body ? body.tools : undefined
  return connectOperations.getConnectConfig.response.shape.tools.parse(tools)
}
