// #152: no call text excuses attendance (CAL-15). Drafts and approver edits pass both deny-lists (D23, TRD "Agent
// inputs and output schema"); a match blocks drafting or approval. A Malay reader reviews the Malay list (#79 §9
// item 9). Phrases are lower case, with straight apostrophes and single spaces.

export type FindAttendanceExcuse = (text: string, lang: string) => string | null

const ATTENDANCE_EXCUSES = {
  en: [
    'attendance is not required',
    'attendance not required',
    'attendance is optional',
    'attendance will not be taken',
    "attendance won't be taken",
    'no need to attend',
    'need not attend',
    "don't need to attend",
    'do not need to attend',
    "don't have to attend",
    'do not have to attend',
    "don't come to class",
    'do not come to class',
    'excused from attendance',
    'excused from class',
    'excused from classes',
    'you are excused',
    "you're excused",
    'absence will be excused',
    'absences will be excused',
    'will not be marked absent',
    "won't be marked absent",
    'class is cancelled',
    'classes are cancelled',
    'class cancelled',
    'classes cancelled',
    'lecture is cancelled',
    'lectures are cancelled',
    'lecture cancelled',
    'lectures cancelled',
    'class is canceled',
    'classes are canceled',
    'no class today',
    'no classes today',
    'skip class',
    'skip classes',
    'skip the class',
    'skip the lecture',
    'skip lectures'
  ],
  ms: [
    'tidak perlu hadir',
    'tak perlu hadir',
    'tidak wajib hadir',
    'tak wajib hadir',
    'tidak perlu datang ke kelas',
    'kehadiran tidak diwajibkan',
    'kehadiran tidak wajib',
    'kehadiran tidak diperlukan',
    'kehadiran tidak akan diambil',
    'dikecualikan daripada hadir',
    'dikecualikan daripada kelas',
    'dikecualikan kehadiran',
    'ketidakhadiran akan dimaafkan',
    'tidak akan ditanda tidak hadir',
    'kelas dibatalkan',
    'kuliah dibatalkan',
    'tiada kelas hari ini',
    'tiada kuliah hari ini',
    'boleh ponteng',
    'ponteng kelas'
  ]
} as const

const normalise = (text: string) => text.normalize('NFKC').toLowerCase().replace(/[‘’ʼ]/g, "'").replace(/\s+/g, ' ')

const escapeRegExp = (value: string) => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
const PATTERNS = Object.fromEntries(
  Object.entries(ATTENDANCE_EXCUSES).map(([lang, phrases]) => [
    lang,
    phrases.map((phrase) => ({
      phrase,
      pattern: new RegExp(`(?<![\\p{L}\\p{N}])${escapeRegExp(phrase)}(?![\\p{L}\\p{N}])`, 'u')
    }))
  ])
) as Record<'en' | 'ms', Array<{ phrase: string; pattern: RegExp }>>

/** The deny-list phrase `text` contains, from `lang`'s list first, else null. */
export const findAttendanceExcuse: FindAttendanceExcuse = (text, lang) => {
  const normalised = normalise(text)
  const order = lang === 'ms' ? (['ms', 'en'] as const) : (['en', 'ms'] as const)
  for (const list of order) {
    const hit = PATTERNS[list].find(({ pattern }) => pattern.test(normalised))
    if (hit) return hit.phrase
  }
  return null
}
