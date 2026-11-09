import {
  getCall as call,
  getCallExplanation as explanation,
  listProjectCalls as calls
} from '@skyclause/contracts/api/v1/calls'
import { listGrades as grades } from '@skyclause/contracts/api/v1/grades'
import { getRun as run } from '@skyclause/contracts/api/v1/runs'
import { getProjectStrip as strip } from '@skyclause/contracts/api/v1/strip'
import { listProjects as projects } from '@skyclause/contracts/api/v1/projects'
import { createApiFetch } from '../../lib/api-fetch'

export const callsOperations = {
  listProjects: {
    method: projects.method.toUpperCase(),
    path: projects.path,
    request: { query: projects.request.query },
    response: projects.responses[200].content['application/json'].schema
  },
  listProjectCalls: {
    method: calls.method.toUpperCase(),
    path: calls.path,
    request: { params: calls.request.params, query: calls.request.query },
    response: calls.responses[200].content['application/json'].schema
  },
  getCall: {
    method: call.method.toUpperCase(),
    path: call.path,
    request: { params: call.request.params },
    response: call.responses[200].content['application/json'].schema
  },
  getCallExplanation: {
    method: explanation.method.toUpperCase(),
    path: explanation.path,
    request: { params: explanation.request.params },
    response: explanation.responses[200].content['application/json'].schema
  },
  getRun: {
    method: run.method.toUpperCase(),
    path: run.path,
    request: { params: run.request.params },
    response: run.responses[200].content['application/json'].schema
  },
  listGrades: {
    method: grades.method.toUpperCase(),
    path: grades.path,
    request: { params: grades.request.params, query: grades.request.query },
    response: grades.responses[200].content['application/json'].schema
  },
  getProjectStrip: {
    method: strip.method.toUpperCase(),
    path: strip.path,
    request: { params: strip.request.params },
    response: strip.responses[200].content['application/json'].schema
  }
}

export const apiFetch = createApiFetch(callsOperations)
export type CallsProject = ReturnType<typeof callsOperations.listProjects.response.parse>['data'][number]
export type CallRowView = ReturnType<typeof callsOperations.listProjectCalls.response.parse>['data'][number]
export type CallDetailView = ReturnType<typeof callsOperations.getCall.response.parse>
export type CallExplanationView = ReturnType<typeof callsOperations.getCallExplanation.response.parse>
export type RunDetailView = ReturnType<typeof callsOperations.getRun.response.parse>
export type GradeView = ReturnType<typeof callsOperations.listGrades.response.parse>['data'][number]
export type StripView = ReturnType<typeof callsOperations.getProjectStrip.response.parse>

export async function resolveProject(org: string, slug: string, signal?: AbortSignal): Promise<CallsProject> {
  const page = await apiFetch('listProjects', { org, query: { slug, limit: 200 }, signal })
  const project = page.data.find((item) => item.slug === slug)
  if (!project) throw new Error('Project unavailable')
  return project
}
