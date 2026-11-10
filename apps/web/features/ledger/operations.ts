import { REGISTRY, Page, PageQuery, EvidenceRequest } from '@skyclause/contracts'
import { createApiFetch } from '../../lib/api-fetch'
import { shellOperations } from '../shell/operations'

const list = REGISTRY.find((route) => route.operationId === 'listLedgerEntries')!
const exportRoute = REGISTRY.find((route) => route.operationId === 'exportLedger')!
const verify = REGISTRY.find((route) => route.operationId === 'verifyLedger')!
const archive = REGISTRY.find((route) => route.operationId === 'getPilotArchive')!
const create = REGISTRY.find((route) => route.operationId === 'createEvidenceRequest')!
const get = REGISTRY.find((route) => route.operationId === 'getEvidenceRequest')!
const approve = REGISTRY.find((route) => route.operationId === 'approveEvidenceRequest')!

export const ledgerOperations = {
  listProjects: shellOperations.listProjects,
  listLedgerEntries: {
    method: list.method,
    path: list.path,
    request: { params: list.request.params, query: list.request.query },
    response: list.responses[200].content['application/json'].schema
  },
  exportLedger: {
    method: exportRoute.method,
    path: exportRoute.path,
    request: { params: exportRoute.request.params, query: exportRoute.request.query },
    response: exportRoute.responses[200].content['text/csv'].schema
  },
  verifyLedger: {
    method: verify.method,
    path: verify.path,
    request: { params: verify.request.params },
    response: verify.responses[200].content['application/json'].schema
  },
  getPilotArchive: {
    method: archive.method,
    path: archive.path,
    request: { params: archive.request.params },
    response: archive.responses[200].content['application/json'].schema
  },
  // #159 supplies this route; share its documented path and existing item schema until registry registration lands.
  listEvidenceRequests: {
    method: 'get',
    path: create.path,
    request: { params: create.request.params, query: PageQuery },
    response: Page(EvidenceRequest)
  },
  createEvidenceRequest: {
    method: create.method,
    path: create.path,
    request: { params: create.request.params, body: create.request.body.content['application/json'].schema },
    response: create.responses[202].content['application/json'].schema,
    idempotent: create['x-skyclause'].idempotent
  },
  getEvidenceRequest: {
    method: get.method,
    path: get.path,
    request: { params: get.request.params },
    response: get.responses[200].content['application/json'].schema
  },
  approveEvidenceRequest: {
    method: approve.method,
    path: approve.path,
    request: { params: approve.request.params },
    response: approve.responses[200].content['application/json'].schema
  }
}

export const apiFetch = createApiFetch(ledgerOperations)
export type LedgerRow = ReturnType<typeof ledgerOperations.listLedgerEntries.response.parse>['data'][number]
export type Evidence = ReturnType<typeof ledgerOperations.getEvidenceRequest.response.parse>
export type EvidenceSummary = ReturnType<typeof ledgerOperations.listEvidenceRequests.response.parse>['data'][number]
export type ArchiveFile = ReturnType<typeof ledgerOperations.getPilotArchive.response.parse>['data'][number]
