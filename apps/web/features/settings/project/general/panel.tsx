'use client'

import { useCallback, useEffect, useRef, useState, type FormEvent } from 'react'
import { useParams } from 'next/navigation'
import { formatTimeZoneName } from '@skyclause/i18n/format'
import { defaultSlaSeconds, slaUpdateBody } from '../../../project-settings/model'
import { projectSettingsApi, resolveProject, type Project } from '../../../project-settings/operations'
import { useRead } from '../../../analysis/use-read'
import { Button } from '#ui/button'
import { Input } from '#ui/input'
import { Label } from '#ui/label'
import { Textarea } from '#ui/textarea'
import { Skeleton } from '#ui/skeleton'
import { ConfirmDialog, useUndoableAction, useUnsavedChangesGuard } from '../../set-7'
import { focusWhenFree } from '../../focus'
import { t } from '../../../project-settings/catalogue'
import '../../catalogue'
import {
  SettingsAside,
  SettingsDanger,
  SettingsError,
  SettingsItem,
  SettingsList,
  SettingsLoading,
  SettingsPart,
  SettingsParts,
  SettingsReadError,
  SettingsStatus,
  SettingsSummaryLine,
  dateFieldRing
} from '../../parts'

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

type Pack = 'sky' | 'crowd'
const PACKS = ['sky', 'crowd'] as const
const SLA_SECONDS_MAX = 2147483647
/** Seconds in the unit each pack's deadline is written in: minutes for Sky, hours for Crowd. */
const slaUnit = (pack: Pack) => (pack === 'sky' ? 60 : 3600)
const slaWords = (seconds: number, pack: Pack) => String(Math.max(1, Math.round(seconds / slaUnit(pack))))

/** The whole number of units a deadline field holds, or null while it is empty, fractional, below 1 or too large. */
function parseSla(text: string, pack: Pack): number | null {
  if (!/^\d+$/.test(text.trim())) return null
  const value = Number(text.trim())
  return value >= 1 && value * slaUnit(pack) <= SLA_SECONDS_MAX ? value : null
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
  // What each deadline field holds, as typed: it is checked on blur and on save, never rewritten while typing.
  const [slaText, setSlaText] = useState<Record<Pack, string>>({
    sky: slaWords(defaultSlaSeconds('sky'), 'sky'),
    crowd: slaWords(defaultSlaSeconds('crowd'), 'crowd')
  })
  const [slaProblem, setSlaProblem] = useState<Record<Pack, boolean>>({ sky: false, crowd: false })
  const [savedSla, setSavedSla] = useState<Record<Pack, number> | null>(null)
  const [busy, setBusy] = useState<'project' | Pack | null>(null)
  const [status, setStatus] = useState('')
  const [error, setError] = useState('')
  const [archived, setArchived] = useState(false)
  const [archiveOpen, setArchiveOpen] = useState(false)
  const [slaSaved, setSlaSaved] = useState<Pack | null>(null)
  const [focusNext, setFocusNext] = useState<'undo' | 'archive' | null>(null)
  const archiveRef = useRef<HTMLButtonElement>(null)
  const undoRef = useRef<HTMLButtonElement>(null)

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
    setSlaText({ sky: slaWords(nextSla.sky, 'sky'), crowd: slaWords(nextSla.crowd, 'crowd') })
    setSavedSla(nextSla)
    setArchived(value.archived_at !== null)
  }, [loaded])

  const dirty = !!form && !!savedForm && JSON.stringify(form) !== JSON.stringify(savedForm)
  const slaDirty = (pack: Pack) => savedSla !== null && slaText[pack].trim() !== slaWords(savedSla[pack], pack)
  // Leaving the page (a link, the back button, closing the tab) with edits in the form or a deadline asks first.
  useUnsavedChangesGuard(dirty || PACKS.some(slaDirty), locale)
  const archiveAction = useUndoableAction(async ({ keepalive }) => {
    if (!project) return
    const result = await projectSettingsApi('archiveProject', { params: { id: project.id }, keepalive })
    setArchived(result.archived_at !== null)
  })
  // The control that was pressed is replaced by the next one (Archive by Undo, Undo and Restore by Archive): focus
  // follows it, once the confirm dialog that was open has let go of the page.
  useEffect(() => {
    if (focusNext === 'undo' && archiveAction.pending) {
      focusWhenFree(() => undoRef.current)
      setFocusNext(null)
    } else if (focusNext === 'archive' && !archiveAction.pending && !archived) {
      focusWhenFree(() => archiveRef.current)
      setFocusNext(null)
    }
  }, [focusNext, archiveAction.pending, archived])

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

  const saveSla = async (pack: Pack) => {
    if (!project || !slaDirty(pack) || busy) return
    const words = parseSla(slaText[pack], pack)
    if (words === null) {
      setSlaProblem((current) => ({ ...current, [pack]: true }))
      document.getElementById(`sla-${pack}`)?.focus()
      return
    }
    const seconds = words * slaUnit(pack)
    setBusy(pack)
    setError('')
    setStatus('')
    setSlaSaved(null)
    try {
      const existing = project.packs.find((item) => item.pack === pack)
      const updated = await projectSettingsApi('updateProjectPack', {
        org: params.org,
        params: { id: project.id, pack },
        body: slaUpdateBody({ pack, enabled: existing?.enabled ?? false }, seconds)
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
      const saved = updated.sla_s ?? seconds
      setSlaText((current) => ({ ...current, [pack]: slaWords(saved, pack) }))
      setSavedSla((current) => current && { ...current, [pack]: saved })
      setSlaProblem((current) => ({ ...current, [pack]: false }))
      setSlaSaved(pack)
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
      setFocusNext('archive')
    } catch {
      setError(t('project-settings.restore_failed', {}, locale))
    } finally {
      setBusy(null)
    }
  }

  if (loaded.status === 'loading' || (loaded.status === 'ready' && (!project || !form)))
    return (
      <SettingsLoading locale={locale} className="grid gap-4">
        <Skeleton className="h-10 w-full rounded-full" />
        <Skeleton className="h-10 w-full rounded-full" />
        <Skeleton className="h-10 w-2/3 rounded-full" />
      </SettingsLoading>
    )
  if (loaded.status === 'error')
    return (
      <SettingsReadError
        source={t('project-settings.source', {}, locale)}
        error={loaded.error}
        onRetry={() => setReadRevision((value) => value + 1)}
        locale={locale}
      />
    )
  if (!project || !form) return null

  const field = (key: keyof ProjectForm, value: string) => setForm((current) => current && { ...current, [key]: value })

  return (
    <SettingsParts data-project-settings-general>
      <SettingsAside>
        <SettingsSummaryLine label={t('project-settings.name', {}, locale)}>{project.name}</SettingsSummaryLine>
        <SettingsSummaryLine label={t('project-settings.site_name', {}, locale)}>
          {project.site_name ?? t('project-settings.missing', {}, locale)}
        </SettingsSummaryLine>
        <SettingsSummaryLine label={t('project-settings.time_zone', {}, locale)}>
          {formatTimeZoneName(project.time_zone, locale)}
        </SettingsSummaryLine>
        {PACKS.map((pack) => (
          <SettingsSummaryLine
            key={pack}
            label={t('project-settings.deadline_of', { pack: t(`project-settings.${pack}`, {}, locale) }, locale)}
          >
            {t(
              'project-settings.value_unit',
              {
                value: savedSla ? slaWords(savedSla[pack], pack) : slaText[pack],
                unit: t(`project-settings.unit_${pack === 'sky' ? 'minutes' : 'hours'}`, {}, locale)
              },
              locale
            )}
          </SettingsSummaryLine>
        ))}
      </SettingsAside>
      <form className="grid min-w-0 gap-10" onSubmit={saveProject}>
        <SettingsPart title={t('project-settings.site', {}, locale)}>
          <div className="grid min-w-0 gap-4 sm:grid-cols-2">
            <div className="grid min-w-0 gap-2">
              <Label htmlFor="project-name">{t('project-settings.name', {}, locale)}</Label>
              <Input
                id="project-name"
                name="name"
                autoComplete="off"
                value={form.name}
                onChange={(event) => field('name', event.target.value)}
                required
                maxLength={120}
              />
            </div>
            <div className="grid min-w-0 gap-2">
              <Label htmlFor="site-name">{t('project-settings.site_name', {}, locale)}</Label>
              <Input
                id="site-name"
                name="site_name"
                autoComplete="off"
                value={form.siteName}
                onChange={(event) => field('siteName', event.target.value)}
                maxLength={160}
              />
            </div>
            <div className="grid min-w-0 gap-2">
              <Label htmlFor="site-latitude">{t('project-settings.latitude', {}, locale)}</Label>
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
                data-numeric
                onChange={(event) => field('latitude', event.target.value)}
              />
            </div>
            <div className="grid min-w-0 gap-2">
              <Label htmlFor="site-longitude">{t('project-settings.longitude', {}, locale)}</Label>
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
                data-numeric
                onChange={(event) => field('longitude', event.target.value)}
              />
            </div>
            <div className="grid min-w-0 gap-2">
              <Label htmlFor="project-time-zone">{t('project-settings.time_zone', {}, locale)}</Label>
              <Input
                id="project-time-zone"
                name="time_zone"
                autoComplete="off"
                spellCheck={false}
                aria-describedby="project-time-zone-hint"
                value={form.timeZone}
                onChange={(event) => field('timeZone', event.target.value)}
                required
              />
              <p id="project-time-zone-hint" className="type-small text-muted-foreground">
                {t('project-settings.time_zone_hint', {}, locale)}
              </p>
            </div>
            <div className={`grid min-w-0 gap-2 ${dateFieldRing}`} data-focus-ring>
              <Label htmlFor="semester-end">{t('project-settings.semester_end', {}, locale)}</Label>
              <Input
                id="semester-end"
                name="semester_ends_on"
                autoComplete="off"
                type="date"
                value={form.semesterEnd}
                onChange={(event) => field('semesterEnd', event.target.value)}
              />
            </div>
            <div className="grid min-w-0 gap-2 sm:col-span-2">
              <Label htmlFor="warning-terms">{t('project-settings.warning_terms', {}, locale)}</Label>
              <Textarea
                id="warning-terms"
                name="warning_area_terms"
                autoComplete="off"
                spellCheck={false}
                rows={3}
                aria-describedby="warning-terms-hint"
                value={form.warningTerms}
                onChange={(event) => field('warningTerms', event.target.value)}
              />
              <p id="warning-terms-hint" className="type-small text-muted-foreground">
                {t('project-settings.warning_hint', {}, locale)}
              </p>
            </div>
          </div>
        </SettingsPart>

        <SettingsPart
          title={t('project-settings.camera_hours', {}, locale)}
          description={t(
            'project-settings.local_time_zone',
            { zone: formatTimeZoneName(form.timeZone, locale) },
            locale
          )}
        >
          <div className="grid min-w-0 gap-4 sm:grid-cols-2">
            <div className={`grid min-w-0 gap-2 ${dateFieldRing}`} data-focus-ring>
              <Label htmlFor="camera-start">{t('project-settings.camera_start', {}, locale)}</Label>
              <Input
                id="camera-start"
                name="camera_day_start"
                autoComplete="off"
                type="time"
                value={form.cameraStart}
                onChange={(event) => field('cameraStart', event.target.value)}
              />
            </div>
            <div className={`grid min-w-0 gap-2 ${dateFieldRing}`} data-focus-ring>
              <Label htmlFor="camera-end">{t('project-settings.camera_end', {}, locale)}</Label>
              <Input
                id="camera-end"
                name="camera_day_end"
                autoComplete="off"
                type="time"
                value={form.cameraEnd}
                onChange={(event) => field('cameraEnd', event.target.value)}
              />
            </div>
          </div>
        </SettingsPart>

        <div className="flex flex-wrap items-center gap-3">
          <Button type="submit" disabled={!dirty || busy !== null} aria-busy={busy === 'project'}>
            {busy === 'project' ? t('project-settings.saving', {}, locale) : t('project-settings.save', {}, locale)}
          </Button>
          {status ? <SettingsStatus>{status}</SettingsStatus> : null}
          {error ? <SettingsError>{error}</SettingsError> : null}
        </div>
      </form>

      <SettingsPart
        title={t('project-settings.sla', {}, locale)}
        description={t('project-settings.sla_description', {}, locale)}
        id="project-sla-title"
      >
        <SettingsList>
          {PACKS.map((pack) => {
            const unitWord = t(`project-settings.unit_${pack === 'sky' ? 'minutes' : 'hours'}`, {}, locale)
            const packName = t(`project-settings.${pack}`, {}, locale)
            return (
              <SettingsItem key={pack} data-sla-pack={pack} className="items-end">
                <form
                  className="flex w-full min-w-0 flex-wrap items-end justify-between gap-x-4 gap-y-3"
                  onSubmit={(event) => {
                    event.preventDefault()
                    void saveSla(pack)
                  }}
                  noValidate
                >
                  <div className="grid min-w-0 content-start gap-2">
                    <Label htmlFor={`sla-${pack}`}>
                      {t('project-settings.deadline_of', { pack: packName }, locale)}
                    </Label>
                    <div className="flex items-center gap-3">
                      <Input
                        id={`sla-${pack}`}
                        name={`sla_s_${pack}`}
                        autoComplete="off"
                        type="number"
                        min={1}
                        step={1}
                        inputMode="numeric"
                        value={slaText[pack]}
                        data-numeric
                        className="w-24 text-right"
                        aria-invalid={slaProblem[pack] ? true : undefined}
                        aria-describedby={`sla-${pack}-hint${slaProblem[pack] ? ` sla-${pack}-error` : ''}`}
                        onChange={(event) => {
                          setSlaText((current) => ({ ...current, [pack]: event.target.value }))
                          if (slaProblem[pack]) setSlaProblem((current) => ({ ...current, [pack]: false }))
                        }}
                        onBlur={() => {
                          if (parseSla(slaText[pack], pack) === null)
                            setSlaProblem((current) => ({ ...current, [pack]: true }))
                        }}
                      />
                      <span aria-hidden="true" className="type-body text-muted-foreground">
                        {unitWord}
                      </span>
                    </div>
                    <p id={`sla-${pack}-hint`} className="type-small text-muted-foreground">
                      {t('project-settings.sla_hint', { unit: unitWord }, locale)}
                    </p>
                    {slaProblem[pack] ? (
                      <SettingsError id={`sla-${pack}-error`}>
                        {t('project-settings.sla_invalid', { unit: unitWord }, locale)}
                      </SettingsError>
                    ) : null}
                  </div>
                  <div className="flex flex-wrap items-center gap-3">
                    {slaSaved === pack && !slaDirty(pack) && (
                      <SettingsStatus>
                        {t(
                          'project-settings.saved_sla_value',
                          { value: slaWords(savedSla?.[pack] ?? 0, pack), unit: unitWord },
                          locale
                        )}
                      </SettingsStatus>
                    )}
                    <Button
                      type="submit"
                      variant="outline"
                      disabled={!slaDirty(pack) || busy !== null}
                      aria-busy={busy === pack}
                      aria-label={t('project-settings.save_named', { name: packName }, locale)}
                    >
                      {busy === pack
                        ? t('project-settings.saving', {}, locale)
                        : t('project-settings.save', {}, locale)}
                    </Button>
                  </div>
                </form>
              </SettingsItem>
            )
          })}
        </SettingsList>
      </SettingsPart>

      <SettingsDanger
        title={t('project-settings.archive', {}, locale)}
        description={t('project-settings.archive_description', {}, locale)}
        id="project-archive-title"
      >
        {archived ? (
          <SettingsStatus>{t('project-settings.archived', { name: project.name }, locale)}</SettingsStatus>
        ) : null}
        {archiveAction.pending ? (
          <div className="flex flex-wrap items-center gap-3" role="status">
            <span className="type-body">{t('project-settings.archive_pending', { name: project.name }, locale)}</span>
            <Button
              ref={undoRef}
              type="button"
              variant="outline"
              onClick={() => {
                archiveAction.undo()
                setFocusNext('archive')
              }}
            >
              {t('project-settings.undo', {}, locale)}
            </Button>
          </div>
        ) : archived ? (
          <Button type="button" variant="outline" disabled={busy !== null} onClick={() => void restore()}>
            {t('project-settings.restore', {}, locale)}
          </Button>
        ) : (
          <Button
            ref={archiveRef}
            type="button"
            variant="destructive"
            disabled={busy !== null || archiveAction.committing}
            onClick={() => setArchiveOpen(true)}
          >
            {t('project-settings.archive_action', {}, locale)}
          </Button>
        )}
        {archiveAction.error ? <SettingsError>{t('project-settings.archive_failed', {}, locale)}</SettingsError> : null}
      </SettingsDanger>
      <ConfirmDialog
        open={archiveOpen}
        onOpenChange={setArchiveOpen}
        objectName={project.name}
        title={t('project-settings.archive_title', { name: project.name }, locale)}
        confirmLabel={t('project-settings.archive_title', { name: project.name }, locale)}
        description={t('project-settings.archive_description', {}, locale)}
        locale={locale}
        onConfirm={() => {
          archiveAction.start()
          setFocusNext('undo')
        }}
      />
    </SettingsParts>
  )
}

export default function Panel({ locale = 'en' }: { locale?: Locale } = {}) {
  return <ProjectGeneralPanel locale={locale} />
}
