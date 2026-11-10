'use client'

import { useCallback, useEffect, useState, type FormEvent } from 'react'
import { useParams } from 'next/navigation'
import { formatTimeZoneName } from '@skyclause/i18n/format'
import { defaultSlaSeconds, slaUpdateBody } from '../../../project-settings/model'
import { projectSettingsApi, resolveProject, type Project } from '../../../project-settings/operations'
import { useRead } from '../../../analysis/use-read'
import { Button } from '#ui/button'
import { Input } from '#ui/input'
import { Label } from '#ui/label'
import { useUndoableAction } from '../../set-7'
import { t } from '../../../project-settings/catalogue'

type Locale = 'en' | 'ms'
type ProjectForm = {
  name: string
  siteName: string
  latitude: string
  longitude: string
  timeZone: string
  cameraStart: string
  cameraEnd: string
  semesterEnd: string
  warningTerms: string
}

function formFrom(project: Project): ProjectForm {
  return {
    name: project.name,
    siteName: project.site_name ?? '',
    latitude: project.site_lat === null ? '' : String(project.site_lat),
    longitude: project.site_lon === null ? '' : String(project.site_lon),
    timeZone: project.time_zone,
    cameraStart: project.camera_day_start ?? '',
    cameraEnd: project.camera_day_end ?? '',
    semesterEnd: project.semester_ends_on ?? '',
    warningTerms: project.warning_area_terms.join(', ')
  }
}

function projectFromForm(form: ProjectForm) {
  return {
    name: form.name.trim(),
    site_name: form.siteName.trim() || null,
    site_lat: form.latitude.trim() === '' ? null : Number(form.latitude),
    site_lon: form.longitude.trim() === '' ? null : Number(form.longitude),
    time_zone: form.timeZone.trim(),
    camera_day_start: form.cameraStart || null,
    camera_day_end: form.cameraEnd || null,
    semester_ends_on: form.semesterEnd || null,
    warning_area_terms: form.warningTerms
      .split(',')
      .map((term) => term.trim())
      .filter(Boolean)
  }
}

function Field({
  id,
  label,
  children,
  hint,
  focusRing = false
}: {
  id: string
  label: string
  children: React.ReactNode
  hint?: string
  focusRing?: boolean
}) {
  return (
    <div
      data-focus-ring={focusRing ? '' : undefined}
      className={`grid min-w-0 gap-2 ${focusRing ? 'rounded-sm focus-within:outline-solid focus-within:outline-2 focus-within:outline-offset-2 focus-within:outline-ring' : ''}`}
    >
      <Label htmlFor={id}>{label}</Label>
      {children}
      {hint ? <p className="text-sm text-muted-foreground">{hint}</p> : null}
    </div>
  )
}

export function ProjectGeneralPanel({ locale = 'en' }: { locale?: Locale }) {
  const params = useParams<{ org: string; project: string }>()
  const [readRevision, setReadRevision] = useState(0)
  const read = useCallback(
    (signal: AbortSignal) => resolveProject(params.org, params.project, signal),
    [params.org, params.project, readRevision]
  )
  const loaded = useRead(read)
  const [project, setProject] = useState<Project | null>(null)
  const [form, setForm] = useState<ProjectForm | null>(null)
  const [savedForm, setSavedForm] = useState<ProjectForm | null>(null)
  const [sla, setSla] = useState<Record<'sky' | 'crowd', number>>({
    sky: defaultSlaSeconds('sky'),
    crowd: defaultSlaSeconds('crowd')
  })
  const [savedSla, setSavedSla] = useState<Record<'sky' | 'crowd', number> | null>(null)
  const [busy, setBusy] = useState<'project' | 'sky' | 'crowd' | null>(null)
  const [status, setStatus] = useState('')
  const [error, setError] = useState('')
  const [archived, setArchived] = useState(false)

  useEffect(() => {
    if (loaded.status !== 'ready') return
    const value = loaded.value
    const nextForm = formFrom(value)
    const nextSla = {
      sky: value.packs.find((pack) => pack.pack === 'sky')?.sla_s ?? defaultSlaSeconds('sky'),
      crowd: value.packs.find((pack) => pack.pack === 'crowd')?.sla_s ?? defaultSlaSeconds('crowd')
    }
    setProject(value)
    setForm(nextForm)
    setSavedForm(nextForm)
    setSla(nextSla)
    setSavedSla(nextSla)
    setArchived(value.archived_at !== null)
  }, [loaded])

  const dirty = !!form && !!savedForm && JSON.stringify(form) !== JSON.stringify(savedForm)
  const slaDirty = (pack: 'sky' | 'crowd') => savedSla !== null && sla[pack] !== savedSla[pack]
  const archiveAction = useUndoableAction(async ({ keepalive }) => {
    if (!project) return
    const result = await projectSettingsApi('archiveProject', { params: { id: project.id }, keepalive })
    setArchived(result.archived_at !== null)
  })

  const saveProject = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (!project || !form || !dirty || busy) return
    const body = projectFromForm(form)
    if (
      (body.site_lat !== null && (!Number.isFinite(body.site_lat) || body.site_lat < -90 || body.site_lat > 90)) ||
      (body.site_lon !== null && (!Number.isFinite(body.site_lon) || body.site_lon < -180 || body.site_lon > 180))
    ) {
      setError(t('project-settings.invalid_coordinates', {}, locale))
      setStatus('')
      return
    }
    setBusy('project')
    setError('')
    setStatus('')
    try {
      const updated = await projectSettingsApi('updateProject', { params: { id: project.id }, body })
      const next = formFrom(updated)
      setProject(updated)
      setForm(next)
      setSavedForm(next)
      setStatus(t('project-settings.saved', {}, locale))
    } catch {
      setError(t('project-settings.save_failed', {}, locale))
    } finally {
      setBusy(null)
    }
  }

  const saveSla = async (pack: 'sky' | 'crowd') => {
    if (!project || !slaDirty(pack) || busy) return
    setBusy(pack)
    setError('')
    setStatus('')
    try {
      const existing = project.packs.find((item) => item.pack === pack)
      const updated = await projectSettingsApi('updateProjectPack', {
        org: params.org,
        params: { id: project.id, pack },
        body: slaUpdateBody({ pack, enabled: existing?.enabled ?? false }, sla[pack])
      })
      setProject(
        (current) =>
          current && {
            ...current,
            packs: current.packs.some((item) => item.pack === pack)
              ? current.packs.map((item) => (item.pack === pack ? updated : item))
              : [...current.packs, updated]
          }
      )
      setSla((current) => ({ ...current, [pack]: updated.sla_s ?? sla[pack] }))
      setSavedSla((current) => current && { ...current, [pack]: updated.sla_s ?? sla[pack] })
      setStatus(t('project-settings.saved', {}, locale))
    } catch {
      setError(t('project-settings.save_failed', {}, locale))
    } finally {
      setBusy(null)
    }
  }

  const restore = async () => {
    if (!project || busy) return
    setBusy('project')
    setError('')
    try {
      const result = await projectSettingsApi('restoreProject', { params: { id: project.id } })
      setProject(result)
      setArchived(false)
      setStatus(t('project-settings.saved', {}, locale))
    } catch {
      setError(t('project-settings.restore_failed', {}, locale))
    } finally {
      setBusy(null)
    }
  }

  if (loaded.status === 'loading')
    return (
      <div className="grid gap-6" aria-busy="true">
        <div className="h-10 animate-pulse rounded bg-muted" />
        <div className="h-40 animate-pulse rounded bg-muted" />
      </div>
    )
  if (loaded.status === 'error')
    return (
      <div role="alert" className="flex flex-wrap items-center gap-2 text-sm text-destructive">
        <span>{t('project-settings.load_failed', {}, locale)}</span>
        <Button type="button" variant="link" onClick={() => setReadRevision((value) => value + 1)}>
          {t('project-settings.retry', {}, locale)}
        </Button>
      </div>
    )
  if (!project || !form)
    return (
      <div className="grid gap-6" aria-busy="true">
        <div className="h-10 animate-pulse rounded bg-muted" />
        <div className="h-40 animate-pulse rounded bg-muted" />
      </div>
    )

  const field = (key: keyof ProjectForm, value: string) => setForm((current) => current && { ...current, [key]: value })

  return (
    <div className="grid min-w-0 gap-8" data-project-settings-general>
      <form className="grid min-w-0 gap-6" onSubmit={saveProject}>
        <div className="grid min-w-0 gap-5 sm:grid-cols-2">
          <Field id="project-name" label={t('project-settings.name', {}, locale)}>
            <Input
              id="project-name"
              name="name"
              autoComplete="organization-title"
              value={form.name}
              onChange={(event) => field('name', event.target.value)}
              required
              maxLength={120}
            />
          </Field>
          <Field id="site-name" label={t('project-settings.site_name', {}, locale)}>
            <Input
              id="site-name"
              name="site_name"
              autoComplete="organization"
              value={form.siteName}
              onChange={(event) => field('siteName', event.target.value)}
              maxLength={160}
            />
          </Field>
          <Field id="site-latitude" label={t('project-settings.latitude', {}, locale)}>
            <Input
              id="site-latitude"
              name="site_lat"
              autoComplete="off"
              inputMode="decimal"
              type="number"
              step="any"
              min="-90"
              max="90"
              value={form.latitude}
              onChange={(event) => field('latitude', event.target.value)}
            />
          </Field>
          <Field id="site-longitude" label={t('project-settings.longitude', {}, locale)}>
            <Input
              id="site-longitude"
              name="site_lon"
              autoComplete="off"
              inputMode="decimal"
              type="number"
              step="any"
              min="-180"
              max="180"
              value={form.longitude}
              onChange={(event) => field('longitude', event.target.value)}
            />
          </Field>
          <Field id="project-time-zone" label={t('project-settings.time_zone', {}, locale)}>
            <Input
              id="project-time-zone"
              name="time_zone"
              autoComplete="off"
              value={form.timeZone}
              onChange={(event) => field('timeZone', event.target.value)}
              required
            />
          </Field>
          <Field id="semester-end" label={t('project-settings.semester_end', {}, locale)} focusRing>
            <Input
              id="semester-end"
              name="semester_ends_on"
              autoComplete="off"
              type="date"
              value={form.semesterEnd}
              onChange={(event) => field('semesterEnd', event.target.value)}
            />
          </Field>
        </div>

        <fieldset className="grid min-w-0 gap-4 rounded-md border p-4 sm:grid-cols-2">
          <legend className="px-1 text-sm font-medium">{t('project-settings.camera_hours', {}, locale)}</legend>
          <p className="text-sm text-muted-foreground sm:col-span-2">
            {t('project-settings.local_time_zone', { zone: formatTimeZoneName(form.timeZone, locale) }, locale)}
          </p>
          <Field id="camera-start" label={t('project-settings.camera_start', {}, locale)} focusRing>
            <Input
              id="camera-start"
              name="camera_day_start"
              autoComplete="off"
              type="time"
              value={form.cameraStart}
              onChange={(event) => field('cameraStart', event.target.value)}
            />
          </Field>
          <Field id="camera-end" label={t('project-settings.camera_end', {}, locale)} focusRing>
            <Input
              id="camera-end"
              name="camera_day_end"
              autoComplete="off"
              type="time"
              value={form.cameraEnd}
              onChange={(event) => field('cameraEnd', event.target.value)}
            />
          </Field>
        </fieldset>

        <Field
          id="warning-terms"
          label={t('project-settings.warning_terms', {}, locale)}
          hint={t('project-settings.warning_hint', {}, locale)}
        >
          <textarea
            id="warning-terms"
            name="warning_area_terms"
            autoComplete="off"
            rows={3}
            value={form.warningTerms}
            onChange={(event) => field('warningTerms', event.target.value)}
            className="min-h-24 w-full rounded-md border border-input bg-background px-3 py-2 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          />
        </Field>
        <div className="flex flex-wrap items-center gap-3">
          <Button type="submit" disabled={!dirty || busy !== null} aria-busy={busy === 'project'}>
            {busy === 'project' ? t('project-settings.saving', {}, locale) : t('project-settings.save', {}, locale)}
          </Button>
          {status ? (
            <p role="status" className="text-sm text-muted-foreground">
              {status}
            </p>
          ) : null}
          {error ? (
            <p role="alert" className="text-sm text-destructive">
              {error}
            </p>
          ) : null}
        </div>
      </form>

      <section className="grid gap-4 border-t pt-6" aria-labelledby="project-sla-title">
        <div>
          <h3 id="project-sla-title" className="text-base font-semibold">
            {t('project-settings.sla', {}, locale)}
          </h3>
          <p className="mt-1 text-sm text-muted-foreground">{t('project-settings.sla_description', {}, locale)}</p>
        </div>
        {(['sky', 'crowd'] as const).map((pack) => {
          const unit = pack === 'sky' ? 60 : 3600
          const value = Math.max(1, Math.round(sla[pack] / unit))
          return (
            <div className="grid min-w-0 items-end gap-3 sm:grid-cols-[1fr_1fr_auto]" key={pack} data-sla-pack={pack}>
              <div className="grid gap-2">
                <Label htmlFor={`sla-${pack}`}>{t(`project-settings.${pack}`, {}, locale)}</Label>
                <Input
                  id={`sla-${pack}`}
                  name={`sla_s_${pack}`}
                  autoComplete="off"
                  type="number"
                  min={1}
                  step={1}
                  value={value}
                  aria-label={`${t(`project-settings.${pack}`, {}, locale)} ${t('project-settings.sla', {}, locale)}`}
                  onChange={(event) =>
                    setSla((current) => ({ ...current, [pack]: Math.max(1, Number(event.target.value) || 1) * unit }))
                  }
                />
              </div>
              <span className="pb-2 text-sm text-muted-foreground">
                {t(`project-settings.${pack === 'sky' ? 'minutes' : 'hours'}`, {}, locale)}
              </span>
              <Button
                type="button"
                variant="outline"
                disabled={!slaDirty(pack) || busy !== null}
                aria-busy={busy === pack}
                onClick={() => void saveSla(pack)}
              >
                {busy === pack ? t('project-settings.saving', {}, locale) : t('project-settings.save', {}, locale)}
              </Button>
              {savedSla?.[pack] === sla[pack] && (
                <p className="text-sm text-muted-foreground sm:col-span-3" role="status">
                  {t(
                    'project-settings.saved_sla_value',
                    {
                      value,
                      unit: t(`project-settings.${pack === 'sky' ? 'minutes' : 'hours'}`, {}, locale)
                    },
                    locale
                  )}
                </p>
              )}
            </div>
          )
        })}
      </section>

      <section className="grid gap-3 border-t border-destructive/40 pt-6" aria-labelledby="project-archive-title">
        <h3 id="project-archive-title" className="text-base font-semibold text-destructive">
          {t('project-settings.archive', {}, locale)}
        </h3>
        <p className="text-sm text-muted-foreground">{t('project-settings.archive_description', {}, locale)}</p>
        {archived ? <p role="status">{t('project-settings.archived', {}, locale)}</p> : null}
        {archiveAction.pending ? (
          <div className="flex flex-wrap items-center gap-3" role="status">
            <span>{t('project-settings.archive_pending', {}, locale)}</span>
            <Button type="button" variant="outline" onClick={archiveAction.undo}>
              {t('project-settings.undo', {}, locale)}
            </Button>
          </div>
        ) : archived ? (
          <Button type="button" variant="outline" disabled={busy !== null} onClick={() => void restore()}>
            {t('project-settings.restore', {}, locale)}
          </Button>
        ) : (
          <Button
            type="button"
            variant="destructive"
            disabled={busy !== null || archiveAction.committing}
            onClick={archiveAction.start}
          >
            {t('project-settings.archive_action', {}, locale)}
          </Button>
        )}
        {archiveAction.error ? (
          <p role="alert" className="text-sm text-destructive">
            {t('project-settings.archive_failed', {}, locale)}
          </p>
        ) : null}
      </section>
    </div>
  )
}

export default function Panel({ locale = 'en' }: { locale?: Locale } = {}) {
  return <ProjectGeneralPanel locale={locale} />
}
