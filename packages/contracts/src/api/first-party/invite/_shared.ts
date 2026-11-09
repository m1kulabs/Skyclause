import { z } from '@hono/zod-openapi'
import { Membership } from '../../shared'

export const membershipSummary = Membership.extend({ org_name: z.string(), org_slug: z.string() })
