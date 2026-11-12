'use client'

import { useEffect, useRef, useState, type FormEvent } from 'react'
import { formatDate, formatDateCompact, formatDateTime, formatList, formatNumber } from '@skyclause/i18n/format'
import { Button } from '#ui/button'
import { Empty, EmptyDescription, EmptyHeader, EmptyTitle } from '#ui/empty'
import { Input } from '#ui/input'
import { Select, SelectContent, SelectGroup, SelectItem, SelectTrigger, SelectValue } from '#ui/select'
import { Skeleton } from '#ui/skeleton'
import { Switch } from '#ui/switch'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '#ui/table'
import { ConfirmDialog } from '../settings/set-7/confirm-dialog'
import {
  SettingsAside,
  SettingsError,
  SettingsField,
  SettingsLoading,
  SettingsPart,
  SettingsParts,
  SettingsReadError,
  SettingsRowMenu,
  SettingsRowMenuItem,
  SettingsStatus,
  SettingsSummaryLine,
  focusPartHeading
} from '../settings/parts'
import { apiFetch } from './operations'
import {
  activityAge,
  errorMessageKey,
  problemCode,
  roleIsLowering,
  roleOptions,
  type ManagedRole,
  type Member,
  type PendingInvitation
} from './model'
import { t, type Locale } from './i18n'
import styles from './members.module.css'

type Page<T> = { data: T[]; next_cursor: string | null }

/** The most rows of a list on screen; a longer list pages. */
const PAGE_SIZE = 50
type ViewerRole = 'owner' | 'admin'
type RoleChange = { member: Member; role: ManagedRole }

export interface MembersPanelProps {
  org: string
  viewerRole: ViewerRole
  locale: Locale
  accountId?: string
}

async function allPages<T>(read: (cursor: string | undefined) => Promise<Page<T>>): Promise<T[]> {
  const rows: T[] = []
  const seen = new Set<string>()
  let cursor: string | undefined
  do {
    const page = await read(cursor)
    rows.push(...page.data)
    cursor = page.next_cursor ?? undefined
    if (cursor && seen.has(cursor)) throw new Error('Pagination repeated a cursor')
    if (cursor) seen.add(cursor)
  } while (cursor)
  return rows
}

function roleName(role: string, locale: Locale): string {
  return t(`members.role_names.${role}`, {}, locale)
}

function signInName(method: string, locale: Locale): string {
  const key = method.toLowerCase().replace(/[ -]/g, '_')
  const known = ['email', 'magic_link', 'google', 'passkey'].includes(key)
  return known ? t(`members.method_names.${key}`, {}, locale) : method
}

function signInText(member: Member, locale: Locale): string {
  return member.sign_in_methods.length
    ? formatList(
        member.sign_in_methods.map((method) => signInName(method, locale)),
        locale
      )
    : t('members.no_methods', {}, locale)
}

function errorText(error: unknown, fallback: string, locale: Locale): string {
  return t(errorMessageKey(error, fallback), {}, locale)
}

/** When a member was last active, in words; the exact time is the element's `datetime`. */
function activeWords(instant: string | null, locale: Locale): string {
  if (!instant) return t('members.never_active', {}, locale)
  const { unit, value } = activityAge(instant)
  if (unit === 'date') return formatDate(instant, locale)
  return t(`members.active_${unit}`, { value }, locale)
}

export function MembersPanel({ org, viewerRole, locale, accountId }: MembersPanelProps) {
  const [members, setMembers] = useState<Member[]>([])
  const [invites, setInvites] = useState<PendingInvitation[]>([])
  const [loading, setLoading] = useState(true)
  const [failure, setFailure] = useState<{ error: unknown; at: string } | null>(null)
  const [reload, setReload] = useState(0)
  const [activeAction, setActiveAction] = useState<string | null>(null)
  const [rowProblems, setRowProblems] = useState<Record<string, string>>({})
  const [notice, setNotice] = useState('')
  const [inviteEmail, setInviteEmail] = useState('')
  const [inviteRole, setInviteRole] = useState<ManagedRole>('approver')
  const [inviteError, setInviteError] = useState('')
  const [emailError, setEmailError] = useState('')
  const emailField = useRef<HTMLInputElement>(null)
  const [memberPage, setMemberPage] = useState(0)
  const [invitePage, setInvitePage] = useState(0)
  const [cancelTransferOpen, setCancelTransferOpen] = useState(false)
  const [inviteBusy, setInviteBusy] = useState(false)
  const [roleChange, setRoleChange] = useState<RoleChange | null>(null)
  const [removeTarget, setRemoveTarget] = useState<Member | null>(null)
  const [revokeTarget, setRevokeTarget] = useState<PendingInvitation | null>(null)
  const [transferTarget, setTransferTarget] = useState('')
  const [pendingTransfer, setPendingTransfer] = useState<{ id: string; to_member_id: string } | null>(null)
  const [transferError, setTransferError] = useState('')

  useEffect(() => {
    const controller = new AbortController()
    setLoading(true)
    setFailure(null)
    Promise.all([
      allPages((cursor) =>
        apiFetch('listMembers', {
          org,
          params: { org },
          query: { limit: 200, cursor },
          signal: controller.signal
        })
      ),
      allPages((cursor) =>
        apiFetch('listInvitations', {
          org,
          params: { org },
          query: { limit: 200, cursor },
          signal: controller.signal
        })
      )
    ])
      .then(([memberRows, invitationRows]) => {
        if (controller.signal.aborted) return
        setMembers(memberRows)
        setInvites(invitationRows)
      })
      .catch((error: unknown) => {
        if (!controller.signal.aborted) setFailure({ error, at: new Date().toISOString() })
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false)
      })
    return () => controller.abort()
  }, [org, reload])

  function rowProblem(id: string, message: string) {
    setRowProblems((previous) => ({ ...previous, [id]: message }))
  }

  async function updateRole(member: Member, nextRole: ManagedRole) {
    setActiveAction(`member:${member.id}`)
    setNotice('')
    rowProblem(member.id, '')
    try {
      const updated = await apiFetch('updateMember', {
        org,
        params: { org, id: member.id },
        body: { role: nextRole }
      })
      setMembers((previous) => previous.map((row) => (row.id === updated.id ? updated : row)))
      setNotice(t('members.role_changed', { name: member.name, role: roleName(nextRole, locale) }, locale))
    } catch (error) {
      rowProblem(member.id, errorText(error, 'members.member_update_failed', locale))
    } finally {
      setActiveAction(null)
    }
  }

  async function updateMalay(member: Member, readsMalay: boolean) {
    setActiveAction(`member:${member.id}`)
    setNotice('')
    rowProblem(member.id, '')
    try {
      const updated = await apiFetch('updateMember', {
        org,
        params: { org, id: member.id },
        body: { reads_malay: readsMalay }
      })
      setMembers((previous) => previous.map((row) => (row.id === updated.id ? updated : row)))
    } catch (error) {
      rowProblem(member.id, errorText(error, 'members.member_update_failed', locale))
    } finally {
      setActiveAction(null)
    }
  }

  async function removeMember(member: Member) {
    setActiveAction(`member:${member.id}`)
    setNotice('')
    rowProblem(member.id, '')
    try {
      await apiFetch('removeMember', { org, params: { org, id: member.id } })
      setMembers((previous) => previous.filter((row) => row.id !== member.id))
      setNotice(t('members.removed', { name: member.name }, locale))
      // The row and its menu are gone: focus goes to the list's heading, not to the page.
      focusPartHeading('members-table-heading')
    } catch (error) {
      rowProblem(member.id, errorText(error, 'members.member_remove_failed', locale))
    } finally {
      setActiveAction(null)
    }
  }

  async function createInvite(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const email = inviteEmail.trim()
    setInviteError('')
    setEmailError('')
    setNotice('')
    if (!email) {
      setEmailError(t('members.email_required', {}, locale))
      emailField.current?.focus()
      return
    }
    setInviteBusy(true)
    try {
      const invite = await apiFetch('createInvitation', {
        org,
        params: { org },
        body: { email, role: inviteRole }
      })
      setInvites((previous) => [...previous.filter((row) => row.id !== invite.id), invite])
      setInviteEmail('')
      setNotice(t('members.invited', { email, role: roleName(inviteRole, locale) }, locale))
    } catch (error) {
      // A role the account cannot grant belongs to the role field; anything else to the address.
      const code = problemCode(error)
      const message = errorText(error, 'members.invite_failed', locale)
      if (code === 'role-not-grantable' || code === 'last-owner') setInviteError(message)
      else {
        setEmailError(message)
        emailField.current?.focus()
      }
    } finally {
      setInviteBusy(false)
    }
  }

  async function resendInvite(invite: PendingInvitation) {
    setActiveAction(`invite:${invite.id}`)
    setNotice('')
    rowProblem(invite.id, '')
    try {
      const updated = await apiFetch('resendInvitation', { org, params: { org, id: invite.id } })
      setInvites((previous) => previous.map((row) => (row.id === updated.id ? updated : row)))
      setNotice(t('members.resent', { email: invite.email }, locale))
    } catch (error) {
      rowProblem(invite.id, errorText(error, 'members.resend_failed', locale))
    } finally {
      setActiveAction(null)
    }
  }

  async function revokeInvite(invite: PendingInvitation) {
    setActiveAction(`invite:${invite.id}`)
    setNotice('')
    rowProblem(invite.id, '')
    try {
      await apiFetch('revokeInvitation', { org, params: { org, id: invite.id } })
      setInvites((previous) => previous.filter((row) => row.id !== invite.id))
      setNotice(t('members.revoked', { email: invite.email }, locale))
      focusPartHeading('pending-invites-heading')
    } catch (error) {
      rowProblem(invite.id, errorText(error, 'members.revoke_failed', locale))
    } finally {
      setActiveAction(null)
    }
  }

  async function startTransfer(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!transferTarget) return
    setTransferError('')
    setActiveAction('transfer')
    try {
      const transfer = await apiFetch('createOwnershipTransfer', {
        org,
        params: { org },
        body: { to_member_id: transferTarget }
      })
      setPendingTransfer({ id: transfer.id, to_member_id: transfer.to_member_id })
    } catch {
      setTransferError(t('members.transfer_failed', {}, locale))
    } finally {
      setActiveAction(null)
    }
  }

  async function cancelTransfer() {
    if (!pendingTransfer) return
    setTransferError('')
    setActiveAction('transfer')
    try {
      await apiFetch('cancelOwnershipTransfer', {
        org,
        params: { org, id: pendingTransfer.id }
      })
      setPendingTransfer(null)
    } catch {
      setTransferError(t('members.transfer_cancel_failed', {}, locale))
    } finally {
      setActiveAction(null)
    }
  }

  const roles = roleOptions(viewerRole)
  const transferMember = members.find((member) => member.id === pendingTransfer?.to_member_id)
  const transferCandidates = members.filter((member) => member.account_id !== accountId)
  const loaded = !loading && !failure
  const byRole = (['owner', 'admin', 'approver', 'editor', 'viewer'] as const).map((role) => ({
    role,
    count: members.filter((member) => member.role === role).length
  }))
  const memberRows = members.slice(memberPage * PAGE_SIZE, (memberPage + 1) * PAGE_SIZE)
  const inviteRows = invites.slice(invitePage * PAGE_SIZE, (invitePage + 1) * PAGE_SIZE)
  const countTitle = (key: 'count' | 'invites', count: number) =>
    t(`members.${key}_${count === 1 ? 'one' : 'other'}`, { count: formatNumber(count, locale) }, locale)
  // What went wrong on a row, named by whose row it is, shown where the list is rather than at the page's foot.
  const problems = [
    ...members.map((member) => ({ id: member.id, who: member.name })),
    ...invites.map((invite) => ({ id: invite.id, who: invite.email }))
  ].filter((entry) => rowProblems[entry.id])

  return (
    <div className={styles.panel} aria-busy={loading}>
      {loaded && (
        <SettingsAside>
          <SettingsSummaryLine label={t('members.title', {}, locale)}>
            {byRole
              .filter((entry) => entry.count > 0)
              .map((entry) =>
                t(
                  'members.summary_role',
                  { count: formatNumber(entry.count, locale), role: roleName(entry.role, locale) },
                  locale
                )
              )
              .join(' · ') || t('members.empty', {}, locale)}
          </SettingsSummaryLine>
          <SettingsSummaryLine label={t('members.invites_label', {}, locale)}>
            {t('members.summary_invites', { count: formatNumber(invites.length, locale) }, locale)}
          </SettingsSummaryLine>
        </SettingsAside>
      )}
      <SettingsParts>
        {failure ? (
          <SettingsReadError
            source={t('members.source', {}, locale)}
            error={failure.error}
            at={failure.at}
            locale={locale}
            onRetry={() => setReload((value) => value + 1)}
          />
        ) : null}

        {loading && !failure ? (
          <SettingsLoading locale={locale} className="grid gap-1">
            {Array.from({ length: 3 }, (_, index) => (
              <Skeleton key={index} className="h-11 w-full rounded-full" />
            ))}
          </SettingsLoading>
        ) : null}

        {loaded && members.length === 0 ? (
          <Empty>
            <EmptyHeader>
              <EmptyTitle>{t('members.empty', {}, locale)}</EmptyTitle>
              <EmptyDescription>{t('members.empty_hint', {}, locale)}</EmptyDescription>
            </EmptyHeader>
          </Empty>
        ) : null}

        {loaded ? (
          <div className="grid min-w-0 gap-2">
            {/* The outcome of a row action, beside the list it came from. */}
            {notice ? <SettingsStatus>{notice}</SettingsStatus> : null}
            {problems.map((entry) => (
              <SettingsError key={entry.id}>{`${entry.who}: ${rowProblems[entry.id]}`}</SettingsError>
            ))}
          </div>
        ) : null}

        {loaded && members.length > 0 ? (
          <SettingsPart title={countTitle('count', members.length)} id="members-table-heading">
            <div role="region" aria-label={t('members.table_label', {}, locale)}>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>{t('members.name', {}, locale)}</TableHead>
                    <TableHead className="w-60 max-lg:hidden">{t('members.email', {}, locale)}</TableHead>
                    <TableHead className="w-40">{t('members.role', {}, locale)}</TableHead>
                    <TableHead numeric className="w-36">
                      {t('members.last_active', {}, locale)}
                    </TableHead>
                    <TableHead className="w-36">{t('members.malay_reader', {}, locale)}</TableHead>
                    <TableHead className="w-44 max-xl:hidden">{t('members.sign_in_methods', {}, locale)}</TableHead>
                    <TableHead className="w-14">
                      <span className="sr-only">{t('members.actions', {}, locale)}</span>
                    </TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {memberRows.map((member) => {
                    const editable = viewerRole === 'owner' || member.role !== 'owner'
                    const rowBusy = activeAction === `member:${member.id}`
                    return (
                      <TableRow key={member.id} data-member-row>
                        <TableCell truncate="26ch" phone="primary">
                          <strong className="font-semibold">{member.name}</strong>
                        </TableCell>
                        <TableCell truncate="32ch" phone="meta" className="max-lg:hidden">
                          {member.email}
                        </TableCell>
                        <TableCell phone="meta" label={t('members.role', {}, locale)}>
                          {editable ? (
                            <Select
                              value={member.role}
                              onValueChange={(value) => {
                                if (!value || value === member.role) return
                                const next = value as ManagedRole
                                if (roleIsLowering(member.role as ManagedRole | 'owner', next))
                                  setRoleChange({ member, role: next })
                                else void updateRole(member, next)
                              }}
                              disabled={rowBusy}
                            >
                              <SelectTrigger
                                id={`member-role-${member.id}`}
                                className="w-full min-w-32"
                                aria-label={t('members.role_for', { name: member.name }, locale)}
                              >
                                <SelectValue>{roleName(member.role, locale)}</SelectValue>
                              </SelectTrigger>
                              <SelectContent>
                                <SelectGroup>
                                  {member.role === 'owner' && viewerRole === 'owner' && (
                                    <SelectItem value="owner">{roleName('owner', locale)}</SelectItem>
                                  )}
                                  {roles.map((option) => (
                                    <SelectItem key={option} value={option}>
                                      {roleName(option, locale)}
                                    </SelectItem>
                                  ))}
                                </SelectGroup>
                              </SelectContent>
                            </Select>
                          ) : (
                            <span className={styles.roleWord} title={t('members.owner_transfer_hint', {}, locale)}>
                              {roleName(member.role, locale)}
                            </span>
                          )}
                        </TableCell>
                        <TableCell numeric phone="meta" label={t('members.last_active', {}, locale)}>
                          {member.last_active_at ? (
                            <time
                              dateTime={member.last_active_at}
                              title={formatDateTime(member.last_active_at, locale)}
                            >
                              {activeWords(member.last_active_at, locale)}
                            </time>
                          ) : (
                            <span>{activeWords(null, locale)}</span>
                          )}
                        </TableCell>
                        <TableCell phone="meta" label={t('members.malay_reader', {}, locale)}>
                          <span className={styles.switchCell}>
                            <Switch
                              checked={member.reads_malay}
                              aria-label={t('members.malay_reader_for', { name: member.name }, locale)}
                              disabled={rowBusy}
                              onCheckedChange={(checked) => void updateMalay(member, checked)}
                            />
                            <span className={styles.meta}>
                              {member.reads_malay ? t('members.on', {}, locale) : t('members.off', {}, locale)}
                            </span>
                          </span>
                        </TableCell>
                        <TableCell
                          truncate="24ch"
                          phone="hide"
                          className="max-xl:hidden"
                          title={signInText(member, locale)}
                        >
                          {signInText(member, locale)}
                        </TableCell>
                        <TableCell phone="end" className="text-right">
                          {editable ? (
                            <SettingsRowMenu
                              label={t('members.more_actions', { name: member.name }, locale)}
                              disabled={rowBusy}
                            >
                              <SettingsRowMenuItem destructive onSelect={() => setRemoveTarget(member)}>
                                {t('members.remove_member', {}, locale)}
                              </SettingsRowMenuItem>
                            </SettingsRowMenu>
                          ) : null}
                        </TableCell>
                      </TableRow>
                    )
                  })}
                </TableBody>
              </Table>
            </div>
            <Pager page={memberPage} total={members.length} onPage={setMemberPage} locale={locale} />
            {viewerRole === 'admin' && members.some((member) => member.role === 'owner') ? (
              <p className="type-small m-0 text-muted-foreground">{t('members.owner_transfer_hint', {}, locale)}</p>
            ) : null}
          </SettingsPart>
        ) : null}

        {loaded ? (
          <SettingsPart title={countTitle('invites', invites.length)} id="pending-invites-heading">
            {invites.length === 0 ? (
              <p className="type-body text-muted-foreground">{t('members.invites_empty', {}, locale)}</p>
            ) : (
              <>
                <div role="region" aria-label={countTitle('invites', invites.length)}>
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>{t('members.email', {}, locale)}</TableHead>
                        <TableHead className="w-40">{t('members.role', {}, locale)}</TableHead>
                        <TableHead className="w-56 max-lg:hidden">{t('members.sent', {}, locale)}</TableHead>
                        <TableHead numeric className="w-36">
                          {t('members.expires', {}, locale)}
                        </TableHead>
                        <TableHead className="w-14">
                          <span className="sr-only">{t('members.actions', {}, locale)}</span>
                        </TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {inviteRows.map((invite) => {
                        const rowBusy = activeAction === `invite:${invite.id}`
                        return (
                          <TableRow key={invite.id} data-invite-row>
                            <TableCell truncate="34ch" phone="primary">
                              <strong className="font-semibold">{invite.email}</strong>
                            </TableCell>
                            <TableCell phone="meta" label={t('members.role', {}, locale)}>
                              {roleName(invite.role, locale)}
                            </TableCell>
                            <TableCell phone="meta" label={t('members.sent', {}, locale)} className="max-lg:hidden">
                              {invite.sent_at ? (
                                <time dateTime={invite.sent_at}>{formatDateTime(invite.sent_at, locale)}</time>
                              ) : (
                                t('members.sent_unavailable', {}, locale)
                              )}
                            </TableCell>
                            <TableCell numeric phone="meta" label={t('members.expires', {}, locale)}>
                              <time dateTime={invite.expires_at}>{formatDateCompact(invite.expires_at, locale)}</time>
                            </TableCell>
                            <TableCell phone="end" className="text-right">
                              <SettingsRowMenu
                                label={t('members.more_actions', { name: invite.email }, locale)}
                                disabled={rowBusy}
                              >
                                <SettingsRowMenuItem onSelect={() => void resendInvite(invite)}>
                                  {t('members.resend', {}, locale)}
                                </SettingsRowMenuItem>
                                <SettingsRowMenuItem destructive onSelect={() => setRevokeTarget(invite)}>
                                  {t('members.revoke', {}, locale)}
                                </SettingsRowMenuItem>
                              </SettingsRowMenu>
                            </TableCell>
                          </TableRow>
                        )
                      })}
                    </TableBody>
                  </Table>
                </div>
                <Pager page={invitePage} total={invites.length} onPage={setInvitePage} locale={locale} />
              </>
            )}
          </SettingsPart>
        ) : null}

        {loaded ? (
          <SettingsPart title={t('members.invite_form', {}, locale)} id="invite-form-heading">
            <form className={styles.form} noValidate onSubmit={(event) => void createInvite(event)}>
              <div className={styles.fields}>
                <SettingsField
                  label={t('members.invite_email', {}, locale)}
                  hint={t('members.invite_hint', {}, locale)}
                  error={emailError || undefined}
                >
                  {(aria) => (
                    <Input
                      {...aria}
                      ref={emailField}
                      name="email"
                      type="email"
                      inputMode="email"
                      autoComplete="off"
                      spellCheck={false}
                      required
                      value={inviteEmail}
                      onChange={(event) => setInviteEmail(event.currentTarget.value)}
                      disabled={inviteBusy}
                    />
                  )}
                </SettingsField>
                <SettingsField
                  label={t('members.invite_role', {}, locale)}
                  hint={viewerRole === 'admin' ? t('members.owner_transfer_hint', {}, locale) : undefined}
                  error={inviteError || undefined}
                >
                  {(aria) => (
                    <Select
                      value={inviteRole}
                      onValueChange={(value) => value && setInviteRole(value as ManagedRole)}
                      disabled={inviteBusy}
                    >
                      <SelectTrigger {...aria} className="w-full" aria-label={t('members.invite_role', {}, locale)}>
                        <SelectValue>{roleName(inviteRole, locale)}</SelectValue>
                      </SelectTrigger>
                      <SelectContent>
                        <SelectGroup>
                          {roles.map((option) => (
                            <SelectItem key={option} value={option}>
                              {roleName(option, locale)}
                            </SelectItem>
                          ))}
                        </SelectGroup>
                      </SelectContent>
                    </Select>
                  )}
                </SettingsField>
              </div>
              <div className="flex flex-wrap items-center gap-3">
                <Button type="submit" disabled={inviteBusy}>
                  {inviteBusy ? t('members.sending_invite', {}, locale) : t('members.send_invite', {}, locale)}
                </Button>
              </div>
            </form>
          </SettingsPart>
        ) : null}

        {loaded && viewerRole === 'owner' ? (
          <SettingsPart title={t('members.transfer_heading', {}, locale)} id="transfer-heading">
            {transferError ? <SettingsError>{transferError}</SettingsError> : null}
            {pendingTransfer && transferMember ? (
              <div className={styles.transferRow}>
                <p>{t('members.transfer_pending', { name: transferMember.name }, locale)}</p>
                <Button
                  variant="outline"
                  disabled={activeAction === 'transfer'}
                  onClick={() => setCancelTransferOpen(true)}
                >
                  {activeAction === 'transfer'
                    ? t('members.transfer_cancelling', {}, locale)
                    : t('members.transfer_cancel', {}, locale)}
                </Button>
              </div>
            ) : (
              <form className={styles.form} onSubmit={(event) => void startTransfer(event)}>
                <SettingsField
                  label={t('members.transfer_to', {}, locale)}
                  hint={t('members.transfer_hint', {}, locale)}
                >
                  {(aria) => (
                    <Select value={transferTarget} onValueChange={(value) => setTransferTarget(value ?? '')}>
                      <SelectTrigger
                        {...aria}
                        className="w-full"
                        aria-label={t('members.transfer_to', {}, locale)}
                        disabled={!transferCandidates.length}
                      >
                        <SelectValue placeholder={t('members.choose_member', {}, locale)}>
                          {transferCandidates.find((member) => member.id === transferTarget)
                            ? t(
                                'members.name_email',
                                {
                                  name: transferCandidates.find((member) => member.id === transferTarget)!.name,
                                  email: transferCandidates.find((member) => member.id === transferTarget)!.email
                                },
                                locale
                              )
                            : null}
                        </SelectValue>
                      </SelectTrigger>
                      <SelectContent>
                        <SelectGroup>
                          {transferCandidates.map((member) => (
                            <SelectItem key={member.id} value={member.id}>
                              {t('members.name_email', { name: member.name, email: member.email }, locale)}
                            </SelectItem>
                          ))}
                        </SelectGroup>
                      </SelectContent>
                    </Select>
                  )}
                </SettingsField>
                <div>
                  <Button type="submit" disabled={!transferTarget || activeAction === 'transfer'}>
                    {t('members.transfer_start', {}, locale)}
                  </Button>
                </div>
              </form>
            )}
          </SettingsPart>
        ) : null}
      </SettingsParts>

      {roleChange && (
        <ConfirmDialog
          open
          onOpenChange={(open) => !open && setRoleChange(null)}
          objectName={roleChange.member.name}
          title={t(
            'members.lower_role_title',
            {
              name: `“${roleChange.member.name}”`,
              role: roleName(roleChange.role, locale)
            },
            locale
          )}
          description={t(
            'members.lower_role_description',
            {
              name: roleChange.member.name,
              oldRole: roleName(roleChange.member.role, locale)
            },
            locale
          )}
          confirmLabel={t('members.confirm_role', { role: roleName(roleChange.role, locale) }, locale)}
          locale={locale}
          onConfirm={() => updateRole(roleChange.member, roleChange.role)}
        />
      )}
      {removeTarget && (
        <ConfirmDialog
          open
          onOpenChange={(open) => !open && setRemoveTarget(null)}
          objectName={removeTarget.name}
          title={t('members.remove_title', { name: `“${removeTarget.name}”` }, locale)}
          description={t('members.remove_description', { name: removeTarget.name }, locale)}
          confirmLabel={t('members.confirm_remove', {}, locale)}
          locale={locale}
          onConfirm={() => removeMember(removeTarget)}
        />
      )}
      {revokeTarget && (
        <ConfirmDialog
          open
          onOpenChange={(open) => !open && setRevokeTarget(null)}
          objectName={revokeTarget.email}
          title={t('members.revoke_title', { name: `“${revokeTarget.email}”` }, locale)}
          description={t('members.revoke_description', { email: revokeTarget.email }, locale)}
          confirmLabel={t('members.revoke_invite', {}, locale)}
          locale={locale}
          onConfirm={() => revokeInvite(revokeTarget)}
        />
      )}
      {cancelTransferOpen && transferMember && (
        <ConfirmDialog
          open
          onOpenChange={(open) => !open && setCancelTransferOpen(false)}
          objectName={transferMember.name}
          title={t('members.transfer_cancel_title', { name: `“${transferMember.name}”` }, locale)}
          description={t('members.transfer_cancel_description', { name: transferMember.name }, locale)}
          confirmLabel={t('members.transfer_cancel', {}, locale)}
          locale={locale}
          onConfirm={() => cancelTransfer()}
        />
      )}
    </div>
  )
}

/** Previous and next page of a list that runs past one page; a control with nowhere to go is not drawn. */
function Pager({
  page,
  total,
  onPage,
  locale
}: {
  page: number
  total: number
  onPage: (page: number) => void
  locale: Locale
}) {
  if (total <= PAGE_SIZE) return null
  const from = page * PAGE_SIZE + 1
  const to = Math.min(total, (page + 1) * PAGE_SIZE)
  return (
    <div className="flex flex-wrap items-center justify-between gap-3">
      <p className="type-small m-0 text-muted-foreground" data-numeric>
        {t(
          'members.range',
          { from: formatNumber(from, locale), to: formatNumber(to, locale), total: formatNumber(total, locale) },
          locale
        )}
      </p>
      <div className="flex gap-2">
        {page > 0 ? (
          <Button variant="outline" onClick={() => onPage(page - 1)}>
            {t('members.previous_page', {}, locale)}
          </Button>
        ) : null}
        {to < total ? (
          <Button variant="outline" onClick={() => onPage(page + 1)}>
            {t('members.next_page', {}, locale)}
          </Button>
        ) : null}
      </div>
    </div>
  )
}
