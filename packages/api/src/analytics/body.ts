import { ROUTE_GROUPS, VITAL_METRICS } from '@skyclause/contracts'
import { ANALYTICS_PROPS } from '@skyclause/db'
import { z } from 'zod'

// #111's `POST /e` body (spec §2): the two browser events, or a web vital. Strict throughout, so an unknown name, an
// extra property or personal data in any field is `validation-failed`, never a row.

const slug = z.string().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, 'must be a slug')
const slugPair = z.string().refine(
  (value) => {
    const [org, project] = value.split('/')
    return (
      value.split('/').length === 2 &&
      !!org &&
      !!project &&
      org.length >= 2 &&
      org.length <= 39 &&
      project.length >= 2 &&
      project.length <= 39 &&
      slug.safeParse(org).success &&
      slug.safeParse(project).success
    )
  },
  { message: 'must be "{org}/{project}" slugs' }
)

const landingWindowSet = z.strictObject({
  name: z.literal('landing_window_set'),
  props: ANALYTICS_PROPS.landing_window_set,
  project: slugPair.optional()
})

const embedLoaded = z.strictObject({
  name: z.literal('embed_loaded'),
  props: ANALYTICS_PROPS.embed_loaded,
  project: slugPair.optional()
})

const vital = z.strictObject({
  type: z.literal('vital'),
  metric: z.enum(VITAL_METRICS),
  value: z.number().finite().nonnegative(),
  route_group: z.enum(ROUTE_GROUPS)
})

/** At most 2 KB, as `application/json` or `text/plain` (what `navigator.sendBeacon` sends). */
export const MAX_BODY_BYTES = 2048

export const browserEventNames = ['landing_window_set', 'embed_loaded'] as const
const nameOnly = z.strictObject({ name: z.enum(browserEventNames) })

export const ingestBody = z.union([landingWindowSet, embedLoaded, vital])
export type IngestBody = z.infer<typeof ingestBody>

/**
 * Parses against the variant the body's discriminator names, so a failure points at the offending field (`/name`
 * for an unknown event, `/props/modes/0` for a bad enum) instead of the union itself.
 */
export function parseIngestBody(value: unknown): IngestBody {
  if (typeof value === 'object' && value !== null) {
    if ('type' in value) return vital.parse(value)
    if ('name' in value) {
      const { name } = value as { name: unknown }
      if (name === 'landing_window_set') return landingWindowSet.parse(value)
      if (name === 'embed_loaded') return embedLoaded.parse(value)
      nameOnly.parse({ name })
    }
  }
  return ingestBody.parse(value)
}
