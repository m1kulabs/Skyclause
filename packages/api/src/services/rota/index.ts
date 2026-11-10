import { bundleAlert, lockMemberWrites, member, project, rotaShift, track, type Tx } from '@skyclause/db'
import type { Can, Principal, ShiftConditions } from '@skyclause/contracts'
import { zonedDateTimeParts } from '@skyclause/i18n/format'
import { and, eq, inArray, isNull, or, sql } from 'drizzle-orm'
import { ApiError } from '../../problems'

export type RotaCondition = 'storm_afternoon' | 'surge_night'
export type ConditionState = boolean | 'unknown'
type ShiftRow = typeof rotaShift.$inferSelect
type RotaContext = { tx: Tx; principal: Principal }
type ReadContext = Tx | { tx: Tx }

export const ROTA_TIME_ZONE = 'Asia/Kuala_Lumpur'
export const ROTA_TEMPLATES = [
  {
    template: 'storm_afternoon' as const,
    local_start: '14:00',
    local_end: '19:15',
    condition: 'storm_afternoon' as const
  },
  { template: 'surge_night' as const, local_start: '08:00', local_end: '22:00', condition: 'surge_night' as const }
]

const transactionOf = (ctx: ReadContext) => ('select' in ctx ? ctx : ctx.tx)

const unknownConditions: ShiftConditions = {
  async isActive() {
    return 'unknown'
  }
}
const roleRank = (role: string) => (role === 'owner' ? 3 : role === 'admin' ? 2 : role === 'approver' ? 1 : 0)
const isoWeekday = (date: string) => ((new Date(`${date}T00:00:00Z`).getUTCDay() + 6) % 7) + 1
const addDate = (date: string, days: number) =>
  new Date(Date.parse(`${date}T12:00:00Z`) + days * 86_400_000).toISOString().slice(0, 10)
const timeParts = (value: string) => {
  const [hour = 0, minute = 0, second = 0] = value.split(':').map(Number)
  return hour! * 3600 + minute! * 60 + second!
}
const normalTime = (value: string) => value.slice(0, 5)
const z2 = (value: number) => String(value).padStart(2, '0')

function localParts(at: Date, timeZone: string) {
  const values = zonedDateTimeParts(at, timeZone)
  const weekdays: Record<string, number> = { Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6, Sun: 7 }
  return {
    date: `${values.year}-${values.month}-${values.day}`,
    weekday: weekdays[values.weekday!]!,
    seconds: values.hour * 3600 + values.minute * 60 + values.second + at.getUTCMilliseconds() / 1000
  }
}

function shiftStartDate(shift: ShiftRow, date: string, seconds: number): string | null {
  const start = timeParts(shift.localStart)
  const end = timeParts(shift.localEnd)
  if (start < end) return shift.days.includes(isoWeekday(date)) ? date : null
  if (seconds >= start && shift.days.includes(isoWeekday(date))) return date
  if (seconds < end) {
    const previous = addDate(date, -1)
    return shift.days.includes(isoWeekday(previous)) ? previous : null
  }
  return null
}

function dateOf(at: Date, zone: string) {
  return localParts(at, zone).date
}

async function projectZone(tx: Tx, projectId: string): Promise<string> {
  const [row] = await tx
    .select({ id: project.id, timeZone: project.timeZone })
    .from(project)
    .where(eq(project.id, projectId))
    .limit(1)
  if (!row) throw new ApiError(404, 'not-found', 'The project was not found in this organisation.')
  return row.timeZone
}

async function effectiveShifts(
  tx: Tx,
  projectId?: string,
  eligible = false
): Promise<Array<ShiftRow & { role?: string }>> {
  const projectFilter = projectId
    ? or(isNull(rotaShift.projectId), eq(rotaShift.projectId, projectId))
    : isNull(rotaShift.projectId)
  const rows = await tx
    .select()
    .from(rotaShift)
    .where(and(eq(rotaShift.orgId, tx.orgId!), projectFilter))
  const scoped = projectId ? rows.filter((row) => row.projectId === null || row.projectId === projectId) : rows
  const projectTemplates = new Set(
    scoped.filter((row) => row.projectId === projectId && projectId !== undefined).map((row) => row.template)
  )
  const selected = projectId
    ? scoped.filter((row) => row.projectId === projectId || !projectTemplates.has(row.template))
    : scoped
  const memberships = selected.length
    ? await tx
        .select({ accountId: member.userId, role: member.role })
        .from(member)
        .where(
          and(
            eq(member.organizationId, tx.orgId!),
            inArray(member.userId, [...new Set(selected.map((row) => row.accountId))])
          )
        )
    : []
  const roles = new Map(memberships.map((row) => [row.accountId, row.role]))
  return selected.flatMap((row) => {
    const role = roles.get(row.accountId)
    if (eligible && (!role || roleRank(role) < 1)) return []
    return [{ ...row, role }]
  })
}

async function conditionState(
  tx: Tx,
  conditions: ShiftConditions,
  condition: RotaCondition | null,
  date: string,
  projectId?: string,
  orgProjectIds?: string[]
): Promise<'active' | 'inactive' | 'unknown'> {
  if (!condition) return 'active'
  if (projectId) {
    const value = await conditions.isActive(tx, { projectId, condition, date })
    return value === true ? 'active' : value === false ? 'inactive' : 'unknown'
  }
  const ids =
    orgProjectIds ??
    (await tx.select({ id: project.id }).from(project).where(eq(project.orgId, tx.orgId!))).map((row) => row.id)
  if (!ids.length) return 'unknown'
  const values = await Promise.all(ids.map((id) => conditions.isActive(tx, { projectId: id, condition, date })))
  if (values.some((value) => value === true)) return 'active'
  if (values.some((value) => value === 'unknown')) return 'unknown'
  return 'inactive'
}

async function conditionActive(
  tx: Tx,
  conditions: ShiftConditions,
  shift: ShiftRow,
  date: string,
  projectId?: string,
  orgProjectIds?: string[]
) {
  if (!shift.condition) return true
  return (
    (await conditionState(tx, conditions, shift.condition as RotaCondition, date, projectId, orgProjectIds)) !==
    'inactive'
  )
}

async function localInstant(tx: Tx, date: string, time: string, zone: string): Promise<Date> {
  const { rows } = await tx.execute<{ at: Date }>(
    sql`SELECT ((${date}::date + ${time}::time) AT TIME ZONE ${zone}) AS at`
  )
  const at = rows[0]!.at as Date | string
  return at instanceof Date ? at : new Date(at)
}

function isoTime(seconds: number) {
  const whole = Math.floor(seconds)
  return `${z2(Math.floor(whole / 3600))}:${z2(Math.floor((whole % 3600) / 60))}`
}

function covers(shift: ShiftRow, date: string, seconds: number) {
  const start = timeParts(shift.localStart)
  const end = timeParts(shift.localEnd)
  const startDate = shiftStartDate(shift, date, seconds)
  if (!startDate) return null
  if (start < end && seconds >= start && seconds < end) return { startDate, endDate: startDate }
  if (
    start >= end &&
    ((date === startDate && seconds >= start) || (addDate(date, -1) === startDate && seconds < end))
  ) {
    return { startDate, endDate: addDate(startDate, 1) }
  }
  return null
}

async function trackRota(tx: Tx, shifts: ShiftRow[]) {
  await track(tx, 'rota_set', { shifts: shifts.length, conditional: shifts.some((shift) => Boolean(shift.condition)) })
}

async function shiftsInScope(tx: Tx, projectId: string | null) {
  const scope = projectId === null ? isNull(rotaShift.projectId) : eq(rotaShift.projectId, projectId)
  return tx
    .select()
    .from(rotaShift)
    .where(and(eq(rotaShift.orgId, tx.orgId!), scope))
}

function snakeShift(row: ShiftRow) {
  return {
    id: row.id,
    account_id: row.accountId,
    project_id: row.projectId,
    days: row.days,
    local_start: normalTime(row.localStart),
    local_end: normalTime(row.localEnd),
    condition: row.condition as RotaCondition | null,
    order: row.order,
    template: row.template
  }
}

function shiftSetMatchesTemplates(
  input: Array<{ template: string; local_start: string; local_end: string; condition: string | null }>
) {
  return (
    input.length === ROTA_TEMPLATES.length &&
    ROTA_TEMPLATES.every((expected, index) => {
      const actual = input[index]
      return (
        actual?.template === expected.template &&
        actual.local_start === expected.local_start &&
        actual.local_end === expected.local_end &&
        actual.condition === expected.condition
      )
    })
  )
}

export function createRotaService(conditions: ShiftConditions = unknownConditions) {
  async function onDuty(context: ReadContext, q: { projectId?: string; at: Date }) {
    const tx = transactionOf(context)
    const timeZone = q.projectId ? await projectZone(tx, q.projectId) : ROTA_TIME_ZONE
    const now = localParts(q.at, timeZone)
    const rows = await effectiveShifts(tx, q.projectId, true)
    const projectIds = q.projectId
      ? undefined
      : (await tx.select({ id: project.id }).from(project).where(eq(project.orgId, tx.orgId!))).map((row) => row.id)
    const active = [] as Array<{ accountId: string; shiftId: string; until: Date; order: number }>
    for (const shift of rows) {
      const span = covers(shift, now.date, now.seconds)
      if (!span || !(await conditionActive(tx, conditions, shift, span.startDate, q.projectId, projectIds))) continue
      const endDate = span.endDate
      const until = await localInstant(tx, endDate, shift.localEnd, timeZone)
      active.push({ accountId: shift.accountId, shiftId: shift.id, until, order: shift.order })
    }
    return active.sort((a, b) => a.order - b.order || a.accountId.localeCompare(b.accountId))
  }

  async function nextApprovers(context: ReadContext, q: { projectId: string; bundleId: string; at: Date }) {
    const tx = transactionOf(context)
    const timeZone = await projectZone(tx, q.projectId)
    const duty = await onDuty(tx, { projectId: q.projectId, at: q.at })
    const dutyAccounts = new Set(duty.map((row) => row.accountId))
    const floor = duty.length ? Math.max(...duty.map((row) => row.order)) : -Infinity
    const rows = await effectiveShifts(tx, q.projectId, true)
    const localToday = dateOf(q.at, timeZone)
    const scheduled: Array<{ accountId: string; order: number; start: Date }> = []
    for (let offset = 0; offset < 31; offset++) {
      const date = addDate(localToday, offset)
      for (const shift of rows) {
        if (!shift.days.includes(isoWeekday(date)) || shift.order <= floor || dutyAccounts.has(shift.accountId))
          continue
        if (!(await conditionActive(tx, conditions, shift, date, q.projectId))) continue
        const start = await localInstant(tx, date, shift.localStart, timeZone)
        const endDate = timeParts(shift.localStart) >= timeParts(shift.localEnd) ? addDate(date, 1) : date
        const end = await localInstant(tx, endDate, shift.localEnd, timeZone)
        if (end <= q.at) continue
        scheduled.push({ accountId: shift.accountId, order: shift.order, start })
      }
    }
    const alertedRows = await tx
      .select({ accountId: bundleAlert.accountId })
      .from(bundleAlert)
      .where(and(eq(bundleAlert.bundleId, q.bundleId), eq(bundleAlert.level, 'next_approver')))
    const alerted = new Set(alertedRows.map((row) => row.accountId))
    const remaining = scheduled.filter((row) => !alerted.has(row.accountId))
    if (!remaining.length) {
      const admins = await tx
        .select({ accountId: member.userId })
        .from(member)
        .where(and(eq(member.organizationId, tx.orgId!), inArray(member.role, ['owner', 'admin'])))
      const alreadyAlertedAdmins = await tx
        .select({ accountId: bundleAlert.accountId })
        .from(bundleAlert)
        .where(and(eq(bundleAlert.bundleId, q.bundleId), eq(bundleAlert.level, 'admins')))
      const alertedAdminIds = new Set(alreadyAlertedAdmins.map((row) => row.accountId))
      return admins
        .map((row) => row.accountId)
        .filter((accountId) => !alertedAdminIds.has(accountId))
        .sort()
    }
    const lowest = Math.min(...remaining.map((row) => row.order))
    return [...new Set(remaining.filter((row) => row.order === lowest).map((row) => row.accountId))].sort()
  }

  async function getRota(ctx: RotaContext, q: { days?: number; projectId?: string; at?: Date }) {
    const at = q.at ?? new Date()
    const days = q.days ?? 7
    const zone = q.projectId ? await projectZone(ctx.tx, q.projectId) : ROTA_TIME_ZONE
    const shifts = await effectiveShifts(ctx.tx, q.projectId, false)
    const eligibleRows = await effectiveShifts(ctx.tx, q.projectId, true)
    const currentDuty = await onDuty(ctx, { projectId: q.projectId, at })
    const next = [] as Array<{ shift: ShiftRow; starts_at: Date; ends_at: Date }>
    const today = dateOf(at, zone)
    for (let offset = 0; offset < Math.min(days, 31); offset++) {
      const date = addDate(today, offset)
      const weekday = isoWeekday(date)
      for (const shift of eligibleRows) {
        if (!shift.days.includes(weekday)) continue
        if (!(await conditionActive(ctx.tx, conditions, shift, date, q.projectId))) continue
        const startsAt = await localInstant(ctx.tx, date, shift.localStart, zone)
        if (startsAt <= at) continue
        const endDate = timeParts(shift.localStart) >= timeParts(shift.localEnd) ? addDate(date, 1) : date
        const endsAt = await localInstant(ctx.tx, endDate, shift.localEnd, zone)
        next.push({ shift, starts_at: startsAt, ends_at: endsAt })
      }
    }
    next.sort((a, b) => a.starts_at.getTime() - b.starts_at.getTime())

    const orgProjectIds = q.projectId
      ? undefined
      : (await ctx.tx.select({ id: project.id }).from(project).where(eq(project.orgId, ctx.tx.orgId!))).map(
          (row) => row.id
        )
    const unstaffed: Array<{
      date: string
      starts_at: string
      ends_at: string
      template: 'storm_afternoon' | 'surge_night'
      condition_state: 'active' | 'inactive' | 'unknown'
    }> = []
    for (let offset = 0; offset < days; offset++) {
      const date = addDate(today, offset)
      const weekday = isoWeekday(date)
      for (const template of ROTA_TEMPLATES) {
        const state = await conditionState(ctx.tx, conditions, template.condition, date, q.projectId, orgProjectIds)
        if (state === 'inactive') continue
        const start = timeParts(template.local_start)
        const end = timeParts(template.local_end)
        const covered = eligibleRows
          .filter((shift) => shift.template === template.template && shift.days.includes(weekday))
          .map(
            (shift) => [Math.max(start, timeParts(shift.localStart)), Math.min(end, timeParts(shift.localEnd))] as const
          )
          .filter(([from, to]) => from < to)
          .sort((a, b) => a[0] - b[0])
        let cursor = start
        for (const [from, to] of covered) {
          if (from > cursor) {
            unstaffed.push({
              date,
              starts_at: (await localInstant(ctx.tx, date, isoTime(cursor), zone)).toISOString(),
              ends_at: (await localInstant(ctx.tx, date, isoTime(from), zone)).toISOString(),
              template: template.template,
              condition_state: state
            })
          }
          cursor = Math.max(cursor, to)
        }
        if (cursor < end) {
          unstaffed.push({
            date,
            starts_at: (await localInstant(ctx.tx, date, isoTime(cursor), zone)).toISOString(),
            ends_at: (await localInstant(ctx.tx, date, isoTime(end), zone)).toISOString(),
            template: template.template,
            condition_state: state
          })
        }
      }
    }
    return {
      time_zone: zone,
      templates: ROTA_TEMPLATES,
      shifts: shifts.map(snakeShift),
      on_duty: currentDuty.map((row) => ({
        account_id: row.accountId,
        shift_id: row.shiftId,
        until: row.until.toISOString()
      })),
      next_shift: next[0]
        ? {
            shift: snakeShift(next[0].shift),
            starts_at: next[0].starts_at.toISOString(),
            ends_at: next[0].ends_at.toISOString()
          }
        : null,
      unstaffed_slots: unstaffed
    }
  }

  function canEdit(principal: Principal, accountId: string, can?: Can) {
    const role =
      principal.kind === 'session' || principal.kind === 'api_key' || principal.kind === 'oauth' ? principal.role : null
    if (role === 'owner' || role === 'admin') return
    if (
      role === 'approver' &&
      principal.kind === 'session' &&
      principal.accountId === accountId &&
      can?.(principal, 'rota.manage', { accountId })
    )
      return
    throw new ApiError(403, 'insufficient-scope', 'Approvers can edit only their own shifts.')
  }

  async function ensureProject(ctx: RotaContext, projectId: string | null) {
    if (projectId) await projectZone(ctx.tx, projectId)
  }

  async function ensureMember(tx: Tx, accountId: string) {
    const [row] = await tx
      .select({ id: member.id })
      .from(member)
      .where(and(eq(member.organizationId, tx.orgId!), eq(member.userId, accountId)))
      .limit(1)
    if (!row) throw new ApiError(404, 'not-found', 'The member was not found in this organisation.')
  }

  async function createShift(
    ctx: RotaContext,
    input: Omit<ShiftRow, 'id' | 'orgId' | 'createdAt' | 'updatedAt'>,
    can?: Can
  ) {
    await lockMemberWrites(ctx.tx)
    canEdit(ctx.principal, input.accountId, can)
    await ensureMember(ctx.tx, input.accountId)
    await ensureProject(ctx, input.projectId)
    if (input.localStart === input.localEnd)
      throw new ApiError(400, 'validation-failed', 'A shift must have a non-empty time range.')
    const [row] = await ctx.tx
      .insert(rotaShift)
      .values({ ...input, orgId: ctx.tx.orgId! })
      .returning()
    await trackRota(ctx.tx, await shiftsInScope(ctx.tx, input.projectId))
    return snakeShift(row!)
  }

  async function updateShift(
    ctx: RotaContext,
    id: string,
    input: Partial<Omit<ShiftRow, 'id' | 'orgId' | 'createdAt' | 'updatedAt'>>,
    can?: Can
  ) {
    await lockMemberWrites(ctx.tx)
    const [before] = await ctx.tx
      .select()
      .from(rotaShift)
      .where(and(eq(rotaShift.id, id), eq(rotaShift.orgId, ctx.tx.orgId!)))
      .limit(1)
    if (!before) throw new ApiError(404, 'not-found', 'The shift was not found in this organisation.')
    canEdit(ctx.principal, before.accountId, can)
    if (input.accountId && input.accountId !== before.accountId) canEdit(ctx.principal, input.accountId, can)
    await ensureMember(ctx.tx, input.accountId ?? before.accountId)
    const projectId = input.projectId === undefined ? before.projectId : input.projectId
    await ensureProject(ctx, projectId)
    if ((input.localStart ?? before.localStart) === (input.localEnd ?? before.localEnd))
      throw new ApiError(400, 'validation-failed', 'A shift must have a non-empty time range.')
    const [row] = await ctx.tx.update(rotaShift).set(input).where(eq(rotaShift.id, id)).returning()
    await trackRota(ctx.tx, await shiftsInScope(ctx.tx, projectId))
    return snakeShift(row!)
  }

  async function deleteShift(ctx: RotaContext, id: string, can?: Can) {
    await lockMemberWrites(ctx.tx)
    const [before] = await ctx.tx
      .select()
      .from(rotaShift)
      .where(and(eq(rotaShift.id, id), eq(rotaShift.orgId, ctx.tx.orgId!)))
      .limit(1)
    if (!before) throw new ApiError(404, 'not-found', 'The shift was not found in this organisation.')
    canEdit(ctx.principal, before.accountId, can)
    await ctx.tx.delete(rotaShift).where(eq(rotaShift.id, id))
    await trackRota(ctx.tx, await shiftsInScope(ctx.tx, before.projectId))
  }

  async function replaceShifts(
    ctx: RotaContext,
    input: {
      projectId: string | null
      templates: Array<{ template: string; local_start: string; local_end: string; condition: string | null }>
      shifts: Array<{
        account_id: string
        days: number[]
        local_start: string
        local_end: string
        condition: string | null
        order: number
        template: 'storm_afternoon' | 'surge_night' | 'custom'
      }>
    },
    can?: Can
  ) {
    await lockMemberWrites(ctx.tx)
    canEdit(ctx.principal, ctx.principal.kind === 'session' ? ctx.principal.accountId : '', can)
    await ensureProject(ctx, input.projectId)
    if (!shiftSetMatchesTemplates(input.templates))
      throw new ApiError(400, 'validation-failed', 'Rota templates are code-defined and cannot be changed.')
    const accounts = [...new Set(input.shifts.map((shift) => shift.account_id))]
    if (accounts.length) {
      const rows = await ctx.tx
        .select({ accountId: member.userId })
        .from(member)
        .where(and(eq(member.organizationId, ctx.tx.orgId!), inArray(member.userId, accounts)))
      const found = new Set(rows.map((row) => row.accountId))
      const missing = accounts.find((accountId) => !found.has(accountId))
      if (missing) throw new ApiError(404, 'not-found', 'The member was not found in this organisation.')
    }
    for (const shift of input.shifts) {
      canEdit(ctx.principal, shift.account_id, can)
      if (shift.local_start === shift.local_end)
        throw new ApiError(400, 'validation-failed', 'A shift must have a non-empty time range.')
    }
    const scope = input.projectId === null ? isNull(rotaShift.projectId) : eq(rotaShift.projectId, input.projectId)
    const ownShifts =
      ctx.principal.kind === 'session' && ctx.principal.role === 'approver'
        ? eq(rotaShift.accountId, ctx.principal.accountId)
        : undefined
    await ctx.tx.delete(rotaShift).where(and(eq(rotaShift.orgId, ctx.tx.orgId!), scope, ownShifts))
    const inserted = input.shifts.length
      ? await ctx.tx
          .insert(rotaShift)
          .values(
            input.shifts.map((shift) => ({
              orgId: ctx.tx.orgId!,
              projectId: input.projectId,
              accountId: shift.account_id,
              days: shift.days,
              localStart: shift.local_start,
              localEnd: shift.local_end,
              condition: shift.condition,
              order: shift.order,
              template: shift.template
            }))
          )
          .returning()
      : []
    await trackRota(ctx.tx, inserted)
    return getRota(ctx, { projectId: input.projectId ?? undefined })
  }

  async function updateSettings(
    ctx: RotaContext,
    input: {
      time_zone?: string
      templates?: Array<{ template: string; local_start: string; local_end: string; condition: string | null }>
    }
  ) {
    if (input.templates && !shiftSetMatchesTemplates(input.templates))
      throw new ApiError(400, 'validation-failed', 'Rota templates are code-defined and cannot be changed.')
    if (input.time_zone && input.time_zone !== ROTA_TIME_ZONE) {
      // Project time zones are owned by the project settings API; the organisation rota uses MYT.
      throw new ApiError(400, 'validation-failed', 'The organisation rota always uses MYT.')
    }
    return getRota(ctx, { days: 7 })
  }

  return { onDuty, nextApprovers, getRota, createShift, updateShift, deleteShift, replaceShifts, updateSettings }
}

const defaultService = createRotaService()
export const onDuty = (tx: Tx, q: { projectId?: string; at: Date }) => defaultService.onDuty({ tx }, q)
/** D22's next rota level, consumed by worker escalations. */
export const nextApprovers = (tx: Tx, q: { projectId: string; bundleId: string; at: Date }) =>
  defaultService.nextApprovers({ tx }, q)
