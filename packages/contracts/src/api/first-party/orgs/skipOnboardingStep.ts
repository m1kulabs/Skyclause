import { createRoute } from '../../create-route'
import { Forbidden, NotFound, Onboarding, OnboardingStep, OrgParams, Unauthorized } from './_shared'

export const skipOnboardingStep = createRoute({
  method: 'post',
  path: '/api/orgs/{org}/onboarding/{step}/skip',
  operationId: 'skipOnboardingStep',
  tags: ['onboarding'],
  request: { params: OrgParams.extend({ step: OnboardingStep }) },
  responses: {
    200: { description: 'Success.', content: { 'application/json': { schema: Onboarding } } },
    401: Unauthorized,
    403: Forbidden,
    404: NotFound
  },
  x: { owner: 'b-create-project-ui', statement: 'session', idempotent: false }
})
