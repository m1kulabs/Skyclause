import type { EvidenceRequestRow, StoredEvidencePack } from '@skyclause/db'
import { t } from '@skyclause/i18n/brand'
import '@skyclause/i18n/evidence'
import { formatDateTime } from '@skyclause/i18n/format'

// #159 ticket decision: no model drafts a reply. The email is the stored pack in plain text from the `evidence`
// catalogue (en, ms), ending with the not-a-safety-service and non-affiliation lines; times print in MYT (LOC-6).

type Language = 'en' | 'ms'

export function renderEvidenceReply(r: {
  project: { name: string }
  request: EvidenceRequestRow
  pack: StoredEvidencePack
  language: Language
}): { subject: string; text: string } {
  const lang = r.language
  const say = (key: string, vars: Record<string, string | number> = {}) => t(`evidence.email.${key}`, vars, lang)
  const when = (value: Date | string | null) => (value === null ? '—' : formatDateTime(value, lang))
  const span = { project: r.project.name, from: when(r.request.spanFrom), to: when(r.request.spanTo) }
  const { pack } = r
  const section = <T>(key: string, rows: T[], line: (row: T) => string[], none?: string) =>
    rows.length ? ['', say(key, { count: rows.length }), ...rows.flatMap(line)] : none ? ['', say(none)] : []

  const text = [
    say('intro', span),
    say('times', {
      received: when(r.request.receivedAt),
      drafted: when(r.request.draftedAt),
      approved: when(r.request.approvedAt),
      replied: when(r.request.repliedAt)
    }),
    say('hash', { hash: r.request.packHash ?? '' }),
    ...section(
      'readings',
      pack.readings,
      (reading) => [
        `- ${say('reading', {
          time: when(reading.observed_at),
          station: reading.station_id,
          metric: reading.metric,
          value:
            reading.value === null
              ? (reading.value_text ?? say('no_value'))
              : [reading.value, reading.unit].filter((part) => part !== null).join(' '),
          id: reading.id
        })}`
      ],
      'no_readings'
    ),
    ...section(
      'warnings',
      pack.warnings,
      (warning) => [
        `- ${say('warning', { from: when(warning.valid_from), to: when(warning.valid_to), id: warning.reading_id })}`,
        `  ${warning.text}`,
        ...(warning.gloss ? [`  ${say('warning_english', { text: warning.gloss })}`] : [])
      ],
      'no_warnings'
    ),
    ...section('calls', pack.calls, (call) => [
      `- ${say('call', { id: call.id, mode: call.mode ?? say('no_mode'), state: call.state })}`
    ]),
    ...section('approvals', pack.approvals, (approval) => [
      `- ${say('approval', { time: when(approval.approved_at), call: approval.call_id ?? '—', id: approval.id })}`
    ]),
    ...section('grades', pack.grades, (grade) => [
      `- ${say('grade', { call: grade.call_id ?? '—', outcome: grade.outcome, id: grade.id })}`
    ]),
    ...section('ledger', pack.ledger, (entry) => [
      `- ${say('ledger_entry', { seq: entry.seq, kind: entry.kind, hash: entry.hash })}`
    ]),
    ...section('frames', pack.frames, (frame) => [
      `- ${say('frame', { time: when(frame.captured_at), id: frame.reading_id })}`
    ]),
    '',
    t('brand.not_safety_service', {}, lang),
    t('brand.non_affiliation', {}, lang)
  ].join('\n')
  return { subject: say('subject', span), text }
}
