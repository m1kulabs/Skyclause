'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { CopyIcon } from 'lucide-react'
import { formatList } from '@skyclause/i18n/format'
import { Button } from '#ui/button'
import { CodeBlock, CodeBlockContent } from '#ui/code-block'
import { Input } from '#ui/input'
import { Field, FieldDescription, FieldGroup } from '#ui/field'
import { Label } from '#ui/label'
import { Skeleton } from '#ui/skeleton'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '#ui/dialog'
import { ApiProblem } from '../../../../lib/api-fetch'
import { StatusMark } from '../../../brand/status-mark'
import { FirstRunProgress } from '../../../onboarding/first-run-progress'
import { t as baseT } from '../../../onboarding/catalogue'
import { t as baseTs } from '../../../project-settings/catalogue'
import '../../catalogue'
import { onboardingApi, type ProjectView } from '../../../onboarding/operations'
import { SourcePicker } from '../../../sources/source-picker'
import { sourcesApi, type BoundSourceView, type CatalogueSourceView } from '../../../sources/operations'
import { ConfirmDialog } from '../../set-7'
import { focusHeadingWhenFree } from '../../focus'
import { RowPager, pageOf } from '../row-pager'
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

type Pack = 'sky' | 'crowd'

/** The roles of the sources each pack reads: the pack's own signals, so the row can say what it reads. */
const packRoles = {
  sky: ['rain_gauge', 'api_station', 'warnings', 'met_forecast'],
  crowd: ['rail_station', 'venue_listings', 'bus_feed', 'gtfs_static']
} as const satisfies Record<Pack, readonly string[]>
type Device = { source_id: string; token: string; scope: 'ingest'; kind: 'camera' | 'pi'; name: string }

async function allProjectSources(projectId: string, org: string) {
  const data: BoundSourceView[] = []
  const seen = new Set<string>()
  let cursor: string | undefined
  do {
    const page = await sourcesApi('listProjectSources', {
      params: { id: projectId },
      query: { limit: 200, cursor },
      org
    })
    data.push(...page.data)
    cursor = page.next_cursor ?? undefined
    if (cursor && seen.has(cursor)) throw new Error('Repeated source cursor')
    if (cursor) seen.add(cursor)
  } while (cursor)
  return data
}

function missingForCrowd(sources: BoundSourceView[]) {
  const rail = sources.some((source) => source.role === 'rail_station')
  const venue = sources.some((source) => source.role === 'venue_listings')
  return {
    rail,
    venue,
    missing: !rail && !venue ? 'missing_both' : !rail ? 'missing_rail' : !venue ? 'missing_venue' : null
  }
}

export interface ProjectPacksPanelProps {
  org: string
  project: string
  initialPack?: string
  /** Whether Add device can work (`createDevice` has a handler); without it the Devices part is not offered. */
  devices?: boolean
  locale?: 'en' | 'ms'
}

export default function Panel({
  org,
  project: projectSlug,
  initialPack,
  devices = false,
  locale = 'en'
}: ProjectPacksPanelProps) {
  const t = (key: string, vars: Record<string, string | number> = {}) => baseT(key, vars, locale)
  const ts = (key: string, vars: Record<string, string | number> = {}) => baseTs(key, vars, locale)
  const [project, setProject] = useState<ProjectView | null>(null)
  const [sources, setSources] = useState<BoundSourceView[]>([])
  const [loading, setLoading] = useState(true)
  const [loadFailed, setLoadFailed] = useState<unknown>(null)
  const [message, setMessage] = useState('')
  const [notice, setNotice] = useState('')
  const [confirmPack, setConfirmPack] = useState<{ pack: Pack; enable: boolean } | null>(null)
  const [unbinding, setUnbinding] = useState<BoundSourceView | null>(null)
  const [tokenCopied, setTokenCopied] = useState<'idle' | 'copied' | 'failed'>('idle')
  const [crowdMissingMessage, setCrowdMissingMessage] = useState('')
  const [workingPack, setWorkingPack] = useState<Pack | null>(null)
  const [crowdIntent, setCrowdIntent] = useState(false)
  const [pickerOpen, setPickerOpen] = useState(false)
  const [deviceOpen, setDeviceOpen] = useState(false)
  const [deviceKind, setDeviceKind] = useState<'camera' | 'pi'>('camera')
  const [deviceName, setDeviceName] = useState('')
  const [device, setDevice] = useState<Device | null>(null)
  const [deviceSaving, setDeviceSaving] = useState(false)
  const [deviceError, setDeviceError] = useState(false)
  const [deviceNameError, setDeviceNameError] = useState(false)
  const [sourcePage, setSourcePage] = useState(0)
  const queryApplied = useRef(false)

  const load = useCallback(async () => {
    setLoading(true)
    setLoadFailed(null)
    try {
      const projects = await onboardingApi('listProjects', {
        query: { slug: projectSlug, limit: 200, cursor: undefined },
        org
      })
      const found = projects.data.find((item) => item.slug === projectSlug)
      if (!found) throw new Error('Project unavailable')
      const bound = await allProjectSources(found.id, org)
      setProject(found)
      setSources(bound)
    } catch (error) {
      setLoadFailed(error ?? new Error('Project settings could not load'))
    } finally {
      setLoading(false)
    }
  }, [org, projectSlug])

  useEffect(() => {
    void load()
  }, [load])

  useEffect(() => {
    if (queryApplied.current || initialPack !== 'crowd' || loading || !project) return
    queryApplied.current = true
    setCrowdIntent(true)
    const prerequisites = missingForCrowd(sources)
    if (prerequisites.missing) setPickerOpen(true)
    else setConfirmPack({ pack: 'crowd', enable: true })
    // The query is a one-time request to enter Crowd's source step.
  }, [initialPack, loading, project, sources])

  const boundIds = useMemo(() => new Set(sources.map((source) => source.id)), [sources])
  const missing = missingForCrowd(sources)

  async function updatePack(pack: Pack, enabled: boolean, sourcesForCheck = sources): Promise<boolean> {
    if (!project || workingPack) return false
    setWorkingPack(pack)
    setMessage('')
    setNotice('')
    if (pack === 'crowd') setCrowdMissingMessage('')
    try {
      const updated = await sourcesApi('updateProjectPack', {
        params: { id: project.id, pack },
        body: { enabled },
        org
      })
      setProject((current) =>
        current
          ? { ...current, packs: current.packs.map((item) => (item.pack === updated.pack ? updated : item)) }
          : current
      )
      if (pack === 'crowd' && enabled) setCrowdIntent(false)
      setNotice(
        ts(enabled ? 'project-settings.pack_turned_on' : 'project-settings.pack_turned_off', {
          pack: ts(`project-settings.${pack}`),
          project: project.name
        })
      )
      return true
    } catch (error) {
      const detail = error instanceof ApiProblem ? error.body.detail : undefined
      const code = error instanceof ApiProblem ? error.body.type?.split('/').pop() : undefined
      if (pack === 'crowd' && enabled && code === 'pack-prerequisites') {
        const prerequisite = missingForCrowd(sourcesForCheck)
        setCrowdIntent(true)
        setCrowdMissingMessage(
          typeof detail === 'string' && detail
            ? detail
            : t('onboarding.pack_missing', { missing: t(`onboarding.${prerequisite.missing ?? 'missing_both'}`) })
        )
        setPickerOpen(true)
      } else {
        setMessage(typeof detail === 'string' && detail ? detail : t('onboarding.save_error_generic'))
      }
      return false
    } finally {
      setWorkingPack(null)
    }
  }

  async function refreshAfterBind(_source: CatalogueSourceView) {
    if (!project) return
    try {
      const next = await allProjectSources(project.id, org)
      setSources(next)
      const prerequisite = missingForCrowd(next)
      if (crowdIntent && !prerequisite.missing) {
        if (await updatePack('crowd', true, next)) {
          setCrowdMissingMessage('')
          setPickerOpen(false)
        }
      }
    } catch {
      setMessage(t('onboarding.load_project_error'))
    }
  }

  async function unbind(source: BoundSourceView) {
    if (!project) return
    setMessage('')
    setNotice('')
    try {
      await sourcesApi('unbindSource', { params: { id: project.id, sourceId: source.id }, org })
      const next = await allProjectSources(project.id, org)
      setSources(next)
      setSourcePage((page) => Math.min(page, Math.max(0, Math.ceil(next.length / 50) - 1)))
      setNotice(ts('project-settings.unbound', { source: source.external_id, project: project.name }))
      // The row that held focus is gone: the list's heading takes it, after the confirm dialog lets go.
      focusHeadingWhenFree('sources-heading')
    } catch {
      setMessage(t('onboarding.save_error_generic'))
    }
  }

  async function createDevice(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!project || deviceSaving) return
    if (!deviceName.trim()) {
      setDeviceNameError(true)
      document.getElementById('device-name')?.focus()
      return
    }
    setDeviceSaving(true)
    setDeviceError(false)
    try {
      const created = await sourcesApi('createDevice', {
        params: { id: project.id },
        body: { kind: deviceKind, name: deviceName.trim() },
        org
      })
      setDevice(created)
    } catch {
      setDeviceError(true)
    } finally {
      setDeviceSaving(false)
    }
  }

  async function copyToken() {
    if (!device) return
    try {
      await navigator.clipboard.writeText(device.token)
      setTokenCopied('copied')
    } catch {
      setTokenCopied('failed')
    }
  }

  if (loading && !project)
    return (
      <SettingsLoading locale={locale} className="grid gap-4">
        <Skeleton className="h-16 w-full rounded-md" />
        <Skeleton className="h-16 w-full rounded-md" />
      </SettingsLoading>
    )
  if (loadFailed || !project) {
    return (
      <SettingsReadError
        source={ts('project-settings.source')}
        error={loadFailed}
        onRetry={() => void load()}
        locale={locale}
      />
    )
  }

  const readsOf = (pack: Pack) =>
    sources.filter((source) => (packRoles[pack] as readonly string[]).includes(source.role))
  return (
    <SettingsParts data-project-packs>
      <SettingsAside>
        {(['sky', 'crowd'] as const).map((pack) => (
          <SettingsSummaryLine key={pack} label={t(`onboarding.${pack}`)}>
            {ts(
              project.packs.find((item) => item.pack === pack)?.enabled
                ? 'project-settings.pack_on'
                : 'project-settings.pack_off'
            )}
          </SettingsSummaryLine>
        ))}
        <SettingsSummaryLine label={t('onboarding.sources_bound')}>
          <span data-numeric>{sources.length}</span>
        </SettingsSummaryLine>
      </SettingsAside>
      <FirstRunProgress org={org} locale={locale} />
      <SettingsPart title={t('onboarding.packs')} description={t('onboarding.packs_description')} id="packs-heading">
        <SettingsList>
          {(['sky', 'crowd'] as const).map((pack) => {
            const enabled = project.packs.find((item) => item.pack === pack)?.enabled ?? false
            const prerequisite = pack === 'crowd' ? missing : null
            const missingText =
              pack === 'crowd'
                ? crowdMissingMessage ||
                  (prerequisite?.missing
                    ? t('onboarding.pack_missing', { missing: t(`onboarding.${prerequisite.missing}`) })
                    : '')
                : ''
            const reads = readsOf(pack)
            return (
              <SettingsItem key={pack} className="items-start">
                <div className="grid min-w-0 flex-1 gap-1">
                  <label htmlFor={`pack-${pack}`} className="type-card-title flex min-h-6 items-center">
                    {t(`onboarding.${pack}`)}
                  </label>
                  <p className="type-body" data-pack-state={enabled ? 'on' : 'off'}>
                    <StatusMark
                      state={enabled ? 'fresh' : 'off_hours'}
                      variant="plain"
                      label={ts(enabled ? 'project-settings.pack_on' : 'project-settings.pack_off')}
                    />
                  </p>
                  <p className="type-small text-muted-foreground [overflow-wrap:anywhere]">
                    {reads.length
                      ? ts('project-settings.reads', {
                          sources: formatList(
                            reads.map((source) => `${source.external_id} ${source.name}`),
                            locale
                          )
                        })
                      : ts('project-settings.reads_none')}
                  </p>
                  {pack === 'crowd' && missingText && (
                    <p
                      className="type-small font-medium"
                      id="crowd-missing"
                      role={crowdMissingMessage ? 'alert' : undefined}
                    >
                      {missingText}
                    </p>
                  )}
                </div>
                <input
                  id={`pack-${pack}`}
                  name="pack"
                  type="checkbox"
                  role="switch"
                  className="native-switch"
                  value={pack}
                  checked={enabled}
                  disabled={workingPack !== null}
                  aria-describedby={pack === 'crowd' && missingText ? 'crowd-missing' : undefined}
                  onChange={(event) => setConfirmPack({ pack, enable: event.target.checked })}
                />
              </SettingsItem>
            )
          })}
        </SettingsList>
        {notice ? <SettingsStatus>{notice}</SettingsStatus> : null}
        {message ? <SettingsError>{message}</SettingsError> : null}
      </SettingsPart>

      <SettingsPart
        title={t('onboarding.sources_bound')}
        id="sources-heading"
        actions={
          <Button type="button" variant="outline" onClick={() => setPickerOpen(true)}>
            {t('onboarding.add_source')}
          </Button>
        }
      >
        {sources.length === 0 ? (
          <p className="type-body text-muted-foreground">{t('onboarding.no_bound_sources')}</p>
        ) : (
          <SettingsList>
            {pageOf(sources, sourcePage).map((source) => (
              <SettingsItem key={source.id}>
                <div className="grid min-w-0 gap-0.5">
                  <strong className="type-body [overflow-wrap:anywhere]">
                    <span translate="no">{source.external_id}</span> {t('onboarding.separator')} {source.name}
                  </strong>
                  <p className="type-small text-muted-foreground">
                    {t('onboarding.source_adapter_role', {
                      adapter: t(`onboarding.adapter_${source.kind}`),
                      role: t(`onboarding.role_${source.role}`)
                    })}
                  </p>
                  {source.state === null && (
                    <span className="type-small text-muted-foreground">{t('onboarding.source_not_evaluated')}</span>
                  )}
                  {source.state?.state === 'error' && (
                    <span className="type-small font-medium">{t('onboarding.source_error')}</span>
                  )}
                </div>
                <Button type="button" variant="outline" onClick={() => setUnbinding(source)}>
                  {t('onboarding.remove_source', { source: source.external_id })}
                </Button>
              </SettingsItem>
            ))}
          </SettingsList>
        )}
        <RowPager
          total={sources.length}
          page={sourcePage}
          onPage={setSourcePage}
          locale={locale}
          rangeKey="project-settings.sources_range"
        />
      </SettingsPart>

      {devices && (
        <SettingsPart
          title={t('onboarding.devices')}
          id="devices-title"
          actions={
            <Button
              type="button"
              variant="outline"
              onClick={() => {
                setDevice(null)
                setDeviceError(false)
                setTokenCopied('idle')
                setDeviceNameError(false)
                setDeviceOpen(true)
              }}
            >
              {t('onboarding.add_device')}
            </Button>
          }
        />
      )}

      <SourcePicker
        open={pickerOpen}
        onOpenChange={setPickerOpen}
        org={org}
        projectId={project.id}
        site={{ lat: project.site_lat, lon: project.site_lon }}
        boundIds={boundIds}
        onBound={refreshAfterBind}
        locale={locale}
      />
      {confirmPack ? (
        <ConfirmDialog
          open
          onOpenChange={(open) => !open && setConfirmPack(null)}
          objectName={project.name}
          locale={locale}
          title={ts(confirmPack.enable ? 'project-settings.pack_on_title' : 'project-settings.pack_off_title', {
            pack: ts(`project-settings.${confirmPack.pack}`),
            project: project.name
          })}
          confirmLabel={ts(confirmPack.enable ? 'project-settings.pack_on_title' : 'project-settings.pack_off_title', {
            pack: ts(`project-settings.${confirmPack.pack}`),
            project: project.name
          })}
          description={ts(
            confirmPack.enable ? 'project-settings.pack_on_description' : 'project-settings.pack_off_description',
            { pack: ts(`project-settings.${confirmPack.pack}`) }
          )}
          onConfirm={async () => {
            await updatePack(confirmPack.pack, confirmPack.enable)
          }}
        />
      ) : null}
      {unbinding ? (
        <ConfirmDialog
          open
          onOpenChange={(open) => !open && setUnbinding(null)}
          objectName={unbinding.external_id}
          locale={locale}
          title={ts('project-settings.unbind_title', { source: unbinding.external_id })}
          confirmLabel={ts('project-settings.unbind_title', { source: unbinding.external_id })}
          description={ts('project-settings.unbind_description', { project: project.name })}
          onConfirm={async () => {
            await unbind(unbinding)
          }}
        />
      ) : null}
      <Dialog
        open={devices && deviceOpen}
        onOpenChange={(open) => {
          setDeviceOpen(open)
          if (!open) {
            setDevice(null)
            setDeviceName('')
            setDeviceError(false)
            setDeviceNameError(false)
          }
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{device ? t('onboarding.device_token') : t('onboarding.add_device')}</DialogTitle>
            <DialogDescription>
              {device ? t('onboarding.token_once') : t('onboarding.device_description')}
            </DialogDescription>
          </DialogHeader>
          {device ? (
            <div className="grid min-w-0 gap-3">
              <p className="type-body">
                <strong>{device.name}</strong> {t('onboarding.separator')} {t(`onboarding.${device.kind}`)}
              </p>
              <CodeBlock>
                <CodeBlockContent wrap translate="no" aria-label={t('onboarding.device_token')}>
                  {device.token}
                </CodeBlockContent>
              </CodeBlock>
              <div className="flex flex-wrap items-center gap-3">
                <Button type="button" variant="outline" onClick={() => void copyToken()}>
                  <CopyIcon data-icon="inline-start" />
                  {tokenCopied === 'copied' ? ts('project-settings.copied') : ts('project-settings.copy_token')}
                </Button>
                <Button type="button" onClick={() => setDeviceOpen(false)}>
                  {t('onboarding.close')}
                </Button>
              </div>
              {tokenCopied === 'copied' ? <SettingsStatus>{ts('project-settings.copied')}</SettingsStatus> : null}
              {tokenCopied === 'failed' ? <SettingsError>{ts('project-settings.copy_failed')}</SettingsError> : null}
            </div>
          ) : (
            <form className="min-w-0" onSubmit={(event) => void createDevice(event)}>
              <FieldGroup className="gap-4">
                <Field data-invalid={deviceNameError || undefined}>
                  <Label htmlFor="device-name">{t('onboarding.device_name')}</Label>
                  <Input
                    id="device-name"
                    name="name"
                    autoComplete="off"
                    value={deviceName}
                    maxLength={80}
                    aria-invalid={deviceNameError ? true : undefined}
                    aria-describedby={`device-name-hint${deviceNameError ? ' device-name-error' : ''}`}
                    onChange={(event) => {
                      setDeviceName(event.target.value)
                      if (deviceNameError) setDeviceNameError(false)
                    }}
                  />
                  <FieldDescription id="device-name-hint">{ts('project-settings.device_name_hint')}</FieldDescription>
                  {deviceNameError ? (
                    <SettingsError id="device-name-error">{ts('project-settings.device_name_required')}</SettingsError>
                  ) : null}
                </Field>
                <Field>
                  <Label htmlFor="device-kind">{t('onboarding.device_kind')}</Label>
                  <select
                    id="device-kind"
                    name="kind"
                    autoComplete="off"
                    className="native-select"
                    value={deviceKind}
                    onChange={(event) => setDeviceKind(event.target.value as 'camera' | 'pi')}
                  >
                    <option value="camera">{t('onboarding.camera')}</option>
                    <option value="pi">{t('onboarding.pi')}</option>
                  </select>
                </Field>
                {deviceError ? <SettingsError>{t('onboarding.save_error_generic')}</SettingsError> : null}
                <Button type="submit" disabled={deviceSaving} aria-busy={deviceSaving}>
                  {deviceSaving ? t('onboarding.saving') : t('onboarding.create_device')}
                </Button>
              </FieldGroup>
            </form>
          )}
        </DialogContent>
      </Dialog>
    </SettingsParts>
  )
}
