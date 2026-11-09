import {
  ScopedOrganizationHeaders as OrganizationHeaders,
  NonEmptyIdParams as IdParams,
  ProblemResponses
} from '../../common'
import { z } from '@hono/zod-openapi'
import { createRoute } from '../../create-route'
import { Channel, Language, Mode, Pack } from '../../shared'
import { ChannelPreviewResult } from './_shared'

export const previewChannels = createRoute({
  method: 'get',
  path: '/v1/projects/{id}/channels/preview',
  operationId: 'previewChannels',
  tags: ['channels'],
  request: {
    headers: OrganizationHeaders,
    params: IdParams,
    query: z.object({
      pack: Pack.optional(),
      mode: Mode.optional(),
      language: Language.optional(),
      channel: Channel.shape.channel.optional()
    })
  },
  responses: {
    ...ProblemResponses,
    200: { description: 'Success', content: { 'application/json': { schema: ChannelPreviewResult } } }
  },
  x: { owner: 'c-notice-templates', statement: 'channels.manage', idempotent: false }
})
