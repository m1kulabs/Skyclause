import { z } from '@hono/zod-openapi'
import { Instant } from '../../shared'

export const GuestBlock = z.object({
  id: z.string(),
  subject_kind: z.enum(['device', 'ip']),
  subject_hash: z.string(),
  reason: z.string(),
  created_at: Instant
})

export const IncidentUpdate = z.object({ id: z.string(), status: z.string(), body: z.string(), at: Instant })

export const Incident = z.object({
  id: z.string(),
  title: z.string(),
  scope: z.enum(['ours', 'source']),
  component: z.string(),
  source_id: z.string().nullable(),
  created_at: Instant,
  resolved_at: Instant.nullable(),
  updates: z.array(IncidentUpdate)
})

export const IncidentFields = Incident.pick({ title: true, scope: true, component: true, source_id: true })
