import {
  problemResponse,
  SessionErrors as sessionErrors,
  IdempotencyHeaders as idempotencyHeaders,
  UuidIdParams
} from '../common'
import { z } from '@hono/zod-openapi'
import { createRoute } from '../create-route'
import {
  AiKey,
  ApiKey,
  ExportJob,
  Instant,
  Membership,
  NotificationPreference,
  Page,
  PageQuery,
  Preferences
} from '../shared'

const validationErrors = {
  ...sessionErrors,
  400: problemResponse('The request is invalid.')
}

const membershipSummary = Membership.extend({ org_name: z.string(), org_slug: z.string() })
const aiKeyWithTestResult = AiKey.extend({ last_test_result: z.enum(['passed', 'failed']).nullable() })
const exportFormat = z.enum(['json', 'csv'])
const exportSummary = ExportJob.extend({
  scope: z.literal('account'),
  format: exportFormat,
  created_at: Instant
})
const notificationPreferences = z.object({ data: z.array(NotificationPreference) })

const apiKeyScopes = z.enum(['read', 'draft', 'admin'])
const aiProvider = z.enum(['google_ai_studio', 'vertex_ai', 'anthropic', 'openai', 'openrouter'])
const aiKeyUsageSummary = z.object({
  month: z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/),
  tokens_in: z.number().int().nonnegative(),
  tokens_out: z.number().int().nonnegative(),
  estimated_cost_myr: z.number().nonnegative()
})

export const listMyMemberships = createRoute({
  method: 'get',
  path: '/api/me/memberships',
  operationId: 'listMyMemberships',
  tags: ['Memberships'],
  request: { query: PageQuery },
  responses: {
    200: {
      description: 'The signed-in account’s organisation memberships.',
      content: { 'application/json': { schema: Page(membershipSummary) } }
    },
    ...sessionErrors
  },
  x: { owner: 'a-org-projects', statement: 'session', idempotent: false }
})

export const getMyPreferences = createRoute({
  method: 'get',
  path: '/api/me/preferences',
  operationId: 'getMyPreferences',
  tags: ['Preferences'],
  responses: {
    200: {
      description: 'The signed-in account’s preferences.',
      content: { 'application/json': { schema: Preferences } }
    },
    ...sessionErrors
  },
  x: { owner: 'a-account-settings', statement: 'session', idempotent: false }
})

export const updateMyPreferences = createRoute({
  method: 'patch',
  path: '/api/me/preferences',
  operationId: 'updateMyPreferences',
  tags: ['Preferences'],
  request: { body: { content: { 'application/json': { schema: Preferences.partial() } } } },
  responses: {
    200: { description: 'The updated account preferences.', content: { 'application/json': { schema: Preferences } } },
    ...validationErrors
  },
  x: { owner: 'a-account-settings', statement: 'session', idempotent: false }
})

export const updateMySecurity = createRoute({
  method: 'patch',
  path: '/api/me/security',
  operationId: 'updateMySecurity',
  tags: ['Security'],
  request: { body: { content: { 'application/json': { schema: z.object({ magic_link_enabled: z.boolean() }) } } } },
  responses: {
    200: {
      description: 'The updated account security setting.',
      content: { 'application/json': { schema: z.object({ magic_link_enabled: z.boolean() }) } }
    },
    ...validationErrors,
    401: problemResponse('Recent authentication is required to change account security settings.'),
    409: problemResponse('The change would remove the last sign-in method.')
  },
  x: { owner: 'a-account-settings', statement: 'session', idempotent: false }
})

export const listMyApiKeys = createRoute({
  method: 'get',
  path: '/api/me/api-keys',
  operationId: 'listMyApiKeys',
  tags: ['API Keys'],
  request: { query: PageQuery },
  responses: {
    200: {
      description: 'The signed-in account’s API keys.',
      content: { 'application/json': { schema: Page(ApiKey) } }
    },
    ...sessionErrors,
    403: problemResponse('The session cannot manage API keys.')
  },
  x: { owner: 'a-api-keys', statement: 'session', idempotent: false }
})

export const createMyApiKey = createRoute({
  method: 'post',
  path: '/api/me/api-keys',
  operationId: 'createMyApiKey',
  tags: ['API Keys'],
  request: {
    headers: idempotencyHeaders,
    body: {
      content: {
        'application/json': {
          schema: z.object({
            name: z.string().min(1),
            scopes: z.array(apiKeyScopes).min(1),
            expires_in_days: z.number().int().min(1).max(365)
          })
        }
      }
    }
  },
  responses: {
    201: {
      description: 'The created API key. The key is returned only once.',
      content: { 'application/json': { schema: ApiKey.extend({ key: z.string() }) } }
    },
    ...validationErrors,
    401: problemResponse('Recent authentication is required to create an API key.'),
    403: problemResponse('The session cannot create API keys.'),
    422: problemResponse('The idempotency key was already used with a different request.')
  },
  x: { owner: 'a-api-keys', statement: 'api_key.create', idempotent: true }
})

export const revokeMyApiKey = createRoute({
  method: 'delete',
  path: '/api/me/api-keys/{id}',
  operationId: 'revokeMyApiKey',
  tags: ['API Keys'],
  request: { params: UuidIdParams },
  responses: {
    204: { description: 'The API key was revoked immediately.' },
    ...sessionErrors,
    403: problemResponse('The session cannot revoke API keys.'),
    404: problemResponse('The API key does not exist for this account.')
  },
  x: { owner: 'a-api-keys', statement: 'session', idempotent: false }
})

export const listMyAiKeys = createRoute({
  method: 'get',
  path: '/api/me/ai-keys',
  operationId: 'listMyAiKeys',
  tags: ['AI Keys'],
  request: { query: PageQuery },
  responses: {
    200: {
      description: 'The signed-in account’s AI keys, without saved secrets.',
      content: { 'application/json': { schema: Page(aiKeyWithTestResult) } }
    },
    ...sessionErrors,
    403: problemResponse('Personal AI keys are not enabled for this account or organisation.')
  },
  x: { owner: 'e-byok-api', statement: 'session', idempotent: false }
})

export const createMyAiKey = createRoute({
  method: 'post',
  path: '/api/me/ai-keys',
  operationId: 'createMyAiKey',
  tags: ['AI Keys'],
  request: {
    headers: idempotencyHeaders,
    body: {
      content: {
        'application/json': {
          schema: z.object({
            provider: aiProvider,
            key: z.string().min(1),
            model: z.string().min(1),
            enabled: z.boolean(),
            declared_tier: z.string().min(1)
          })
        }
      }
    }
  },
  responses: {
    201: {
      description: 'The created AI key metadata. The saved secret is never returned.',
      content: { 'application/json': { schema: aiKeyWithTestResult } }
    },
    ...validationErrors,
    401: problemResponse('Recent authentication is required to create an AI key.'),
    403: problemResponse('Personal AI keys are not enabled for this account or organisation.'),
    422: problemResponse('The idempotency key was already used with a different request.')
  },
  x: { owner: 'e-byok-api', statement: 'session', idempotent: true }
})

export const deleteMyAiKey = createRoute({
  method: 'delete',
  path: '/api/me/ai-keys/{id}',
  operationId: 'deleteMyAiKey',
  tags: ['AI Keys'],
  request: { params: z.object({ id: z.string().min(1) }) },
  responses: {
    204: { description: 'The personal AI key was deleted.' },
    ...sessionErrors,
    403: problemResponse('Personal AI keys are not enabled for this account or organisation.'),
    404: problemResponse('The AI key does not exist for this account.')
  },
  x: { owner: 'e-byok-api', statement: 'session', idempotent: false }
})

export const testMyAiKey = createRoute({
  method: 'post',
  path: '/api/me/ai-keys/{id}/test',
  operationId: 'testMyAiKey',
  tags: ['AI Keys'],
  request: { params: z.object({ id: z.string().min(1) }) },
  responses: {
    200: {
      description: 'The key passed a minimal provider request.',
      content: {
        'application/json': { schema: z.object({ key_id: z.string(), model: z.string(), tested_at: Instant }) }
      }
    },
    ...sessionErrors,
    403: problemResponse('Personal AI keys are not enabled for this account or organisation.'),
    404: problemResponse('The AI key does not exist for this account.'),
    422: problemResponse('The provider rejected the saved key.')
  },
  x: { owner: 'e-byok-api', statement: 'session', idempotent: false }
})

export const getMyAiKeyUsage = createRoute({
  method: 'get',
  path: '/api/me/ai-keys/usage',
  operationId: 'getMyAiKeyUsage',
  tags: ['AI Keys'],
  responses: {
    200: {
      description: 'Monthly personal AI key usage totals.',
      content: { 'application/json': { schema: aiKeyUsageSummary } }
    },
    ...sessionErrors,
    403: problemResponse('Personal AI keys are not enabled for this account or organisation.')
  },
  x: { owner: 'e-byok-api', statement: 'session', idempotent: false }
})

export const listMyExports = createRoute({
  method: 'get',
  path: '/api/me/exports',
  operationId: 'listMyExports',
  tags: ['Data Rights'],
  request: { query: PageQuery },
  responses: {
    200: {
      description: 'The signed-in account’s export jobs.',
      content: { 'application/json': { schema: Page(exportSummary) } }
    },
    ...sessionErrors
  },
  x: { owner: 'a-data-rights', statement: 'session', idempotent: false }
})

export const createMyExport = createRoute({
  method: 'post',
  path: '/api/me/exports',
  operationId: 'createMyExport',
  tags: ['Data Rights'],
  request: {
    headers: idempotencyHeaders,
    body: { content: { 'application/json': { schema: z.object({ format: exportFormat }) } } }
  },
  responses: {
    202: { description: 'The account export was queued.', content: { 'application/json': { schema: exportSummary } } },
    ...validationErrors,
    403: problemResponse('The session cannot export account data.'),
    422: problemResponse('The idempotency key was already used with a different request.')
  },
  x: { owner: 'a-data-rights', statement: 'session', idempotent: true }
})

export const deleteMyAccount = createRoute({
  method: 'post',
  path: '/api/me/deletion',
  operationId: 'deleteMyAccount',
  tags: ['Data Rights'],
  request: {
    body: { content: { 'application/json': { schema: z.object({ typed_name: z.literal('delete account') }) } } }
  },
  responses: {
    202: {
      description: 'The account deletion was accepted.',
      content: { 'application/json': { schema: z.object({ deleted_at: Instant }) } }
    },
    ...validationErrors,
    409: problemResponse('The account must keep a sign-in method until deletion is confirmed.')
  },
  x: { owner: 'a-data-rights', statement: 'session', idempotent: false }
})

export const getMyNotificationPreferences = createRoute({
  method: 'get',
  path: '/api/me/notification-preferences',
  operationId: 'getMyNotificationPreferences',
  tags: ['Notifications'],
  responses: {
    200: {
      description: 'The signed-in account’s notification preferences.',
      content: { 'application/json': { schema: notificationPreferences } }
    },
    ...sessionErrors
  },
  x: { owner: 'c-notifications', statement: 'session', idempotent: false }
})

export const updateMyNotificationPreferences = createRoute({
  method: 'patch',
  path: '/api/me/notification-preferences',
  operationId: 'updateMyNotificationPreferences',
  tags: ['Notifications'],
  request: {
    body: {
      content: {
        'application/json': {
          schema: z.object({ preferences: z.array(NotificationPreference).min(1) })
        }
      }
    }
  },
  responses: {
    200: {
      description: 'The updated notification preferences.',
      content: { 'application/json': { schema: notificationPreferences } }
    },
    ...validationErrors
  },
  x: { owner: 'c-notifications', statement: 'session', idempotent: false }
})

export const routes = [
  listMyMemberships,
  getMyPreferences,
  updateMyPreferences,
  updateMySecurity,
  listMyApiKeys,
  createMyApiKey,
  revokeMyApiKey,
  listMyAiKeys,
  createMyAiKey,
  deleteMyAiKey,
  testMyAiKey,
  getMyAiKeyUsage,
  listMyExports,
  createMyExport,
  deleteMyAccount,
  getMyNotificationPreferences,
  updateMyNotificationPreferences
] as const
