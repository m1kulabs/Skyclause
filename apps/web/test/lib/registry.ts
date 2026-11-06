import { Problem } from '@skyclause/contracts'

export const testRegistry = {
  getProjects: {
    method: 'GET',
    path: '/v1/orgs/{instance}/projects',
    request: {
      params: Problem.pick({ instance: true }),
      query: Problem.pick({ title: true })
    },
    response: Problem
  },
  createProject: {
    method: 'POST',
    path: '/v1/orgs/{instance}/projects',
    request: {
      params: Problem.pick({ instance: true }),
      body: Problem.pick({ detail: true })
    },
    response: Problem,
    idempotent: true
  }
} as const

export const validProblem = {
  type: 'https://example.test/problems/invalid-request',
  title: 'Invalid request',
  status: 422,
  detail: 'Check the request and try again.',
  instance: '/requests/test'
}
