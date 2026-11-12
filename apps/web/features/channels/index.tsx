'use client'

import '../subscribe/catalogue'
import '../subscribers/catalogue'
import { useEffect, useRef, useState } from 'react'
import { useParams, useSearchParams } from 'next/navigation'
import type { Channel } from '@skyclause/contracts'
import { Button } from '#ui/button'
import { Skeleton } from '#ui/skeleton'
import { Switch } from '#ui/switch'
import { t } from './catalogue'
import { apiFetch } from '../subscribe/operations'
import { OperationError } from '../subscribe/error'
import { resolveProject } from '../subscribers/project'
import { StatusMark } from '../brand/status-mark'
import {
  SettingsAside,
  SettingsError,
  SettingsItem,
  SettingsList,
  SettingsPart,
  SettingsParts,
  SettingsReadError,
  SettingsStatus,
  SettingsSummaryLine
} from '../settings/parts'

const readPreview = (id: string) => apiFetch('previewChannels', { params: { id } })
type Preview = Awaited<ReturnType<typeof readPreview>>

export function Channels() {
  const { org, project } = useParams<{ org: string; project: string }>()
  const locale = useSearchParams().get('lang') === 'ms' ? 'ms' : 'en'
  const [projectId, setProjectId] = useState<string>()
  const [channels, setChannels] = useState<Channel[]>()
  const [preview, setPreview] = useState<Preview>()
  const [error, setError] = useState<unknown>(null)
  const [readError, setReadError] = useState<unknown>(null)
  const [missing, setMissing] = useState(false)
  const [busy, setBusy] = useState(false)
  const [saved, setSaved] = useState('')
  const [attempt, setAttempt] = useState(0)
  const inFlight = useRef(false)
  useEffect(() => {
    const controller = new AbortController()
    setReadError(null)
    setMissing(false)
    resolveProject(org, project, controller.signal)
      .then(async (resolved) => {
        if (!resolved) {
          setMissing(true)
          return
        }
        setProjectId(resolved.id)
        const response = await apiFetch('listChannels', { params: { id: resolved.id }, signal: controller.signal })
        setChannels(response.data)
      })
      .catch((reason: unknown) => {
        if (!controller.signal.aborted) setReadError(reason)
      })
    return () => controller.abort()
  }, [org, project, attempt])

  async function toggle(channel: Channel) {
    if (!projectId || inFlight.current) return
    inFlight.current = true
    setBusy(true)
    setError(null)
    setSaved('')
    setPreview(undefined)
    try {
      const next = await apiFetch('updateChannel', {
        params: { id: projectId, channel: channel.channel },
        body: { enabled: !channel.enabled }
      })
      setChannels((previous) => previous?.map((item) => (item.channel === next.channel ? next : item)))
      setSaved(t('channels.saved', { channel: t(`subscribe.${channel.channel}_channel`, {}, locale) }, locale))
    } catch (reason) {
      setError(reason)
    } finally {
      setBusy(false)
      inFlight.current = false
    }
  }
  async function showPreview() {
    if (!projectId || inFlight.current) return
    inFlight.current = true
    setBusy(true)
    setError(null)
    setPreview(undefined)
    try {
      setPreview(await readPreview(projectId))
    } catch (reason) {
      setError(reason)
    } finally {
      setBusy(false)
      inFlight.current = false
    }
  }
  const retry = () => setAttempt((n) => n + 1)
  return (
    <SettingsParts data-channels-panel>
      {readError ? (
        <SettingsReadError
          source={t('channels.source_read', {}, locale)}
          error={readError}
          onRetry={retry}
          locale={locale}
        />
      ) : null}
      {missing && (
        <div className="grid justify-items-start gap-3">
          <SettingsError>{t('subscribers.no_project', {}, locale)}</SettingsError>
          <Button variant="outline" onClick={retry}>
            {t('subscribe.retry', {}, locale)}
          </Button>
        </div>
      )}
      {!channels && !readError && !missing && (
        <div className="grid gap-2" aria-busy="true">
          <Skeleton className="h-16 w-full rounded-md" />
          <Skeleton className="h-16 w-full rounded-md" />
          <p role="status" className="sr-only">
            {t('subscribe.loading', {}, locale)}
          </p>
        </div>
      )}
      {channels && (
        <>
          <SettingsAside>
            {channels.map((channel) => (
              <SettingsSummaryLine key={channel.channel} label={t(`subscribe.${channel.channel}_channel`, {}, locale)}>
                {t(channel.enabled ? 'channels.enabled' : 'channels.disabled', {}, locale)}
              </SettingsSummaryLine>
            ))}
          </SettingsAside>
          <SettingsPart
            title={t('channels.description', {}, locale)}
            actions={<SettingsStatus>{busy ? t('subscribe.saving', {}, locale) : saved}</SettingsStatus>}
          >
            {!channels.length && <p className="type-body text-muted-foreground">{t('channels.empty', {}, locale)}</p>}
            <SettingsList>
              {channels.map((channel) => {
                const name = t(`subscribe.${channel.channel}_channel`, {}, locale)
                return (
                  <SettingsItem key={channel.channel} data-channel={channel.channel}>
                    <div className="grid min-w-0 flex-1 gap-1">
                      <span className="type-card-title">{name}</span>
                      <p className="type-body">
                        <StatusMark
                          state={channel.enabled ? 'fresh' : 'off_hours'}
                          variant="plain"
                          label={t(channel.enabled ? 'channels.enabled' : 'channels.disabled', {}, locale)}
                          locale={locale}
                        />
                      </p>
                      <p className="type-small text-muted-foreground">
                        {t(`channels.about_${channel.channel}`, {}, locale)}
                      </p>
                    </div>
                    <Switch
                      aria-label={t('channels.toggle', { channel: name }, locale)}
                      checked={channel.enabled}
                      disabled={busy}
                      onCheckedChange={() => void toggle(channel)}
                    />
                  </SettingsItem>
                )
              })}
            </SettingsList>
            <OperationError error={error} locale={locale} />
          </SettingsPart>
          <SettingsPart
            title={t('channels.preview_title', {}, locale)}
            description={t('channels.preview_description', {}, locale)}
          >
            <div>
              <Button variant="outline" onClick={() => void showPreview()} disabled={busy}>
                {t('channels.preview', {}, locale)}
              </Button>
            </div>
            {preview && (
              <section className="grid min-w-0 gap-3" aria-label={t('channels.preview', {}, locale)}>
                {preview.n === 0 ? (
                  <p role="status" className="type-body">
                    {t('channels.no_preview', {}, locale)}
                  </p>
                ) : (
                  <>
                    <p className="type-body text-muted-foreground">
                      {t('channels.source', { id: preview.call_id }, locale)}
                    </p>
                    {!preview.previews.length && <p className="type-body">{t('channels.no_renderings', {}, locale)}</p>}
                    {preview.previews.map((notice, index) => (
                      <article key={index} className="grid min-w-0 gap-2 rounded-md bg-raised p-4">
                        <h4 className="type-body font-semibold">
                          {t(
                            'channels.preview_label',
                            {
                              channel: t(`subscribe.${notice.channel}_channel`, {}, locale),
                              language: t(
                                notice.language === 'ms' ? 'subscribe.malay' : 'subscribe.english',
                                {},
                                locale
                              )
                            },
                            locale
                          )}
                        </h4>
                        <p className="type-text font-semibold">{notice.subject}</p>
                        <p className="type-text whitespace-pre-wrap">{notice.text}</p>
                      </article>
                    ))}
                  </>
                )}
              </section>
            )}
          </SettingsPart>
        </>
      )}
    </SettingsParts>
  )
}
