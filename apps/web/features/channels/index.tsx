'use client'

import '../subscribe/catalogue'
import '../subscribers/catalogue'
import { useEffect, useRef, useState } from 'react'
import { useParams, useSearchParams } from 'next/navigation'
import type { Channel } from '@skyclause/contracts'
import { Button } from '#ui/button'
import { Switch } from '#ui/switch'
import { t } from './catalogue'
import { apiFetch } from '../subscribe/operations'
import { actionClass } from '../subscribe/fields'
import { OperationError } from '../subscribe/error'
import { resolveProject } from '../subscribers/project'

const readPreview = (id: string) => apiFetch('previewChannels', { params: { id } })
type Preview = Awaited<ReturnType<typeof readPreview>>

export function Channels() {
  const { org, project } = useParams<{ org: string; project: string }>()
  const locale = useSearchParams().get('lang') === 'ms' ? 'ms' : 'en'
  const [projectId, setProjectId] = useState<string>()
  const [channels, setChannels] = useState<Channel[]>()
  const [preview, setPreview] = useState<Preview>()
  const [error, setError] = useState<unknown>(null)
  const [missing, setMissing] = useState(false)
  const [busy, setBusy] = useState(false)
  const [saved, setSaved] = useState('')
  const [attempt, setAttempt] = useState(0)
  const inFlight = useRef(false)
  useEffect(() => {
    const controller = new AbortController()
    setError(null)
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
        if (!controller.signal.aborted) setError(reason)
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
  return (
    <div className="grid min-w-0 gap-6 [overflow-wrap:anywhere]" data-channels-panel>
      <OperationError error={error} locale={locale} />
      {missing && <p role="alert">{t('subscribers.no_project', {}, locale)}</p>}
      {(error || missing) && (
        <Button className={actionClass} onClick={() => setAttempt((n) => n + 1)}>
          {t('subscribe.retry', {}, locale)}
        </Button>
      )}
      {!channels && !error && !missing && <p role="status">{t('subscribe.loading', {}, locale)}</p>}
      {channels && (
        <>
          {!channels.length && <p>{t('channels.empty', {}, locale)}</p>}
          <div className="grid min-w-0 gap-3">
            {channels.map((channel) => (
              <div
                key={channel.channel}
                className="flex min-w-0 items-center justify-between gap-4 border-b border-border pb-4"
              >
                <div className="grid min-w-0 gap-1">
                  <span>{t(`subscribe.${channel.channel}_channel`, {}, locale)}</span>
                  <span
                    className={
                      channel.enabled
                        ? 'inline-flex h-5 w-fit items-center rounded-full border border-transparent bg-primary px-2 text-xs font-medium text-primary-foreground'
                        : 'inline-flex h-5 w-fit items-center rounded-full border border-border px-2 text-xs font-medium text-muted-foreground'
                    }
                  >
                    {t(channel.enabled ? 'channels.enabled' : 'channels.disabled', {}, locale)}
                  </span>
                </div>
                <Switch
                  aria-label={t(
                    'channels.toggle',
                    { channel: t(`subscribe.${channel.channel}_channel`, {}, locale) },
                    locale
                  )}
                  checked={channel.enabled}
                  disabled={busy}
                  onCheckedChange={() => void toggle(channel)}
                />
              </div>
            ))}
          </div>
          <p role="status">{busy ? t('subscribe.saving', {}, locale) : saved}</p>
          <Button className={actionClass} onClick={() => void showPreview()} disabled={busy}>
            {t('channels.preview', {}, locale)}
          </Button>
        </>
      )}
      {preview && (
        <section className="grid min-w-0 gap-4" aria-label={t('channels.preview', {}, locale)}>
          {preview.n === 0 ? (
            <p role="status">{t('channels.no_preview', {}, locale)}</p>
          ) : (
            <>
              <p>{t('channels.source', { id: preview.call_id }, locale)}</p>
              {!preview.previews.length && <p>{t('channels.no_renderings', {}, locale)}</p>}
              {preview.previews.map((notice, index) => (
                <article key={index} className="grid min-w-0 gap-3 border-t border-border pt-4">
                  <h3 className="font-medium">
                    {t(
                      'channels.preview_label',
                      {
                        channel: t(`subscribe.${notice.channel}_channel`, {}, locale),
                        language: t(notice.language === 'ms' ? 'subscribe.malay' : 'subscribe.english', {}, locale)
                      },
                      locale
                    )}
                  </h3>
                  <p className="font-medium">{notice.subject}</p>
                  <p className="whitespace-pre-wrap">{notice.text}</p>
                </article>
              ))}
            </>
          )}
        </section>
      )}
    </div>
  )
}
