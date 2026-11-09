import { ProblemContent as JsonProblem, JsonValue as AuditJson, UuidIdParams } from '../../common'
import { z } from '@hono/zod-openapi'
import { AUDIT_ACTIONS } from '../../../audit'
import { ROLES } from '../../../auth'
import { slugSchema } from '../../../slugs'
import {
  AiKey,
  ApiKey,
  ExportJob,
  Instant,
  Invitation,
  Membership,
  OAuthGrant,
  Organisation,
  RotaShift
} from '../../shared'

export const Id = UuidIdParams.shape.id

export const OrgParams = z.object({ org: z.union([Id, slugSchema]) })

export const OrgItemParams = OrgParams.extend(UuidIdParams.shape)

export const Role = z.enum(ROLES)

export const AssignableRole = Role.exclude(['owner', 'guest'])

export const ApiKeyScopes = ApiKey.shape.scopes.min(1)

export const OAuthScopes = OAuthGrant.shape.scopes.min(1)

export const Unauthorized = {
  description: 'A human session or recent authentication is required.',
  content: JsonProblem
}

export const Forbidden = { description: 'The session does not have permission for this action.', content: JsonProblem }

export const NotFound = {
  description: 'The organisation or resource is missing or belongs to another organisation.',
  content: JsonProblem
}

export const ValidationFailed = { description: 'Validation failed.', content: JsonProblem }

export const IdempotencyMismatch = {
  description: 'The idempotency key was reused with a different request body.',
  content: JsonProblem
}

export const NoContent = { description: 'The resource was removed.' }

// ORG-2/3 and DESIGN's member table; secrets and invitation tokens are never returned.
export const Member = Membership.extend({
  name: z.string(),
  email: z.email(),
  last_active_at: Instant.nullable(),
  sign_in_methods: z.array(z.string())
})

export const PendingInvitation = Invitation.extend({ expires_at: Instant })

export const CreateInvitation = Invitation.pick({ email: true }).extend({ role: AssignableRole })

// ORG-4: templates exist even when no approver is assigned.
export const LocalTime = z.string().regex(/^(?:[01]\d|2[0-3]):[0-5]\d$/)

export const ShiftCondition = z.enum(['storm_afternoon', 'surge_night'])

export const ShiftTemplate = RotaShift.pick({ template: true }).extend({
  local_start: LocalTime,
  local_end: LocalTime,
  condition: ShiftCondition.nullable()
})

export const ShiftInput = RotaShift.omit({ id: true }).extend({
  account_id: Id,
  project_id: Id.nullable(),
  local_start: LocalTime,
  local_end: LocalTime,
  condition: ShiftCondition.nullable()
})

export const Shift = ShiftInput.extend({ id: Id })

export const RotaSettings = z.object({ time_zone: z.string(), templates: z.array(ShiftTemplate) })

export const Rota = RotaSettings.extend({
  shifts: z.array(Shift),
  on_duty: z.array(z.object({ account_id: Id, shift_id: Id, until: Instant })),
  next_shift: Shift.nullable(),
  unstaffed_slots: z.array(z.object({ starts_at: Instant, ends_at: Instant, template: RotaShift.shape.template }))
})

// AUD-1/2: actor, client, target and before/after remain explicit on the wire.
export const AuditAction = z.enum(AUDIT_ACTIONS)

export const AuditEntry = z.object({
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

export const AuditFilters = z.object({
  action: AuditAction.optional(),
  actor_id: z.string().optional(),
  project_id: Id.optional(),
  from: Instant.optional(),
  to: Instant.optional()
})

// SET-5 and TRD BYOK: saved secrets stay write-only; model names are provider-defined.
export const KeyTestResult = z.object({ ok: z.boolean(), tested_at: Instant, detail: z.string().nullable() })

export const OrganisationAiKey = AiKey.extend({ last_test: KeyTestResult.nullable() })

export const ModelEntry = z.object({
  provider: AiKey.shape.provider,
  model: AiKey.shape.model,
  key_id: Id.nullable(),
  declared_tier: AiKey.shape.declared_tier
})

export const AiSettingsInput = Organisation.pick({ ai_fallback_enabled: true, allow_member_ai_keys: true }).extend({
  model_chain: z.array(ModelEntry)
})

export const AiSettings = AiSettingsInput.extend({ default_model: ModelEntry })

export const UsageMonth = z.string().regex(/^\d{4}-(?:0[1-9]|1[0-2])$/)

export const OrganisationExport = ExportJob.extend({
  created_at: Instant,
  download_url: z.url().nullable()
})

export const Deletion = Organisation.pick({ deletion_requested_at: true, purge_after: true })

// ORG-6 names the six onboarding actions; grading is the activation outcome.
export const OnboardingStep = z.enum(['organisation', 'project', 'sources', 'window', 'rota', 'channel'])

export const Onboarding = z.object({
  steps: z.array(z.object({ step: OnboardingStep, completed_at: Instant.nullable(), skipped: z.boolean() }))
})

// D37 and TRD MCP authorisation: client credentials are shown once on creation.
export const OAuthClientInput = z.object({
  client_name: z.string().min(1),
  redirect_uris: z.array(z.url()).min(1),
  scopes: OAuthScopes
})

export const OAuthClient = OAuthClientInput.extend({ id: Id, client_id: z.string(), created_at: Instant })

export const OrganisationOAuthGrant = OAuthGrant.extend({
  account_id: Id,
  client_name: z.string(),
  resource: z.enum(['api', 'mcp']),
  created_at: Instant
})
