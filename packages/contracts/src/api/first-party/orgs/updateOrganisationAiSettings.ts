import { createRoute } from '../../create-route'
import { AiSettings, AiSettingsInput, Forbidden, NotFound, OrgParams, Unauthorized, ValidationFailed } from './_shared'

export const updateOrganisationAiSettings = createRoute({
  method: 'patch',
  path: '/api/orgs/{org}/settings/ai',
  operationId: 'updateOrganisationAiSettings',
  tags: ['ai-settings'],
  request: {
    params: OrgParams,
    body: { required: true, content: { 'application/json': { schema: AiSettingsInput.partial() } } }
  },
  responses: {
    200: { description: 'Success.', content: { 'application/json': { schema: AiSettings } } },
    401: Unauthorized,
    403: Forbidden,
    404: NotFound,
    400: ValidationFailed
  },
  x: { owner: 'e-byok-api', statement: 'ai_keys.manage', idempotent: false }
})
