const MYT_OFFSET_MS = 8 * 60 * 60 * 1000

// ISO 8601 in MYT with an explicit offset, for example `2026-11-02T15:05:00+08:00`. MYT has no daylight saving,
// so a fixed offset is exact and needs no Intl time zone data.
export function toMytIso(date: Date): string {
  return new Date(date.getTime() + MYT_OFFSET_MS).toISOString().slice(0, 19) + '+08:00'
}
