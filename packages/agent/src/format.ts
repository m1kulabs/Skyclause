// Spec conventions and DESIGN "Voice and content": every printed time carries MYT. The §1 cell keeps @skyclause/i18n
// out of this package, so MYT is a fixed UTC+8 offset (Malaysia keeps no daylight saving) read with getUTC*.
const MYT_OFFSET_MS = 8 * 60 * 60 * 1000
const WEEKDAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']
const MONTHS = [
  'January',
  'February',
  'March',
  'April',
  'May',
  'June',
  'July',
  'August',
  'September',
  'October',
  'November',
  'December'
]

const myt = (instant: string) => new Date(Date.parse(instant) + MYT_OFFSET_MS)
const pad = (n: number) => String(n).padStart(2, '0')

/** "15:05 MYT" */
export function mytTime(instant: string): string {
  const at = myt(instant)
  return `${pad(at.getUTCHours())}:${pad(at.getUTCMinutes())} MYT`
}

/** "Monday 2 November 2026" */
export function mytDate(instant: string): string {
  const at = myt(instant)
  return `${WEEKDAYS[at.getUTCDay()]} ${at.getUTCDate()} ${MONTHS[at.getUTCMonth()]} ${at.getUTCFullYear()}`
}

/** "5 min", or "2 h" over 90 minutes (DESIGN input ages). */
export function age(ageS: number): string {
  const minutes = Math.round(ageS / 60)
  return minutes > 90 ? `${Math.round(ageS / 3600)} h` : `${minutes} min`
}

/**
 * A value as the source gave it, never rounded: whole millimetres print one decimal as DESIGN does ("39.0 mm"), and
 * other whole numbers group thousands ("27,044").
 */
export function quantity(value: number, unit: string): string {
  const text = !Number.isInteger(value)
    ? String(value)
    : unit === 'mm'
      ? value.toFixed(1)
      : String(value).replace(/\B(?=(\d{3})+(?!\d))/g, ',')
  return unit ? `${text} ${unit}` : text
}
