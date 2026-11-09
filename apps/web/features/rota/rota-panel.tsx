'use client'

import { useEffect, useId, useMemo, useState, type FormEvent, type ReactNode } from 'react'
import type { RotaShift } from '@skyclause/contracts'
import { formatDateTime } from '@skyclause/i18n/format'
import { Alert, AlertDescription } from '#ui/alert'
import { Badge } from '#ui/badge'
import { Button } from '#ui/button'
import { Checkbox } from '#ui/checkbox'
import { Field, FieldDescription, FieldGroup, FieldLabel } from '#ui/field'
import { Input } from '#ui/input'
import { Select, SelectContent, SelectGroup, SelectItem, SelectTrigger, SelectValue } from '#ui/select'
import { useUnsavedChangesGuard } from '../settings/set-7/use-unsaved-changes-guard'
import { apiFetch } from '../members/operations'
import type { Member } from '../members/model'
import { formatMytClock, formatRotaDate, initials, nextSevenDays, type Locale } from './model'
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
  const personId = useId()
  const templateId = useId()
  const startId = useId()
  const endId = useId()
  const [rota, setRota] = useState<RotaData | null>(null)
  const [members, setMembers] = useState<Member[]>([])
  const [draft, setDraft] = useState<DraftShift[]>([])
  const [savedSignature, setSavedSignature] = useState('')
  const [editor, setEditor] = useState<ShiftEditor | null>(null)
  const [showEditor, setShowEditor] = useState(false)
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState(false)
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState('')
  const [reload, setReload] = useState(0)
  const dirty = useMemo(() => stableSignature(draft) !== savedSignature, [draft, savedSignature])
  useUnsavedChangesGuard(dirty, locale)

  useEffect(() => {
    const controller = new AbortController()
    setLoading(true)
    setLoadError(false)
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
        setLoadError(false)
      })
      .catch(() => {
        if (!controller.signal.aborted) setLoadError(true)
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
    try {
      const updated = await apiFetch('replaceRotaShifts', {
        org,
        params: { org },
        body: {
          project_id: null,
          templates: rota.templates,
          shifts: draft.map(({ clientKey: _clientKey, id: _id, project_id: _projectId, ...shift }) => shift)
        }
      })
      const result = updated as RotaData
      const saved = result.shifts.map((shift) => ({ ...shift, clientKey: shift.id }))
      setRota(result)
      setDraft(saved)
      setSavedSignature(stableSignature(saved))
      setMessage(t('rota.saved', {}, locale))
    } catch {
      setMessage(t('rota.save_failed', {}, locale))
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

  return (
    <div className={styles.panel}>
      {loading && <p role="status">{t('rota.loading', {}, locale)}</p>}
      {loadError && (
        <Alert variant="destructive" role="alert">
          <AlertDescription className={styles.retryRow}>
            <span>{t('rota.load_error', {}, locale)}</span>
            <button className={styles.inlineButton} type="button" onClick={() => setReload((value) => value + 1)}>
              {t('rota.retry', {}, locale)}
            </button>
          </AlertDescription>
        </Alert>
      )}

      {!loading && !loadError && rota && (
        <>
          <section className={styles.coverage} aria-label={t('rota.on_duty', {}, locale)}>
            <div>
              <h3>{t('rota.on_duty', {}, locale)}</h3>
              {onDuty ? (
                <p>
                  <strong>
                    {t(
                      'rota.on_duty_summary',
                      {
                        name: displayName(onDuty.account_id, members, viewer, locale),
                        time: formatMytClock(onDuty.until, locale)
                      },
                      locale
                    )}
                  </strong>
                </p>
              ) : (
                <p>{t('rota.on_duty_none', {}, locale)}</p>
              )}
            </div>
            <div>
              <h3>{t('rota.next_shift', {}, locale)}</h3>
              {nextShift ? (
                <p>
                  <strong>
                    {t(
                      'rota.next_shift_summary',
                      {
                        name: displayName(nextShift.shift.account_id, members, viewer, locale),
                        start: formatDateTime(nextShift.starts_at, locale),
                        end: formatMytClock(nextShift.ends_at, locale)
                      },
                      locale
                    )}
                  </strong>
                </p>
              ) : (
                <p>{t('rota.next_none', {}, locale)}</p>
              )}
            </div>
          </section>

          {draft.some((shift) => shift.account_id === viewer.accountId) && alertsCard}

          <section className={styles.finding} aria-labelledby="rota-finding-heading">
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
          </section>

          <section className={styles.templates} aria-labelledby="rota-templates-heading">
            <h3 id="rota-templates-heading">{t('rota.templates_heading', {}, locale)}</h3>
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
          </section>

          <section aria-labelledby="rota-timeline-heading">
            <div className={styles.sectionHeader}>
              <h3 id="rota-timeline-heading">{t('rota.timeline', {}, locale)}</h3>
              <span>{t('rota.shift_count', { count: draft.length }, locale)}</span>
            </div>
            <div
              className={styles.timelineFrame}
              // eslint-disable-next-line jsx-a11y/no-noninteractive-tabindex -- A scrollable timeline needs a keyboard tab stop.
              tabIndex={0}
              role="region"
              aria-label={t('rota.timeline', {}, locale)}
            >
              <div className={styles.timeline}>
                <div className={styles.timelineHeader}>
                  <div className={styles.personHeader}>{t('rota.person', {}, locale)}</div>
                  {days.map((day, index) => {
                    const daySlots = unstaffedSlots.filter((slot) => slot.date === day.date)
                    const labels = [
                      ...new Set(daySlots.map(conditionLabel).filter((label): label is string => Boolean(label)))
                    ]
                    return (
                      <div className={styles.dayHeader} key={day.date}>
                        <strong>{formatRotaDate(day.date, locale)}</strong>
                        {index === 0 && <span>{t('rota.today', {}, locale)}</span>}
                        {labels.map((label) => (
                          <Badge key={label} variant="outline">
                            {label}
                          </Badge>
                        ))}
                      </div>
                    )
                  })}
                </div>
                {people.map((person) => (
                  <div className={styles.timelineRow} key={person.id}>
                    <div className={styles.personCell}>
                      <span className={styles.avatar} aria-hidden="true">
                        {person.initials}
                      </span>
                      <strong>{person.name}</strong>
                    </div>
                    {days.map((day) => {
                      const shifts = draft.filter(
                        (shift) => shift.account_id === person.id && shiftMatchesDay(shift, day.isoWeekday)
                      )
                      return (
                        <div className={styles.dayCell} key={`${person.id}-${day.date}`}>
                          {shifts.map((shift) => {
                            const canEdit = viewer.role !== 'approver' || shift.account_id === viewer.accountId
                            return (
                              <div className={styles.shiftCard} key={shift.clientKey}>
                                <span>
                                  {t('rota.time_range', { start: shift.local_start, end: shift.local_end }, locale)}
                                </span>
                                <span>{templateName(shift.template, locale)}</span>
                                {canEdit && (
                                  <div className={styles.shiftActions}>
                                    <Button variant="outline" onClick={() => editShift(shift)}>
                                      {t(
                                        'rota.edit_shift',
                                        { name: person.name, date: formatRotaDate(day.date, locale) },
                                        locale
                                      )}
                                    </Button>
                                    <Button variant="outline" onClick={() => removeShift(shift)}>
                                      {t('rota.remove_shift', { name: person.name }, locale)}
                                    </Button>
                                  </div>
                                )}
                              </div>
                            )
                          })}
                        </div>
                      )
                    })}
                  </div>
                ))}
                <div className={styles.timelineRow}>
                  <div className={styles.personCell}>
                    <strong>{t('rota.unstaffed_row', {}, locale)}</strong>
                  </div>
                  {days.map((day) => {
                    const slots = unstaffedSlots.filter((slot) => slot.date === day.date)
                    return (
                      <div
                        className={slots.length ? styles.unstaffedCell : styles.dayCell}
                        key={`unstaffed-${day.date}`}
                      >
                        {slots.map((slot, index) => (
                          <div className={styles.unstaffedCard} key={`${slot.template}-${slot.starts_at}-${index}`}>
                            <strong>{t('rota.unstaffed', {}, locale)}</strong>
                            <span>
                              {t(
                                'rota.time_range',
                                {
                                  start: formatMytClock(slot.starts_at, locale),
                                  end: formatMytClock(slot.ends_at, locale)
                                },
                                locale
                              )}
                            </span>
                            {conditionLabel(slot) && <span>{conditionLabel(slot)}</span>}
                          </div>
                        ))}
                      </div>
                    )
                  })}
                </div>
              </div>
            </div>
          </section>

          <section className={styles.editorSection} aria-labelledby="rota-add-heading">
            <h3 id="rota-add-heading">{t('rota.add_heading', {}, locale)}</h3>
            {!showEditor && (
              <Button type="button" onClick={startNewShift}>
                {t('rota.add_action', {}, locale)}
              </Button>
            )}
            {showEditor && editor && (
              <form className={styles.editor} onSubmit={applyEditor}>
                <FieldGroup className={styles.editorFields}>
                  <Field>
                    <FieldLabel htmlFor={personId}>{t('rota.person', {}, locale)}</FieldLabel>
                    <Select
                      value={editor.accountId}
                      onValueChange={(value) =>
                        setEditor((current) => current && { ...current, accountId: value ?? '' })
                      }
                      disabled={viewer.role === 'approver'}
                    >
                      <SelectTrigger id={personId} aria-label={t('rota.person', {}, locale)}>
                        <SelectValue placeholder={t('rota.person_placeholder', {}, locale)} />
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
                    {!eligible.length && <FieldDescription>{t('rota.no_approvers', {}, locale)}</FieldDescription>}
                  </Field>
                  <Field>
                    <FieldLabel htmlFor={templateId}>{t('rota.template', {}, locale)}</FieldLabel>
                    <Select
                      value={editor.template}
                      onValueChange={(value) => value && chooseTemplate(value as TemplateName)}
                    >
                      <SelectTrigger id={templateId} aria-label={t('rota.template', {}, locale)}>
                        <SelectValue />
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
                  </Field>
                  <Field>
                    <FieldLabel htmlFor={startId}>{t('rota.time_start', {}, locale)}</FieldLabel>
                    <Input
                      id={startId}
                      type="time"
                      value={editor.localStart}
                      onChange={(event) =>
                        setEditor((current) => current && { ...current, localStart: event.currentTarget.value })
                      }
                      disabled={editor.template !== 'custom'}
                    />
                  </Field>
                  <Field>
                    <FieldLabel htmlFor={endId}>{t('rota.time_end', {}, locale)}</FieldLabel>
                    <Input
                      id={endId}
                      type="time"
                      value={editor.localEnd}
                      onChange={(event) =>
                        setEditor((current) => current && { ...current, localEnd: event.currentTarget.value })
                      }
                      disabled={editor.template !== 'custom'}
                    />
                  </Field>
                </FieldGroup>
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
                {message && (
                  <p role="alert" className={styles.problem}>
                    {message}
                  </p>
                )}
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
          </section>

          <div className={styles.saveRow}>
            <Button type="button" disabled={!dirty || saving} onClick={() => void saveRota()}>
              {saving ? t('rota.saving', {}, locale) : t('rota.save', {}, locale)}
            </Button>
            {dirty && <span role="status">{t('rota.unsaved', {}, locale)}</span>}
            {message && !showEditor && <span role="status">{message}</span>}
          </div>
        </>
      )}
    </div>
  )
}
