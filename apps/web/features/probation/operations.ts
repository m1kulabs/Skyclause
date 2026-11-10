import { REGISTRY } from '@skyclause/contracts'
import { createApiFetch } from '../../lib/api-fetch'

const setProbation = REGISTRY.find((route) => route.operationId === 'setSourceProbation')!
const nextFrame = REGISTRY.find((route) => route.operationId === 'getNextProbationFrame')!
const createLabel = REGISTRY.find((route) => route.operationId === 'createProbationLabel')!
const members = REGISTRY.find((route) => route.operationId === 'listMembers')!

const frameSchema = nextFrame.responses[200].content['application/json'].schema

export const probationOperations = {
  setSourceProbation: {
    method: setProbation.method,
    path: setProbation.path,
    request: {
      params: setProbation.request.params,
      body: setProbation.request.body.content['application/json'].schema
    },
    response: setProbation.responses[200].content['application/json'].schema
  },
  getNextProbationFrame: {
    method: nextFrame.method,
    path: nextFrame.path,
    request: { params: nextFrame.request.params },
    // A 204 carries no body; surface it as an empty marker for the empty state.
    response: {
      parse: (value: unknown) => (value === undefined ? { empty: true as const } : frameSchema.parse(value))
    }
  },
  createProbationLabel: {
    method: createLabel.method,
    path: createLabel.path,
    request: {
      params: createLabel.request.params,
      headers: createLabel.request.headers,
      body: createLabel.request.body.content['application/json'].schema
    },
    response: createLabel.responses[201].content['application/json'].schema,
    idempotent: true
  },
  listMembers: {
    method: members.method,
    path: members.path,
    request: { params: members.request.params, query: members.request.query },
    response: members.responses[200].content['application/json'].schema
  }
}

export const apiFetch = createApiFetch(probationOperations)

export const labelValues = ['landmark_visible', 'obscured'] as const
export type LabelValue = (typeof labelValues)[number]

export type ProbationStatus = ReturnType<typeof probationOperations.setSourceProbation.response.parse>
export type NextResult = ReturnType<typeof probationOperations.getNextProbationFrame.response.parse>
export type ProbationFrame = Exclude<NextResult, { empty: true }>
export type Member = ReturnType<typeof probationOperations.listMembers.response.parse>['data'][number]
