'use client'

import { useCallback, useState, type FormEvent } from 'react'
import { useParams } from 'next/navigation'
import { formatList, formatTimeZoneName } from '@skyclause/i18n/format'
import { Button } from '#ui/button'
import { Input } from '#ui/input'
import { Label } from '#ui/label'
import { Skeleton } from '#ui/skeleton'
import { useRead } from '../../../analysis/use-read'
import { useUnsavedChangesGuard } from '../../set-7'
import { t } from '../../../project-settings/catalogue'
import { Notice, Part, Parts, Problem, ReadFailed, Row, Rows, dateFieldRing } from '../parts'
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

  const dirty = formOpen && JSON.stringify(form) !== JSON.stringify(baseForm)
  useUnsavedChangesGuard(dirty, locale)

  const pageData = loaded.status === 'ready' ? loaded.value : null
  const eligible = pageData?.members.filter((member) => ['owner', 'admin', 'approver'].includes(member.role)) ?? []
  const inherited = pageData?.rota.shifts.filter((shift) => shift.project_id === null) ?? []
  const overrides = pageData?.rota.shifts.filter((shift) => shift.project_id === pageData.project.id) ?? []
  const memberName = (accountId: string) => {
    const member = pageData?.members.find((item) => item.account_id === accountId)
    return member ? t('project-settings.member_name', { name: member.name, email: member.email }, locale) : accountId
  }

  const openNew = () => {
    const next = { ...blankForm, accountId: eligible[0]?.account_id ?? '' }
    setEditingId(null)
    setForm(next)
    setBaseForm(next)
    setFormOpen(true)
    setStatus('')
    setError('')
  }

  const openEdit = (shift: RotaShift) => {
    const next = formFromShift(shift)
    setEditingId(shift.id)
    setForm(next)
    setBaseForm(next)
    setFormOpen(true)
    setStatus('')
    setError('')
  }

  const closeEditor = () => {
    setFormOpen(false)
    setEditingId(null)
    setForm(blankForm)
    setBaseForm(blankForm)
    setError('')
  }

  const toggleDay = (day: number) =>
    setForm((current) => ({
      ...current,
      days: current.days.includes(day) ? current.days.filter((item) => item !== day) : [...current.days, day]
    }))

  const save = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (
      !pageData ||
      busy ||
      !form.accountId ||
      !form.days.length ||
      !form.localStart ||
      !form.localEnd ||
      form.localEnd <= form.localStart
    ) {
      setError(t('project-settings.shift_failed', {}, locale))
      return
    }
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

  if (loaded.status === 'loading')
    return (
      <div className="grid gap-4" aria-busy="true">
        <Skeleton className="h-16 w-full rounded-md" />
        <Skeleton className="h-16 w-full rounded-md" />
      </div>
    )
  if (loaded.status === 'error')
    return (
      <ReadFailed
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
  const empty = (count: number) => (
    <p className="type-body flex flex-wrap gap-x-2 text-muted-foreground">
      <span data-numeric>{t('project-settings.count', { count }, locale)}</span>
    </p>
  )

  return (
    <Parts data-project-settings-rota>
      <Part
        title={t('project-settings.override', {}, locale)}
        description={t('project-settings.rota_description', {}, locale)}
        id="project-rota-override-title"
        actions={
          <Button type="button" variant="outline" onClick={openNew}>
            {t('project-settings.add_shift', {}, locale)}
          </Button>
        }
      >
        {overrides.length ? (
          <Rows>
            {overrides.map((shift) => (
              <Row key={shift.id}>
                {shiftLine(shift)}
                <Button type="button" variant="outline" onClick={() => openEdit(shift)}>
                  {t('project-settings.edit_shift', {}, locale)}
                </Button>
              </Row>
            ))}
          </Rows>
        ) : (
          <div className="grid gap-1">
            {empty(0)}
            <p className="type-body text-muted-foreground">{t('project-settings.empty_rota', {}, locale)}</p>
          </div>
        )}
      </Part>

      <Part title={t('project-settings.inherited', {}, locale)} id="project-rota-inherited-title">
        {inherited.length ? (
          <Rows>
            {inherited.map((shift) => (
              <Row key={shift.id}>{shiftLine(shift)}</Row>
            ))}
          </Rows>
        ) : (
          empty(0)
        )}
      </Part>

      {status ? <Notice>{status}</Notice> : null}
      {formOpen ? (
        <form className="grid min-w-0 gap-5 rounded-md bg-raised p-4" onSubmit={save} data-rota-editor>
          <div className="grid gap-1">
            <h3 className="type-card-title">
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
            <div className="grid gap-2">
              <Label htmlFor="rota-approver">{t('project-settings.approver', {}, locale)}</Label>
              <select
                id="rota-approver"
                name="account_id"
                autoComplete="off"
                value={form.accountId}
                onChange={(event) => setForm((current) => ({ ...current, accountId: event.target.value }))}
                className="native-select"
              >
                <option value="">{t('project-settings.choose_approver', {}, locale)}</option>
                {eligible.map((member) => (
                  <option key={member.account_id} value={member.account_id}>
                    {t('project-settings.member_name', { name: member.name, email: member.email }, locale)}
                  </option>
                ))}
              </select>
            </div>
          ) : (
            <p role="status" className="type-body text-muted-foreground">
              {t('project-settings.no_approvers', {}, locale)}
            </p>
          )}

          <fieldset className="grid min-w-0 gap-2 sm:grid-cols-2">
            <legend className="type-body mb-2 font-medium">{t('project-settings.days', {}, locale)}</legend>
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
                    onChange={() => toggleDay(day)}
                  />
                  {t(`project-settings.weekdays.${name}`, {}, locale)}
                </label>
              )
            })}
          </fieldset>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className={`grid gap-2 ${dateFieldRing}`} data-focus-ring>
              <Label htmlFor="rota-start">{t('project-settings.start', {}, locale)}</Label>
              <Input
                id="rota-start"
                name="local_start"
                autoComplete="off"
                type="time"
                value={form.localStart}
                onChange={(event) => setForm((current) => ({ ...current, localStart: event.target.value }))}
                required
              />
            </div>
            <div className={`grid gap-2 ${dateFieldRing}`} data-focus-ring>
              <Label htmlFor="rota-end">{t('project-settings.end', {}, locale)}</Label>
              <Input
                id="rota-end"
                name="local_end"
                autoComplete="off"
                type="time"
                value={form.localEnd}
                onChange={(event) => setForm((current) => ({ ...current, localEnd: event.target.value }))}
                required
              />
            </div>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="grid gap-2">
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
            </div>
            <div className="grid gap-2">
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
            </div>
          </div>
          {error ? <Problem>{error}</Problem> : null}
          <div className="flex flex-wrap gap-3">
            <Button type="submit" disabled={busy || !eligible.length} aria-busy={busy}>
              {busy ? t('project-settings.saving', {}, locale) : t('project-settings.save_shift', {}, locale)}
            </Button>
            <Button type="button" variant="outline" disabled={busy} onClick={closeEditor}>
              {t('project-settings.cancel_edit', {}, locale)}
            </Button>
          </div>
        </form>
      ) : null}
    </Parts>
  )
}

export default function Panel({ locale = 'en' }: { locale?: Locale } = {}) {
  return <ProjectRotaPanel locale={locale} />
}
