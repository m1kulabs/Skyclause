'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Button } from '#ui/button'
import { Field, FieldLabel } from '#ui/field'
import { Input } from '#ui/input'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '#ui/dialog'
import { ApiProblem } from '../../../../lib/api-fetch'
import { FirstRunProgress } from '../../../onboarding/first-run-progress'
import { t } from '../../../onboarding/catalogue'
import { onboardingApi, type ProjectView } from '../../../onboarding/operations'
import { SourcePicker } from '../../../sources/source-picker'
import { sourcesApi, type BoundSourceView, type CatalogueSourceView } from '../../../sources/operations'
import styles from '../../../onboarding/onboarding.module.css'

type Pack = 'sky' | 'crowd'
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
}

export default function Panel({ org, project: projectSlug, initialPack }: ProjectPacksPanelProps) {
  const [project, setProject] = useState<ProjectView | null>(null)
  const [sources, setSources] = useState<BoundSourceView[]>([])
  const [loading, setLoading] = useState(true)
  const [loadFailed, setLoadFailed] = useState(false)
  const [message, setMessage] = useState('')
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
  const queryApplied = useRef(false)

  const load = useCallback(async () => {
    setLoading(true)
    setLoadFailed(false)
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
    } catch {
      setLoadFailed(true)
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
    else void updatePack('crowd', true)
    // The query is a one-time request to enter Crowd's source step.
  }, [initialPack, loading, project, sources])

  const boundIds = useMemo(() => new Set(sources.map((source) => source.id)), [sources])
  const missing = missingForCrowd(sources)

  async function updatePack(pack: Pack, enabled: boolean, sourcesForCheck = sources): Promise<boolean> {
    if (!project || workingPack) return false
    setWorkingPack(pack)
    setMessage('')
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
    try {
      await sourcesApi('unbindSource', { params: { id: project.id, sourceId: source.id }, org })
      const next = await allProjectSources(project.id, org)
      setSources(next)
    } catch {
      setMessage(t('onboarding.save_error_generic'))
    }
  }

  async function createDevice(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!project || deviceSaving || !deviceName.trim()) return
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

  if (loading && !project)
    return (
      <p className={styles.status} role="status">
        {t('onboarding.loading_project')}
      </p>
    )
  if (loadFailed || !project) {
    return (
      <div className={styles.status} role="alert">
        <p>{t('onboarding.load_project_error')}</p>
        <Button type="button" variant="outline" onClick={() => void load()}>
          {t('onboarding.retry')}
        </Button>
      </div>
    )
  }

  return (
    <div className={styles.packsPanel} data-project-packs>
      <FirstRunProgress org={org} />
      <header className={styles.panelHeader}>
        <div>
          <h2>{t('onboarding.packs_title')}</h2>
          <p className={styles.helper}>{t('onboarding.packs_description')}</p>
        </div>
      </header>
      <section className={styles.packList} aria-labelledby="packs-heading">
        <h2 id="packs-heading" className="sr-only">
          {t('onboarding.packs')}
        </h2>
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
          return (
            <div className={styles.packRow} key={pack}>
              <div className={styles.packRowDetails}>
                <label htmlFor={`pack-${pack}`}>{t(`onboarding.${pack}`)}</label>
                {pack === 'crowd' && missingText && (
                  <p className={styles.packMissing} id="crowd-missing" role={crowdMissingMessage ? 'alert' : undefined}>
                    {missingText}
                  </p>
                )}
              </div>
              <input
                id={`pack-${pack}`}
                name="pack"
                type="checkbox"
                value={pack}
                checked={enabled}
                disabled={workingPack !== null}
                aria-describedby={pack === 'crowd' && missingText ? 'crowd-missing' : undefined}
                onChange={(event) => void updatePack(pack, event.target.checked)}
              />
            </div>
          )
        })}
        {message && (
          <p className={styles.status} role="status">
            {message}
          </p>
        )}
        <div className={styles.panelHeader}>
          <h2>{t('onboarding.sources_bound')}</h2>
          <Button type="button" variant="outline" onClick={() => setPickerOpen(true)}>
            {t('onboarding.add_source')}
          </Button>
        </div>
        {sources.length === 0 ? (
          <p className={styles.helper}>{t('onboarding.no_bound_sources')}</p>
        ) : (
          <ul className={styles.boundSources}>
            {sources.map((source) => (
              <li className={styles.boundSource} key={source.id}>
                <div>
                  <strong>
                    {source.external_id} {t('onboarding.separator')} {source.name}
                  </strong>
                  <p>
                    {t('onboarding.source_adapter_role', {
                      adapter: t(`onboarding.adapter_${source.kind}`),
                      role: t(`onboarding.role_${source.role}`)
                    })}
                  </p>
                  {source.state.state === 'error' && (
                    <span className={styles.sourceError}>
                      {t('onboarding.source_error', {
                        status: source.state.http_status ?? t('onboarding.source_error_unknown')
                      })}
                    </span>
                  )}
                </div>
                <Button type="button" variant="ghost" onClick={() => void unbind(source)}>
                  {t('onboarding.remove_source', { source: source.external_id })}
                </Button>
              </li>
            ))}
          </ul>
        )}
      </section>
      <section className={styles.deviceSection} aria-labelledby="devices-title">
        <header className={styles.deviceHeader}>
          <h2 id="devices-title">{t('onboarding.devices')}</h2>
          <Button
            type="button"
            variant="outline"
            onClick={() => {
              setDevice(null)
              setDeviceError(false)
              setDeviceOpen(true)
            }}
          >
            {t('onboarding.add_device')}
          </Button>
        </header>
      </section>
      <SourcePicker
        open={pickerOpen}
        onOpenChange={setPickerOpen}
        org={org}
        projectId={project.id}
        site={{ lat: project.site_lat, lon: project.site_lon }}
        boundIds={boundIds}
        onBound={refreshAfterBind}
      />
      <Dialog
        open={deviceOpen}
        onOpenChange={(open) => {
          setDeviceOpen(open)
          if (!open) {
            setDevice(null)
            setDeviceName('')
            setDeviceError(false)
          }
        }}
      >
        <DialogContent className={styles.deviceDialog}>
          <DialogHeader>
            <DialogTitle>{device ? t('onboarding.device_token') : t('onboarding.add_device')}</DialogTitle>
            <DialogDescription>
              {device ? t('onboarding.token_once') : t('onboarding.device_description')}
            </DialogDescription>
          </DialogHeader>
          {device ? (
            <>
              <p>
                <strong>{device.name}</strong> {t('onboarding.separator')} {t(`onboarding.${device.kind}`)}
              </p>
              <code className={styles.tokenBlock} aria-label={t('onboarding.device_token')}>
                {device.token}
              </code>
              <Button type="button" onClick={() => setDeviceOpen(false)}>
                {t('onboarding.close')}
              </Button>
            </>
          ) : (
            <form className={styles.boundSources} onSubmit={(event) => void createDevice(event)}>
              <Field>
                <FieldLabel htmlFor="device-name">{t('onboarding.device_name')}</FieldLabel>
                <Input
                  id="device-name"
                  name="name"
                  autoComplete="off"
                  value={deviceName}
                  onChange={(event) => setDeviceName(event.target.value)}
                  required
                />
              </Field>
              <Field>
                <FieldLabel htmlFor="device-kind">{t('onboarding.device_kind')}</FieldLabel>
                <select
                  id="device-kind"
                  name="kind"
                  autoComplete="off"
                  value={deviceKind}
                  onChange={(event) => setDeviceKind(event.target.value as 'camera' | 'pi')}
                >
                  <option value="camera">{t('onboarding.camera')}</option>
                  <option value="pi">{t('onboarding.pi')}</option>
                </select>
              </Field>
              {deviceError && (
                <p role="alert" className={styles.error}>
                  {t('onboarding.save_error_generic')}
                </p>
              )}
              <Button type="submit" disabled={deviceSaving || !deviceName.trim()}>
                {deviceSaving ? t('onboarding.saving') : t('onboarding.create_device')}
              </Button>
            </form>
          )}
        </DialogContent>
      </Dialog>
    </div>
  )
}
