import {
  ScopedOrganizationHeaders as OrganizationHeaders,
  NonEmptyIdParams as IdParams,
  ProblemResponses
} from '../common'
import { z } from '@hono/zod-openapi'
import { createRoute } from '../create-route'
import { Channel, Language, Mode, Pack, Page } from '../shared'

const ChannelPreview = z.object({
  channel: Channel.shape.channel,
  pack: Pack,
  mode: Mode.nullable(),
  language: Language,
  subject: z.string(),
  text: z.string(),
  html: z.string().optional()
})
// NTC-7: no latest real call means n=0 and no rendered notice values.
const ChannelPreviewResult = z.discriminatedUnion('n', [
  z.object({ n: z.literal(0), call_id: z.null(), previews: z.array(ChannelPreview).max(0) }),
  z.object({ n: z.literal(1), call_id: z.string(), previews: z.array(ChannelPreview) })
])

export const listChannels = createRoute({
  method: 'get',
  path: '/v1/projects/{id}/channels',
  operationId: 'listChannels',
  tags: ['channels'],
  request: { headers: OrganizationHeaders, params: IdParams },
  responses: {
    ...ProblemResponses,
    200: { description: 'Success', content: { 'application/json': { schema: Page(Channel) } } }
  },
  x: { owner: 'c-notice-templates', statement: 'channels.manage', idempotent: false }
})

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

export const updateChannel = createRoute({
  method: 'patch',
  path: '/v1/projects/{id}/channels/{channel}',
  operationId: 'updateChannel',
  tags: ['channels'],
  request: {
    headers: OrganizationHeaders,
    params: IdParams.extend({ channel: Channel.shape.channel }),
    body: { required: true, content: { 'application/json': { schema: Channel.pick({ enabled: true }) } } }
  },
  responses: {
    ...ProblemResponses,
    200: { description: 'Success', content: { 'application/json': { schema: Channel } } }
  },
  x: { owner: 'c-notice-templates', statement: 'channels.manage', idempotent: false }
})

export const routes = [listChannels, previewChannels, updateChannel] as const
