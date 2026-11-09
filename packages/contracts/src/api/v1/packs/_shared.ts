import { IdParams } from '../../common'
import { z } from '@hono/zod-openapi'
import { Pack } from '../../shared'

export const PackParams = IdParams.extend({ pack: Pack })

export const PackUpdate = z.object({ enabled: z.boolean() })
