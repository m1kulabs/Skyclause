import { IdempotencyHeaders, ProblemContent as JsonProblem, JsonValue as AuditJson, UuidIdParams } from '../common'
import { z } from '@hono/zod-openapi'
import { AUDIT_ACTIONS } from '../../audit'
import { ROLES } from '../../auth'
import { SLUG_REGEX, slugSchema } from '../../slugs'
import { createRoute } from '../create-route'
import {
  AiKey,
  AiUsage,
  ApiKey,
  ExportJob,
  Instant,
  Invitation,
  Membership,
  OAuthGrant,
  Organisation,
  OwnershipTransfer,
  Pack,
  Page,
  PageQuery,
  Project,
  RotaShift
} from '../shared'

const Id = UuidIdParams.shape.id
const OrgParams = z.object({ org: z.union([Id, slugSchema]) })
const OrgItemParams = OrgParams.extend(UuidIdParams.shape)

const Role = z.enum(ROLES)
// `owner` is syntactically a role so the service can return the contract's role-not-grantable problem (403).
const AssignableRole = Role.exclude(['guest'])
const ApiKeyScopes = ApiKey.shape.scopes.min(1)
const OAuthScopes = OAuthGrant.shape.scopes.min(1)

const Unauthorized = { description: 'A human session or recent authentication is required.', content: JsonProblem }
const Forbidden = { description: 'The session does not have permission for this action.', content: JsonProblem }
const NotFound = {
  description: 'The organisation or resource is missing or belongs to another organisation.',
  content: JsonProblem
}
const ValidationFailed = { description: 'Validation failed.', content: JsonProblem }
const IdempotencyMismatch = {
  description: 'The idempotency key was reused with a different request body.',
  content: JsonProblem
}
const NoContent = { description: 'The resource was removed.' }

// ORG-2/3 and DESIGN's member table; secrets and invitation tokens are never returned.
const Member = Membership.extend({
  name: z.string(),
  email: z.email(),
  last_active_at: Instant.nullable(),
  sign_in_methods: z.array(z.string())
})
const PendingInvitation = Invitation.extend({ expires_at: Instant })
const CreateInvitation = Invitation.pick({ email: true }).extend({ role: AssignableRole })

// ORG-4: templates exist even when no approver is assigned.
const LocalTime = z.string().regex(/^(?:[01]\d|2[0-3]):[0-5]\d$/)
const ShiftCondition = z.enum(['storm_afternoon', 'surge_night'])
const ShiftTemplate = RotaShift.pick({ template: true }).extend({
  local_start: LocalTime,
  local_end: LocalTime,
  condition: ShiftCondition.nullable()
})
const ShiftInput = RotaShift.omit({ id: true }).extend({
  account_id: Id,
  project_id: Id.nullable(),
  local_start: LocalTime,
  local_end: LocalTime,
  condition: ShiftCondition.nullable()
})
const Shift = ShiftInput.extend({ id: Id })
const RotaSettings = z.object({ time_zone: z.string(), templates: z.array(ShiftTemplate) })
const Rota = RotaSettings.extend({
  shifts: z.array(Shift),
  on_duty: z.array(z.object({ account_id: Id, shift_id: Id, until: Instant })),
  next_shift: z.object({ shift: Shift, starts_at: Instant, ends_at: Instant }).nullable(),
  unstaffed_slots: z.array(
    z.object({
      date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
      starts_at: Instant,
      ends_at: Instant,
      template: RotaShift.shape.template,
      condition_state: z.enum(['active', 'inactive', 'unknown'])
    })
  )
})
const RotaQuery = z.object({
  days: z.coerce.number().int().min(1).max(31).default(7),
  project_id: Id.optional()
})
const RotaReplacement = z
  .object({
    project_id: Id.nullable(),
    templates: z.array(ShiftTemplate),
    shifts: z.array(ShiftInput.omit({ project_id: true }))
  })
  .strict()

// AUD-1/2: actor, client, target and before/after remain explicit on the wire.
const AuditAction = z.enum(AUDIT_ACTIONS)

const AuditEntry = z.object({
  id: Id,
  project_id: Id.nullable(),
  actor_type: z.string(),
  actor_id: z.string().nullable(),
  actor_name: z.string().nullable(),
  actor_role: Role.nullable(),
  client: z.enum(['app', 'api', 'cli', 'mcp', 'playground', 'worker']),
  client_name: z.string().nullable(),
  action: AuditAction,
  target_type: z.string(),
  target_id: z.string(),
  before: AuditJson.nullable(),
  after: AuditJson.nullable(),
  created_at: Instant
})
const AuditFilters = z.object({
  action: AuditAction.optional(),
  actor_id: z.string().optional(),
  target_type: z.string().optional(),
  target_id: z.string().optional(),
  project_id: Id.optional(),
  from: Instant.optional(),
  to: Instant.optional()
})
const AuditExportQuery = AuditFilters.extend({ format: z.enum(['csv', 'json']).default('csv') })

// SET-5 and TRD BYOK: saved secrets stay write-only; model names are provider-defined.
const KeyTestResult = z.object({ ok: z.boolean(), tested_at: Instant, detail: z.string().nullable() })
const OrganisationAiKey = AiKey.extend({ last_test: KeyTestResult.nullable() })
const ModelEntry = z.object({
  provider: AiKey.shape.provider,
  model: AiKey.shape.model,
  key_id: Id.nullable(),
  declared_tier: AiKey.shape.declared_tier
})
const AiSettingsInput = Organisation.pick({ ai_fallback_enabled: true, allow_member_ai_keys: true }).extend({
  model_chain: z.array(ModelEntry)
})
const AiSettings = AiSettingsInput.extend({ default_model: ModelEntry })
const UsageMonth = z.string().regex(/^\d{4}-(?:0[1-9]|1[0-2])$/)

const OrganisationExport = ExportJob.extend({
  created_at: Instant,
  download_url: z.url().nullable()
})
const Deletion = Organisation.pick({ deletion_requested_at: true, purge_after: true })

// ORG-6 names the six onboarding actions; grading is the activation outcome.
const OnboardingStep = z.enum(['organisation', 'project', 'sources', 'window', 'rota', 'channel'])
const Onboarding = z.object({
  steps: z.array(z.object({ step: OnboardingStep, completed_at: Instant.nullable(), skipped: z.boolean() }))
})

// D37 and TRD MCP authorisation: client credentials are shown once on creation.
const OAuthClientInput = z.object({
  client_name: z.string().min(1),
  redirect_uris: z.array(z.url()).min(1),
  scopes: OAuthScopes
})
const OAuthClient = OAuthClientInput.extend({ id: Id, client_id: z.string(), created_at: Instant })
const OrganisationOAuthGrant = OAuthGrant.extend({
  account_id: Id,
  client_name: z.string(),
  resource: z.enum(['api', 'mcp']),
  created_at: Instant
})

export const createOrganisation = createRoute({
  method: 'post',
  path: '/api/orgs',
  operationId: 'createOrganisation',
  tags: ['organisations'],
  request: {
    headers: IdempotencyHeaders,
    body: {
      required: true,
      content: { 'application/json': { schema: z.object({ name: z.string().min(1), slug: slugSchema }).strict() } }
    }
  },
  responses: {
    201: { description: 'Created.', content: { 'application/json': { schema: Organisation } } },
    401: Unauthorized,
    403: Forbidden,
    400: ValidationFailed,
    422: IdempotencyMismatch,
    409: { description: 'slug-reserved or slug-taken: the organisation slug is unavailable.', content: JsonProblem }
  },
  x: { owner: 'a-org-projects', statement: 'session', idempotent: true }
})

export const updateOrganisation = createRoute({
  method: 'patch',
  path: '/api/orgs/{org}',
  operationId: 'updateOrganisation',
  tags: ['organisations'],
  request: {
    params: OrgParams,
    body: {
      required: true,
      content: {
        'application/json': {
          schema: z.object({ name: z.string().min(1).optional(), slug: slugSchema.optional() }).strict()
        }
      }
    }
  },
  responses: {
    200: { description: 'Success.', content: { 'application/json': { schema: Organisation } } },
    401: Unauthorized,
    403: Forbidden,
    404: NotFound,
    400: ValidationFailed,
    409: { description: 'slug-reserved or slug-taken: the organisation slug is unavailable.', content: JsonProblem }
  },
  x: { owner: 'a-org-projects', statement: 'org.manage', idempotent: false }
})

export const listMembers = createRoute({
  method: 'get',
  path: '/api/orgs/{org}/members',
  operationId: 'listMembers',
  tags: ['members'],
  request: { params: OrgParams, query: PageQuery },
  responses: {
    200: { description: 'Success.', content: { 'application/json': { schema: Page(Member) } } },
    401: Unauthorized,
    403: Forbidden,
    404: NotFound,
    400: ValidationFailed
  },
  x: { owner: 'a-members-api', statement: 'members.manage', idempotent: false }
})

export const updateMember = createRoute({
  method: 'patch',
  path: '/api/orgs/{org}/members/{id}',
  operationId: 'updateMember',
  tags: ['members'],
  request: {
    params: OrgItemParams,
    body: {
      required: true,
      content: {
        'application/json': {
          schema: z
            .object({ role: AssignableRole.optional(), reads_malay: Membership.shape.reads_malay.optional() })
            .strict()
        }
      }
    }
  },
  responses: {
    200: { description: 'Success.', content: { 'application/json': { schema: Member } } },
    401: Unauthorized,
    403: {
      description: 'insufficient-scope or role-not-grantable: the role cannot be assigned by this session.',
      content: JsonProblem
    },
    404: NotFound,
    400: ValidationFailed,
    409: { description: 'last-owner: the organisation must retain an Owner.', content: JsonProblem }
  },
  x: { owner: 'a-members-api', statement: 'members.manage', idempotent: false }
})

export const removeMember = createRoute({
  method: 'delete',
  path: '/api/orgs/{org}/members/{id}',
  operationId: 'removeMember',
  tags: ['members'],
  request: { params: OrgItemParams },
  responses: {
    204: NoContent,
    401: Unauthorized,
    403: Forbidden,
    404: NotFound,
    409: { description: 'last-owner: the last Owner cannot be removed.', content: JsonProblem }
  },
  x: { owner: 'a-members-api', statement: 'members.manage', idempotent: false }
})

export const listInvitations = createRoute({
  method: 'get',
  path: '/api/orgs/{org}/invitations',
  operationId: 'listInvitations',
  tags: ['invitations'],
  request: { params: OrgParams, query: PageQuery },
  responses: {
    200: { description: 'Success.', content: { 'application/json': { schema: Page(PendingInvitation) } } },
    401: Unauthorized,
    403: Forbidden,
    404: NotFound,
    400: ValidationFailed
  },
  x: { owner: 'a-members-api', statement: 'members.manage', idempotent: false }
})

export const createInvitation = createRoute({
  method: 'post',
  path: '/api/orgs/{org}/invitations',
  operationId: 'createInvitation',
  tags: ['invitations'],
  request: {
    params: OrgParams,
    headers: IdempotencyHeaders,
    body: { required: true, content: { 'application/json': { schema: CreateInvitation } } }
  },
  responses: {
    201: { description: 'Created.', content: { 'application/json': { schema: PendingInvitation } } },
    401: Unauthorized,
    403: { description: 'insufficient-scope or role-not-grantable: the role cannot be granted.', content: JsonProblem },
    404: NotFound,
    400: ValidationFailed,
    422: IdempotencyMismatch
  },
  x: { owner: 'a-members-api', statement: 'members.manage', idempotent: true }
})

export const revokeInvitation = createRoute({
  method: 'delete',
  path: '/api/orgs/{org}/invitations/{id}',
  operationId: 'revokeInvitation',
  tags: ['invitations'],
  request: { params: OrgItemParams },
  responses: {
    204: NoContent,
    401: Unauthorized,
    403: Forbidden,
    404: NotFound
  },
  x: { owner: 'a-members-api', statement: 'members.manage', idempotent: false }
})

export const resendInvitation = createRoute({
  method: 'post',
  path: '/api/orgs/{org}/invitations/{id}/resend',
  operationId: 'resendInvitation',
  tags: ['invitations'],
  request: { params: OrgItemParams },
  responses: {
    200: { description: 'Success.', content: { 'application/json': { schema: PendingInvitation } } },
    401: Unauthorized,
    403: Forbidden,
    404: NotFound,
    410: { description: 'invite-withdrawn: the invitation was revoked.', content: JsonProblem }
  },
  x: { owner: 'a-members-api', statement: 'members.manage', idempotent: false }
})

export const createOwnershipTransfer = createRoute({
  method: 'post',
  path: '/api/orgs/{org}/ownership-transfers',
  operationId: 'createOwnershipTransfer',
  tags: ['members'],
  request: {
    params: OrgParams,
    headers: IdempotencyHeaders,
    body: {
      required: true,
      content: { 'application/json': { schema: OwnershipTransfer.pick({ to_member_id: true }) } }
    }
  },
  responses: {
    201: { description: 'Created.', content: { 'application/json': { schema: OwnershipTransfer } } },
    401: Unauthorized,
    403: Forbidden,
    404: NotFound,
    400: ValidationFailed,
    422: IdempotencyMismatch
  },
  x: { owner: 'a-members-api', statement: 'members.manage', idempotent: true }
})

export const cancelOwnershipTransfer = createRoute({
  method: 'delete',
  path: '/api/orgs/{org}/ownership-transfers/{id}',
  operationId: 'cancelOwnershipTransfer',
  tags: ['members'],
  request: { params: OrgItemParams },
  responses: {
    204: NoContent,
    401: Unauthorized,
    403: Forbidden,
    404: NotFound,
    409: { description: 'The transfer is no longer pending.', content: JsonProblem }
  },
  x: { owner: 'a-members-api', statement: 'members.manage', idempotent: false }
})

const TokenParam = z.object({
  token: z
    .string()
    .min(1)
    .max(128)
    .regex(/^[A-Za-z0-9_-]+$/)
})
const TokenState = z.object({
  kind: z.enum(['invitation', 'ownership_transfer']),
  state: z.enum(['valid', 'expired', 'withdrawn', 'used'])
})

export const inspectMemberToken = createRoute({
  method: 'get',
  path: '/api/invite/{token}',
  operationId: 'inspectMemberToken',
  tags: ['invitations'],
  request: { params: TokenParam },
  responses: {
    200: {
      description: 'Token kind and state; no personal data.',
      content: { 'application/json': { schema: TokenState } }
    },
    404: NotFound,
    429: { description: 'Too many token lookups.', content: JsonProblem }
  },
  x: { owner: 'a-members-api', statement: 'token', idempotent: false }
})

export const getRota = createRoute({
  method: 'get',
  path: '/api/orgs/{org}/rota',
  operationId: 'getRota',
  tags: ['rota'],
  request: { params: OrgParams, query: RotaQuery },
  responses: {
    200: { description: 'Success.', content: { 'application/json': { schema: Rota } } },
    401: Unauthorized,
    403: Forbidden,
    404: NotFound
  },
  x: { owner: 'a-members-api', statement: 'rota.manage', idempotent: false }
})

export const updateRota = createRoute({
  method: 'patch',
  path: '/api/orgs/{org}/rota',
  operationId: 'updateRota',
  tags: ['rota'],
  request: {
    params: OrgParams,
    body: { required: true, content: { 'application/json': { schema: RotaSettings.partial() } } }
  },
  responses: {
    200: { description: 'Success.', content: { 'application/json': { schema: Rota } } },
    401: Unauthorized,
    403: Forbidden,
    404: NotFound,
    400: ValidationFailed
  },
  x: { owner: 'a-members-api', statement: 'rota.manage', idempotent: false }
})

export const replaceRotaShifts = createRoute({
  method: 'put',
  path: '/api/orgs/{org}/rota/shifts',
  operationId: 'replaceRotaShifts',
  tags: ['rota'],
  request: {
    params: OrgParams,
    headers: IdempotencyHeaders,
    body: { required: true, content: { 'application/json': { schema: RotaReplacement } } }
  },
  responses: {
    200: { description: 'The shifts for this scope were replaced.', content: { 'application/json': { schema: Rota } } },
    401: Unauthorized,
    403: Forbidden,
    404: NotFound,
    400: ValidationFailed,
    422: IdempotencyMismatch
  },
  x: { owner: 'a-members-api', statement: 'rota.manage', idempotent: true }
})

export const createRotaShift = createRoute({
  method: 'post',
  path: '/api/orgs/{org}/rota/shifts',
  operationId: 'createRotaShift',
  tags: ['rota'],
  request: {
    params: OrgParams,
    headers: IdempotencyHeaders,
    body: { required: true, content: { 'application/json': { schema: ShiftInput } } }
  },
  responses: {
    201: { description: 'Created.', content: { 'application/json': { schema: Shift } } },
    401: Unauthorized,
    403: Forbidden,
    404: NotFound,
    400: ValidationFailed,
    422: IdempotencyMismatch
  },
  x: { owner: 'a-members-api', statement: 'rota.manage', idempotent: true }
})

export const updateRotaShift = createRoute({
  method: 'patch',
  path: '/api/orgs/{org}/rota/shifts/{id}',
  operationId: 'updateRotaShift',
  tags: ['rota'],
  request: {
    params: OrgItemParams,
    body: { required: true, content: { 'application/json': { schema: ShiftInput.partial() } } }
  },
  responses: {
    200: { description: 'Success.', content: { 'application/json': { schema: Shift } } },
    401: Unauthorized,
    403: Forbidden,
    404: NotFound,
    400: ValidationFailed
  },
  x: { owner: 'a-members-api', statement: 'rota.manage', idempotent: false }
})

export const deleteRotaShift = createRoute({
  method: 'delete',
  path: '/api/orgs/{org}/rota/shifts/{id}',
  operationId: 'deleteRotaShift',
  tags: ['rota'],
  request: { params: OrgItemParams },
  responses: {
    204: NoContent,
    401: Unauthorized,
    403: Forbidden,
    404: NotFound
  },
  x: { owner: 'a-members-api', statement: 'rota.manage', idempotent: false }
})

export const listAuditEntries = createRoute({
  method: 'get',
  path: '/api/orgs/{org}/audit',
  operationId: 'listAuditEntries',
  tags: ['audit'],
  request: { params: OrgParams, query: PageQuery.extend(AuditFilters.shape) },
  responses: {
    200: { description: 'Success.', content: { 'application/json': { schema: Page(AuditEntry) } } },
    401: Unauthorized,
    403: Forbidden,
    404: NotFound,
    400: ValidationFailed
  },
  x: { owner: 'a-audit-log', statement: 'audit.view', idempotent: false }
})

export const exportAuditLog = createRoute({
  method: 'get',
  path: '/api/orgs/{org}/audit/export',
  operationId: 'exportAuditLog',
  tags: ['audit'],
  request: { params: OrgParams, query: AuditExportQuery },
  responses: {
    200: {
      description: 'Success.',
      content: {
        'text/csv': { schema: z.string() },
        'application/json': { schema: z.array(AuditEntry) }
      }
    },
    401: Unauthorized,
    403: Forbidden,
    404: NotFound,
    400: ValidationFailed
  },
  x: { owner: 'a-audit-log', statement: 'audit.view', idempotent: false }
})

export const listOrganisationApiKeys = createRoute({
  method: 'get',
  path: '/api/orgs/{org}/api-keys',
  operationId: 'listOrganisationApiKeys',
  tags: ['api-keys'],
  request: { params: OrgParams, query: PageQuery },
  responses: {
    200: { description: 'Success.', content: { 'application/json': { schema: Page(ApiKey) } } },
    401: Unauthorized,
    403: Forbidden,
    404: NotFound,
    400: ValidationFailed
  },
  x: { owner: 'a-api-keys', statement: 'api_key.create', idempotent: false }
})

export const createOrganisationApiKey = createRoute({
  method: 'post',
  path: '/api/orgs/{org}/api-keys',
  operationId: 'createOrganisationApiKey',
  tags: ['api-keys'],
  request: {
    params: OrgParams,
    headers: IdempotencyHeaders,
    body: {
      required: true,
      content: {
        'application/json': {
          schema: ApiKey.pick({ name: true, expires_at: true })
            .extend({ scopes: ApiKeyScopes })
            .describe('Expiry must be no more than 365 days after creation.')
        }
      }
    }
  },
  responses: {
    201: {
      description: 'Created.',
      content: {
        'application/json': {
          schema: ApiKey.extend({ key: z.string().describe('Shown only in the creation response.') })
        }
      }
    },
    401: Unauthorized,
    403: Forbidden,
    404: NotFound,
    400: ValidationFailed,
    422: IdempotencyMismatch
  },
  x: { owner: 'a-api-keys', statement: 'api_key.create', idempotent: true }
})

export const revokeOrganisationApiKey = createRoute({
  method: 'delete',
  path: '/api/orgs/{org}/api-keys/{id}',
  operationId: 'revokeOrganisationApiKey',
  tags: ['api-keys'],
  request: { params: OrgItemParams },
  responses: {
    204: NoContent,
    401: Unauthorized,
    403: Forbidden,
    404: NotFound
  },
  x: { owner: 'a-api-keys', statement: 'api_key.create', idempotent: false }
})

export const listOrganisationAiKeys = createRoute({
  method: 'get',
  path: '/api/orgs/{org}/ai-keys',
  operationId: 'listOrganisationAiKeys',
  tags: ['ai-keys'],
  request: { params: OrgParams, query: PageQuery },
  responses: {
    200: { description: 'Success.', content: { 'application/json': { schema: Page(OrganisationAiKey) } } },
    401: Unauthorized,
    403: Forbidden,
    404: NotFound,
    400: ValidationFailed
  },
  x: { owner: 'e-byok-api', statement: 'ai_keys.manage', idempotent: false }
})

export const createOrganisationAiKey = createRoute({
  method: 'post',
  path: '/api/orgs/{org}/ai-keys',
  operationId: 'createOrganisationAiKey',
  tags: ['ai-keys'],
  request: {
    params: OrgParams,
    headers: IdempotencyHeaders,
    body: {
      required: true,
      content: {
        'application/json': {
          schema: AiKey.pick({
            provider: true,
            model: true,
            enabled: true,
            declared_tier: true,
            priority: true
          }).extend({ key: z.string().min(1).meta({ writeOnly: true }) })
        }
      }
    }
  },
  responses: {
    201: { description: 'Created.', content: { 'application/json': { schema: OrganisationAiKey } } },
    401: Unauthorized,
    403: Forbidden,
    404: NotFound,
    400: ValidationFailed,
    422: {
      description: 'validation-failed, idempotency-mismatch or key-test-failed: a failing key cannot be enabled.',
      content: JsonProblem
    },
    409: { description: 'conflict: this key is already saved for this organisation.', content: JsonProblem }
  },
  x: { owner: 'e-byok-api', statement: 'ai_keys.manage', idempotent: true }
})

export const updateOrganisationAiKey = createRoute({
  method: 'patch',
  path: '/api/orgs/{org}/ai-keys/{id}',
  operationId: 'updateOrganisationAiKey',
  tags: ['ai-keys'],
  request: {
    params: OrgItemParams,
    body: {
      required: true,
      content: {
        'application/json': {
          schema: AiKey.pick({ enabled: true, priority: true, declared_tier: true }).partial()
        }
      }
    }
  },
  responses: {
    200: { description: 'Success.', content: { 'application/json': { schema: OrganisationAiKey } } },
    401: Unauthorized,
    403: Forbidden,
    404: NotFound,
    400: ValidationFailed,
    422: { description: 'key-test-failed: a key whose last test failed cannot be enabled.', content: JsonProblem }
  },
  x: { owner: 'e-byok-api', statement: 'ai_keys.manage', idempotent: false }
})

export const deleteOrganisationAiKey = createRoute({
  method: 'delete',
  path: '/api/orgs/{org}/ai-keys/{id}',
  operationId: 'deleteOrganisationAiKey',
  tags: ['ai-keys'],
  request: { params: OrgItemParams },
  responses: {
    204: NoContent,
    401: Unauthorized,
    403: Forbidden,
    404: NotFound
  },
  x: { owner: 'e-byok-api', statement: 'ai_keys.manage', idempotent: false }
})

export const testOrganisationAiKey = createRoute({
  method: 'post',
  path: '/api/orgs/{org}/ai-keys/{id}/test',
  operationId: 'testOrganisationAiKey',
  tags: ['ai-keys'],
  request: { params: OrgItemParams },
  responses: {
    200: { description: 'Success.', content: { 'application/json': { schema: KeyTestResult } } },
    401: Unauthorized,
    403: Forbidden,
    404: NotFound,
    422: { description: 'key-test-failed: the minimal provider call failed.', content: JsonProblem },
    429: { description: 'rate-limited: the key was tested too many times in the last hour.', content: JsonProblem }
  },
  x: { owner: 'e-byok-api', statement: 'ai_keys.manage', idempotent: false }
})

export const getOrganisationAiKeyUsage = createRoute({
  method: 'get',
  path: '/api/orgs/{org}/ai-keys/usage',
  operationId: 'getOrganisationAiKeyUsage',
  tags: ['ai-keys'],
  request: { params: OrgParams, query: PageQuery.extend({ month: UsageMonth.optional(), key_id: Id.optional() }) },
  responses: {
    200: {
      description: 'Success.',
      content: { 'application/json': { schema: Page(AiUsage.extend({ estimated_cost: z.number().nonnegative() })) } }
    },
    401: Unauthorized,
    403: Forbidden,
    404: NotFound,
    400: ValidationFailed
  },
  x: { owner: 'e-byok-api', statement: 'ai_keys.manage', idempotent: false }
})

export const getOrganisationAiSettings = createRoute({
  method: 'get',
  path: '/api/orgs/{org}/settings/ai',
  operationId: 'getOrganisationAiSettings',
  tags: ['ai-settings'],
  request: { params: OrgParams },
  responses: {
    200: { description: 'Success.', content: { 'application/json': { schema: AiSettings } } },
    401: Unauthorized,
    403: Forbidden,
    404: NotFound
  },
  x: { owner: 'e-byok-api', statement: 'ai_keys.manage', idempotent: false }
})

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

export const listOrganisationExports = createRoute({
  method: 'get',
  path: '/api/orgs/{org}/exports',
  operationId: 'listOrganisationExports',
  tags: ['exports'],
  request: { params: OrgParams, query: PageQuery },
  responses: {
    200: { description: 'Success.', content: { 'application/json': { schema: Page(OrganisationExport) } } },
    401: Unauthorized,
    403: Forbidden,
    404: NotFound,
    400: ValidationFailed
  },
  x: { owner: 'a-data-rights', statement: 'org.export', idempotent: false }
})

export const createOrganisationExport = createRoute({
  method: 'post',
  path: '/api/orgs/{org}/exports',
  operationId: 'createOrganisationExport',
  tags: ['exports'],
  request: {
    params: OrgParams,
    headers: IdempotencyHeaders,
    body: {
      required: true,
      content: { 'application/json': { schema: z.object({ formats: z.array(z.enum(['json', 'csv'])).min(1) }) } }
    }
  },
  responses: {
    202: { description: 'Accepted.', content: { 'application/json': { schema: OrganisationExport } } },
    401: Unauthorized,
    403: Forbidden,
    404: NotFound,
    400: ValidationFailed,
    422: IdempotencyMismatch,
    409: { description: 'export-pending: an export is already being prepared.', content: JsonProblem },
    503: { description: 'The export could not be queued right now.', content: JsonProblem }
  },
  x: { owner: 'a-data-rights', statement: 'org.export', idempotent: true }
})

export const getOrganisationDeletion = createRoute({
  method: 'get',
  path: '/api/orgs/{org}/deletion',
  operationId: 'getOrganisationDeletion',
  tags: ['deletion'],
  request: { params: OrgParams },
  responses: {
    200: { description: 'Success.', content: { 'application/json': { schema: Deletion } } },
    401: Unauthorized,
    403: Forbidden,
    404: NotFound
  },
  x: { owner: 'a-data-rights', statement: 'org.delete', idempotent: false }
})

export const requestOrganisationDeletion = createRoute({
  method: 'post',
  path: '/api/orgs/{org}/deletion',
  operationId: 'requestOrganisationDeletion',
  tags: ['deletion'],
  request: {
    params: OrgParams,
    body: {
      required: true,
      content: {
        'application/json': {
          schema: z
            .object({ slug: slugSchema })
            .strict()
            .describe('Type the organisation slug to start the 30-day deletion grace period.')
        }
      }
    }
  },
  responses: {
    202: { description: 'Accepted.', content: { 'application/json': { schema: Deletion } } },
    401: Unauthorized,
    403: Forbidden,
    404: NotFound,
    400: ValidationFailed
  },
  x: { owner: 'a-data-rights', statement: 'org.delete', idempotent: false }
})

export const cancelOrganisationDeletion = createRoute({
  method: 'delete',
  path: '/api/orgs/{org}/deletion',
  operationId: 'cancelOrganisationDeletion',
  tags: ['deletion'],
  request: { params: OrgParams },
  responses: {
    200: { description: 'Success.', content: { 'application/json': { schema: Deletion } } },
    401: Unauthorized,
    403: Forbidden,
    404: NotFound
  },
  x: { owner: 'a-data-rights', statement: 'org.delete', idempotent: false }
})

export const getOnboarding = createRoute({
  method: 'get',
  path: '/api/orgs/{org}/onboarding',
  operationId: 'getOnboarding',
  tags: ['onboarding'],
  request: { params: OrgParams },
  responses: {
    200: { description: 'Success.', content: { 'application/json': { schema: Onboarding } } },
    401: Unauthorized,
    403: Forbidden,
    404: NotFound
  },
  x: { owner: 'b-create-project-ui', statement: 'session', idempotent: false }
})

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

export const createProject = createRoute({
  method: 'post',
  path: '/api/orgs/{org}/projects',
  operationId: 'createProject',
  tags: ['projects'],
  request: {
    params: OrgParams,
    headers: IdempotencyHeaders,
    body: {
      required: true,
      content: {
        'application/json': {
          schema: z
            .object({
              name: z.string().min(1),
              slug: z.string().regex(SLUG_REGEX),
              site_name: z.string().min(1),
              site_lat: z.number(),
              site_lon: z.number(),
              time_zone: Project.shape.time_zone.default('Asia/Kuala_Lumpur'),
              packs: z.array(Pack).min(1),
              semester_ends_on: Project.shape.semester_ends_on.optional(),
              camera_day_start: Project.shape.camera_day_start.optional(),
              camera_day_end: Project.shape.camera_day_end.optional(),
              warning_area_terms: Project.shape.warning_area_terms.optional()
            })
            .strict()
        }
      }
    }
  },
  responses: {
    201: { description: 'Created.', content: { 'application/json': { schema: Project } } },
    401: Unauthorized,
    403: Forbidden,
    404: NotFound,
    400: ValidationFailed,
    422: {
      description:
        'validation-failed, idempotency-mismatch, slug-reserved, slug-taken or pack-prerequisites: Crowd needs a venue and rail station.',
      content: JsonProblem
    },
    409: { description: 'slug-reserved or slug-taken: the project slug is unavailable.', content: JsonProblem }
  },
  x: { owner: 'b-projects-api', statement: 'project.manage', idempotent: true }
})

export const listOauthClients = createRoute({
  method: 'get',
  path: '/api/orgs/{org}/oauth-clients',
  operationId: 'listOauthClients',
  tags: ['oauth-clients'],
  request: { params: OrgParams, query: PageQuery },
  responses: {
    200: { description: 'Success.', content: { 'application/json': { schema: Page(OAuthClient) } } },
    401: Unauthorized,
    403: Forbidden,
    404: NotFound,
    400: ValidationFailed
  },
  x: { owner: 'e-mcp-auth', statement: 'integrations.manage', idempotent: false }
})

export const createOauthClient = createRoute({
  method: 'post',
  path: '/api/orgs/{org}/oauth-clients',
  operationId: 'createOauthClient',
  tags: ['oauth-clients'],
  request: {
    params: OrgParams,
    headers: IdempotencyHeaders,
    body: { required: true, content: { 'application/json': { schema: OAuthClientInput } } }
  },
  responses: {
    201: {
      description: 'Created.',
      content: {
        'application/json': {
          schema: OAuthClient.extend({ client_secret: z.string().describe('Shown only in the creation response.') })
        }
      }
    },
    401: Unauthorized,
    403: Forbidden,
    404: NotFound,
    400: ValidationFailed,
    422: IdempotencyMismatch
  },
  x: { owner: 'e-mcp-auth', statement: 'integrations.manage', idempotent: true }
})

export const deleteOauthClient = createRoute({
  method: 'delete',
  path: '/api/orgs/{org}/oauth-clients/{id}',
  operationId: 'deleteOauthClient',
  tags: ['oauth-clients'],
  request: { params: OrgItemParams },
  responses: {
    204: NoContent,
    401: Unauthorized,
    403: Forbidden,
    404: NotFound
  },
  x: { owner: 'e-mcp-auth', statement: 'integrations.manage', idempotent: false }
})

export const listOauthGrants = createRoute({
  method: 'get',
  path: '/api/orgs/{org}/oauth-grants',
  operationId: 'listOauthGrants',
  tags: ['oauth-grants'],
  request: { params: OrgParams, query: PageQuery },
  responses: {
    200: { description: 'Success.', content: { 'application/json': { schema: Page(OrganisationOAuthGrant) } } },
    401: Unauthorized,
    403: Forbidden,
    404: NotFound,
    400: ValidationFailed
  },
  x: { owner: 'e-mcp-auth', statement: 'integrations.manage', idempotent: false }
})

export const revokeOauthGrant = createRoute({
  method: 'delete',
  path: '/api/orgs/{org}/oauth-grants/{id}',
  operationId: 'revokeOauthGrant',
  tags: ['oauth-grants'],
  request: { params: OrgItemParams },
  responses: {
    204: NoContent,
    401: Unauthorized,
    403: Forbidden,
    404: NotFound
  },
  x: { owner: 'e-mcp-auth', statement: 'integrations.manage', idempotent: false }
})

export const routes = [
  createOrganisation,
  updateOrganisation,
  listMembers,
  updateMember,
  removeMember,
  listInvitations,
  createInvitation,
  revokeInvitation,
  resendInvitation,
  createOwnershipTransfer,
  cancelOwnershipTransfer,
  inspectMemberToken,
  getRota,
  updateRota,
  replaceRotaShifts,
  createRotaShift,
  updateRotaShift,
  deleteRotaShift,
  listAuditEntries,
  exportAuditLog,
  listOrganisationApiKeys,
  createOrganisationApiKey,
  revokeOrganisationApiKey,
  listOrganisationAiKeys,
  createOrganisationAiKey,
  updateOrganisationAiKey,
  deleteOrganisationAiKey,
  testOrganisationAiKey,
  getOrganisationAiKeyUsage,
  getOrganisationAiSettings,
  updateOrganisationAiSettings,
  listOrganisationExports,
  createOrganisationExport,
  getOrganisationDeletion,
  requestOrganisationDeletion,
  cancelOrganisationDeletion,
  getOnboarding,
  skipOnboardingStep,
  createProject,
  listOauthClients,
  createOauthClient,
  deleteOauthClient,
  listOauthGrants,
  revokeOauthGrant
] as const
