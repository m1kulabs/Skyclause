import type { z } from 'zod'
import { CONFUSABLE_LETTERS } from './confusables'
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
// CJK numerals are letters to Unicode (五十 is 50); notices are English or Malay, so any ideograph is refused, not a
// list.
const IDEOGRAPHS = /\p{Ideographic}+/gu
// Invisible to a reader: a zero-width space inside a figure (12, U+200B, 0) makes a person read 120 where the checks see 12 and 0.
// Unicode's Default_Ignorable_Code_Point plus category Cf (format characters); nothing legitimate in a notice needs them.
const INVISIBLE = /[\p{Default_Ignorable_Code_Point}\p{Cf}]/gu
// A private-use character draws as whatever the font puts there, one newer than this runtime's Unicode tables
// (U+12562 under Node 22 and Bun, both Unicode 17) may draw as a digit on a newer phone, and a lone surrogate has no
// glyph. No notice needs them.
const UNKNOWN = /[\p{Co}\p{Cn}\p{Cs}]/gu
// Other ways a figure reads whole while the checks see two pieces: a combining mark on a digit, a control character
// (C0 and C1 draw at zero width in some renderers; tab and line breaks are ordinary text), a thin or no-break space
// between digits (NFKC folds them to a plain space), and a right-to-left letter beside digits, which reorders them.
// A mark on a space between digits draws as a separator too (5, space, U+0307, 60).
const MARK_ON_DIGIT = /\p{N}[\p{Zs}\t]*[.,:]?(?!\p{Default_Ignorable_Code_Point})\p{M}/u
// Vertical tab and form feed are what Word and PowerPoint paste for a soft line break.
const CONTROL = /[^\P{Cc}\t\n\r\v\f]/gu
// A separator or space run beside a thin space still reads as one figure: 2, 060 is 2,060.
const ODD_SPACE_BETWEEN_DIGITS =
  /\p{N}[\p{Zs}\p{Zl}\p{Zp}\v\f.,:]*(?! )[\p{Zs}\p{Zl}\p{Zp}\v\f][\p{Zs}\p{Zl}\p{Zp}\v\f.,:]*\p{N}/u
// Strong right-to-left blocks: Hebrew to Mandaic (0590-085F), Arabic Presentation Forms, and the right-to-left scripts of the SMP.
const RTL = String.raw`(?!\p{N})[\u0590-\u08FF\uFB1D-\uFDFF\uFE70-\uFEFC\u{10800}-\u{10FFF}\u{1E800}-\u{1EFFF}]`
const RTL_BESIDE_DIGIT = new RegExp(String.raw`${RTL}[\s\p{M}]*\p{N}|\p{N}[\s\p{M}]*${RTL}`, 'u')
// UTS #39 confusables.txt, letters only: a Cyrillic "о" in "hundrеd" is read as the English word.
const CONFUSABLE = new Map(
  Object.entries(CONFUSABLE_LETTERS).flatMap(([letters, chars]) => [...chars].map((char) => [char, letters] as const))
)
// UTS #39 skeletons fold capital I and l together and write m as rn, so the checks read each of those spellings too.
// Symbols that fold to letters (🆃 is T, | is l) are read folded and as written, so |hundred| keeps its word edges.
// camelCase is read split (rainTwenty, as a link path writes words) and whole (tWenty).
const skeletons = (text: string): string[] => {
  const chars = [...text.normalize('NFD').replace(/\p{M}/gu, '')]
  return [true, false].flatMap((symbols) => {
    const folded = chars
      .map((char) => (symbols || /\p{L}/u.test(char) ? (CONFUSABLE.get(char) ?? char) : char))
      .join('')
    return [folded, folded.replace(/([a-z])([A-Z])/g, '$1 $2')].flatMap((base) => {
      const asI = base.replaceAll('l', 'i')
      return [base, asI, base.replaceAll('rn', 'm'), asI.replaceAll('rn', 'm')]
    })
  })
}
// Small capitals that UTS #39 leaves out of confusables.txt (Latin phonetic letters that draw as A-Z).
const SMALL_CAPITALS: Record<string, string> = {
  a: '\u1D00',
  b: '\u0299',
  c: '\u1D04',
  d: '\u1D05',
  e: '\u1D07',
  f: '\uA730',
  g: '\u0262',
  h: '\u029C',
  i: '\u026A',
  j: '\u1D0A',
  k: '\u1D0B',
  l: '\u029F',
  m: '\u1D0D',
  n: '\u0274',
  o: '\u1D0F',
  p: '\u1D18',
  q: '\uA7AF',
  r: '\u0280',
  s: '\uA731',
  t: '\u1D1B',
  u: '\u1D1C',
  v: '\u1D20',
  w: '\u1D21',
  y: '\u028F',
  z: '\u1D22'
}
// Letters UTS #39 maps onto those small capitals (so confusables.txt has no ASCII skeleton for them).
const ONTO_SMALL_CAPITALS: Record<string, string> = {
  t: 'тτꭲ',
  h: 'н',
  b: 'в',
  p: 'ᴩꮲ',
  r: 'ꭱ',
  d: 'ꭰ'
}
for (const [letter, chars] of Object.entries(ONTO_SMALL_CAPITALS)) {
  for (const char of chars) if (!CONFUSABLE.has(char)) CONFUSABLE.set(char, letter)
}
for (const [letter, char] of Object.entries(SMALL_CAPITALS)) {
  // m is written rn in the table, so the existing rn fold reads it too.
  if (!CONFUSABLE.has(char)) CONFUSABLE.set(char, letter === 'm' ? 'rn' : letter)
}
// UTS #39 reads the vertical line as l too (the generated table leaves ASCII sources out). Other vertical bars draw the
// same though its table lacks them: the broken bar, light to heavy bars, box and bracket lines, one-eighth blocks.
for (const char of '|\u00A6\u2758\u2759\u275A\u23D0\u23B8\u23B9\u239C\u239F\u23A2\u23A5\u23AA\u258F\u2595\u254E\u254F\u2506\u2507\u250A\u250B') {
  if (!CONFUSABLE.has(char)) CONFUSABLE.set(char, 'l')
}
// Negative circled and negative squared letters, symbols NFKC leaves alone: 🅣 and 🆃 read as T.
for (const first of [0x1f150, 0x1f170]) {
  for (let i = 0; i < 26; i++) CONFUSABLE.set(String.fromCodePoint(first + i), String.fromCharCode(0x41 + i))
}
// Spelled-out numbers from eleven up, English and Malay; "one window" stays fine.
const NUMBER_WORDS =
  'eleven twelve thirteen fourteen fifteen sixteen seventeen eighteen nineteen twenty thirty forty fifty sixty seventy eighty ninety hundred thousand million sebelas belas puluh ratus seratus ribu seribu juta sejuta'
const NUMBER_WORD = new RegExp(String.raw`\b(?:${NUMBER_WORDS.replaceAll(' ', '|')})\b`, 'gi')
// A letter the folds leave outside ASCII (ŧ, ᴆ, м) may draw as any letter, so a word with one is a spelled-out number
// if it is one once each such letter is read as some letter: ŧwenŧy is twenty.
const UNREAD_WORD = /\p{L}*[^\P{L}\p{ASCII}\p{Ideographic}]\p{L}*/gu
const unreadNumber = (word: string): string[] => {
  const shape = new RegExp(String.raw`\b${word.replace(/[^\p{ASCII}]/gu, '[a-z]')}\b`, 'i')
  const found = shape.exec(NUMBER_WORDS)?.[0]
  return found ? [found] : []
}

// Punctuation a reader takes for a separator inside a figure: any non-ASCII punctuation or symbol (a comma look-alike,
// U+2800, a Tibetan tsheg, an ideographic comma) between digits, directly or after any space or tab: 5, space, U+00B7,
// 60 reads as one figure, while a space on both sides separates, as DESIGN's lists do. The en and em dash and the minus
// sign (it draws as the en dash) stay: they write ranges; so does the right arrow, which writes a change. None hides a
// figure.
const PUNCTUATION_BETWEEN_DIGITS = /\p{N}([\p{Zs}\t]*[\p{P}\p{S}\p{Lm}\uA4F8-\uA4FD\uA78F\u1427]+)(?=\p{N})/gu
// Punctuation UTS #39 reads as l, O or o on one side of a digit reads as a digit: |5 is 15, and so is a danda (U+0964)
// before a 5. Checked before NFKC, which turns the vertical U+FE31 into an em dash.
const PUNCTUATION_BESIDE_DIGIT = /(?<!\p{N})[\p{P}\p{S}](?=\p{N})|(?<=\p{N})[\p{P}\p{S}](?!\p{N})/gu
// A comma between digits reads as a decimal mark (5,60) unless it is a thousands group (2,060).
const THOUSANDS = /(?<!\d|\d,)\d{1,3}(?:,\d{3})+(?!\d|,\d)/g
// Spaces (HTML collapses a run to one) or underscores before three digits group a figure: 2 060 and 2_060 read as
// 2,060. Not after a separator or another figure: "15:30 120 people", "39.0 120" and "2026-11-02 120" stay apart.
const GROUPED = /(?<![\d_.,:-])\d{1,3}[ \t_]+\d{3}(?!\d)/
// A token of 0-9 and the letters O, o, l, I, S, B (plus up to three unit letters) with a letter beside a digit: 5OO,
// 5l, l5, 5S. Lower-case s and b stay out: s is a unit.
const LETTER_DIGITS = /^([0-9OolISB]+)[a-zA-Z]{0,8}$/
const LETTER_BESIDE_DIGIT = /\d[OolISB]|[OolISB]\d/
const LETTER_ACROSS_SEPARATOR = /\d[.,:][OolISB]+(?!\p{L})|(?<!\p{L})[OolISB]+[.,:]\d/u
// Any letter left outside ASCII after the fold, glued to a digit: UTS #39 reads Ƽ as 5 and б as 6, and no notice
// glues such a letter to a figure. Invisible fillers are refused on their own.
const OTHER_LETTER_BESIDE_DIGIT =
  /\d[^\P{L}\p{ASCII}\p{Default_Ignorable_Code_Point}]|[^\P{L}\p{ASCII}\p{Default_Ignorable_Code_Point}]\d/u
// Letters and letter-like symbols (🅾 is O) fold to ASCII.
const asciiLetters = (text: string): string =>
  [...text.normalize('NFD').replace(/\p{M}/gu, '')]
    .map((char) => {
      const mapped = /[\p{L}\p{So}]/u.test(char) ? CONFUSABLE.get(char) : undefined
      return mapped && /^\p{ASCII}+$/u.test(mapped) ? mapped : char
    })
    .join('')

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
      return decodeURIComponent(rest.slice(host.length)).normalize('NFKC').replaceAll('_', ' ')
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
      for (const char of new Set(text.match(UNKNOWN) ?? [])) {
        const code = char.codePointAt(0)!.toString(16).toUpperCase().padStart(4, '0')
        reasons.push(`${where}: contains the private-use, unassigned or surrogate character U+${code}; remove it`)
      }
    }
    const refuseSeparators = (where: string, text: string) => {
      if (MARK_ON_DIGIT.test(text)) reasons.push(`${where}: a combining mark follows a digit; remove it`)
      for (const char of new Set(text.match(CONTROL) ?? [])) {
        const code = char.codePointAt(0)!.toString(16).toUpperCase().padStart(4, '0')
        reasons.push(`${where}: contains the control character U+${code}; remove it`)
      }
      if (ODD_SPACE_BETWEEN_DIGITS.test(text))
        reasons.push(`${where}: a thin or no-break space between digits; remove it`)
      for (const [, run] of text.matchAll(PUNCTUATION_BETWEEN_DIGITS)) {
        for (const char of new Set(
          [...run!].filter((c) => (c > '\x7F' || c === "'" || c === '`') && !'\u2013\u2014\u2212\u2192'.includes(c))
        )) {
          const code = char.codePointAt(0)!.toString(16).toUpperCase().padStart(4, '0')
          reasons.push(`${where}: look-alike punctuation U+${code} between digits; remove it`)
        }
      }
      for (const char of new Set(text.match(PUNCTUATION_BESIDE_DIGIT) ?? [])) {
        if (!/^[OolI]+$/.test(CONFUSABLE.get(char) ?? '')) continue
        const code = char.codePointAt(0)!.toString(16).toUpperCase().padStart(4, '0')
        reasons.push(`${where}: look-alike punctuation U+${code} beside a digit; remove it`)
      }
      if (RTL_BESIDE_DIGIT.test(text))
        reasons.push(`${where}: a right-to-left character beside a digit reorders it; remove it`)
    }
    const safeDecode = (text: string) => {
      try {
        return decodeURIComponent(text)
      } catch {
        return text
      }
    }
    const checkFigures = (where: string, written: string) => {
      refuseInvisible(where, written)
      refuseSeparators(where, written)
      const text = written.normalize('NFKC')
      const { links, rest } = linksIn(text, names)
      figures(where, rest)
      for (const link of links) {
        // Percent escapes decode before the check: `5%E2%80%8A60` is a thin space to a reader.
        refuseSeparators(`${where} (link ${link})`, safeDecode(link))
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
      if (/\d,\d/.test(rest.replace(THOUSANDS, ' ')))
        reasons.push(`${where}: a comma between digits reads as a decimal mark; write the figure as quoted`)
      const folded = asciiLetters(rest)
      if (LETTER_ACROSS_SEPARATOR.test(folded))
        reasons.push(`${where}: letters read as digits across a separator; quote the figure from the quotable block`)
      for (const token of folded.match(/[\p{L}\p{N}_]+/gu) ?? []) {
        if (names.has(token)) continue
        const run = LETTER_DIGITS.exec(token)?.[1]
        if ((run && LETTER_BESIDE_DIGIT.test(run)) || OTHER_LETTER_BESIDE_DIGIT.test(token))
          reasons.push(`${where}: ${token} has letters read as digits; quote the figure from the quotable block`)
      }
      if (GROUPED.test(rest))
        reasons.push(
          `${where}: digits grouped with a space or underscore read as one figure; write the figure as quoted`
        )
      for (const [digits] of rest.matchAll(OTHER_DIGIT)) {
        reasons.push(`${where}: ${digits} uses digits outside 0-9; quote the figure from the quotable block`)
      }
      for (const [run] of rest.matchAll(IDEOGRAPHS)) {
        reasons.push(`${where}: ${run} uses CJK ideographs, which write numbers; write English or Malay`)
      }
      const spelled = new Set(
        skeletons(rest).flatMap((text) => [
          ...[...text.matchAll(NUMBER_WORD)].map(([word]) => word),
          ...(text.match(UNREAD_WORD) ?? []).flatMap(unreadNumber)
        ])
      )
      for (const word of spelled) {
        reasons.push(`${where}: spelled-out number ${word}; quote the figure from the quotable block`)
      }
    }
    call.notices.forEach((notice, j) => {
      for (const field of ['subject', 'body'] as const) {
        const where = `${at} notices[${j}].${field}`
        checkFigures(where, notice[field])
        const texts = skeletons(notice[field].normalize('NFKC'))
        for (const line of TEMPLATE_LINES) {
          if (texts.some((text) => line.test(text)))
            reasons.push(`${where}: writes a template line (${line.source}); templates add it`)
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
