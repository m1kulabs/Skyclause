'use client'

import { useEffect, useMemo, useState, type FormEvent, type ReactNode } from 'react'
import type { RotaShift } from '@skyclause/contracts'
import { formatDateTime } from '@skyclause/i18n/format'
import { Button } from '#ui/button'
import { Checkbox } from '#ui/checkbox'
import { Input } from '#ui/input'
import { Select, SelectContent, SelectGroup, SelectItem, SelectTrigger, SelectValue } from '#ui/select'
import { Skeleton } from '#ui/skeleton'
import {
  SettingsAside,
  SettingsError,
  SettingsField,
  SettingsPart,
  SettingsParts,
  SettingsReadError,
  SettingsStatus,
  SettingsSummaryLine
} from '../settings/parts'
import { useUnsavedChangesGuard } from '../settings/set-7/use-unsaved-changes-guard'
import { apiFetch } from '../members/operations'
import type { Member } from '../members/model'
import { formatMytClock, formatRotaDate, initials, minutesOfDay, nextSevenDays, type Locale } from './model'
import { t } from './i18n'
import styles from './rota.module.css'

type TemplateName = RotaShift['template']
type Condition = 'storm_afternoon' | 'surge_night' | null
type RotaTemplate = { template: TemplateName; local_start: string; local_end: string; condition: Condition }
type Shift = Omit<RotaShift, 'condition'> & { local_start: string; local_end: string; condition: Condition }
type RotaData = {
  time_zone: string
  templates: RotaTemplate[]
  shifts: Shift[]
  on_duty: Array<{ account_id: string; shift_id: string; until: string }>
  next_shift: { shift: Shift; starts_at: string; ends_at: string } | null
  unstaffed_slots: Array<{
    date: string
    starts_at: string
    ends_at: string
    template: TemplateName
    condition_state: 'active' | 'inactive' | 'unknown'
  }>
}
type ViewerRole = 'owner' | 'admin' | 'approver'
type DraftShift = Shift & { clientKey: string }
type ShiftEditor = {
  key: string | null
  accountId: string
  template: TemplateName
  days: number[]
  localStart: string
  localEnd: string
  condition: Condition
}

export interface RotaPanelProps {
  org: string
  viewer: { accountId: string; role: ViewerRole }
  locale: Locale
  alertsCard?: ReactNode
}

const dayKeys = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'] as const

function dayName(weekday: number, locale: Locale): string {
  return t(`rota.${dayKeys[weekday - 1]}`, {}, locale)
}

function templateName(template: TemplateName, locale: Locale): string {
  return t(
    `rota.${template === 'storm_afternoon' ? 'storm_template' : template === 'surge_night' ? 'surge_template' : 'custom_template'}`,
    {},
    locale
  )
}

function memberRoleIsApprover(role: string): boolean {
  return ['approver', 'admin', 'owner'].includes(role)
}

function stableSignature(shifts: DraftShift[]): string {
  return JSON.stringify(
    shifts.map(({ account_id, days, local_start, local_end, condition, order, template }) => ({
      account_id,
      days: [...days].sort((a, b) => a - b),
      local_start,
      local_end,
      condition,
      order,
      template
    }))
  )
}

async function allMembers(org: string, signal: AbortSignal): Promise<Member[]> {
  const result: Member[] = []
  let cursor: string | undefined
  do {
    const page = await apiFetch('listMembers', {
      org,
      params: { org },
      query: { limit: 200, cursor },
      signal
    })
    result.push(...page.data)
    cursor = page.next_cursor ?? undefined
  } while (cursor)
  return result
}

function shiftFromEditor(editor: ShiftEditor, clientKey: string, order: number): DraftShift {
  return {
    id: editor.key ?? clientKey,
    clientKey,
    account_id: editor.accountId,
    project_id: null,
    days: [...editor.days].sort((a, b) => a - b),
    local_start: editor.localStart,
    local_end: editor.localEnd,
    condition: editor.condition,
    order,
    template: editor.template
  }
}

function displayName(accountId: string, members: Member[], viewer: RotaPanelProps['viewer'], locale: Locale): string {
  if (accountId === viewer.accountId) return t('rota.you', {}, locale)
  return (
    members.find((member) => member.account_id === accountId)?.name ??
    t('rota.unknown_person', { id: accountId }, locale)
  )
}

function shiftMatchesDay(shift: DraftShift, weekday: number): boolean {
  return shift.days.includes(weekday)
}

export function RotaPanel({ org, viewer, locale, alertsCard }: RotaPanelProps) {
  const [rota, setRota] = useState<RotaData | null>(null)
  const [members, setMembers] = useState<Member[]>([])
  const [draft, setDraft] = useState<DraftShift[]>([])
  const [savedSignature, setSavedSignature] = useState('')
  const [editor, setEditor] = useState<ShiftEditor | null>(null)
  const [showEditor, setShowEditor] = useState(false)
  const [loading, setLoading] = useState(true)
  const [loadFailure, setLoadFailure] = useState<{ error: unknown; at: string } | null>(null)
  const [saveResult, setSaveResult] = useState<'saved' | 'failed' | null>(null)
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState('')
  const [reload, setReload] = useState(0)
  const dirty = useMemo(() => stableSignature(draft) !== savedSignature, [draft, savedSignature])
  useUnsavedChangesGuard(dirty, locale)

  useEffect(() => {
    const controller = new AbortController()
    setLoading(true)
    setLoadFailure(null)
    Promise.all([
      apiFetch('getRota', { org, params: { org }, query: { days: 7 }, signal: controller.signal }),
      viewer.role === 'approver' ? Promise.resolve([] as Member[]) : allMembers(org, controller.signal)
    ])
      .then(([data, memberRows]) => {
        if (controller.signal.aborted) return
        const result = data as RotaData
        const initial = result.shifts.map((shift) => ({ ...shift, clientKey: shift.id }))
        setRota(result)
        setMembers(memberRows)
        setDraft(initial)
        setSavedSignature(stableSignature(initial))
      })
      .catch((error: unknown) => {
        if (!controller.signal.aborted) setLoadFailure({ error, at: new Date().toISOString() })
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false)
      })
    return () => controller.abort()
  }, [org, viewer.role, reload])

  const days = useMemo(() => nextSevenDays(), [rota])
  const accounts = new Set(draft.map((shift) => shift.account_id))
  const eligible = members.filter((member) => memberRoleIsApprover(member.role))
  if (viewer.role === 'approver' && !eligible.some((member) => member.account_id === viewer.accountId)) {
    eligible.push({
      id: viewer.accountId,
      org_id: org,
      account_id: viewer.accountId,
      role: 'approver',
      reads_malay: false,
      name: t('rota.you', {}, locale),
      email: '',
      last_active_at: null,
      sign_in_methods: []
    })
  }
  const rowAccounts = new Set([...eligible.map((member) => member.account_id), ...accounts])
  if (viewer.role === 'approver') rowAccounts.add(viewer.accountId)
  const people = [...rowAccounts].map((id) => ({
    id,
    name: displayName(id, members, viewer, locale),
    initials: initials(displayName(id, members, viewer, locale))
  }))
  const templateValues = rota?.templates ?? []
  const unstaffedSlots = [...(rota?.unstaffed_slots ?? [])].sort((a, b) =>
    `${a.date}T${a.starts_at}`.localeCompare(`${b.date}T${b.starts_at}`)
  )
  const firstUnstaffed = unstaffedSlots[0]
  const onDuty = rota?.on_duty[0]
  const nextShift = rota?.next_shift

  function startNewShift() {
    const firstTemplate = templateValues.find((item) => item.template !== 'custom') ?? templateValues[0]
    const person = viewer.role === 'approver' ? viewer.accountId : (eligible[0]?.account_id ?? '')
    setEditor({
      key: null,
      accountId: person,
      template: firstTemplate?.template ?? 'custom',
      days: [],
      localStart: firstTemplate?.local_start ?? '09:00',
      localEnd: firstTemplate?.local_end ?? '17:00',
      condition: firstTemplate?.condition ?? null
    })
    setShowEditor(true)
    setMessage('')
  }

  function editShift(shift: DraftShift) {
    setEditor({
      key: shift.clientKey,
      accountId: shift.account_id,
      template: shift.template,
      days: [...shift.days],
      localStart: shift.local_start,
      localEnd: shift.local_end,
      condition: shift.condition
    })
    setShowEditor(true)
    setMessage('')
  }

  function chooseTemplate(template: TemplateName) {
    const values = templateValues.find((item) => item.template === template)
    setEditor(
      (current) =>
        current && {
          ...current,
          template,
          localStart: values?.local_start ?? current.localStart,
          localEnd: values?.local_end ?? current.localEnd,
          condition: values?.condition ?? null
        }
    )
  }

  function applyEditor(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!editor || !editor.accountId || editor.days.length === 0) {
      setMessage(t('rota.editor_required', {}, locale))
      return
    }
    if (editor.localStart >= editor.localEnd) {
      setMessage(t('rota.time_order', {}, locale))
      return
    }
    const clientKey = editor.key ?? globalThis.crypto.randomUUID()
    setDraft((previous) => {
      const order = editor.key
        ? (previous.find((shift) => shift.clientKey === editor.key)?.order ?? previous.length)
        : previous.length
      const next = shiftFromEditor(editor, clientKey, order)
      return editor.key ? previous.map((shift) => (shift.clientKey === editor.key ? next : shift)) : [...previous, next]
    })
    setShowEditor(false)
    setEditor(null)
    setMessage('')
  }

  function removeShift(shift: DraftShift) {
    setDraft((previous) => previous.filter((row) => row.clientKey !== shift.clientKey))
    if (editor?.key === shift.clientKey) {
      setEditor(null)
      setShowEditor(false)
    }
  }

  async function saveRota() {
    if (!rota || !dirty) return
    setSaving(true)
    setMessage('')
    setSaveResult(null)
    // An Approver's replacement covers only their own shifts; the API keeps colleagues' and refuses theirs.
    const editable = viewer.role === 'approver' ? draft.filter((shift) => shift.account_id === viewer.accountId) : draft
    try {
      const updated = await apiFetch('replaceRotaShifts', {
        org,
        params: { org },
        body: {
          project_id: null,
          templates: rota.templates,
          shifts: editable.map(({ clientKey: _clientKey, id: _id, project_id: _projectId, ...shift }) => shift)
        }
      })
      const result = updated as RotaData
      const saved = result.shifts.map((shift) => ({ ...shift, clientKey: shift.id }))
      setRota(result)
      setDraft(saved)
      setSavedSignature(stableSignature(saved))
      setSaveResult('saved')
    } catch {
      setSaveResult('failed')
    } finally {
      setSaving(false)
    }
  }

  function conditionLabel(slot: RotaData['unstaffed_slots'][number]): string | null {
    if (slot.condition_state === 'unknown') return t('rota.condition_unknown', {}, locale)
    if (slot.condition_state === 'inactive') return null
    return slot.template === 'storm_afternoon'
      ? t('rota.condition_storm', {}, locale)
      : slot.template === 'surge_night'
        ? t('rota.condition_show', {}, locale)
        : null
  }

  const hourTicks = [0, 3, 6, 9, 12, 15, 18, 21, 24]
  const placement = (start: number, end: number) => ({
    left: `${((start / 1440) * 100).toFixed(3)}%`,
    width: `${(((end - start) / 1440) * 100).toFixed(3)}%`
  })
  const shiftCount = draft.length
  const gapCount = unstaffedSlots.length

  return (
    <div className={styles.panel} aria-busy={loading}>
      {!loading && !loadFailure && rota && (
        <SettingsAside>
          <SettingsSummaryLine label={t('rota.timeline_short', {}, locale)}>
            {t('rota.summary_shifts', { count: shiftCount }, locale)}
          </SettingsSummaryLine>
          <SettingsSummaryLine label={t('rota.unstaffed_row', {}, locale)}>
            {t('rota.summary_gaps', { count: gapCount }, locale)}
          </SettingsSummaryLine>
        </SettingsAside>
      )}
      <SettingsParts>
        {loading && (
          <div className="grid gap-2" role="status" aria-label={t('rota.loading', {}, locale)}>
            <Skeleton className="h-12 w-full rounded-md" />
            <Skeleton className="h-28 w-full rounded-md" />
            <Skeleton className="h-28 w-full rounded-md" />
          </div>
        )}
        {loadFailure && (
          <SettingsReadError
            source={t('rota.source', {}, locale)}
            error={loadFailure.error}
            at={loadFailure.at}
            locale={locale}
            onRetry={() => setReload((value) => value + 1)}
          />
        )}

        {!loading && !loadFailure && rota && (
          <>
            <section className={styles.coverage} aria-label={t('rota.on_duty', {}, locale)}>
              <div className={styles.fact}>
                <h3>{t('rota.on_duty', {}, locale)}</h3>
                {onDuty ? (
                  <p>
                    {t(
                      'rota.on_duty_summary',
                      {
                        name: displayName(onDuty.account_id, members, viewer, locale),
                        time: formatMytClock(onDuty.until, locale)
                      },
                      locale
                    )}
                  </p>
                ) : (
                  <p>{t('rota.on_duty_none', {}, locale)}</p>
                )}
              </div>
              <div className={styles.fact}>
                <h3>{t('rota.next_shift', {}, locale)}</h3>
                {nextShift ? (
                  <p>
                    {t(
                      'rota.next_shift_summary',
                      {
                        name: displayName(nextShift.shift.account_id, members, viewer, locale),
                        start: formatDateTime(nextShift.starts_at, locale),
                        end: formatMytClock(nextShift.ends_at, locale)
                      },
                      locale
                    )}
                  </p>
                ) : (
                  <p>{t('rota.next_none', {}, locale)}</p>
                )}
              </div>
              <div className={styles.fact} aria-labelledby="rota-finding-heading" role="group">
                <h3 id="rota-finding-heading">{t('rota.finding', {}, locale)}</h3>
                {firstUnstaffed ? (
                  <p>
                    {t(
                      'rota.finding_item',
                      {
                        date: formatRotaDate(firstUnstaffed.date, locale),
                        start: formatMytClock(firstUnstaffed.starts_at, locale),
                        end: formatMytClock(firstUnstaffed.ends_at, locale),
                        template: templateName(firstUnstaffed.template, locale)
                      },
                      locale
                    )}
                  </p>
                ) : (
                  <p>{t('rota.finding_none', {}, locale)}</p>
                )}
              </div>
            </section>

            {draft.some((shift) => shift.account_id === viewer.accountId) && alertsCard}

            <SettingsPart
              title={t('rota.timeline', {}, locale)}
              id="rota-timeline-heading"
              actions={
                <span className="type-small text-muted-foreground">
                  {t('rota.shift_count', { count: draft.length }, locale)}
                </span>
              }
            >
              <div className={styles.week}>
                <div className={styles.axis} aria-hidden="true">
                  <div className={styles.axisRow}>
                    <span className={styles.zone}>{t('rota.axis_zone', {}, locale)}</span>
                    <div className={styles.ticks}>
                      {hourTicks.map((hour) => (
                        <time
                          key={hour}
                          className={styles.tick}
                          dateTime={`${String(hour % 24).padStart(2, '0')}:00`}
                          style={{ left: `${((hour / 24) * 100).toFixed(3)}%` }}
                        >
                          {String(hour).padStart(2, '0')}
                        </time>
                      ))}
                    </div>
                  </div>
                </div>
                {days.map((day, index) => {
                  const dayShifts = draft
                    .filter((shift) => shiftMatchesDay(shift, day.isoWeekday))
                    .sort((a, b) => a.local_start.localeCompare(b.local_start))
                  const daySlots = unstaffedSlots.filter((slot) => slot.date === day.date)
                  const lanePeople = people.filter((person) =>
                    dayShifts.some((shift) => shift.account_id === person.id)
                  )
                  return (
                    <div className={styles.day} key={day.date} data-day={day.date}>
                      <div className={styles.dayHead}>
                        <strong>{formatRotaDate(day.date, locale)}</strong>
                        {index === 0 && <span className={styles.today}>{t('rota.today', {}, locale)}</span>}
                      </div>
                      <div className={styles.lanes} aria-hidden="true">
                        {lanePeople.map((person) => (
                          <div className={styles.lane} key={person.id}>
                            {dayShifts
                              .filter((shift) => shift.account_id === person.id)
                              .map((shift) => (
                                <span
                                  className={styles.capsule}
                                  key={shift.clientKey}
                                  style={placement(minutesOfDay(shift.local_start), minutesOfDay(shift.local_end))}
                                >
                                  <span className={styles.initials}>{person.initials}</span>
                                  <span className={styles.name}>{person.name}</span>
                                </span>
                              ))}
                          </div>
                        ))}
                        {daySlots.map((slot, slotIndex) => (
                          <div className={styles.lane} key={`${slot.template}-${slot.starts_at}-${slotIndex}`}>
                            <span
                              className={styles.capsule}
                              data-gap
                              style={placement(minutesOfDay(slot.starts_at), minutesOfDay(slot.ends_at))}
                            >
                              <span className={styles.initials}>{t('rota.unstaffed_short', {}, locale)}</span>
                              <span className={styles.name}>{t('rota.unstaffed', {}, locale)}</span>
                            </span>
                          </div>
                        ))}
                        {!daySlots.length && !lanePeople.length ? <div className={styles.lane} /> : null}
                      </div>
                      {dayShifts.length || daySlots.length ? (
                        <ul className={styles.shifts}>
                          {dayShifts.map((shift) => {
                            const canEdit = viewer.role !== 'approver' || shift.account_id === viewer.accountId
                            const person = displayName(shift.account_id, members, viewer, locale)
                            return (
                              <li className={styles.shift} key={shift.clientKey}>
                                <span className={styles.shiftWhen} data-numeric>
                                  {t('rota.time_range', { start: shift.local_start, end: shift.local_end }, locale)}
                                </span>
                                <span className={styles.shiftWho}>
                                  {person}
                                  <span>{templateName(shift.template, locale)}</span>
                                </span>
                                {canEdit && (
                                  <span className={styles.shiftActions}>
                                    <Button
                                      variant="outline"
                                      aria-label={t(
                                        'rota.edit_shift',
                                        { name: person, date: formatRotaDate(day.date, locale) },
                                        locale
                                      )}
                                      onClick={() => editShift(shift)}
                                    >
                                      {t('rota.edit', {}, locale)}
                                    </Button>
                                    <Button
                                      variant="outline"
                                      aria-label={t('rota.remove_shift', { name: person }, locale)}
                                      onClick={() => removeShift(shift)}
                                    >
                                      {t('rota.remove', {}, locale)}
                                    </Button>
                                  </span>
                                )}
                              </li>
                            )
                          })}
                          {daySlots.map((slot, slotIndex) => (
                            <li
                              className={styles.shift}
                              data-gap
                              key={`gap-${slot.template}-${slot.starts_at}-${slotIndex}`}
                            >
                              <span className={styles.shiftWhen} data-numeric>
                                {t(
                                  'rota.time_range',
                                  {
                                    start: formatMytClock(slot.starts_at, locale),
                                    end: formatMytClock(slot.ends_at, locale)
                                  },
                                  locale
                                )}
                              </span>
                              <span className={styles.shiftWho}>
                                {t('rota.unstaffed', {}, locale)}
                                <span>{conditionLabel(slot) ?? templateName(slot.template, locale)}</span>
                              </span>
                            </li>
                          ))}
                        </ul>
                      ) : (
                        <p className={styles.empty}>{t('rota.no_shifts', {}, locale)}</p>
                      )}
                    </div>
                  )
                })}
              </div>
            </SettingsPart>

            <SettingsPart title={t('rota.templates_heading', {}, locale)} id="rota-templates-heading">
              <div className={styles.templates}>
                {rota.templates.map((template) => {
                  const assigned = draft.some((shift) => shift.template === template.template)
                  return (
                    <div className={styles.templateRow} key={template.template}>
                      <strong>{templateName(template.template, locale)}</strong>
                      <span>
                        {t('rota.template_hours', { start: template.local_start, end: template.local_end }, locale)}
                      </span>
                      <span>
                        {assigned ? t('rota.template_assigned', {}, locale) : t('rota.no_one_assigned', {}, locale)}
                      </span>
                    </div>
                  )
                })}
              </div>
            </SettingsPart>

            <SettingsPart title={t('rota.add_heading', {}, locale)} id="rota-add-heading">
              {!showEditor && (
                <div>
                  <Button type="button" onClick={startNewShift}>
                    {t('rota.add_action', {}, locale)}
                  </Button>
                </div>
              )}
              {showEditor && editor && (
                <form className={styles.editor} onSubmit={applyEditor} noValidate>
                  <div className={styles.editorFields}>
                    <SettingsField
                      label={t('rota.person', {}, locale)}
                      hint={!eligible.length ? t('rota.no_approvers', {}, locale) : undefined}
                    >
                      {(aria) => (
                        <Select
                          value={editor.accountId}
                          onValueChange={(value) =>
                            setEditor((current) => current && { ...current, accountId: value ?? '' })
                          }
                          disabled={viewer.role === 'approver'}
                        >
                          <SelectTrigger {...aria} className="w-full" aria-label={t('rota.person', {}, locale)}>
                            <SelectValue placeholder={t('rota.person_placeholder', {}, locale)}>
                              {editor.accountId ? displayName(editor.accountId, members, viewer, locale) : null}
                            </SelectValue>
                          </SelectTrigger>
                          <SelectContent>
                            <SelectGroup>
                              {(viewer.role === 'approver'
                                ? eligible.filter((member) => member.account_id === viewer.accountId)
                                : eligible
                              ).map((member) => (
                                <SelectItem key={member.account_id} value={member.account_id}>
                                  {displayName(member.account_id, members, viewer, locale)}
                                </SelectItem>
                              ))}
                            </SelectGroup>
                          </SelectContent>
                        </Select>
                      )}
                    </SettingsField>
                    <SettingsField label={t('rota.template', {}, locale)}>
                      {(aria) => (
                        <Select
                          value={editor.template}
                          onValueChange={(value) => value && chooseTemplate(value as TemplateName)}
                        >
                          <SelectTrigger {...aria} className="w-full" aria-label={t('rota.template', {}, locale)}>
                            <SelectValue>{templateName(editor.template, locale)}</SelectValue>
                          </SelectTrigger>
                          <SelectContent>
                            <SelectGroup>
                              {rota.templates.map((template) => (
                                <SelectItem key={template.template} value={template.template}>
                                  {templateName(template.template, locale)}
                                </SelectItem>
                              ))}
                              {!rota.templates.some((template) => template.template === 'custom') && (
                                <SelectItem value="custom">{templateName('custom', locale)}</SelectItem>
                              )}
                            </SelectGroup>
                          </SelectContent>
                        </Select>
                      )}
                    </SettingsField>
                    <SettingsField label={t('rota.time_start', {}, locale)} hint={t('rota.time_hint', {}, locale)}>
                      {(aria) => (
                        <Input
                          {...aria}
                          name="local_start"
                          type="time"
                          autoComplete="off"
                          value={editor.localStart}
                          onChange={(event) => {
                            const localStart = event.currentTarget.value
                            setEditor((current) => current && { ...current, localStart })
                          }}
                          disabled={editor.template !== 'custom'}
                        />
                      )}
                    </SettingsField>
                    <SettingsField label={t('rota.time_end', {}, locale)} hint={t('rota.time_hint', {}, locale)}>
                      {(aria) => (
                        <Input
                          {...aria}
                          name="local_end"
                          type="time"
                          autoComplete="off"
                          value={editor.localEnd}
                          onChange={(event) => {
                            const localEnd = event.currentTarget.value
                            setEditor((current) => current && { ...current, localEnd })
                          }}
                          disabled={editor.template !== 'custom'}
                        />
                      )}
                    </SettingsField>
                  </div>
                  <fieldset className={styles.dayChoices}>
                    <legend>{t('rota.days', {}, locale)}</legend>
                    <div className={styles.dayOptions}>
                      {dayKeys.map((key, index) => {
                        const weekday = index + 1
                        const checked = editor.days.includes(weekday)
                        return (
                          <label className={styles.dayChoice} key={key}>
                            <Checkbox
                              checked={checked}
                              name="days"
                              value={String(weekday)}
                              aria-label={dayName(weekday, locale)}
                              onCheckedChange={(value) =>
                                setEditor(
                                  (current) =>
                                    current && {
                                      ...current,
                                      days: value
                                        ? [...new Set([...current.days, weekday])].sort((a, b) => a - b)
                                        : current.days.filter((day) => day !== weekday)
                                    }
                                )
                              }
                            />
                            <span>{dayName(weekday, locale)}</span>
                          </label>
                        )
                      })}
                    </div>
                  </fieldset>
                  {message && <SettingsError>{message}</SettingsError>}
                  <div className={styles.editorActions}>
                    <Button type="submit">{t('rota.apply_shift', {}, locale)}</Button>
                    <Button
                      type="button"
                      variant="outline"
                      onClick={() => {
                        setShowEditor(false)
                        setEditor(null)
                        setMessage('')
                      }}
                    >
                      {t('rota.cancel_edit', {}, locale)}
                    </Button>
                  </div>
                </form>
              )}
            </SettingsPart>

            <div className={styles.saveRow}>
              <Button type="button" disabled={!dirty || saving} onClick={() => void saveRota()}>
                {saving ? t('rota.saving', {}, locale) : t('rota.save', {}, locale)}
              </Button>
              {dirty && <SettingsStatus>{t('rota.unsaved', {}, locale)}</SettingsStatus>}
              {saveResult === 'saved' && !dirty && <SettingsStatus>{t('rota.saved', {}, locale)}</SettingsStatus>}
              {saveResult === 'failed' && <SettingsError>{t('rota.save_failed', {}, locale)}</SettingsError>}
            </div>
          </>
        )}
      </SettingsParts>
    </div>
  )
}
