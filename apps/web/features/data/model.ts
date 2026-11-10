import type { AccountExport, OrganisationExport } from './operations'
import { formatDate } from '@skyclause/i18n/format'

export type ExportView = AccountExport | OrganisationExport

export function isExportExpired(job: ExportView, now = new Date()): boolean {
  return job.status === 'expired' || !job.expires_at || new Date(job.expires_at) <= now
}

export function canDownloadExport(job: ExportView, now = new Date()): boolean {
  return job.status === 'ready' && !isExportExpired(job, now)
}

export function formatExpiryDate(instant: string, locale: 'en' | 'ms' = 'en'): string {
  return formatDate(instant, locale)
}

export function problemSlug(error: unknown): string | null {
  if (typeof error !== 'object' || error === null || !('body' in error)) return null
  const body = error.body
  if (typeof body !== 'object' || body === null || !('type' in body) || typeof body.type !== 'string') return null
  return body.type.split(/[/:]/).filter(Boolean).at(-1) ?? null
}
