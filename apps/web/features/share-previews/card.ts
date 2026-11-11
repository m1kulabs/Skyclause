import { brandStates, type BrandState, type StripInput } from '@skyclause/elements'
import { formatDateLong, formatDateTime, formatNumber, formatTime } from '@skyclause/i18n/format'
import { t, type Locale } from './i18n'
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
// Registry keys are the catalogue paths for the card's display names.
const indicatorDisplayName = (name: string, locale: Locale) => t(`share-previews.indicators.${name}`, {}, locale)
const at = (instant: string) => Date.parse(instant)

const rangeOf = (window: Range | null, locale: Locale) =>
  window &&
  t(
    'share-previews.range',
    { from: formatTime(window.starts_at, locale), to: formatTime(window.ends_at, locale) },
    locale
  )

const windowOf = (window: Range | null, locale: Locale) =>
  window &&
  t(
    'share-previews.window',
    { range: rangeOf(window, locale)!, date: formatDateLong(window.starts_at, locale) },
    locale
  )

/** The data's capture time: the newest observation among the values the card draws from. */
function capturedOf(values: readonly InputValue[], locale: Locale): string | null {
  const times = values.flatMap((value) => (value.observed_at ? [value.observed_at] : []))
  if (!times.length) return null
  const newest = times.reduce((a, b) => (at(b) > at(a) ? b : a))
  return formatDateTime(newest, locale)
}

const firedInputs = (call: PublicCall | null) => call?.fired.flatMap((fired) => fired.inputs) ?? []

/** The deciding reading: the first fired clause's first observed value. */
function readingOf(call: PublicCall | null, locale: Locale): string | null {
  const input = firedInputs(call).find((value) => value.value !== null && value.observed_at !== null)
  if (!input) return null
  return t(
    'share-previews.reading',
    {
      value: typeof input.value === 'number' ? formatNumber(input.value, locale) : String(input.value),
      unit: input.unit,
      name: indicatorDisplayName(input.name, locale),
      time: formatTime(input.observed_at!, locale)
    },
    locale
  )
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
  const from = rain60[0]!.at
  const to = at(rain60.at(-1)!.at) > now.getTime() ? rain60.at(-1)!.at : now.toISOString()
  // The window's box, cut to the strip's range so it stays on the plot; none when they don't meet.
  const shown = window && at(window.starts_at) < at(to) && at(window.ends_at) > at(from)
  return {
    from,
    to,
    now: now.toISOString(),
    window: shown
      ? {
          from: at(window.starts_at) > at(from) ? window.starts_at : from,
          to: at(window.ends_at) < at(to) ? window.ends_at : to
        }
      : null,
    rain5: [],
    rain60
  }
}

function noCallOf(status: PublicStatus, locale: Locale): string | null {
  const failing = failingInputs(status.packs)
  if (!failing.length) return null
  const since = failing.reduce((a, b) => (at(b.since) < at(a.since) ? b : a)).since
  return t(
    'share-previews.noCall',
    {
      inputs: [...new Set(failing.map((input) => indicatorDisplayName(input.name, locale)))].join(', '),
      time: formatTime(since, locale)
    },
    locale
  )
}

/** `/p/{org}/{project}/og.png`: the headline pack's approved call in force, read as `call`. */
export function projectCard(status: PublicStatus, call: PublicCall | null, now: Date, locale: Locale = 'en'): Card {
  const lead = headline(status.packs)
  const window = call?.window ?? null
  return {
    project: status.project.slug,
    state: lead && callState(lead),
    range: rangeOf(window, locale),
    window: windowOf(window, locale),
    approved: null,
    noCall: noCallOf(status, locale),
    strip: stripOf(status.strip, window, now),
    captured: capturedOf([...firedInputs(call), ...status.strip], locale),
    reading: readingOf(call, locale)
  }
}

/** `/c/{callId}/og.png`: the call at its snapshot. */
export function callCard(call: PublicCall, locale: Locale = 'en'): Card {
  return {
    project: null,
    state: callState(call),
    range: rangeOf(call.window, locale),
    window: windowOf(call.window, locale),
    approved: t('share-previews.approved', { time: formatTime(call.approved_at, locale) }, locale),
    noCall: null,
    strip: null,
    captured: capturedOf(firedInputs(call), locale),
    reading: readingOf(call, locale)
  }
}

/** `/p/{org}/{project}/windows/{id}/og.png`: untitled (D32), with its call read for the capture time. */
export function windowCard(
  status: PublicStatus,
  window: PublicWindow,
  call: PublicCall | null,
  locale: Locale = 'en'
): Card {
  return {
    project: status.project.slug,
    state: callState(window),
    range: rangeOf(window, locale),
    window: windowOf(window, locale),
    approved: null,
    noCall: null,
    strip: null,
    captured: capturedOf(firedInputs(call), locale),
    reading: readingOf(call, locale)
  }
}

export const stateWord = (state: BrandState | null, locale: Locale = 'en') =>
  state ? t(brandStates[state].word, {}, locale) : t('share-previews.noApprovedCall', {}, locale)

/** Alt text for the pages' `og:image:alt` (#188, #189): the mode, the window, the deciding reading and No call (D3). */
export function cardAlt(card: Card, locale: Locale = 'en'): string {
  const { window, reading } = card
  const key = window ? (reading ? 'full' : 'window') : reading ? 'reading' : 'state'
  const alt = t(
    `share-previews.alt.${key}`,
    {
      state: stateWord(card.state, locale),
      window: window ?? '',
      reading: reading ?? ''
    },
    locale
  )
  return card.noCall ? t('share-previews.alt.noCall', { alt, noCall: card.noCall }, locale) : alt
}
