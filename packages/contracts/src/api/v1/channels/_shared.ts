import { z } from '@hono/zod-openapi'
import { Channel, Instant, Language, Mode, Pack } from '../../shared'

export const ChannelPreview = z.object({
  channel: Channel.shape.channel,
  pack: Pack,
  mode: Mode.nullable(),
  language: Language,
  subject: z.string(),
  text: z.string(),
  html: z.string().optional()
})

// NTC-7: no latest real call means n=0 and no previews of stored values. For Sky, `replay` (#152) fills only the
// measured parts of the labelled 2 November 2026 replay and leaves every other field as its named placeholder.
export const ReplayPreview = z.object({
  label: z.literal('replay'),
  source: z.object({ station_id: z.string(), url: z.url(), captured_at: Instant, observed_at: Instant }),
  previews: z.array(ChannelPreview)
})

export const ChannelPreviewResult = z.discriminatedUnion('n', [
  z.object({
    n: z.literal(0),
    call_id: z.null(),
    previews: z.array(ChannelPreview).max(0),
    replay: ReplayPreview.optional()
  }),
  z.object({ n: z.literal(1), call_id: z.string(), previews: z.array(ChannelPreview) })
])
