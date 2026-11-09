import { problemResponse, SessionErrors as sessionErrors } from '../../common'
import { z } from '@hono/zod-openapi'
import { AiKey, ExportJob, Instant, Membership, NotificationPreference } from '../../shared'

export const validationErrors = {
  ...sessionErrors,
  400: problemResponse('The request is invalid.')
}

export const membershipSummary = Membership.extend({ org_name: z.string(), org_slug: z.string() })

export const aiKeyWithTestResult = AiKey.extend({ last_test_result: z.enum(['passed', 'failed']).nullable() })

export const exportFormat = z.enum(['json', 'csv'])

export const exportSummary = ExportJob.extend({
  scope: z.literal('account'),
  format: exportFormat,
  created_at: Instant
})

export const notificationPreferences = z.object({ data: z.array(NotificationPreference) })

export const apiKeyScopes = z.enum(['read', 'draft', 'admin'])

export const aiProvider = z.enum(['google_ai_studio', 'vertex_ai', 'anthropic', 'openai', 'openrouter'])

export const aiKeyUsageSummary = z.object({
  month: z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/),
  tokens_in: z.number().int().nonnegative(),
  tokens_out: z.number().int().nonnegative(),
  estimated_cost_myr: z.number().nonnegative()
})
