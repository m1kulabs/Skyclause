import type { Channel, Language, Mode, Pack, Page } from '@skyclause/contracts'
import { channelProject, latestSentCall, listProjectChannels, setProjectChannel, track, type Tx } from '@skyclause/db'
import { REPLAY_2_NOVEMBER, renderNotice, renderReplayPreview, type NoticeContext } from '@skyclause/delivery'
import { ApiError } from '../../problems'
import { instant } from '../../serialize'
import type { ServiceContext } from '../../tenancy'
import { callView } from '../bundles'

// #152 c-notice-templates: GET /v1/projects/{id}/channels, GET …/channels/preview and PATCH …/channels/{channel},
// all `channels.manage` (#79 §4).

type ChannelKind = Channel['channel']
/** The channels with a notice template that the preview shows (push has no P1 sender). */
type PreviewChannel = 'email' | 'ics'
type Preview = { channel: PreviewChannel; pack: Pack; mode: Mode | null; language: Language } & ReturnType<
  typeof renderNotice
>

const CHANNELS: ChannelKind[] = ['email', 'ics', 'webhook', 'in_app']
const SKY_MODES: Mode[] = ['outdoor_limited', 'commute_disruption', 'hybrid_recommended']
const APPROVING_ROLES = ['owner', 'admin', 'approver'] as const
type ApprovingRole = (typeof APPROVING_ROLES)[number]
const isApprovingRole = (role: string | null): role is ApprovingRole =>
  (APPROVING_ROLES as readonly (string | null)[]).includes(role)

const invalid = (detail: string, pointer: string) =>
  new ApiError(422, 'validation-failed', detail, { errors: [{ in: 'query', pointer, detail }] })

/** The project, if this principal may manage its channels; else 404, as for another organisation's project. */
export async function channelProjectFor(ctx: ServiceContext, projectId: string, canManage: (id: string) => boolean) {
  const project = await channelProject(ctx.tx, projectId)
  if (!project || !canManage(projectId)) {
    throw new ApiError(404, 'not-found', 'No such project, or you can’t manage its channels.')
  }
  return project
}

export async function listChannels(ctx: ServiceContext, input: { projectId: string }): Promise<Page<Channel>> {
  const rows = await listProjectChannels(ctx.tx, input.projectId)
  const enabled = (channel: ChannelKind) => rows.find((row) => row.channel === channel)?.enabled ?? false
  return { data: CHANNELS.map((channel) => ({ channel, enabled: enabled(channel) })), next_cursor: null }
}

/** Switches a channel; switching one on that was off (or never set) tracks `channel_connected`. */
export async function updateChannel(
  ctx: ServiceContext,
  input: { projectId: string; channel: ChannelKind; enabled: boolean }
): Promise<Channel> {
  const { before, after } = await setProjectChannel(ctx.tx, input)
  if (after && !before) {
    await track(ctx.tx as Tx, 'channel_connected', { channel: input.channel }, { projectId: input.projectId })
  }
  return { channel: input.channel, enabled: after }
}

/**
 * NTC-7: each channel's template filled from the project's latest sent call of the pack and mode (n=1), or with none,
 * n=0; a Sky n=0 adds the labelled 2 November replay. Only what went out is previewed: the feed is English (D20), and
 * an email needs the call's wording in that language and its approver's role. Per-recipient links stay placeholders.
 */
export async function previewChannels(
  ctx: ServiceContext,
  q: {
    project: { id: string; name: string }
    pack?: Pack
    mode?: Mode
    language?: Language
    channel?: ChannelKind
    origin: string
  }
) {
  if (q.channel === 'webhook' || q.channel === 'in_app') {
    throw invalid(`The ${q.channel} channel has no notice template.`, '/channel')
  }
  if (
    q.mode &&
    ((q.pack === 'sky' && q.mode === 'surge_night') || (q.pack === 'crowd' && SKY_MODES.includes(q.mode)))
  ) {
    throw invalid(`${q.mode} is not a ${q.pack} mode.`, '/mode')
  }
  const languages: Language[] = q.language ? [q.language] : ['en', 'ms']
  const channels: PreviewChannel[] = q.channel ? [q.channel] : ['email', 'ics']
  const shown = (language: Language, channel: PreviewChannel, has: (language: Language) => boolean) =>
    channel === 'ics' ? language === 'en' : has(language)
  const pairs = (has: (language: Language) => boolean) =>
    languages.flatMap((language) =>
      channels.filter((channel) => shown(language, channel, has)).map((channel) => ({ language, channel }))
    )

  const latest = await latestSentCall(ctx.tx, { projectId: q.project.id, pack: q.pack, mode: q.mode })
  if (latest) {
    const call = callView(latest.call)
    const role = latest.approverRole
    const context: NoticeContext = {
      project: { name: q.project.name },
      window: latest.window
        ? { startsAt: instant(latest.window.startsAt), endsAt: instant(latest.window.endsAt) }
        : undefined,
      approver: isApprovingRole(role) ? { role } : undefined,
      sources: latest.sources
    }
    const links = { permalink: `${q.origin}/c/${call.id}`, preferences: '{preferences}', unsubscribe: '{unsubscribe}' }
    const hasEmail = (language: Language) =>
      context.approver !== undefined && call.notices.some((n) => n.language === language)
    const previews: Preview[] = pairs(hasEmail).map(({ language, channel }) => ({
      channel,
      pack: latest.pack,
      mode: call.mode,
      language,
      ...renderNotice(call, { language, channel, links, ...context })
    }))
    return { n: 1 as const, call_id: call.id, previews }
  }

  const none = { n: 0 as const, call_id: null, previews: [] as Preview[] }
  if (q.pack === 'crowd' || q.mode === 'surge_night') return none
  const mode = q.mode ?? 'commute_disruption'
  const { station_id, url, captured_at, observed_at } = REPLAY_2_NOVEMBER
  return {
    ...none,
    replay: {
      label: 'replay' as const,
      source: { station_id, url, captured_at, observed_at },
      previews: pairs(() => true).map(({ language, channel }) => ({
        channel,
        pack: 'sky' as const,
        mode,
        language,
        ...renderReplayPreview({ mode, language, channel })
      }))
    }
  }
}
