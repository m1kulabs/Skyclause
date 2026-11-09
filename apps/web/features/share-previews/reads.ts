import type { ApiApp } from '@skyclause/api'
import { getPublicCall } from '@skyclause/contracts/api/v1/public/getPublicCall'
import { getPublicProjectStatus } from '@skyclause/contracts/api/v1/public/getPublicProjectStatus'
import { getPublicWindow } from '@skyclause/contracts/api/v1/public/getPublicWindow'

// The public reads every preview draws from: #187's §4 operations, called in process so redaction lives in one place.
type ReadId = 'getPublicProjectStatus' | 'getPublicCall' | 'getPublicWindow'
const ROUTES = { getPublicProjectStatus, getPublicCall, getPublicWindow }
type Schema<Id extends ReadId> = (typeof ROUTES)[Id]['responses'][200]['content']['application/json']['schema']
type Body<Id extends ReadId> = ReturnType<Schema<Id>['parse']>

export type PublicStatus = Body<'getPublicProjectStatus'>
export type PublicCall = Body<'getPublicCall'>
export type PublicWindow = Body<'getPublicWindow'>

/** `null` is #187's one 404, which private, guest and missing targets share. */
export interface PreviewReads {
  projectStatus(org: string, project: string): Promise<PublicStatus | null>
  call(callId: string): Promise<PublicCall | null>
  window(id: string): Promise<PublicWindow | null>
}

/** A read that answered neither 200 nor 404; routes pass its answer on, never a fallback (NFR-15). */
export class ReadFailed extends Error {
  constructor(readonly response: Response) {
    super(`public read answered ${response.status}`)
  }
}

function schemaOf<Id extends ReadId>(id: Id): Schema<Id> {
  return ROUTES[id].responses[200].content['application/json'].schema as Schema<Id>
}

/**
 * Reads through the `/v1` app in process, as a network request would arrive: it carries the client's
 * `X-Forwarded-For`, so the public per-IP-hash rate limit counts each client, not every preview together.
 */
export function v1Reads(app: ApiApp, request: Request): PreviewReads {
  const forwardedFor = request.headers.get('X-Forwarded-For')
  async function read<Id extends ReadId>(id: Id, path: string): Promise<Body<Id> | null> {
    const headers = forwardedFor ? { 'X-Forwarded-For': forwardedFor } : undefined
    const response = await app.fetch(new Request(new URL(path, request.url), { headers }))
    if (response.status === 404) return null
    if (response.status !== 200) throw new ReadFailed(response)
    return schemaOf(id).parse(await response.json()) as Body<Id>
  }
  const segment = encodeURIComponent
  return {
    projectStatus: (org, project) =>
      read('getPublicProjectStatus', `/v1/public/${segment(org)}/${segment(project)}/status`),
    call: (callId) => read('getPublicCall', `/v1/public/calls/${segment(callId)}`),
    window: (id) => read('getPublicWindow', `/v1/public/windows/${segment(id)}`)
  }
}
