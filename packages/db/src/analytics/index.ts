import {
  ANALYTICS_ADAPTERS,
  ANALYTICS_API_KEY_SCOPES,
  ANALYTICS_CHANNELS,
  ANALYTICS_EMBED_COMPONENTS,
  ANALYTICS_GRADES,
  ANALYTICS_LANGUAGES,
  ANALYTICS_MCP_CLIENTS,
  ANALYTICS_MCP_SCOPES,
  ANALYTICS_MCP_TOOLS,
  ANALYTICS_MODES,
  ANALYTICS_ONBOARDING_STEPS,
  ANALYTICS_OPERATING_SYSTEMS,
  ANALYTICS_PACKS,
  ANALYTICS_PLANS,
  ANALYTICS_ROUTE_SCOPES,
  ANALYTICS_TRIGGERS,
  ANALYTICS_WINDOW_SOURCES,
  type AnalyticsName,
  type AnalyticsProps,
  type Track
} from '@skyclause/contracts'
import type { Principal } from '@skyclause/contracts'
import { and, eq, sql } from 'drizzle-orm'
import { z } from 'zod'
import type { Tx } from '../client'
import { publicProject } from '../schema/project'

// #79 §1 track: PRD "Analytics events" as strict schemas, so a property outside the catalogue (personal data
// included) is refused before anything is written. f-contracts holds the catalogue as types and constants only.

const count = z.number().int().nonnegative()
const amount = z.number().nonnegative()
const pack = z.enum(ANALYTICS_PACKS)
const channel = z.enum(ANALYTICS_CHANNELS)

export const ANALYTICS_PROPS = {
  landing_window_set: z.strictObject({
    modes: z.array(z.enum(ANALYTICS_MODES)),
    inputs_fresh: count,
    inputs_error: count
  }),
  guest_started: z.strictObject({ bot_check: z.enum(['passed', 'failed']) }),
  signed_up: z.strictObject({ method: z.enum(['magic_link', 'google', 'passkey']), from_guest: z.boolean() }),
  org_created: z.strictObject({ plan: z.enum(ANALYTICS_PLANS) }),
  project_created: z.strictObject({ packs: z.array(pack) }),
  source_bound: z.strictObject({ adapter: z.enum(ANALYTICS_ADAPTERS), cadence_min: amount }),
  rota_set: z.strictObject({ shifts: count, conditional: z.boolean() }),
  channel_connected: z.strictObject({ channel }),
  onboarding_step: z.strictObject({ step: z.enum(ANALYTICS_ONBOARDING_STEPS), skipped: z.boolean() }),
  window_declared: z.strictObject({ via: z.enum(ANALYTICS_WINDOW_SOURCES), recurring: z.boolean() }),
  run_started: z.strictObject({ pack, trigger: z.enum(ANALYTICS_TRIGGERS) }),
  bundle_drafted: z.strictObject({ pack, calls: count, non_normal: count, disagreements: count, no_call: z.boolean() }),
  bundle_approved: z.strictObject({
    pack,
    minutes_to_approve: amount,
    edited: z.boolean(),
    rejected: z.boolean(),
    recheck_changed: z.boolean()
  }),
  bundle_escalated: z.strictObject({ pack, level: z.enum(['next_approver', 'admins']) }),
  approver_alerted: z.strictObject({ channel: z.enum(['web_push', 'email']), seconds: amount }),
  bundle_closed: z.strictObject({ pack, reason: z.enum(['superseded', 'expired']) }),
  notice_sent: z.strictObject({ channel, language: z.enum(ANALYTICS_LANGUAGES), pack }),
  unsubscribed: z.strictObject({ channel }),
  evidence_requested: z.strictObject({ via: z.enum(['email', 'app', 'api', 'mcp']) }),
  evidence_replied: z.strictObject({ minutes: amount, approval_needed: z.boolean() }),
  call_graded: z.strictObject({ pack, grade: z.enum(ANALYTICS_GRADES) }),
  clause_published: z.strictObject({ pack, clauses_changed: count, replay_calls_changed: count }),
  replay_run: z.strictObject({ pack, days: count }),
  share_link_created: z.strictObject({ access: z.enum(['view', 'reviewer']), expiry_days: count }),
  mcp_connected: z.strictObject({ client: z.enum(ANALYTICS_MCP_CLIENTS) }),
  mcp_tool_called: z.strictObject({
    tool: z.enum(ANALYTICS_MCP_TOOLS),
    scope: z.enum(ANALYTICS_MCP_SCOPES),
    ok: z.boolean()
  }),
  api_key_created: z.strictObject({ scopes: z.array(z.enum(ANALYTICS_API_KEY_SCOPES)), expiry_days: count }),
  cli_login: z.strictObject({ os: z.enum(ANALYTICS_OPERATING_SYSTEMS) }),
  embed_loaded: z.strictObject({ component: z.enum(ANALYTICS_EMBED_COMPONENTS), mode: z.enum(ANALYTICS_MODES) }),
  export_requested: z.strictObject({ scope: z.enum(ANALYTICS_ROUTE_SCOPES) })
} satisfies { [N in AnalyticsName]: z.ZodType<AnalyticsProps<N>> }

// `satisfies` proves each schema's output fits the catalogue; this proves the reverse, so neither drifts.
type Covers = { [N in AnalyticsName]: AnalyticsProps<N> extends z.infer<(typeof ANALYTICS_PROPS)[N]> ? true : false }
const covers: false extends Covers[AnalyticsName] ? never : true = true
void covers

/**
 * Parses `props` against the event's catalogue entry (`POST /e` (#111) shares it, so the browser and the server
 * refuse the same personal data). Throws the zod error for `track` and `/e` to answer `validation-failed`.
 */
export function parseAnalyticsProps<N extends AnalyticsName>(name: N, props: unknown): AnalyticsProps<N> {
  return (ANALYTICS_PROPS[name] as z.ZodType).parse(props) as AnalyticsProps<N>
}

/**
 * Validates `props` against the event's catalogue entry, then writes `analytics_event` through `track_event()`
 * (SECURITY DEFINER, S table) in the transaction's organisation, or none outside `withTenant`.
 */
export const track: Track = async (handle, name, props, ids) => {
  const tx = handle as Tx
  const parsed = parseAnalyticsProps(name, props)
  await tx.execute(sql`SELECT track_event(${name}, ${JSON.stringify(parsed)}::jsonb, ${ids?.projectId ?? null})`)
}

/**
 * Resolves an `/e` `project` of `{orgSlug}/{projectSlug}` to IDs for a public project, else null (`#111`: a private
 * or unknown project is dropped, never an error). Read in `withPublicReader`, which sees `public_project`.
 */
export async function resolvePublicProject(
  tx: Tx<Principal | null>,
  ref: { orgSlug: string; slug: string }
): Promise<{ orgId: string; id: string } | null> {
  const [row] = await tx
    .select({ orgId: publicProject.orgId, id: publicProject.id })
    .from(publicProject)
    .where(and(eq(publicProject.orgSlug, ref.orgSlug), eq(publicProject.slug, ref.slug)))
    .limit(1)
  return row ?? null
}
