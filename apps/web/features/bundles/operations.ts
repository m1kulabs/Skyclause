import { approveBundle as approve } from '@skyclause/contracts/api/first-party/bundles/approveBundle'
import { getMyPreferences as preferences } from '@skyclause/contracts/api/first-party/me/getMyPreferences'
import { listMyMemberships as memberships } from '@skyclause/contracts/api/first-party/me/listMyMemberships'
import { getBundle as bundle } from '@skyclause/contracts/api/v1/bundles/getBundle'
import { streamBundles } from '@skyclause/contracts/api/v1/bundles/streamBundles'
import { getCall as call } from '@skyclause/contracts/api/v1/calls/getCall'
import { getCallExplanation as explanation } from '@skyclause/contracts/api/v1/calls/getCallExplanation'
import { getRun as run } from '@skyclause/contracts/api/v1/runs/getRun'
import { getProjectStrip as strip } from '@skyclause/contracts/api/v1/strip/getProjectStrip'
import { createApiFetch } from '../../lib/api-fetch'

export const bundleStream = streamBundles

export const bundleOperations = {
  getBundle: {
    method: 'GET',
    path: bundle.path,
    request: { params: bundle.request.params },
    response: bundle.responses[200].content['application/json'].schema
  },
  getCall: {
    method: 'GET',
    path: call.path,
    request: { params: call.request.params },
    response: call.responses[200].content['application/json'].schema
  },
  getCallExplanation: {
    method: 'GET',
    path: explanation.path,
    request: { params: explanation.request.params },
    response: explanation.responses[200].content['application/json'].schema
  },
  getRun: {
    method: 'GET',
    path: run.path,
    request: { params: run.request.params },
    response: run.responses[200].content['application/json'].schema
  },
  getProjectStrip: {
    method: 'GET',
    path: strip.path,
    request: { params: strip.request.params },
    response: strip.responses[200].content['application/json'].schema
  },
  approveBundle: {
    method: 'POST',
    path: approve.path,
    request: { params: approve.request.params, body: approve.request.body.content['application/json'].schema },
    response: approve.responses[200].content['application/json'].schema
  },
  getMyPreferences: {
    method: 'GET',
    path: preferences.path,
    response: preferences.responses[200].content['application/json'].schema
  },
  listMyMemberships: {
    method: 'GET',
    path: memberships.path,
    request: { query: memberships.request.query },
    response: memberships.responses[200].content['application/json'].schema
  }
}

export const apiFetch = createApiFetch(bundleOperations)
export const approvalConflict = approve.responses[409].content['application/problem+json'].schema
export type BundleView = ReturnType<typeof bundleOperations.getBundle.response.parse>
export type CallDetail = ReturnType<typeof bundleOperations.getCall.response.parse>
export type RunDetail = ReturnType<typeof bundleOperations.getRun.response.parse>
export type StripDetail = ReturnType<typeof bundleOperations.getProjectStrip.response.parse>
export type ApprovalBody = ReturnType<typeof bundleOperations.approveBundle.request.body.parse>
export type Conflict = ReturnType<typeof approvalConflict.parse>
