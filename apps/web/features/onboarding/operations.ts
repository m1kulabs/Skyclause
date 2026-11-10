import {
  createProject as create,
  getOnboarding as onboarding,
  resumeOnboardingStep as resume,
  skipOnboardingStep as skip
} from '@skyclause/contracts/api/first-party/orgs'
import { listProjects as projects } from '@skyclause/contracts/api/v1/projects'
import { createApiFetch } from '../../lib/api-fetch'

export const onboardingOperations = {
  getOnboarding: {
    method: onboarding.method.toUpperCase(),
    path: onboarding.path,
    request: { params: onboarding.request.params },
    response: onboarding.responses[200].content['application/json'].schema
  },
  skipOnboardingStep: {
    method: skip.method.toUpperCase(),
    path: skip.path,
    request: { params: skip.request.params },
    response: skip.responses[200].content['application/json'].schema
  },
  resumeOnboardingStep: {
    method: resume.method.toUpperCase(),
    path: resume.path,
    request: { params: resume.request.params },
    response: resume.responses[200].content['application/json'].schema
  },
  createProject: {
    method: create.method.toUpperCase(),
    path: create.path,
    idempotent: create['x-skyclause'].idempotent,
    request: { params: create.request.params, body: create.request.body.content['application/json'].schema },
    response: create.responses[201].content['application/json'].schema
  },
  listProjects: {
    method: projects.method.toUpperCase(),
    path: projects.path,
    request: { query: projects.request.query },
    response: projects.responses[200].content['application/json'].schema
  }
}

export const onboardingApi = createApiFetch(onboardingOperations)
export type OnboardingView = ReturnType<typeof onboardingOperations.getOnboarding.response.parse>
export type ProjectView = ReturnType<typeof onboardingOperations.createProject.response.parse>
