import type { CallView, Problem } from '@skyclause/contracts'
import { t } from '@skyclause/i18n/notices'
import type { Rendered } from './render'

// #152: the fixed lines no model or editor may drop (NTC-3, CAL-15, TRD "Agent inputs and output schema": the
// safety line, attributions and the teaching-mode line come from templates). Either language's line counts.

export type CheckRequiredLines = (r: Rendered, call: CallView) => Problem[]

const LANGUAGES = ['en', 'ms'] as const
const both = (key: string) => LANGUAGES.map((language) => t(key, {}, language))
const escapeRegExp = (value: string) => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

/** A catalogue line up to its `{time}` as a pattern: `{role}` is any word, `{time}` an MYT clock time. */
const approvalPattern = (key: string) =>
  LANGUAGES.map((language) => {
    const line = t(key, {}, language)
    const head = line.slice(0, line.indexOf('{time}') + '{time}'.length)
    return new RegExp(
      escapeRegExp(head).replace(escapeRegExp('{role}'), '\\S+').replace(escapeRegExp('{time}'), '\\d{2}:\\d{2} MYT')
    )
  })

interface Line {
  slug: string
  name: string
  applies: (call: CallView) => boolean
  present: (text: string, call: CallView) => boolean
}

const contains = (lines: string[]) => (text: string) => lines.some((line) => text.includes(line))

const LINES: Line[] = [
  {
    slug: 'safety-line-missing',
    name: 'not-a-safety-service line',
    applies: () => true,
    present: contains(both('brand.not_safety_service'))
  },
  {
    slug: 'non-affiliation-missing',
    name: 'non-affiliation line',
    applies: () => true,
    present: contains(both('brand.non_affiliation'))
  },
  {
    slug: 'approval-line-missing',
    name: 'approval line',
    applies: () => true,
    present: (text) =>
      [...approvalPattern('notices.approved'), ...approvalPattern('notices.ics.approved')].some((p) => p.test(text))
  },
  {
    slug: 'permalink-missing',
    name: 'permalink',
    applies: () => true,
    present: (text, call) => text.includes(`/c/${call.id}`)
  },
  {
    slug: 'teaching-line-missing',
    name: 'teaching-mode line',
    applies: (call) => call.mode === 'hybrid_recommended',
    present: contains(both('notices.teaching'))
  },
  {
    slug: 'sources-missing',
    name: 'source attributions',
    applies: (call) => call.shadow.clauses.some((c) => c.inputs.some((i) => i.source_ids.length > 0)),
    present: (text) =>
      LANGUAGES.some((language) => {
        const prefix = t('notices.sources', { sources: '' }, language)
        return text.split('\n').some((line) => line.startsWith(prefix) && line.length > prefix.length)
      })
  }
]

/** The HTML part as text: tags out (`<br>` and paragraphs as line breaks), entities decoded. */
function htmlText(html: string) {
  return html
    .replace(/<br\s*\/?>|<\/p>/gi, '\n')
    .replace(/<[^>]*>/g, '')
    .replace(/&quot;/g, '"')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&amp;/g, '&')
}

export const checkRequiredLines: CheckRequiredLines = (r, call) => {
  const parts = [
    { name: 'text', body: r.text },
    ...(r.html === undefined ? [] : [{ name: 'HTML', body: htmlText(r.html) }])
  ]
  return LINES.filter((line) => line.applies(call)).flatMap((line) => {
    const missing = parts.filter((part) => !line.present(part.body, call)).map((part) => part.name)
    if (missing.length === 0) return []
    const example = line.slug === 'teaching-line-missing' ? `: "${t('notices.teaching')}"` : ''
    return [
      {
        type: 'https://docs.skyclause.m1ku.tech/problems/validation-failed',
        title: 'A required notice line is missing',
        status: 422,
        detail: `The ${missing.join(' and ')} ${missing.length > 1 ? 'are' : 'is'} missing the ${line.name}${example}`,
        instance: `/v1/calls/${call.id}#${line.slug}`
      }
    ]
  })
}
