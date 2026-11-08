import { brandStates, type BrandState, type StripInput } from '@skyclause/elements'
import { formatDateLong, formatDateTime, formatNumber, formatTime } from '@skyclause/i18n/format'
import { t } from './i18n'
import type { PublicCall, PublicStatus, PublicWindow } from './reads'
import { callState, failingInputs, headline } from './state'

// What an Open Graph card shows (DESIGN "Open Graph card", WEB-4), built only from #187's public reads: D3's approved
// call or "No approved call yet", never an engine verdict, a replay or a default. Absent data stays absent.

type InputValue = PublicStatus['strip'][number]
type Range = { starts_at: string; ends_at: string }

export interface Card {
  /** The project's slug; null where the read doesn't carry one (the public call). */
  project: string | null
  /** The approved call's state; null reads "No approved call yet". */
  state: BrandState | null
  range: string | null
  window: string | null
  approved: string | null
  noCall: string | null
  /** Derived lanes only (D32): the 60-minute rain line, never 5-minute JPS bars. */
  strip: StripInput | null
  captured: string | null
  reading: string | null
}

const RAIN_60 = 'site.rain_60m_mm'
const at = (instant: string) => Date.parse(instant)

const rangeOf = (window: Range | null) =>
  window &&
  t('share-previews.range', { from: formatTime(window.starts_at, 'en'), to: formatTime(window.ends_at, 'en') })

const windowOf = (window: Range | null) =>
  window && t('share-previews.window', { range: rangeOf(window)!, date: formatDateLong(window.starts_at, 'en') })

/** The data's capture time: the newest observation among the values the card draws from. */
function capturedOf(values: readonly InputValue[]): string | null {
  const times = values.flatMap((value) => (value.observed_at ? [value.observed_at] : []))
  if (!times.length) return null
  const newest = times.reduce((a, b) => (at(b) > at(a) ? b : a))
  return formatDateTime(newest, 'en')
}

const firedInputs = (call: PublicCall | null) => call?.fired.flatMap((fired) => fired.inputs) ?? []

/** The deciding reading: the first fired clause's first observed value. */
function readingOf(call: PublicCall | null): string | null {
  const input = firedInputs(call).find((value) => value.value !== null && value.observed_at !== null)
  if (!input) return null
  return t('share-previews.reading', {
    value: typeof input.value === 'number' ? formatNumber(input.value, 'en') : String(input.value),
    unit: input.unit,
    name: input.name,
    time: formatTime(input.observed_at!, 'en')
  })
}

/** #187's derived `strip` as `stripSvg`'s 60-minute lane; fewer than two points draws no line, so no strip. */
function stripOf(values: readonly InputValue[], window: Range | null, now: Date): StripInput | null {
  const rain60 = values
    .flatMap((value) =>
      value.name === RAIN_60 && typeof value.value === 'number' && value.observed_at
        ? [{ at: value.observed_at, value: value.value }]
        : []
    )
    .sort((a, b) => at(a.at) - at(b.at))
  if (rain60.length < 2) return null
  const nowAt = now.toISOString()
  return {
    from: rain60[0]!.at,
    to: at(rain60.at(-1)!.at) > now.getTime() ? rain60.at(-1)!.at : nowAt,
    now: nowAt,
    window: window && { from: window.starts_at, to: window.ends_at },
    rain5: [],
    rain60
  }
}

function noCallOf(status: PublicStatus): string | null {
  const failing = failingInputs(status.packs)
  if (!failing.length) return null
  const since = failing.reduce((a, b) => (at(b.since) < at(a.since) ? b : a)).since
  return t('share-previews.noCall', {
    inputs: [...new Set(failing.map((input) => input.name))].join(', '),
    time: formatTime(since, 'en')
  })
}

/** `/p/{org}/{project}/og.png`: the headline pack's approved call in force, read as `call`. */
export function projectCard(status: PublicStatus, call: PublicCall | null, now: Date): Card {
  const lead = headline(status.packs)
  const window = call?.window ?? null
  return {
    project: status.project.slug,
    state: lead && callState(lead),
    range: rangeOf(window),
    window: windowOf(window),
    approved: null,
    noCall: noCallOf(status),
    strip: stripOf(status.strip, window, now),
    captured: capturedOf([...firedInputs(call), ...status.strip]),
    reading: readingOf(call)
  }
}

/** `/c/{callId}/og.png`: the call at its snapshot. */
export function callCard(call: PublicCall): Card {
  return {
    project: null,
    state: callState(call),
    range: rangeOf(call.window),
    window: windowOf(call.window),
    approved: t('share-previews.approved', { time: formatTime(call.approved_at, 'en') }),
    noCall: null,
    strip: null,
    captured: capturedOf(firedInputs(call)),
    reading: readingOf(call)
  }
}

/** `/p/{org}/{project}/windows/{id}/og.png`: untitled (D32), with its call read for the capture time. */
export function windowCard(status: PublicStatus, window: PublicWindow, call: PublicCall | null): Card {
  return {
    project: status.project.slug,
    state: callState(window),
    range: rangeOf(window),
    window: windowOf(window),
    approved: null,
    noCall: null,
    strip: null,
    captured: capturedOf(firedInputs(call)),
    reading: readingOf(call)
  }
}

export const stateWord = (state: BrandState | null) =>
  state ? t(brandStates[state].word) : t('share-previews.noApprovedCall')

/** Alt text for the pages' `og:image:alt` (#188, #189): the mode, the window and the deciding reading. */
export function cardAlt(card: Card): string {
  return [
    t('share-previews.alt.state', { state: stateWord(card.state) }),
    card.window && t('share-previews.alt.window', { window: card.window }),
    card.reading && t('share-previews.alt.reading', { reading: card.reading })
  ]
    .filter(Boolean)
    .join(' ')
}
