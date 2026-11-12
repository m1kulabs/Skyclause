import { REGISTRY } from '@skyclause/contracts'
import { createApiFetch } from '../../lib/api-fetch'
import { membersOperations } from '../members/operations'

const list = REGISTRY.find((route) => route.operationId === 'listAuditEntries')!
const exportLog = REGISTRY.find((route) => route.operationId === 'exportAuditLog')!
const projects = REGISTRY.find((route) => route.operationId === 'listProjects')!

export const auditOperations = {
  // The people and projects a filter chooses from, and the names a record's actor and project are shown by.
  listMembers: membersOperations.listMembers,
  listProjects: {
    method: projects.method.toUpperCase(),
    path: projects.path,
    request: { query: projects.request.query },
    response: projects.responses[200].content['application/json'].schema
  },
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
