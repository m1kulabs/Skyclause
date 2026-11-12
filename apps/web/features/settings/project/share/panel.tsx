'use client'

import { useCallback, useState, type FormEvent } from 'react'
import { useParams } from 'next/navigation'
import { CopyIcon } from 'lucide-react'
import { formatDateTime, formatNumber } from '@skyclause/i18n/format'
import { Button } from '#ui/button'
import { Card, CardContent } from '#ui/card'
import { Input } from '#ui/input'
import { Field, FieldGroup } from '#ui/field'
import { Label } from '#ui/label'
import { Skeleton } from '#ui/skeleton'
import { ConfirmDialog } from '../../set-7'
import { focusHeadingWhenFree } from '../../focus'
import { RowPager, pageOf } from '../row-pager'
import { useRead } from '../../../analysis/use-read'
import { StatusMark } from '../../../brand/status-mark'
import {
  projectSettingsApi,
  projectSettingsOperations,
  resolveProject,
  type ShareLink
} from '../../../project-settings/operations'
import { t } from '../../../project-settings/catalogue'
import '../../catalogue'
import {
  SettingsAside,
  SettingsError,
  SettingsItem,
  SettingsList,
  SettingsLoading,
  SettingsPart,
  SettingsParts,
  SettingsReadError,
  SettingsStatus,
  SettingsSummaryLine
} from '../../parts'

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

/** Every share link of the project: the API's pages are followed to the end, and the panel pages through them. */
async function allShareLinks(projectId: string, signal: AbortSignal) {
  const links: ShareLink[] = []
  const seen = new Set<string>()
  let cursor: string | undefined
  do {
    const page = await projectSettingsApi('listShareLinks', {
      params: { id: projectId },
      query: { limit: 200, cursor },
      signal
    })
    links.push(...page.data)
    cursor = page.next_cursor ?? undefined
    if (cursor && seen.has(cursor)) throw new Error('Repeated share link cursor')
    if (cursor) seen.add(cursor)
  } while (cursor)
  return links
}

export function ProjectSharePanel({ locale = 'en' }: { locale?: Locale }) {
  const params = useParams<{ org: string; project: string }>()
  const [readRevision, setReadRevision] = useState(0)
  const read = useCallback(
    async (signal: AbortSignal): Promise<LinkData> => {
      const project = await resolveProject(params.org, params.project, signal)
      return { projectId: project.id, links: await allShareLinks(project.id, signal) }
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
  const [createError, setCreateError] = useState('')
  const [revokeError, setRevokeError] = useState('')
  const [linkPage, setLinkPage] = useState(0)
  const [links, setLinks] = useState<ShareLink[] | null>(null)

  const projectId = loaded.status === 'ready' ? loaded.value.projectId : ''
  const visibleLinks = links ?? (loaded.status === 'ready' ? loaded.value.links : [])
  // A link is named by its access and when it expires, never by its ID.
  const linkName = (link: ShareLink) =>
    t(
      'project-settings.link_name',
      {
        access: t(`project-settings.${link.access}`, {}, locale),
        expiry: link.expires_at
          ? t('project-settings.link_expires_on', { date: formatDateTime(link.expires_at, locale) }, locale)
          : t('project-settings.link_no_expiry', {}, locale)
      },
      locale
    )

  const create = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (!projectId || creating) return
    setCreating(true)
    setCreateError('')
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
      setLinkPage(0)
    } catch {
      setCreateError(t('project-settings.link_create_failed', {}, locale))
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
    setRevokeError('')
    try {
      const result = await projectSettingsApi('revokeShareLink', { params: { id: revoking.id } })
      setLinks((current) => (current ?? visibleLinks).map((link) => (link.id === result.id ? result : link)))
      setRevoked(linkName(revoking))
      setRevoking(null)
      // The Revoke button that held focus is gone: the list's heading takes it, once the dialog lets go of the page.
      focusHeadingWhenFree('project-share-links-title')
    } catch {
      setRevokeError(t('project-settings.revoke_failed', {}, locale))
    } finally {
      setBusyRevoke(false)
    }
  }

  if (loaded.status === 'loading')
    return (
      <SettingsLoading locale={locale} className="grid gap-4">
        <Skeleton className="h-10 w-full rounded-full" />
        <Skeleton className="h-16 w-full rounded-md" />
      </SettingsLoading>
    )
  if (loaded.status === 'error')
    return (
      <SettingsReadError
        source={t('project-settings.source_links', {}, locale)}
        error={loaded.error}
        onRetry={() => setReadRevision((value) => value + 1)}
        locale={locale}
      />
    )

  const now = Date.now()
  return (
    <SettingsParts data-project-settings-share>
      <SettingsAside>
        <SettingsSummaryLine label={t('project-settings.share_title', {}, locale)}>
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
        </SettingsSummaryLine>
      </SettingsAside>
      <SettingsPart
        title={t('project-settings.create_link', {}, locale)}
        description={t('project-settings.share_description', {}, locale)}
        id="project-share-create-title"
      >
        <form onSubmit={create}>
          <FieldGroup className="grid min-w-0 gap-4 sm:grid-cols-[1fr_1fr_auto] sm:items-end">
            <Field>
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
            </Field>
            <Field>
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
            </Field>
            <Button type="submit" disabled={creating} aria-busy={creating}>
              {creating ? t('project-settings.creating', {}, locale) : t('project-settings.create_link', {}, locale)}
            </Button>
          </FieldGroup>
        </form>
        {created ? (
          <Card data-created-share-link>
            <CardContent className="grid min-w-0 gap-3">
              <SettingsStatus className="sr-only">{t('project-settings.link_created', {}, locale)}</SettingsStatus>
              <p className="type-card-title" aria-hidden="true">
                {t('project-settings.link_created', {}, locale)}
              </p>
              <div className="grid min-w-0 gap-3 sm:grid-cols-[1fr_auto] sm:items-end">
                <Field className="min-w-0">
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
                </Field>
                <Button type="button" variant="outline" onClick={() => void copy()}>
                  <CopyIcon data-icon="inline-start" />
                  {copyState === 'copied'
                    ? t('project-settings.copied', {}, locale)
                    : t('project-settings.copy', {}, locale)}
                </Button>
              </div>
              {copyState === 'failed' ? (
                <SettingsError>{t('project-settings.copy_failed', {}, locale)}</SettingsError>
              ) : null}
            </CardContent>
          </Card>
        ) : null}
        {createError ? <SettingsError>{createError}</SettingsError> : null}
      </SettingsPart>

      <SettingsPart
        title={t('project-settings.share_title', {}, locale)}
        actions={
          visibleLinks.length ? (
            <span className="type-body text-muted-foreground" data-numeric>
              {t(
                visibleLinks.length === 1 ? 'project-settings.links_count_one' : 'project-settings.links_count_other',
                { count: formatNumber(visibleLinks.length, locale) },
                locale
              )}
            </span>
          ) : null
        }
        id="project-share-links-title"
      >
        {visibleLinks.length ? (
          <SettingsList>
            {pageOf(visibleLinks, linkPage).map((link) => {
              const state = linkState(link, now, locale)
              return (
                <SettingsItem key={link.id}>
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
                </SettingsItem>
              )
            })}
          </SettingsList>
        ) : (
          <p className="type-body text-muted-foreground">{t('project-settings.links_empty', {}, locale)}</p>
        )}
        <RowPager total={visibleLinks.length} page={linkPage} onPage={setLinkPage} locale={locale} />
        {revoked ? (
          <SettingsStatus>{t('project-settings.revoked_notice', { name: revoked }, locale)}</SettingsStatus>
        ) : null}
        {revokeError ? <SettingsError>{revokeError}</SettingsError> : null}
      </SettingsPart>
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
    </SettingsParts>
  )
}

export default function Panel({ locale = 'en' }: { locale?: Locale } = {}) {
  return <ProjectSharePanel locale={locale} />
}
