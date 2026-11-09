import type { CheckedSheet, IndicatorSnapshot, IndicatorValue, Verdict as EngineVerdict } from '@skyclause/clauses'
import type { CallView, Notice } from '@skyclause/contracts'
import type { CallContent, NoticeLanguage } from '@skyclause/db'
import { checkRequiredLines, findAttendanceExcuse, malayApprovalPolicy, renderNotice } from '@skyclause/delivery'
import { formatTime } from '@skyclause/i18n/format'
import { t } from '@skyclause/i18n/notices'
import { ApiError } from '../../problems'

// #153: what an approval sends for one call. A shadow pick takes the engine's call and the fired clauses' wording,
// with no model (D23); an edit replaces wording per language and removes recipients (#152: an approver's edit fills
// the reason paragraph); LOC-5 turns a non-reader's Malay model notice into English. Every notice is then rendered
// and checked: the fixed lines (`checkRequiredLines`) and both attendance-excuse deny-lists (CAL-15).

export interface Decision {
  call_id: string
  action: 'approve' | 'edit' | 'reject'
  chosen?: 'agent' | 'shadow'
  recipients?: string[]
  notices?: Notice[]
}

const LANGUAGES: NoticeLanguage[] = ['en', 'ms']
const PLACEHOLDER = /\{([A-Za-z0-9_.]+)\.(value|unit|age|station|observed_at)\}/g

/** 422 `validation-failed` naming the call it's about and, for a notice check, the line's slug as `reason`. */
export const invalid = (detail: string, o: { callId?: string; reason?: string } = {}) =>
  new ApiError(422, 'validation-failed', detail, {
    ...(o.callId ? { call_id: o.callId } : {}),
    ...(o.reason ? { reason: o.reason } : {})
  })

/** DESIGN "Input ages": minutes, then hours over 90 minutes, in the notice's language. */
function ageText(seconds: number, language: NoticeLanguage) {
  const minutes = Math.round(seconds / 60)
  return minutes > 90
    ? t('format.ageHour', { value: Math.round(minutes / 60) }, language)
    : t('format.ageMinute', { value: minutes }, language)
}

interface FillContext {
  inputs: IndicatorValue[]
  snapshot: IndicatorSnapshot
  stations: Map<string, string>
  language: NoticeLanguage
}

function field(input: IndicatorValue, part: string, o: FillContext): string | null {
  switch (part) {
    case 'value':
      if (input.value === null) return null
      return Array.isArray(input.value) ? input.value.join(', ') : String(input.value)
    case 'unit':
      return input.unit
    case 'age':
      return input.ageS === null ? null : ageText(input.ageS, o.language)
    case 'station':
      return input.sourceIds.map((id) => o.stations.get(id)).find(Boolean) ?? null
    default:
      return input.observedAt ? formatTime(input.observedAt, o.language) : null
  }
}

/** Fills `{<registry name>.<value|unit|age|station|observed_at>}` (#79 §1 clauses) from the verdict and snapshot. */
function fill(callId: string, text: string, o: FillContext) {
  return text.replace(PLACEHOLDER, (match, name: string, part: string) => {
    const input = o.inputs.find((i) => i.name === name) ?? o.snapshot.site[name]
    const value = input ? field(input, part, o) : null
    if (value === null) throw invalid(`The clause wording needs ${match}, which the snapshot doesn't hold.`, { callId })
    return value
  })
}

/** D23: the shadow verdict's call, worded by its fired clauses in the run's pinned sheet. */
export function shadowContent(
  callId: string,
  verdict: EngineVerdict,
  o: { sheet: CheckedSheet; snapshot: IndicatorSnapshot; stations: Map<string, string> }
): CallContent {
  const fired = verdict.clauses.filter((c) => c.result === 'fired')
  const inputs = fired.flatMap((c) => c.inputs)
  const notices = LANGUAGES.flatMap((language) => {
    const lines = fired.flatMap((c) => {
      const wording = o.sheet.clauses.find((clause) => clause.key === c.key)?.wording[language]
      return wording ? [fill(callId, wording, { inputs, snapshot: o.snapshot, stations: o.stations, language })] : []
    })
    return lines.length ? [{ language, subject: '', body: lines.join(' ') }] : []
  })
  return {
    chosen: 'shadow',
    mode: verdict.mode,
    watch: verdict.watch,
    noCall: verdict.noCall ? verdict.noCall.inputs.map((i) => i.name) : null,
    recommendations: verdict.recommendations,
    fired: fired.map((c) => ({ clause: c.key, inputs: c.inputs.map((i) => i.name) })),
    notices
  }
}

export interface Planned {
  view: CallView
  content: CallContent
  /** LOC-5: a non-reader approved a Malay model notice, so the call goes in English. */
  fallback: boolean
}

/**
 * The call as approved: the shadow pick or the agent's call, the edit's wording and recipients, and LOC-5. A
 * non-reader may not write Malay, and a call with no English wording left can't fall back.
 */
export function plan(view: CallView, decision: Decision, o: { shadow?: CallContent; readsMalay: boolean }): Planned {
  const picked = decision.chosen === 'shadow' ? o.shadow! : { chosen: 'agent' as const }
  const base = picked.notices ?? view.notices
  const edits = decision.notices ?? []
  if (!o.readsMalay && edits.some((n) => n.language === 'ms')) {
    throw new ApiError(422, 'malay-reader-required', 'Only a Malay-reading approver may edit Malay wording.', {
      call_id: view.id
    })
  }
  const notices = [
    ...base.filter((n) => !edits.some((e) => e.language === n.language)),
    ...edits.map((e) => ({ language: e.language, subject: e.subject, body: e.body }))
  ].sort((a, b) => LANGUAGES.indexOf(a.language) - LANGUAGES.indexOf(b.language))
  let next: CallView = {
    ...view,
    ...(picked.mode !== undefined ? { mode: picked.mode } : {}),
    ...(picked.watch !== undefined ? { watch: picked.watch } : {}),
    ...(picked.noCall !== undefined ? { no_call: picked.noCall } : {}),
    ...(picked.recommendations ? { recommendations: picked.recommendations as CallView['recommendations'] } : {}),
    ...(picked.fired ? { fired: picked.fired } : {}),
    chosen: picked.chosen!,
    notices,
    recipients: decision.recipients ?? view.recipients
  }
  // The policy reads model wording only; a shadow pick's Malay is the sheet's.
  const fallback =
    decision.chosen !== 'shadow' && malayApprovalPolicy(next, { readsMalay: o.readsMalay }).action === 'fallback_en'
  if (fallback) {
    if (!next.notices.some((n) => n.language === 'en')) {
      throw new ApiError(
        422,
        'malay-reader-required',
        'This call has Malay wording only; a Malay reader must approve it.',
        {
          call_id: view.id
        }
      )
    }
    next = { ...next, notices: next.notices.filter((n) => n.language === 'en') }
  }
  return {
    view: next,
    fallback,
    content: {
      ...picked,
      notices: next.notices,
      recipients: next.recipients
    }
  }
}

/**
 * Renders each language the call will send and refuses one missing a fixed line (422 `validation-failed`, `reason`
 * the line's slug, such as `teaching-line-missing`) or excusing attendance in English or Malay (`attendance-excuse`).
 */
export function checkNotices(
  view: CallView,
  o: {
    permalink: string
    approver: { role: 'owner' | 'admin' | 'approver'; at: string }
    project: { name: string }
    window?: { startsAt: string; endsAt: string }
    sources: Array<{ name: string; licence: string }>
  }
) {
  for (const { language } of view.notices) {
    const rendered = renderNotice(view, {
      language,
      channel: 'email',
      links: { permalink: o.permalink },
      approver: o.approver,
      project: o.project,
      ...(o.window ? { window: o.window } : {}),
      ...(o.sources.length ? { sources: o.sources } : {})
    })
    const [missing] = checkRequiredLines(rendered, view)
    if (missing) throw invalid(missing.detail, { callId: view.id, reason: missing.instance.split('#')[1] })
    for (const text of [rendered.subject, rendered.text]) {
      const phrase = findAttendanceExcuse(text, language)
      if (phrase) {
        throw invalid(`The ${language} notice excuses attendance: "${phrase}".`, {
          callId: view.id,
          reason: 'attendance-excuse'
        })
      }
    }
  }
}
