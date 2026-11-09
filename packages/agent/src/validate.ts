import type { z } from 'zod'
import { quotable } from './quotable'
import { ProposedBundle, type AgentInput } from './schema'

export type Validation = { ok: true; bundle: ProposedBundle } | { ok: false; reasons: string[] }

/** Schema issues as reasons, naming each path (`calls.0.mode: …`). */
export function issueReasons(error: z.ZodError): string[] {
  return error.issues.map((issue) => `${issue.path.join('.') || 'bundle'}: ${issue.message}`)
}

// A word: letters, digits and underscores, joined by `.`, `,`, `:` or `-` only between word characters.
const WORD = /[\p{L}\p{N}_]+(?:[.,:-][\p{L}\p{N}_]+)*/gu
const LETTER = /[\p{L}_]/u
// Inside a word: an ISO date, an HH:MM time, or a decimal with optional thousands commas.
const NUMBER = /(\d{4}-\d{2}-\d{2})|(\d{1,2}:\d{2})(?![\d:])|(\d{1,3}(?:,\d{3})+(?:\.\d+)?|\d+(?:\.\d+)?)/g
// After NFKC (which folds fullwidth and superscript digits to 0-9), any other digit is refused outright.
const OTHER_DIGIT = /[^\P{N}0-9]+/gu
// Invisible to a reader: a zero-width space inside a figure (12, U+200B, 0) makes a person read 120 where the checks see 12 and 0.
// Unicode's Default_Ignorable_Code_Point plus category Cf (format characters); nothing legitimate in a notice needs them.
const INVISIBLE = /[\p{Default_Ignorable_Code_Point}\p{Cf}]/gu
// Spelled-out numbers from eleven up, English and Malay; "one window" stays fine.
const NUMBER_WORD =
  /\b(?:eleven|twelve|thirteen|fourteen|fifteen|sixteen|seventeen|eighteen|nineteen|twenty|thirty|forty|fifty|sixty|seventy|eighty|ninety|hundred|thousand|million|sebelas|belas|puluh|(?:se)?ratus|(?:se)?ribu|(?:se)?juta)\b/gi

interface Found {
  key: string
  text: string
}

function numbersIn(text: string, identifiers: Set<string>): Found[] {
  const found: Found[] = []
  for (const [word] of text.matchAll(WORD)) {
    if (LETTER.test(word) && identifiers.has(word)) continue
    for (const [piece, date, time, decimal] of word.matchAll(NUMBER)) {
      if (date) found.push({ key: `date ${date}`, text: piece })
      else if (time) found.push({ key: `time ${time.padStart(5, '0')}`, text: piece })
      else found.push({ key: `number ${Number(decimal!.replaceAll(',', ''))}`, text: piece })
    }
  }
  return found
}

/** Trusted names a notice may print verbatim: indicator names, IDs, the pinned sheet's text and the source URLs. */
function identifiers(input: AgentInput): Set<string> {
  const { snapshot } = input
  const texts = [
    snapshot.projectId,
    ...Object.keys(snapshot.site),
    ...Object.values(snapshot.site).flatMap((v) => [v.name, ...v.sourceIds, ...v.readingIds]),
    ...snapshot.inputs.flatMap((i) => [i.name, i.sourceId ?? '']),
    ...Object.keys(snapshot.series),
    ...snapshot.nights.flatMap((n) => [n.id, n.forecastId ?? '']),
    ...input.windows.map((w) => w.id),
    ...Object.entries(input.candidates).flatMap(([id, list]) => [id, ...list.map((c) => c.id)]),
    ...input.sheet.clauses.flatMap((c) => [c.key, c.when, c.wording.en ?? '', c.wording.ms ?? '']),
    ...input.source_urls
  ]
  const out = new Set<string>()
  for (const text of texts) {
    for (const [word] of text.matchAll(WORD)) {
      out.add(word)
      for (const part of word.split('.')) out.add(part)
    }
  }
  return out
}

// Links: scheme URLs first, then email addresses, `www.` hosts and bare domains (IDN and punycode too) in what is left.
const SCHEME = /^[a-z][a-z0-9+.-]*:\/\//i
const PATH = String.raw`[^\s<>"'()[\]]`
const LINKS = [
  new RegExp(String.raw`\b[a-z][a-z0-9+.-]*:\/\/${PATH}+`, 'gi'),
  /[\p{L}\p{N}._%+-]+@[\p{L}\p{N}-]+(?:\.[\p{L}\p{N}-]+)+/gu,
  new RegExp(String.raw`\bwww\.${PATH}+`, 'gi'),
  new RegExp(
    String.raw`(?<![\p{L}\p{N}_.-])(?:[\p{L}\p{N}-]+\.)+(?:\p{L}{2,}|xn--[a-z0-9-]+)(?![\p{L}\p{N}_.-])(?:\/${PATH}*)?`,
    'giu'
  )
]
const TRAILING = /[.,;:!?]+$/

/**
 * The links in `text`, and the text with them blanked out so their digits aren't read as numbers. A bare dotted name
 * the input trusts (an indicator name such as `site.night.forecast`) isn't a link.
 */
function linksIn(text: string, identifiers: Set<string>): { links: string[]; rest: string } {
  const links: string[] = []
  let rest = text
  for (const pattern of LINKS) {
    rest = rest.replace(pattern, (match) => {
      if (identifiers.has(match)) return match
      links.push(match.replace(TRAILING, ''))
      return ' '.repeat(match.length)
    })
  }
  return { links, rest }
}

/**
 * Links may go only to the input's source URLs and the Skyclause origins it lists; never to an email address. Returns
 * the part of an allowed link that is free text (everything after the host, as written; none for a listed source
 * URL), or null when the link isn't allowed.
 */
function linkPolicy(input: AgentInput): (link: string) => string | null {
  const sources = new Set(input.source_urls.flatMap((u) => (URL.canParse(u) ? [u, new URL(u).href] : [])))
  const origins = new Set(input.origins.filter((o) => URL.canParse(o)).map((o) => new URL(o).origin))
  return (link) => {
    const href = SCHEME.test(link) ? link : `https://${link}`
    if (link.includes('@') || !URL.canParse(href)) return null
    const url = new URL(href)
    if (url.protocol !== 'https:' && url.protocol !== 'http:') return null
    // A listed source URL must be written exactly, so nothing the parser tidies away (`/../`, a default port) hides.
    if (sources.has(link) || sources.has(href)) return ''
    if (!origins.has(url.origin)) return null
    // The text as written, not as the URL parser cleans it: `/x-120/../c` and `:443` are still read by a person.
    const rest = link.replace(SCHEME, '')
    const host = rest.match(/^[^/?#\\:]*/)![0]
    try {
      return decodeURIComponent(rest.slice(host.length))
        .normalize('NFKC')
        .replaceAll('_', ' ')
        .replace(/([a-z])([A-Z])/g, '$1 $2')
    } catch {
      return null
    }
  }
}

// Template lines (NTC-3, CAL-15, NTC-9, PUB-5) come from #152's templates, never from the model.
const TEMPLATE_LINES = [
  /\bnot an? (?:safety|emergency)\b/i,
  /bukan perkhidmatan (?:keselamatan|kecemasan)/i,
  /teaching mode is the lecturer/i,
  /never excuses attendance/i,
  /unsubscribe|\bopt[ -]?out\b|\breply\s+stop\b/i,
  /berhenti melanggan/i,
  /\bCC[ -]?BY\b|creative commons|\blicen[cs]ed\b|©/i,
  /via data\.gov\.my/i
]

export function validate(p: ProposedBundle, input: AgentInput): Validation {
  const parsed = ProposedBundle.safeParse(p)
  if (!parsed.success) return { ok: false, reasons: issueReasons(parsed.error) }
  const reasons: string[] = []
  const { snapshot } = input
  // LOC-5: without a Malay-reading approver on duty the call stays English only.
  const bundle: ProposedBundle = input.malay_reader
    ? parsed.data
    : {
        ...parsed.data,
        calls: parsed.data.calls.map((call) => ({ ...call, notices: call.notices.filter((n) => n.language === 'en') }))
      }
  if (bundle.pack !== input.pack) reasons.push(`bundle: pack ${bundle.pack} is not this run's pack ${input.pack}`)

  const windows = new Set(input.windows.map((w) => w.id))
  const nights = new Set(snapshot.nights.map((n) => n.id))
  const clauses = new Set(input.sheet.clauses.map((c) => c.key))
  const cited = new Set([
    ...Object.keys(snapshot.site),
    ...snapshot.inputs.map((i) => i.name),
    ...Object.keys(snapshot.series)
  ])
  const names = identifiers(input)
  const allowsLink = linkPolicy(input)
  const allowed = new Set(quotable(input).flatMap((item) => numbersIn(item, new Set()).map((found) => found.key)))

  bundle.calls.forEach((call, i) => {
    const at = `calls[${i}] (window ${call.window_id})`
    if (call.notices.length === 0 && parsed.data.calls[i]!.notices.length > 0) {
      reasons.push(`${at}: no English notice once Malay is dropped (no Malay-reading approver on duty); write one`)
    }
    if (!windows.has(call.window_id) && !(input.pack === 'crowd' && nights.has(call.window_id))) {
      reasons.push(`${at}: ${call.window_id} is not a window of this run`)
    }
    for (const fired of call.fired) {
      if (!clauses.has(fired.clause)) reasons.push(`${at}: clause ${fired.clause} is not in the pinned sheet`)
    }
    for (const name of [...call.fired.flatMap((f) => f.inputs), ...(call.no_call ?? [])]) {
      if (!cited.has(name)) reasons.push(`${at}: input ${name} is not in the snapshot`)
    }
    const candidates = new Set((input.candidates[call.window_id] ?? []).map((c) => c.id))
    for (const id of call.recipients) {
      if (!candidates.has(id)) reasons.push(`${at}: recipient ${id} is not a candidate for this window`)
    }
    // Links and numbers: the same rules for everything an approver or recipient reads, the reason included.
    const refuseInvisible = (where: string, text: string) => {
      for (const char of new Set(text.match(INVISIBLE) ?? [])) {
        const code = char.codePointAt(0)!.toString(16).toUpperCase().padStart(4, '0')
        reasons.push(`${where}: contains the invisible character U+${code}; remove it`)
      }
    }
    const checkFigures = (where: string, written: string) => {
      refuseInvisible(where, written)
      const text = written.normalize('NFKC')
      const { links, rest } = linksIn(text, names)
      figures(where, rest)
      for (const link of links) {
        const free = allowsLink(link)
        if (free === null) reasons.push(`${where}: link ${link} is not a source URL or Skyclause origin`)
        else {
          // A percent-encoded character decodes in the free text, where a person reads it as written.
          refuseInvisible(`${where} (link ${link})`, free)
          figures(`${where} (link ${link})`, free)
        }
      }
    }
    // Numbers in text with the links already taken out. An allowed link's path counts too: it is free text.
    const figures = (where: string, rest: string) => {
      for (const found of numbersIn(rest, names)) {
        if (!allowed.has(found.key)) reasons.push(`${where}: ${found.text} is not a quotable number`)
      }
      for (const [digits] of rest.matchAll(OTHER_DIGIT)) {
        reasons.push(`${where}: ${digits} uses digits outside 0-9; quote the figure from the quotable block`)
      }
      for (const [word] of rest.matchAll(NUMBER_WORD)) {
        reasons.push(`${where}: spelled-out number ${word}; quote the figure from the quotable block`)
      }
    }
    call.notices.forEach((notice, j) => {
      for (const field of ['subject', 'body'] as const) {
        const where = `${at} notices[${j}].${field}`
        checkFigures(where, notice[field])
        const text = notice[field].normalize('NFKC')
        for (const line of TEMPLATE_LINES) {
          if (line.test(text)) reasons.push(`${where}: writes a template line (${line.source}); templates add it`)
        }
      }
    })
    checkFigures(`${at}.reason`, call.reason)
  })
  bundle.items.forEach((item, i) => {
    if (!nights.has(item.night_id)) reasons.push(`items[${i}]: night ${item.night_id} is not in the snapshot`)
  })
  return reasons.length > 0 ? { ok: false, reasons } : { ok: true, bundle }
}
