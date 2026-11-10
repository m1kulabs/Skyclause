import { REGISTRY } from '@skyclause/contracts'
import { createApiFetch } from '../../lib/api-fetch'

const list = REGISTRY.find((route) => route.operationId === 'listAuditEntries')!
const exportLog = REGISTRY.find((route) => route.operationId === 'exportAuditLog')!

export const auditOperations = {
  listAuditEntries: {
    method: list.method.toUpperCase(),
    path: list.path,
    request: { params: list.request.params, query: list.request.query },
    response: list.responses[200].content['application/json'].schema
  },
  exportAuditLog: {
    method: exportLog.method.toUpperCase(),
    path: exportLog.path,
    request: { params: exportLog.request.params, query: exportLog.request.query },
    response: exportLog.responses[200].content['text/csv'].schema
  }
}

export const apiFetch = createApiFetch(auditOperations)
export type AuditEntry = ReturnType<typeof auditOperations.listAuditEntries.response.parse>['data'][number]
