import type { Pack } from '@skyclause/contracts'
import { t } from '@skyclause/i18n/approver-alerts'
import { formatDate, formatTime } from '@skyclause/i18n/format'

// #155 (c-approver-alerts): DESIGN "Approver alert" copy for push and email (one owner per notice kind, #79 §1). Times
// print in MYT (LOC-6); a window shows only its time span, never its title or any recipient.

type Span = { startsAt: Date; endsAt: Date }

export type ApproverAlert =
  | {
      kind: 'needs_review' | 'escalated'
      project: string
      pack: Pack
      /** Calls still waiting on review. */
      calls: number
      mode: string | null
      window: Span | null
      slaDueAt: Date
      /** The first fired clause's first input, from the call's shadow verdict. */
      input: { name: string; value: unknown; unit: string; ageS: number | null } | null
      url: string
      now: Date
    }
  | { kind: 'no_draft'; project: string; pack: Pack; reason: string; modes: string[]; url: string }
  | ({
      kind: 'before_shift' | 'switched_on'
      template: 'storm_afternoon' | 'surge_night' | 'custom'
      url: string
    } & Span)

export interface RenderedAlert {
  /** Push title and email subject. */
  title: string
  /** Push body. */
  body: string
  /** Email text. */
  text: string
}

const span = (s: Span) => `${formatTime(s.startsAt, 'en')}–${formatTime(s.endsAt, 'en')}`
const modeName = (mode: string | null) => t(`brand.states.${mode ?? 'no_call'}`)
const minutes = (ms: number) => Math.max(0, Math.ceil(ms / 60_000))

function age(seconds: number) {
  const m = Math.round(seconds / 60)
  return m > 90 ? t('format.ageHour', { value: Math.round(m / 60) }) : t('format.ageMinute', { value: m })
}

export function renderApproverAlert(a: ApproverAlert): RenderedAlert {
  switch (a.kind) {
    case 'needs_review':
    case 'escalated': {
      const mode = modeName(a.mode)
      const what = a.window ? t('approver-alerts.mode_for_window', { mode, window: span(a.window) }) : mode
      let body =
        a.kind === 'needs_review'
          ? t('approver-alerts.needs_review', { what, minutes: minutes(a.slaDueAt.getTime() - a.now.getTime()) })
          : t('approver-alerts.escalated', {
              what,
              minutes: Math.max(0, Math.floor((a.now.getTime() - a.slaDueAt.getTime()) / 60_000))
            })
      if (a.kind === 'needs_review' && a.input) {
        const { name, value, unit, ageS } = a.input
        const reading = unit ? `${String(value)} ${unit}` : String(value)
        body += ` · ${t('approver-alerts.input', { input: name, value: reading, age: age(ageS ?? 0) })}`
      }
      const title = t(`approver-alerts.title.${a.calls === 1 ? 'one' : 'other'}`, { n: a.calls, project: a.project })
      const open = t('approver-alerts.open_bundle', { pack: t(`brand.packs.${a.pack}`), url: a.url })
      return { title, body, text: `${body}\n\n${open}\n\n${t('approver-alerts.never_approves')}` }
    }
    case 'no_draft': {
      // The event says the verdict isn't Normal; with no stored verdict to name, the line says that much.
      const body = a.modes.length
        ? t('approver-alerts.no_draft.body', { reason: a.reason, modes: a.modes.map(modeName).join(', ') })
        : t('approver-alerts.no_draft.body_unnamed', { reason: a.reason })
      const open = t('approver-alerts.no_draft.open', { pack: t(`brand.packs.${a.pack}`), url: a.url })
      return { title: t('approver-alerts.no_draft.title', { project: a.project }), body, text: `${body}\n\n${open}` }
    }
    case 'before_shift':
    case 'switched_on': {
      const vars = {
        template: t(`approver-alerts.templates.${a.template}`),
        start: formatTime(a.startsAt, 'en'),
        span: span(a),
        date: formatDate(a.startsAt, 'en')
      }
      const body = t(`approver-alerts.${a.kind}.body`, vars)
      return {
        title: t(`approver-alerts.${a.kind}.title`, vars),
        body,
        text: `${body}\n\n${t('approver-alerts.open_rota', { url: a.url })}`
      }
    }
  }
}
