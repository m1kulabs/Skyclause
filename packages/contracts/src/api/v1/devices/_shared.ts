import { z } from '@hono/zod-openapi'

export const DeviceInput = z.object({ kind: z.enum(['camera', 'pi']), name: z.string().min(1) })

export const DeviceCredential = z.object({
  source_id: z.string(),
  token: z.string(),
  scope: z.literal('ingest')
})

export const CreatedDevice = DeviceCredential.extend({ kind: z.enum(['camera', 'pi']), name: z.string() })
