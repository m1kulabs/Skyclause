// Camera probation pure logic (#61): the settling rule, the daylight filter and the
// verdict figures with the TRD grading formula (Wilson 95% interval, z = 1.96).
export const PROBATION_LABELS = ['visible', 'obscured'] as const

export type ProbationLabel = (typeof PROBATION_LABELS)[number]

export function isProbationLabel(value: string): value is ProbationLabel {
  return value === 'visible' || value === 'obscured'
}

export interface ProbationRow {
  capture_id: string
  frame_file_id: string
  device_time: string
  phone_flag: string
  label_a: string
  label_b: string
  settled: string
  agrees: unknown
}

export type LabelSlot = 'a' | 'b'

export function slotColumn(slot: LabelSlot): 'label_a' | 'label_b' {
  return slot === 'a' ? 'label_a' : 'label_b'
}

const WILSON_Z = 1.96

// Wilson's score interval for k of n, the TRD "Metrics" formula:
// (p̂ + z²/2n ± z·√(p̂(1 − p̂)/n + z²/4n²)) ÷ (1 + z²/n), with p̂ = k/n.
export function wilson(k: number, n: number, z = WILSON_Z): { lo: number; hi: number } {
  if (!Number.isInteger(k) || !Number.isInteger(n) || n <= 0 || k < 0 || k > n) {
    throw new Error(`wilson needs 0 <= k <= n with n >= 1, got k=${k} n=${n}`)
  }
  const p = k / n
  const z2 = z * z
  const denominator = 1 + z2 / n
  const centre = (p + z2 / (2 * n)) / denominator
  const margin = (z * Math.sqrt((p * (1 - p)) / n + z2 / (4 * n * n))) / denominator
  return { lo: centre - margin, hi: centre + margin }
}

export function twoDecimals(value: number): string {
  return (Math.round(value * 100) / 100).toFixed(2)
}

// A settled row is one whose settled label is a real label; anything else is still open.
export function isSettled(row: Pick<ProbationRow, 'settled'>): boolean {
  return isProbationLabel(row.settled)
}

export function isAgreement(row: Pick<ProbationRow, 'agrees'>): boolean {
  return row.agrees === true || row.agrees === 'TRUE' || row.agrees === 'true'
}

// When both labels match, settled is that label; a disagreement waits for the resolve view.
export function settleLabels(a: string, b: string): ProbationLabel | null {
  if (isProbationLabel(a) && a === b) return a
  return null
}

// Agrees is true when the phone flag equals the settled label.
export function agreesWithPhone(phoneFlag: string, settled: string): boolean {
  return isProbationLabel(settled) && phoneFlag === settled
}

const HHMM = /^(\d{2}):(\d{2})$/
const DAY_MS = 24 * 60 * 60 * 1000
const MYT_OFFSET_MS = 8 * 60 * 60 * 1000

function minutesOfDayMyt(deviceTime: string): number | null {
  const at = Date.parse(deviceTime)
  if (Number.isNaN(at)) return null
  return Math.floor((((((at % DAY_MS) + DAY_MS) % DAY_MS) + MYT_OFFSET_MS) % DAY_MS) / 60_000)
}

function minutesOf(wall: string): number | null {
  const match = HHMM.exec(wall)
  if (!match?.[1] || !match?.[2]) return null
  const hours = Number(match[1])
  const minutes = Number(match[2])
  if (hours > 23 || minutes > 59) return null
  return hours * 60 + minutes
}

// Only frames whose device_time falls between CAMERA_DAY_START and CAMERA_DAY_END, in MYT.
export function isDaylight(deviceTime: string, dayStart: string, dayEnd: string): boolean {
  const at = minutesOfDayMyt(deviceTime)
  const start = minutesOf(dayStart)
  const end = minutesOf(dayEnd)
  if (at === null || start === null || end === null) return false
  return start <= at && at <= end
}

export type ProbationVerdict = 'pass' | 'fail' | 'pending'

export const PASS_N = 100
export const PASS_OBSCURED = 10
export const PASS_AGREEMENT = 0.9

export interface ProbationSummary {
  n: number
  obscured: number
  agreeing: number
  disagreements: number
  agreement: number | null
  lo: number | null
  hi: number | null
  verdict: ProbationVerdict
}

// n is the settled frames, obscured those settled as obscured, and disagreements the
// settled frames the two labellers first split on. Pending means too little evidence to
// fail: fewer than 100 settled frames or fewer than 10 obscured.
export function summarizeProbation(rows: ProbationRow[]): ProbationSummary {
  const settled = rows.filter(isSettled)
  const n = settled.length
  const obscured = settled.filter((row) => row.settled === 'obscured').length
  const agreeing = settled.filter(isAgreement).length
  const disagreements = settled.filter(
    (row) => row.label_a !== '' && row.label_b !== '' && row.label_a !== row.label_b
  ).length
  if (n === 0) return { n, obscured, agreeing, disagreements, agreement: null, lo: null, hi: null, verdict: 'pending' }
  const agreement = agreeing / n
  const { lo, hi } = wilson(agreeing, n)
  const verdict: ProbationVerdict =
    n < PASS_N || obscured < PASS_OBSCURED ? 'pending' : agreement >= PASS_AGREEMENT ? 'pass' : 'fail'
  return { n, obscured, agreeing, disagreements, agreement, lo, hi, verdict }
}

// The verdict-view figures, printed on the verdict view only, never while labelling.
export function formatFigures(summary: ProbationSummary): string {
  if (summary.n === 0 || summary.agreement === null || summary.lo === null || summary.hi === null) return 'n=0'
  return (
    `${summary.n} frames · ${summary.obscured} obscured · agreement ${twoDecimals(summary.agreement)} ` +
    `(n=${summary.n}, 95% ${twoDecimals(summary.lo)}–${twoDecimals(summary.hi)}) · ${summary.disagreements} disagreements`
  )
}
