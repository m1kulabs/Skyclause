import type { CallView } from '@skyclause/contracts'
import { formatDateLong, formatTime } from '@skyclause/i18n/format'
import { formatClock as clock, formatDateShort, hasNotice, t } from '@skyclause/i18n/notices'

// #152 c-notice-templates: every `call` notice's wording (DESIGN "Email notice and ICS entry"). Only the approved
// wording is free text; every other line is a template line, in the notice's language.

export type NoticeLanguage = 'en' | 'ms'
export type NoticeChannel = 'email' | 'push' | 'ics'

export interface Rendered {
  subject: string
  text: string
  html?: string
}

export interface NoticeLinks {
  permalink: string
  unsubscribe?: string
  preferences?: string
  reply?: string
}

/** What a stored call doesn't hold, from its project, window, bundle and sources; §1 lets the owner add these. */
export interface NoticeContext {
  project?: { name: string }
  /** The window's or night's span, which names it (never its title, D32). */
  window?: { startsAt: string; endsAt: string }
  /** The approving member's role; `at` defaults to `call.approved_at` (#153 renders before stamping it). */
  approver?: { role: 'owner' | 'admin' | 'approver'; at?: string }
  /** `source.name` and `source.licence_label` of the sources the call cites. */
  sources?: Array<{ name: string; licence: string }>
  /** Replaces the model's wording: an approver's edit, or the clause wording on a shadow pick (D23). */
  wording?: string
}

export type RenderNotice = (
  call: CallView,
  o: { language: string; channel: NoticeChannel; links: NoticeLinks } & NoticeContext
) => Rendered

/** A notice's fields, already in words; the replay preview fills them with named placeholders. */
export interface Fields {
  label?: string
  mode: string
  window: string | null
  dateShort: string | null
  dateLong: string | null
  project: string | null
  reason: string
  role: string
  time: string
  teaching: boolean
  sources: string | null
  /** ICS: one line per fired clause, with its inputs' ages. */
  clauses: string[]
  links: NoticeLinks
}

export const say = (key: string, vars: Record<string, string>, language: NoticeLanguage) =>
  t(`notices.${key}`, vars, language)

export function modeWord(call: Pick<CallView, 'mode' | 'watch'>, language: NoticeLanguage) {
  const state = call.mode === 'normal' && call.watch ? 'storm_watch' : (call.mode ?? 'no_call')
  return t(`brand.states.${state}`, {}, language)
}

/** Registry names (#79 §1) to the catalogue's input nouns; window fields (`w.start` …) aren't inputs. */
const INPUT_NOUNS: Array<[RegExp, string]> = [
  [/^(site\.rain_60m_mm|w\.rain_max_(60m|4h)_mm)$/, 'rain'],
  [/^site\.api_/, 'api'],
  [/^(site|w)\.met_warning_in_force$/, 'met_warning'],
  [/^site\.met_afternoon_thunderstorm$/, 'met_forecast'],
  [/^site\.camera_/, 'camera'],
  [/^site\.night\./, 'night']
]
const WINDOW_FIELD = /^w\.(start|end|start_local_min|end_local_min|kind|duration)$/

export const label = (group: 'clauses' | 'inputs', key: string, language: NoticeLanguage) =>
  hasNotice(`${group}.${key}`) ? say(`${group}.${key}`, {}, language) : key

/** DESIGN "Input ages": minutes, then hours over 90 minutes. */
export function age(seconds: number, language: NoticeLanguage) {
  const minutes = Math.round(seconds / 60)
  return minutes > 90
    ? t('format.ageHour', { value: Math.round(minutes / 60) }, language)
    : t('format.ageMinute', { value: minutes }, language)
}

/** The fired clauses with their inputs' ages from the shadow verdict: no values, which D32 keeps off public feeds. */
function clauseLines(call: CallView, language: NoticeLanguage) {
  const values = call.shadow.clauses.flatMap((c) => c.inputs)
  return call.fired.map(({ clause, inputs }) => {
    const named = inputs
      .filter((name) => !WINDOW_FIELD.test(name))
      .map((name) => {
        const noun = INPUT_NOUNS.find(([pattern]) => pattern.test(name))?.[1]
        const input = noun ? label('inputs', noun, language) : name
        const ageS = values.find((v) => v.name === name)?.age_s
        return ageS == null ? input : say('input_age', { input, age: age(ageS, language) }, language)
      })
    const names = [...new Set(named)].join(', ')
    const name = label('clauses', clause, language)
    return names ? say('ics.clause', { clause: name, inputs: names }, language) : name
  })
}

function fromCall(call: CallView, o: Parameters<RenderNotice>[1]): Fields {
  const language = o.language as NoticeLanguage
  const at = o.approver?.at ?? call.approved_at
  if (!at) throw new Error(`Call ${call.id} has no approval time to render`)
  const reason = o.wording ?? call.notices.find((n) => n.language === language)?.body
  if (o.channel !== 'ics' && reason === undefined) throw new Error(`Call ${call.id} has no ${language} wording`)
  if (o.channel !== 'ics' && !o.approver) throw new Error(`Call ${call.id} needs its approver's role`)
  const span = o.window
  return {
    mode: modeWord(call, language),
    window: span
      ? span.startsAt === span.endsAt
        ? say('window_instant', { start: clock(span.startsAt) }, language)
        : say('window_span', { start: clock(span.startsAt), end: clock(span.endsAt) }, language)
      : null,
    dateShort: span ? formatDateShort(span.startsAt, language) : null,
    dateLong: span ? formatDateLong(span.startsAt, language) : null,
    project: o.project?.name ?? null,
    reason: reason ?? '',
    role: o.approver ? say(`roles.${o.approver.role}`, {}, language) : '',
    time: formatTime(at, language),
    teaching: call.mode === 'hybrid_recommended',
    sources: o.sources?.length
      ? o.sources.map((s) => say('source', { name: s.name, licence: s.licence }, language)).join('; ')
      : null,
    clauses: o.channel === 'ics' ? clauseLines(call, language) : [],
    links: o.links
  }
}

const escape = (value: string) =>
  value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')

/** URLs become links whose text is the URL, so the HTML reads exactly as the text part. */
const linkify = (escaped: string) =>
  escaped.replace(/https?:\/\/[^\s<]+/g, (url) => `<a href="${url}" style="color:#0b57d0;">${url}</a>`)

/** NFR-4 and NFR-13: one presentation table with inline styles only, which Outlook and Gmail both keep. */
function html(subject: string, blocks: string[][], language: NoticeLanguage) {
  const paragraphs = blocks
    .map((block) => `<p style="margin:0 0 16px 0;">${block.map((line) => linkify(escape(line))).join('<br>')}</p>`)
    .join('')
  return (
    `<!doctype html><html lang="${language}"><head><meta charset="utf-8">` +
    `<meta name="viewport" content="width=device-width, initial-scale=1"><title>${escape(subject)}</title></head>` +
    `<body style="margin:0;padding:0;background-color:#ffffff;">` +
    `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"><tr>` +
    `<td style="padding:24px;font-family:Arial,Helvetica,sans-serif;font-size:16px;line-height:24px;color:#1a1a1a;">` +
    `${paragraphs}</td></tr></table></body></html>`
  )
}

export function layout(f: Fields, language: NoticeLanguage, channel: NoticeChannel): Rendered {
  const s = (key: string, vars: Record<string, string> = {}) => say(key, vars, language)
  const { mode, window, links } = f
  const teaching = f.teaching ? [s('teaching')] : []
  const footer = [
    t('brand.not_safety_service', {}, language),
    t('brand.non_affiliation', {}, language),
    ...(f.sources ? [s('sources', { sources: f.sources })] : [])
  ]
  if (channel === 'ics') {
    return {
      subject: window ? s('ics.summary', { mode, window }) : mode,
      text: [
        ...(f.label ? [f.label] : []),
        ...f.clauses,
        s('ics.approved', { time: f.time }),
        ...teaching,
        ...footer,
        s('ics.details', { permalink: links.permalink })
      ].join('\n')
    }
  }
  const core = window && f.dateShort ? s('subject', { mode, window, date: f.dateShort }) : mode
  const subject = f.project ? s('subject_project', { subject: core, project: f.project }) : core
  const blocks = [
    f.label ? [f.label] : [],
    window && f.dateLong ? [s('headline', { mode, window, date: f.dateLong })] : [],
    [
      f.reason,
      s('approved', { role: f.role, time: f.time, permalink: links.permalink }),
      ...teaching,
      ...(links.reply ? [s('reply', { url: links.reply })] : [])
    ],
    [
      ...footer,
      ...(links.preferences ? [s('preferences', { url: links.preferences })] : []),
      ...(links.unsubscribe ? [s('unsubscribe', { url: links.unsubscribe })] : [])
    ]
  ].filter((block) => block.length > 0)
  const text = blocks.map((block) => block.join('\n')).join('\n\n')
  return channel === 'email' ? { subject, text, html: html(subject, blocks, language) } : { subject, text }
}

export const renderNotice: RenderNotice = (call, o) =>
  layout(fromCall(call, o), o.language as NoticeLanguage, o.channel)
