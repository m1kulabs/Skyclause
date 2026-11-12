'use client'

import { useCallback, useEffect, useRef, useState, type FormEvent } from 'react'
import { useParams } from 'next/navigation'
import { formatList, formatTimeZoneName } from '@skyclause/i18n/format'
import { Button } from '#ui/button'
import { Input } from '#ui/input'
import { Field, FieldGroup, FieldLegend, FieldSet } from '#ui/field'
import { Label } from '#ui/label'
import { Skeleton } from '#ui/skeleton'
import { useRead } from '../../../analysis/use-read'
import { useUnsavedChangesGuard } from '../../set-7'
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
  SettingsSummaryLine,
  dateFieldRing,
  focusPartHeading
} from '../../parts'
import {
  projectSettingsApi,
  resolveProject,
  type Member,
  type Project,
  type Rota,
  type RotaShift
} from '../../../project-settings/operations'

type Locale = 'en' | 'ms'
type Template = RotaShift['template']
type Condition = 'storm_afternoon' | 'surge_night' | null
type ShiftForm = {
  accountId: string
  /** ISO weekdays, Monday 1 to Sunday 7, as `RotaShift.days` (#103). */
  days: number[]
  localStart: string
  localEnd: string
  condition: Condition
  template: Template
}
type RotaPageData = { project: Project; rota: Rota; members: Member[] }
type FieldKey = 'approver' | 'days' | 'start' | 'end'
/** The control each field's error is tied to, and the one that takes focus when the field is the first invalid. */
const fieldControl: Record<FieldKey, string> = {
  approver: 'rota-approver',
  days: 'rota-day-monday',
  start: 'rota-start',
  end: 'rota-end'
}

const weekdays = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'] as const
const blankForm: ShiftForm = {
  accountId: '',
  days: [],
  localStart: '',
  localEnd: '',
  condition: null,
  template: 'custom'
}

async function allPages<Item>(read: (cursor?: string) => Promise<{ data: Item[]; next_cursor: string | null }>) {
  const values: Item[] = []
  const seen = new Set<string>()
  let cursor: string | undefined
  do {
    const page = await read(cursor)
    values.push(...page.data)
    cursor = page.next_cursor ?? undefined
    if (cursor && seen.has(cursor)) throw new Error('Repeated project rota cursor')
    if (cursor) seen.add(cursor)
  } while (cursor)
  return values
}

function formFromShift(shift: RotaShift): ShiftForm {
  return {
    accountId: shift.account_id,
    days: [...shift.days],
    localStart: shift.local_start,
    localEnd: shift.local_end,
    condition: shift.condition === 'storm_afternoon' || shift.condition === 'surge_night' ? shift.condition : null,
    template: shift.template
  }
}

function shiftSchedule(shift: RotaShift, timeZone: string, locale: Locale) {
  return t(
    'project-settings.shift_schedule',
    {
      days: formatList(
        shift.days.map((day) => t(`project-settings.weekdays.${weekdays[day - 1]}`, {}, locale)),
        locale
      ),
      start: shift.local_start,
      end: shift.local_end,
      zone: formatTimeZoneName(timeZone, locale)
    },
    locale
  )
}

export function ProjectRotaPanel({ locale = 'en' }: { locale?: Locale }) {
  const params = useParams<{ org: string; project: string }>()
  const [revision, setRevision] = useState(0)
  const read = useCallback(
    async (signal: AbortSignal): Promise<RotaPageData> => {
      const project = await resolveProject(params.org, params.project, signal)
      const [rota, members] = await Promise.all([
        projectSettingsApi('getRota', { params: { org: params.org }, signal }),
        allPages((cursor) =>
          projectSettingsApi('listMembers', { params: { org: params.org }, query: { limit: 200, cursor }, signal })
        )
      ])
      return { project, rota, members }
    },
    [params.org, params.project, revision]
  )
  const loaded = useRead(read)
  const [formOpen, setFormOpen] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [form, setForm] = useState<ShiftForm>(blankForm)
  const [baseForm, setBaseForm] = useState<ShiftForm>(blankForm)
  const [busy, setBusy] = useState(false)
  const [status, setStatus] = useState('')
  const [error, setError] = useState('')
  const [fieldErrors, setFieldErrors] = useState<Partial<Record<FieldKey, string>>>({})
  const [focusEditor, setFocusEditor] = useState(false)
  const [focusList, setFocusList] = useState(false)
  const [lastData, setLastData] = useState<RotaPageData | null>(null)
  const editorHeading = useRef<HTMLHeadingElement>(null)

  const dirty = formOpen && JSON.stringify(form) !== JSON.stringify(baseForm)
  const { guardNavigation } = useUnsavedChangesGuard(dirty, locale)

  // Keep showing the rota while it is read again after a save, so the panel (and focus in it) is not replaced.
  useEffect(() => {
    if (loaded.status === 'ready') setLastData(loaded.value)
  }, [loaded])
  // The editor takes focus when it opens; when it closes, the list it belongs to does.
  useEffect(() => {
    if (focusEditor && formOpen) {
      editorHeading.current?.focus()
      setFocusEditor(false)
    }
    if (focusList && !formOpen) {
      focusPartHeading('project-rota-override-title')
      setFocusList(false)
    }
  }, [focusEditor, focusList, formOpen])

  const pageData = loaded.status === 'ready' ? loaded.value : lastData
  const eligible = pageData?.members.filter((member) => ['owner', 'admin', 'approver'].includes(member.role)) ?? []
  const inherited = pageData?.rota.shifts.filter((shift) => shift.project_id === null) ?? []
  const overrides = pageData?.rota.shifts.filter((shift) => shift.project_id === pageData.project.id) ?? []
  const memberName = (accountId: string) => {
    const member = pageData?.members.find((item) => item.account_id === accountId)
    return member
      ? t('project-settings.member_name', { name: member.name, email: member.email }, locale)
      : t('project-settings.unknown_member', {}, locale)
  }
  const shortName = (accountId: string) =>
    pageData?.members.find((item) => item.account_id === accountId)?.name ??
    t('project-settings.unknown_member', {}, locale)

  const openNew = () => {
    const next = { ...blankForm, accountId: eligible[0]?.account_id ?? '' }
    setEditingId(null)
    setForm(next)
    setBaseForm(next)
    setFormOpen(true)
    setFocusEditor(true)
    setStatus('')
    setError('')
    setFieldErrors({})
  }

  const openEdit = (shift: RotaShift) => {
    const next = formFromShift(shift)
    setEditingId(shift.id)
    setForm(next)
    setBaseForm(next)
    setFormOpen(true)
    setFocusEditor(true)
    setStatus('')
    setError('')
    setFieldErrors({})
  }

  const closeEditor = () => {
    setFormOpen(false)
    setEditingId(null)
    setForm(blankForm)
    setBaseForm(blankForm)
    setError('')
    setFieldErrors({})
    setFocusList(true)
  }

  /** Opening another shift over an editor with unsaved input asks before it throws that input away. */
  const openGuarded = (open: () => void) => {
    guardNavigation(open)
  }

  const change = (patch: Partial<ShiftForm>, field: FieldKey) => {
    setForm((current) => ({ ...current, ...patch }))
    setFieldErrors((current) => (current[field] ? { ...current, [field]: undefined } : current))
  }

  /** What is wrong with the editor, by field, each with how to put it right. */
  const problems = (): Partial<Record<FieldKey, string>> => {
    const found: Partial<Record<FieldKey, string>> = {}
    if (!form.accountId) found.approver = t('project-settings.error_approver', {}, locale)
    if (!form.days.length) found.days = t('project-settings.error_days', {}, locale)
    if (!form.localStart) found.start = t('project-settings.error_start', {}, locale)
    if (!form.localEnd) found.end = t('project-settings.error_end', {}, locale)
    else if (form.localStart && form.localEnd <= form.localStart)
      found.end = t('project-settings.error_order', {}, locale)
    return found
  }

  const toggleDay = (day: number) => {
    setForm((current) => ({
      ...current,
      days: current.days.includes(day) ? current.days.filter((item) => item !== day) : [...current.days, day]
    }))
    setFieldErrors((current) => (current.days ? { ...current, days: undefined } : current))
  }

  const save = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (!pageData || busy) return
    const found = problems()
    const first = (['approver', 'days', 'start', 'end'] as const).find((key) => found[key])
    if (first) {
      setFieldErrors(found)
      setError('')
      document.getElementById(fieldControl[first])?.focus()
      return
    }
    setFieldErrors({})
    setBusy(true)
    setError('')
    setStatus('')
    const body = {
      account_id: form.accountId,
      project_id: pageData.project.id,
      days: form.days,
      local_start: form.localStart,
      local_end: form.localEnd,
      condition: form.condition,
      order: editingId
        ? (overrides.find((shift) => shift.id === editingId)?.order ?? overrides.length)
        : overrides.length,
      template: form.template
    }
    try {
      if (editingId) await projectSettingsApi('updateRotaShift', { params: { org: params.org, id: editingId }, body })
      else await projectSettingsApi('createRotaShift', { params: { org: params.org }, body })
      setRevision((current) => current + 1)
      closeEditor()
      setStatus(t('project-settings.shift_saved', {}, locale))
    } catch {
      setError(t('project-settings.shift_failed', {}, locale))
    } finally {
      setBusy(false)
    }
  }

  if (loaded.status === 'loading' && !lastData)
    return (
      <SettingsLoading locale={locale} className="grid gap-4">
        <Skeleton className="h-16 w-full rounded-md" />
        <Skeleton className="h-16 w-full rounded-md" />
      </SettingsLoading>
    )
  if (loaded.status === 'error')
    return (
      <SettingsReadError
        source={t('project-settings.source_rota', {}, locale)}
        error={loaded.error}
        onRetry={() => setRevision((value) => value + 1)}
        locale={locale}
      />
    )
  if (!pageData) return null

  const shiftLine = (shift: RotaShift) => (
    <div className="grid min-w-0 gap-0.5">
      <p className="type-body font-semibold [overflow-wrap:anywhere]">{memberName(shift.account_id)}</p>
      <p className="type-small text-muted-foreground">{shiftSchedule(shift, pageData.project.time_zone, locale)}</p>
      <p className="type-small text-muted-foreground">{t(`project-settings.${shift.template}`, {}, locale)}</p>
    </div>
  )
  const shifts = (count: number) =>
    t(count === 1 ? 'project-settings.shift_count_one' : 'project-settings.shift_count_other', { count }, locale)

  return (
    <SettingsParts data-project-settings-rota>
      <SettingsAside>
        <SettingsSummaryLine label={t('project-settings.override', {}, locale)}>
          <span data-numeric>{shifts(overrides.length)}</span>
        </SettingsSummaryLine>
        <SettingsSummaryLine label={t('project-settings.inherited', {}, locale)}>
          <span data-numeric>{shifts(inherited.length)}</span>
        </SettingsSummaryLine>
      </SettingsAside>
      <SettingsPart
        title={t('project-settings.override', {}, locale)}
        description={t('project-settings.rota_description', {}, locale)}
        id="project-rota-override-title"
        actions={
          <Button type="button" variant="outline" onClick={() => openGuarded(openNew)}>
            {t('project-settings.add_shift', {}, locale)}
          </Button>
        }
      >
        {overrides.length ? (
          <SettingsList>
            {overrides.map((shift) => (
              <SettingsItem key={shift.id}>
                {shiftLine(shift)}
                <Button
                  type="button"
                  variant="ghost"
                  aria-label={t('project-settings.edit_shift_for', { name: shortName(shift.account_id) }, locale)}
                  onClick={() => openGuarded(() => openEdit(shift))}
                >
                  {t('project-settings.edit_shift', {}, locale)}
                </Button>
              </SettingsItem>
            ))}
          </SettingsList>
        ) : (
          <p className="type-body text-muted-foreground">{t('project-settings.empty_rota', {}, locale)}</p>
        )}
      </SettingsPart>

      <SettingsPart title={t('project-settings.inherited', {}, locale)} id="project-rota-inherited-title">
        {inherited.length ? (
          <SettingsList>
            {inherited.map((shift) => (
              <SettingsItem key={shift.id}>{shiftLine(shift)}</SettingsItem>
            ))}
          </SettingsList>
        ) : (
          <p className="type-body text-muted-foreground">{t('project-settings.empty_inherited', {}, locale)}</p>
        )}
      </SettingsPart>

      {status ? <SettingsStatus>{status}</SettingsStatus> : null}
      {formOpen ? (
        <form className="min-w-0 rounded-md bg-raised p-4" onSubmit={save} noValidate data-rota-editor>
          <FieldGroup>
            <div className="grid gap-1">
              <h3 ref={editorHeading} tabIndex={-1} className="type-card-title">
                {t(`project-settings.${editingId ? 'edit_shift' : 'add_shift'}`, {}, locale)}
              </h3>
              <p className="type-body text-muted-foreground">
                {t(
                  'project-settings.local_time_zone',
                  { zone: formatTimeZoneName(pageData.project.time_zone, locale) },
                  locale
                )}
              </p>
            </div>
            {eligible.length ? (
              <Field data-invalid={fieldErrors.approver ? true : undefined}>
                <Label htmlFor="rota-approver">{t('project-settings.approver', {}, locale)}</Label>
                <select
                  id="rota-approver"
                  name="account_id"
                  autoComplete="off"
                  value={form.accountId}
                  onChange={(event) => change({ accountId: event.target.value }, 'approver')}
                  className="native-select"
                  aria-invalid={fieldErrors.approver ? true : undefined}
                  aria-describedby={fieldErrors.approver ? 'rota-approver-error' : undefined}
                >
                  <option value="">{t('project-settings.choose_approver', {}, locale)}</option>
                  {eligible.map((member) => (
                    <option key={member.account_id} value={member.account_id}>
                      {t('project-settings.member_name', { name: member.name, email: member.email }, locale)}
                    </option>
                  ))}
                </select>
                {fieldErrors.approver ? (
                  <SettingsError id="rota-approver-error">{fieldErrors.approver}</SettingsError>
                ) : null}
              </Field>
            ) : (
              <p role="status" className="type-body text-muted-foreground">
                {t('project-settings.no_approvers', {}, locale)}
              </p>
            )}

            <FieldSet
              className="grid min-w-0 gap-2 sm:grid-cols-2"
              data-invalid={fieldErrors.days ? true : undefined}
              aria-describedby={fieldErrors.days ? 'rota-days-error' : undefined}
            >
              <FieldLegend variant="label" className="type-body mb-2 font-medium">
                {t('project-settings.days', {}, locale)}
              </FieldLegend>
              {weekdays.map((name, index) => {
                const day = index + 1
                const id = `rota-day-${name}`
                return (
                  <label key={name} htmlFor={id} className="type-body flex min-h-11 items-center gap-3">
                    <input
                      id={id}
                      name="days"
                      autoComplete="off"
                      type="checkbox"
                      className="native-check"
                      value={day}
                      checked={form.days.includes(day)}
                      aria-invalid={fieldErrors.days ? true : undefined}
                      onChange={() => toggleDay(day)}
                    />
                    {t(`project-settings.weekdays.${name}`, {}, locale)}
                  </label>
                )
              })}
              {fieldErrors.days ? (
                <SettingsError id="rota-days-error" className="sm:col-span-2">
                  {fieldErrors.days}
                </SettingsError>
              ) : null}
            </FieldSet>

            <FieldGroup className="grid gap-4 sm:grid-cols-2">
              <Field data-invalid={fieldErrors.start ? true : undefined} className={dateFieldRing} data-focus-ring>
                <Label htmlFor="rota-start">{t('project-settings.start', {}, locale)}</Label>
                <Input
                  id="rota-start"
                  name="local_start"
                  autoComplete="off"
                  type="time"
                  value={form.localStart}
                  onChange={(event) => change({ localStart: event.target.value }, 'start')}
                  aria-invalid={fieldErrors.start ? true : undefined}
                  aria-describedby={fieldErrors.start ? 'rota-start-error' : undefined}
                />
                {fieldErrors.start ? <SettingsError id="rota-start-error">{fieldErrors.start}</SettingsError> : null}
              </Field>
              <Field data-invalid={fieldErrors.end ? true : undefined} className={dateFieldRing} data-focus-ring>
                <Label htmlFor="rota-end">{t('project-settings.end', {}, locale)}</Label>
                <Input
                  id="rota-end"
                  name="local_end"
                  autoComplete="off"
                  type="time"
                  value={form.localEnd}
                  onChange={(event) => change({ localEnd: event.target.value }, 'end')}
                  aria-invalid={fieldErrors.end ? true : undefined}
                  aria-describedby={fieldErrors.end ? 'rota-end-error' : undefined}
                />
                {fieldErrors.end ? <SettingsError id="rota-end-error">{fieldErrors.end}</SettingsError> : null}
              </Field>
            </FieldGroup>

            <FieldGroup className="grid gap-4 sm:grid-cols-2">
              <Field>
                <Label htmlFor="rota-template">{t('project-settings.template', {}, locale)}</Label>
                <select
                  id="rota-template"
                  name="template"
                  autoComplete="off"
                  value={form.template}
                  onChange={(event) => {
                    const template = event.target.value as Template
                    setForm((current) => ({
                      ...current,
                      template,
                      condition: template === 'custom' ? null : template,
                      ...(template === 'storm_afternoon' ? { localStart: '14:00', localEnd: '19:15' } : {}),
                      ...(template === 'surge_night' ? { localStart: '08:00', localEnd: '22:00' } : {})
                    }))
                  }}
                  className="native-select"
                >
                  {(['custom', 'storm_afternoon', 'surge_night'] as const).map((template) => (
                    <option key={template} value={template}>
                      {t(`project-settings.${template === 'custom' ? 'template_custom' : template}`, {}, locale)}
                    </option>
                  ))}
                </select>
              </Field>
              <Field>
                <Label htmlFor="rota-condition">{t('project-settings.condition', {}, locale)}</Label>
                <select
                  id="rota-condition"
                  name="condition"
                  autoComplete="off"
                  value={form.condition ?? ''}
                  onChange={(event) =>
                    setForm((current) => ({
                      ...current,
                      condition:
                        event.target.value === 'storm_afternoon' || event.target.value === 'surge_night'
                          ? event.target.value
                          : null
                    }))
                  }
                  className="native-select"
                >
                  <option value="">{t('project-settings.condition_none', {}, locale)}</option>
                  <option value="storm_afternoon">{t('project-settings.storm_afternoon', {}, locale)}</option>
                  <option value="surge_night">{t('project-settings.surge_night', {}, locale)}</option>
                </select>
              </Field>
            </FieldGroup>
            {error ? <SettingsError>{error}</SettingsError> : null}
            <div className="flex flex-wrap gap-3">
              <Button type="submit" disabled={busy || !eligible.length} aria-busy={busy}>
                {busy ? t('project-settings.saving', {}, locale) : t('project-settings.save_shift', {}, locale)}
              </Button>
              <Button type="button" variant="outline" disabled={busy} onClick={closeEditor}>
                {t('project-settings.cancel_edit', {}, locale)}
              </Button>
            </div>
          </FieldGroup>
        </form>
      ) : null}
    </SettingsParts>
  )
}

export default function Panel({ locale = 'en' }: { locale?: Locale } = {}) {
  return <ProjectRotaPanel locale={locale} />
}
