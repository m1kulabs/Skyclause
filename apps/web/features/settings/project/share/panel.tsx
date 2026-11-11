'use client'

import { useCallback, useState, type FormEvent } from 'react'
import { useParams } from 'next/navigation'
import { formatDateTime } from '@skyclause/i18n/format'
import { Button } from '#ui/button'
import { Input } from '#ui/input'
import { Label } from '#ui/label'
import { ConfirmDialog } from '../../set-7'
import { useRead } from '../../../analysis/use-read'
import {
  projectSettingsApi,
  projectSettingsOperations,
  resolveProject,
  type ShareLink
} from '../../../project-settings/operations'
import { t } from '../../../project-settings/catalogue'

type Locale = 'en' | 'ms'
type LinkData = { projectId: string; links: ShareLink[] }
type CreatedLink = ReturnType<typeof projectSettingsOperations.createShareLink.response.parse>

function expiryText(link: ShareLink, locale: Locale) {
  if (!link.expires_at) return t('project-settings.never_expires', {}, locale)
  return <time dateTime={link.expires_at}>{formatDateTime(link.expires_at, locale)}</time>
}

export function ProjectSharePanel({ locale = 'en' }: { locale?: Locale }) {
  const params = useParams<{ org: string; project: string }>()
  const [readRevision, setReadRevision] = useState(0)
  const read = useCallback(
    async (signal: AbortSignal): Promise<LinkData> => {
      const project = await resolveProject(params.org, params.project, signal)
      const links = await projectSettingsApi('listShareLinks', {
        params: { id: project.id },
        query: { limit: 200 },
        signal
      })
      return { projectId: project.id, links: links.data }
    },
    [params.org, params.project, readRevision]
  )
  const loaded = useRead(read)
  const [access, setAccess] = useState<'view' | 'reviewer'>('view')
  const [expiry, setExpiry] = useState(7)
  const [created, setCreated] = useState<CreatedLink | null>(null)
  const [copyState, setCopyState] = useState<'idle' | 'copied' | 'failed'>('idle')
  const [creating, setCreating] = useState(false)
  const [revoking, setRevoking] = useState<ShareLink | null>(null)
  const [busyRevoke, setBusyRevoke] = useState(false)
  const [error, setError] = useState('')
  const [links, setLinks] = useState<ShareLink[] | null>(null)

  const projectId = loaded.status === 'ready' ? loaded.value.projectId : ''
  const visibleLinks = links ?? (loaded.status === 'ready' ? loaded.value.links : [])

  const create = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (!projectId || creating) return
    setCreating(true)
    setError('')
    setCreated(null)
    setCopyState('idle')
    try {
      const result = await projectSettingsApi('createShareLink', {
        params: { id: projectId },
        body: { access, expires_in_days: expiry }
      })
      setCreated(result)
      setLinks((current) => [result, ...(current ?? visibleLinks)])
    } catch {
      setError(t('project-settings.link_create_failed', {}, locale))
    } finally {
      setCreating(false)
    }
  }

  const copy = async () => {
    if (!created) return
    try {
      await navigator.clipboard.writeText(created.url)
      setCopyState('copied')
    } catch {
      setCopyState('failed')
    }
  }

  const revoke = async () => {
    if (!revoking || busyRevoke) return
    setBusyRevoke(true)
    setError('')
    try {
      const result = await projectSettingsApi('revokeShareLink', { params: { id: revoking.id } })
      setLinks((current) => (current ?? visibleLinks).map((link) => (link.id === result.id ? result : link)))
      setRevoking(null)
    } catch {
      setError(t('project-settings.revoke_failed', {}, locale))
    } finally {
      setBusyRevoke(false)
    }
  }

  if (loaded.status === 'loading')
    return (
      <div className="grid gap-4" aria-busy="true">
        <div className="h-20 animate-pulse rounded bg-muted" />
        <div className="h-28 animate-pulse rounded bg-muted" />
      </div>
    )
  if (loaded.status === 'error')
    return (
      <div role="alert" className="flex flex-wrap items-center gap-2 text-sm text-destructive">
        <span>{t('project-settings.link_load_failed', {}, locale)}</span>
        <Button type="button" variant="link" onClick={() => setReadRevision((value) => value + 1)}>
          {t('project-settings.retry', {}, locale)}
        </Button>
      </div>
    )

  return (
    <div className="grid min-w-0 gap-8" data-project-settings-share>
      <section className="grid min-w-0 gap-4" aria-labelledby="project-share-create-title">
        <div>
          <h3 id="project-share-create-title" className="text-base font-semibold">
            {t('project-settings.create_link', {}, locale)}
          </h3>
          <p className="mt-1 text-sm text-muted-foreground">{t('project-settings.share_description', {}, locale)}</p>
        </div>
        <form className="grid min-w-0 gap-4 sm:grid-cols-[1fr_1fr_auto] sm:items-end" onSubmit={create}>
          <div className="grid gap-2">
            <Label htmlFor="share-access">{t('project-settings.access', {}, locale)}</Label>
            <select
              id="share-access"
              name="access"
              autoComplete="off"
              value={access}
              onChange={(event) => setAccess(event.target.value as 'view' | 'reviewer')}
              className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
            >
              <option value="view">{t('project-settings.view', {}, locale)}</option>
              <option value="reviewer">{t('project-settings.reviewer', {}, locale)}</option>
            </select>
          </div>
          <div className="grid gap-2">
            <Label htmlFor="share-expiry">{t('project-settings.expiry', {}, locale)}</Label>
            <select
              id="share-expiry"
              name="expires_in_days"
              autoComplete="off"
              value={expiry}
              onChange={(event) => setExpiry(Number(event.target.value))}
              className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
            >
              {Array.from({ length: 30 }, (_, index) => index + 1).map((day) => (
                <option value={day} key={day}>
                  {day}
                </option>
              ))}
            </select>
          </div>
          <Button type="submit" disabled={creating} aria-busy={creating}>
            {creating ? t('project-settings.creating', {}, locale) : t('project-settings.create_link', {}, locale)}
          </Button>
        </form>
        {created ? (
          <div className="grid min-w-0 gap-3 rounded-md border p-4" role="status" data-created-share-link>
            <p className="text-sm">{t('project-settings.link_created', {}, locale)}</p>
            <div className="grid min-w-0 gap-2 sm:grid-cols-[1fr_auto]">
              <div className="grid min-w-0 gap-2">
                <Label htmlFor="share-link-url">{t('project-settings.link_url', {}, locale)}</Label>
                <Input
                  id="share-link-url"
                  name="share_url"
                  autoComplete="off"
                  readOnly
                  value={created.url}
                  onFocus={(event) => event.currentTarget.select()}
                />
              </div>
              <Button type="button" variant="outline" onClick={() => void copy()}>
                {copyState === 'copied'
                  ? t('project-settings.copied', {}, locale)
                  : t('project-settings.copy', {}, locale)}
              </Button>
            </div>
            {copyState === 'failed' ? (
              <p className="text-sm text-destructive">{t('project-settings.copy_failed', {}, locale)}</p>
            ) : null}
          </div>
        ) : null}
      </section>

      <section className="grid min-w-0 gap-3 border-t pt-6" aria-labelledby="project-share-links-title">
        <h3 id="project-share-links-title" className="flex flex-wrap items-baseline gap-2 text-base font-semibold">
          <span>{t('project-settings.share_title', {}, locale)}</span>
          <span className="text-sm font-normal text-muted-foreground">
            {t('project-settings.count', { count: visibleLinks.length }, locale)}
          </span>
        </h3>
        {visibleLinks.length ? (
          <ul className="grid gap-4">
            {visibleLinks.map((link) => {
              const objectName = t(
                'project-settings.link_name',
                { access: t(`project-settings.${link.access}`, {}, locale), id: link.id },
                locale
              )
              return (
                <li key={link.id} className="grid min-w-0 gap-3 border-b pb-4 sm:grid-cols-[1fr_auto] sm:items-center">
                  <div className="grid min-w-0 gap-1 text-sm">
                    <p className="font-medium [overflow-wrap:anywhere]">
                      {t(`project-settings.${link.access}`, {}, locale)}
                    </p>
                    <p className="flex flex-wrap gap-1 text-muted-foreground">
                      <span>{t('project-settings.expires', {}, locale)}</span>
                      <span>{expiryText(link, locale)}</span>
                    </p>
                    <p className="flex flex-wrap gap-1 text-muted-foreground">
                      <span>{t('project-settings.last_used', {}, locale)}</span>
                      {link.last_used_at ? (
                        <time dateTime={link.last_used_at}>{formatDateTime(link.last_used_at, locale)}</time>
                      ) : (
                        t('project-settings.never_used', {}, locale)
                      )}
                    </p>
                    {link.revoked_at ? (
                      <p className="flex flex-wrap gap-1 text-destructive">
                        <span>{t('project-settings.revoked', {}, locale)}</span>
                        <time dateTime={link.revoked_at}>{formatDateTime(link.revoked_at, locale)}</time>
                      </p>
                    ) : null}
                  </div>
                  {!link.revoked_at ? (
                    <Button type="button" variant="destructive" onClick={() => setRevoking(link)}>
                      {t('project-settings.revoke', {}, locale)}
                    </Button>
                  ) : null}
                  {revoking?.id === link.id ? (
                    <ConfirmDialog
                      open
                      onOpenChange={(open) => !open && setRevoking(null)}
                      objectName={objectName}
                      title={t('project-settings.revoke_title', {}, locale)}
                      confirmLabel={t('project-settings.confirm_revoke', {}, locale)}
                      description={t('project-settings.revoke_description', {}, locale)}
                      onConfirm={revoke}
                      locale={locale}
                    />
                  ) : null}
                </li>
              )
            })}
          </ul>
        ) : (
          <p className="text-sm text-muted-foreground">{t('project-settings.count', { count: 0 }, locale)}</p>
        )}
        {error ? (
          <p role="alert" className="text-sm text-destructive">
            {error}
          </p>
        ) : null}
      </section>
    </div>
  )
}

export default function Panel({ locale = 'en' }: { locale?: Locale } = {}) {
  return <ProjectSharePanel locale={locale} />
}
