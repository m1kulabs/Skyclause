'use client'

import { useCallback, useState, type FormEvent } from 'react'
import { useParams } from 'next/navigation'
import { CopyIcon } from 'lucide-react'
import { formatDateTime } from '@skyclause/i18n/format'
import { Button } from '#ui/button'
import { Card, CardContent } from '#ui/card'
import { Input } from '#ui/input'
import { Label } from '#ui/label'
import { Skeleton } from '#ui/skeleton'
import { ConfirmDialog } from '../../set-7'
import { useRead } from '../../../analysis/use-read'
import { StatusMark } from '../../../brand/status-mark'
import {
  projectSettingsApi,
  projectSettingsOperations,
  resolveProject,
  type ShareLink
} from '../../../project-settings/operations'
import { t } from '../../../project-settings/catalogue'
import { Aside, Notice, Part, Parts, Problem, ReadFailed, Row, Rows, SummaryLine } from '../parts'

type Locale = 'en' | 'ms'
type LinkData = { projectId: string; links: ShareLink[] }
type CreatedLink = ReturnType<typeof projectSettingsOperations.createShareLink.response.parse>

/** A link's state, in words: revoked, expired, or active with the days it has left. */
function linkState(link: ShareLink, now: number, locale: Locale) {
  if (link.revoked_at) return { mark: 'error', word: t('project-settings.revoked', {}, locale) } as const
  if (link.expires_at && Date.parse(link.expires_at) <= now)
    return { mark: 'stale', word: t('project-settings.link_expired', {}, locale) } as const
  if (!link.expires_at) return { mark: 'fresh', word: t('project-settings.link_active', {}, locale) } as const
  const days = Math.ceil((Date.parse(link.expires_at) - now) / 86_400_000)
  return {
    mark: 'fresh',
    word: t(days === 1 ? 'project-settings.days_left_one' : 'project-settings.days_left', { count: days }, locale)
  } as const
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
  const [revoked, setRevoked] = useState<string | null>(null)
  const [error, setError] = useState('')
  const [links, setLinks] = useState<ShareLink[] | null>(null)

  const projectId = loaded.status === 'ready' ? loaded.value.projectId : ''
  const visibleLinks = links ?? (loaded.status === 'ready' ? loaded.value.links : [])
  const linkName = (link: ShareLink) =>
    t('project-settings.link_name', { access: t(`project-settings.${link.access}`, {}, locale), id: link.id }, locale)

  const create = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (!projectId || creating) return
    setCreating(true)
    setError('')
    setCreated(null)
    setRevoked(null)
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
      setRevoked(linkName(revoking))
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
        <Skeleton className="h-10 w-full rounded-full" />
        <Skeleton className="h-16 w-full rounded-md" />
      </div>
    )
  if (loaded.status === 'error')
    return (
      <ReadFailed
        source={t('project-settings.source_links', {}, locale)}
        error={loaded.error}
        onRetry={() => setReadRevision((value) => value + 1)}
        locale={locale}
      />
    )

  const now = Date.now()
  return (
    <Parts data-project-settings-share>
      <Aside>
        <SummaryLine label={t('project-settings.share_title', {}, locale)}>
          <span data-numeric>
            {t(
              'project-settings.links_active',
              {
                active: visibleLinks.filter((link) => linkState(link, now, locale).mark === 'fresh').length,
                total: visibleLinks.length
              },
              locale
            )}
          </span>
        </SummaryLine>
      </Aside>
      <Part
        title={t('project-settings.create_link', {}, locale)}
        description={t('project-settings.share_description', {}, locale)}
        id="project-share-create-title"
      >
        <form className="grid min-w-0 gap-4 sm:grid-cols-[1fr_1fr_auto] sm:items-end" onSubmit={create}>
          <div className="grid gap-2">
            <Label htmlFor="share-access">{t('project-settings.access', {}, locale)}</Label>
            <select
              id="share-access"
              name="access"
              autoComplete="off"
              value={access}
              onChange={(event) => setAccess(event.target.value as 'view' | 'reviewer')}
              className="native-select"
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
              className="native-select"
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
          <Card role="status" data-created-share-link>
            <CardContent className="grid min-w-0 gap-3">
              <p className="type-card-title">{t('project-settings.link_created', {}, locale)}</p>
              <div className="grid min-w-0 gap-3 sm:grid-cols-[1fr_auto] sm:items-end">
                <div className="grid min-w-0 gap-2">
                  <Label htmlFor="share-link-url">{t('project-settings.link_url', {}, locale)}</Label>
                  <Input
                    id="share-link-url"
                    name="share_url"
                    autoComplete="off"
                    spellCheck={false}
                    readOnly
                    value={created.url}
                    onFocus={(event) => event.currentTarget.select()}
                  />
                </div>
                <Button type="button" variant="outline" onClick={() => void copy()}>
                  <CopyIcon data-icon="inline-start" />
                  {copyState === 'copied'
                    ? t('project-settings.copied', {}, locale)
                    : t('project-settings.copy', {}, locale)}
                </Button>
              </div>
              {copyState === 'failed' ? <Problem>{t('project-settings.copy_failed', {}, locale)}</Problem> : null}
            </CardContent>
          </Card>
        ) : null}
      </Part>

      <Part
        title={t('project-settings.share_title', {}, locale)}
        actions={
          <span className="type-body text-muted-foreground" data-numeric>
            {t('project-settings.count', { count: visibleLinks.length }, locale)}
          </span>
        }
        id="project-share-links-title"
      >
        {visibleLinks.length ? (
          <Rows>
            {visibleLinks.map((link) => {
              const state = linkState(link, now, locale)
              return (
                <Row key={link.id}>
                  <div className="grid min-w-0 gap-1">
                    <p className="type-body flex flex-wrap items-center gap-x-3 gap-y-1 font-semibold [overflow-wrap:anywhere]">
                      <span>{t(`project-settings.${link.access}`, {}, locale)}</span>
                      <StatusMark state={state.mark} variant="plain" label={state.word} locale={locale} />
                    </p>
                    <p className="type-small flex flex-wrap gap-x-1 text-muted-foreground">
                      <span>{t('project-settings.expires', {}, locale)}</span>
                      {link.expires_at ? (
                        <time dateTime={link.expires_at}>{formatDateTime(link.expires_at, locale)}</time>
                      ) : (
                        <span>{t('project-settings.never_expires', {}, locale)}</span>
                      )}
                    </p>
                    <p className="type-small flex flex-wrap gap-x-1 text-muted-foreground">
                      <span>{t('project-settings.last_used', {}, locale)}</span>
                      {link.last_used_at ? (
                        <time dateTime={link.last_used_at}>{formatDateTime(link.last_used_at, locale)}</time>
                      ) : (
                        <span>{t('project-settings.never_used', {}, locale)}</span>
                      )}
                    </p>
                    {link.revoked_at ? (
                      <p className="type-small flex flex-wrap gap-x-1 text-muted-foreground">
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
                </Row>
              )
            })}
          </Rows>
        ) : (
          <Notice>{t('project-settings.count', { count: 0 }, locale)}</Notice>
        )}
        {revoked ? <Notice>{t('project-settings.revoked_notice', { name: revoked }, locale)}</Notice> : null}
        {error ? <Problem>{error}</Problem> : null}
      </Part>
      {revoking ? (
        <ConfirmDialog
          open
          onOpenChange={(open) => !open && setRevoking(null)}
          objectName={linkName(revoking)}
          title={t('project-settings.revoke_title', {}, locale)}
          confirmLabel={t('project-settings.confirm_revoke', {}, locale)}
          description={t('project-settings.revoke_description', {}, locale)}
          onConfirm={revoke}
          locale={locale}
        />
      ) : null}
    </Parts>
  )
}

export default function Panel({ locale = 'en' }: { locale?: Locale } = {}) {
  return <ProjectSharePanel locale={locale} />
}
