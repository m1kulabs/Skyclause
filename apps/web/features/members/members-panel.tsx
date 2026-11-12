'use client'

import { useEffect, useState, type FormEvent } from 'react'
import { formatDate, formatDateCompact, formatDateTime } from '@skyclause/i18n/format'
import { Button } from '#ui/button'
import { Empty, EmptyDescription, EmptyHeader, EmptyTitle } from '#ui/empty'
import { Input } from '#ui/input'
import { Select, SelectContent, SelectGroup, SelectItem, SelectTrigger, SelectValue } from '#ui/select'
import { Skeleton } from '#ui/skeleton'
import { Switch } from '#ui/switch'
import { ConfirmDialog } from '../settings/set-7/confirm-dialog'
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
import { apiFetch } from './operations'
import {
  activityAge,
  errorMessageKey,
  roleIsLowering,
  roleOptions,
  type ManagedRole,
  type Member,
  type PendingInvitation
} from './model'
import { t, type Locale } from './i18n'
import styles from './members.module.css'

type Page<T> = { data: T[]; next_cursor: string | null }
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
    } catch (error) {
      rowProblem(member.id, errorText(error, 'members.member_remove_failed', locale))
    } finally {
      setActiveAction(null)
    }
  }

  async function createInvite(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setInviteBusy(true)
    setInviteError('')
    setNotice('')
    try {
      const email = inviteEmail.trim()
      const invite = await apiFetch('createInvitation', {
        org,
        params: { org },
        body: { email, role: inviteRole }
      })
      setInvites((previous) => [...previous.filter((row) => row.id !== invite.id), invite])
      setInviteEmail('')
      setNotice(t('members.invited', { email, role: roleName(inviteRole, locale) }, locale))
    } catch (error) {
      setInviteError(errorText(error, 'members.invite_failed', locale))
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

  const columns = (
    <div className={styles.head} aria-hidden="true">
      <span>{t('members.name', {}, locale)}</span>
      <span>{t('members.role', {}, locale)}</span>
      <span className={styles.headEnd}>{t('members.last_active', {}, locale)}</span>
      <span>{t('members.malay_reader', {}, locale)}</span>
      <span />
    </div>
  )

  return (
    <div className={styles.panel} aria-busy={loading}>
      {loaded && (
        <SettingsAside>
          <SettingsSummaryLine label={t('members.title', {}, locale)}>
            {byRole
              .filter((entry) => entry.count > 0)
              .map((entry) =>
                t('members.summary_role', { count: entry.count, role: roleName(entry.role, locale) }, locale)
              )
              .join(' · ') || t('members.empty', {}, locale)}
          </SettingsSummaryLine>
          <SettingsSummaryLine label={t('members.invites_label', {}, locale)}>
            {t('members.summary_invites', { count: invites.length }, locale)}
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
          <div className="grid gap-0.5" role="status" aria-label={t('members.loading', {}, locale)}>
            {Array.from({ length: 3 }, (_, index) => (
              <Skeleton key={index} className="h-[68px] w-full rounded-md" />
            ))}
          </div>
        ) : null}

        {loaded && members.length === 0 ? (
          <Empty>
            <EmptyHeader>
              <EmptyTitle>{t('members.empty', {}, locale)}</EmptyTitle>
              <EmptyDescription>{t('members.empty_hint', {}, locale)}</EmptyDescription>
            </EmptyHeader>
          </Empty>
        ) : null}

        {loaded && members.length > 0 ? (
          <SettingsPart title={t('members.count', { count: members.length }, locale)} id="members-table-heading">
            {columns}
            <ul className={styles.list} aria-label={t('members.table_label', {}, locale)}>
              {members.map((member) => {
                const editable = viewerRole === 'owner' || member.role !== 'owner'
                const rowBusy = activeAction === `member:${member.id}`
                const selectId = `member-role-${member.id}`
                return (
                  <li key={member.id} className={styles.row} data-member-row>
                    <div className={styles.identity}>
                      <strong>{member.name}</strong>
                      <span>{member.email}</span>
                      <span>
                        {member.sign_in_methods.length
                          ? t(
                              'members.signs_in_with',
                              {
                                methods: member.sign_in_methods.map((method) => signInName(method, locale)).join(', ')
                              },
                              locale
                            )
                          : t('members.no_methods', {}, locale)}
                      </span>
                    </div>
                    <div className={styles.roleCell}>
                      <span className={styles.cellLabel}>{t('members.role', {}, locale)}</span>
                      {editable ? (
                        <>
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
                              id={selectId}
                              className="w-full"
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
                          {viewerRole === 'admin' && member.role === 'owner' && (
                            <span className={styles.meta}>{t('members.owner_transfer_hint', {}, locale)}</span>
                          )}
                        </>
                      ) : (
                        <>
                          <span className={styles.roleWord}>{roleName(member.role, locale)}</span>
                          <span className={styles.meta}>{t('members.owner_transfer_hint', {}, locale)}</span>
                        </>
                      )}
                    </div>
                    <div className={styles.active} data-numeric>
                      <span className={styles.cellLabel}>{t('members.last_active', {}, locale)}</span>
                      {member.last_active_at ? (
                        <time dateTime={member.last_active_at} title={formatDateTime(member.last_active_at, locale)}>
                          {activeWords(member.last_active_at, locale)}
                        </time>
                      ) : (
                        <span>{activeWords(null, locale)}</span>
                      )}
                    </div>
                    <div className={styles.switchCell}>
                      <span className={styles.cellLabel}>{t('members.malay_reader', {}, locale)}</span>
                      <Switch
                        checked={member.reads_malay}
                        aria-label={`${member.name}: ${t('members.malay_reader', {}, locale)}`}
                        disabled={rowBusy}
                        onCheckedChange={(checked) => void updateMalay(member, checked)}
                      />
                      <span className={styles.meta}>
                        {member.reads_malay ? t('members.on', {}, locale) : t('members.off', {}, locale)}
                      </span>
                    </div>
                    <div className={styles.actions}>
                      {editable && (
                        <Button
                          variant="outline"
                          disabled={rowBusy}
                          aria-label={`${t('members.remove_member', {}, locale)}: ${member.name}`}
                          onClick={() => setRemoveTarget(member)}
                        >
                          {t('members.remove', {}, locale)}
                        </Button>
                      )}
                    </div>
                    {rowProblems[member.id] ? (
                      <SettingsError className={styles.problem}>{rowProblems[member.id]}</SettingsError>
                    ) : null}
                  </li>
                )
              })}
            </ul>
          </SettingsPart>
        ) : null}

        {loaded ? (
          <SettingsPart title={t('members.invites', { count: invites.length }, locale)} id="pending-invites-heading">
            {invites.length === 0 ? (
              <p className="type-body text-muted-foreground">{t('members.invites_empty', {}, locale)}</p>
            ) : (
              <>
                <div className={`${styles.head} ${styles.inviteHead}`} aria-hidden="true">
                  <span>{t('members.email', {}, locale)}</span>
                  <span>{t('members.sent', {}, locale)}</span>
                  <span className={styles.headEnd}>{t('members.expires', {}, locale)}</span>
                  <span />
                </div>
                <ul className={styles.list} aria-label={t('members.invites', { count: invites.length }, locale)}>
                  {invites.map((invite) => {
                    const rowBusy = activeAction === `invite:${invite.id}`
                    return (
                      <li key={invite.id} className={`${styles.row} ${styles.inviteRow}`} data-invite-row>
                        <div className={styles.identity}>
                          <strong>{invite.email}</strong>
                          <span>{t('members.invited_as', { role: roleName(invite.role, locale) }, locale)}</span>
                        </div>
                        <div className={styles.roleCell}>
                          <span className={styles.cellLabel}>{t('members.sent', {}, locale)}</span>
                          <span className={styles.roleWord}>
                            {invite.sent_at ? (
                              <time dateTime={invite.sent_at}>{formatDateTime(invite.sent_at, locale)}</time>
                            ) : (
                              t('members.sent_unavailable', {}, locale)
                            )}
                          </span>
                        </div>
                        <div className={styles.active} data-numeric>
                          <span className={styles.cellLabel}>{t('members.expires', {}, locale)}</span>
                          <time dateTime={invite.expires_at}>{formatDateCompact(invite.expires_at, locale)}</time>
                        </div>
                        <div className={styles.actions}>
                          <Button
                            variant="outline"
                            disabled={rowBusy}
                            aria-label={t('members.resend_named', { email: invite.email }, locale)}
                            onClick={() => void resendInvite(invite)}
                          >
                            {rowBusy ? t('members.resending', {}, locale) : t('members.resend', {}, locale)}
                          </Button>
                          <Button
                            variant="outline"
                            disabled={rowBusy}
                            aria-label={t('members.revoke_named', { email: invite.email }, locale)}
                            onClick={() => setRevokeTarget(invite)}
                          >
                            {t('members.revoke', {}, locale)}
                          </Button>
                        </div>
                        {rowProblems[invite.id] ? (
                          <SettingsError className={styles.problem}>{rowProblems[invite.id]}</SettingsError>
                        ) : null}
                      </li>
                    )
                  })}
                </ul>
              </>
            )}
          </SettingsPart>
        ) : null}

        {loaded ? (
          <SettingsPart title={t('members.invite_form', {}, locale)} id="invite-form-heading">
            <form className={styles.form} onSubmit={(event) => void createInvite(event)}>
              <div className={styles.fields}>
                <SettingsField
                  label={t('members.invite_email', {}, locale)}
                  hint={t('members.invite_hint', {}, locale)}
                >
                  {(aria) => (
                    <Input
                      {...aria}
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
                <Button type="submit" disabled={inviteBusy || !inviteEmail.trim()}>
                  {inviteBusy ? t('members.sending_invite', {}, locale) : t('members.send_invite', {}, locale)}
                </Button>
                {notice ? <SettingsStatus>{notice}</SettingsStatus> : null}
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
                <Button variant="outline" disabled={activeAction === 'transfer'} onClick={() => void cancelTransfer()}>
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
          title={`${t('members.revoke_invite', {}, locale)}: “${revokeTarget.email}”?`}
          description={t('members.revoke_description', { email: revokeTarget.email }, locale)}
          confirmLabel={t('members.revoke_invite', {}, locale)}
          locale={locale}
          onConfirm={() => revokeInvite(revokeTarget)}
        />
      )}
    </div>
  )
}
