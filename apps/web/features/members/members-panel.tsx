'use client'

import { useEffect, useId, useState, type FormEvent } from 'react'
import { formatDateTime } from '@skyclause/i18n/format'
import { Alert, AlertDescription } from '#ui/alert'
import { Badge } from '#ui/badge'
import { Button } from '#ui/button'
import { Empty, EmptyDescription, EmptyHeader, EmptyTitle } from '#ui/empty'
import { Field, FieldDescription, FieldGroup, FieldLabel } from '#ui/field'
import { Input } from '#ui/input'
import { Select, SelectContent, SelectGroup, SelectItem, SelectTrigger, SelectValue } from '#ui/select'
import { Switch } from '#ui/switch'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '#ui/table'
import { ConfirmDialog } from '../settings/set-7/confirm-dialog'
import { apiFetch } from './operations'
import {
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

export function MembersPanel({ org, viewerRole, locale, accountId }: MembersPanelProps) {
  const emailId = useId()
  const roleId = useId()
  const transferId = useId()
  const [members, setMembers] = useState<Member[]>([])
  const [invites, setInvites] = useState<PendingInvitation[]>([])
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState(false)
  const [reload, setReload] = useState(0)
  const [activeAction, setActiveAction] = useState<string | null>(null)
  const [rowProblems, setRowProblems] = useState<Record<string, string>>({})
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
    setLoadError(false)
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
        setLoadError(false)
      })
      .catch(() => {
        if (!controller.signal.aborted) setLoadError(true)
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false)
      })
    return () => controller.abort()
  }, [org, reload])

  function roleError(memberId: string, message: string) {
    setRowProblems((previous) => ({ ...previous, [memberId]: message }))
  }

  async function updateRole(member: Member, nextRole: ManagedRole) {
    setActiveAction(`member:${member.id}`)
    setRowProblems((previous) => ({ ...previous, [member.id]: '' }))
    try {
      const updated = await apiFetch('updateMember', {
        org,
        params: { org, id: member.id },
        body: { role: nextRole }
      })
      setMembers((previous) => previous.map((row) => (row.id === updated.id ? updated : row)))
    } catch (error) {
      roleError(member.id, errorText(error, 'members.member_update_failed', locale))
    } finally {
      setActiveAction(null)
    }
  }

  async function updateMalay(member: Member, readsMalay: boolean) {
    setActiveAction(`member:${member.id}`)
    setRowProblems((previous) => ({ ...previous, [member.id]: '' }))
    try {
      const updated = await apiFetch('updateMember', {
        org,
        params: { org, id: member.id },
        body: { reads_malay: readsMalay }
      })
      setMembers((previous) => previous.map((row) => (row.id === updated.id ? updated : row)))
    } catch (error) {
      roleError(member.id, errorText(error, 'members.member_update_failed', locale))
    } finally {
      setActiveAction(null)
    }
  }

  async function removeMember(member: Member) {
    setActiveAction(`member:${member.id}`)
    setRowProblems((previous) => ({ ...previous, [member.id]: '' }))
    try {
      await apiFetch('removeMember', { org, params: { org, id: member.id } })
      setMembers((previous) => previous.filter((row) => row.id !== member.id))
    } catch (error) {
      roleError(member.id, errorText(error, 'members.member_remove_failed', locale))
    } finally {
      setActiveAction(null)
    }
  }

  async function createInvite(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setInviteBusy(true)
    setInviteError('')
    try {
      const invite = await apiFetch('createInvitation', {
        org,
        params: { org },
        body: { email: inviteEmail.trim(), role: inviteRole }
      })
      setInvites((previous) => [...previous.filter((row) => row.id !== invite.id), invite])
      setInviteEmail('')
    } catch (error) {
      setInviteError(errorText(error, 'members.invite_failed', locale))
    } finally {
      setInviteBusy(false)
    }
  }

  async function resendInvite(invite: PendingInvitation) {
    setActiveAction(`invite:${invite.id}`)
    setRowProblems((previous) => ({ ...previous, [invite.id]: '' }))
    try {
      const updated = await apiFetch('resendInvitation', { org, params: { org, id: invite.id } })
      setInvites((previous) => previous.map((row) => (row.id === updated.id ? updated : row)))
    } catch (error) {
      setRowProblems((previous) => ({
        ...previous,
        [invite.id]: errorText(error, 'members.resend_failed', locale)
      }))
    } finally {
      setActiveAction(null)
    }
  }

  async function revokeInvite(invite: PendingInvitation) {
    setActiveAction(`invite:${invite.id}`)
    setRowProblems((previous) => ({ ...previous, [invite.id]: '' }))
    try {
      await apiFetch('revokeInvitation', { org, params: { org, id: invite.id } })
      setInvites((previous) => previous.filter((row) => row.id !== invite.id))
    } catch (error) {
      setRowProblems((previous) => ({
        ...previous,
        [invite.id]: errorText(error, 'members.revoke_failed', locale)
      }))
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

  return (
    <div className={styles.panel}>
      {loadError && (
        <Alert variant="destructive" role="alert">
          <AlertDescription className={styles.retryRow}>
            <span>{t('members.load_error', {}, locale)}</span>
            <button className={styles.inlineButton} type="button" onClick={() => setReload((value) => value + 1)}>
              {t('members.retry', {}, locale)}
            </button>
          </AlertDescription>
        </Alert>
      )}

      {loading && <p role="status">{t('members.loading', {}, locale)}</p>}
      {!loading && !loadError && members.length === 0 && (
        <Empty>
          <EmptyHeader>
            <EmptyTitle>{t('members.empty', {}, locale)}</EmptyTitle>
            <EmptyDescription>{t('members.empty_hint', {}, locale)}</EmptyDescription>
          </EmptyHeader>
        </Empty>
      )}

      {!loading && !loadError && members.length > 0 && (
        <section aria-labelledby="members-table-heading">
          <h3 id="members-table-heading" className={styles.sectionTitle}>
            {t('members.count', { count: members.length }, locale)}
          </h3>
          <div className={styles.tableFrame}>
            <Table aria-label={t('members.table_label', {}, locale)} className={styles.memberTable}>
              <TableHeader>
                <TableRow>
                  <TableHead>{t('members.name', {}, locale)}</TableHead>
                  <TableHead>{t('members.role', {}, locale)}</TableHead>
                  <TableHead>{t('members.last_active', {}, locale)}</TableHead>
                  <TableHead>{t('members.sign_in_methods', {}, locale)}</TableHead>
                  <TableHead>{t('members.malay_reader', {}, locale)}</TableHead>
                  <TableHead className={styles.actionHeading}>
                    <span className="sr-only">{t('members.remove_member', {}, locale)}</span>
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {members.map((member) => {
                  const editable = viewerRole === 'owner' || member.role !== 'owner'
                  const rowBusy = activeAction === `member:${member.id}`
                  const selectId = `member-role-${member.id}`
                  return (
                    <TableRow key={member.id} className={styles.memberRow}>
                      <TableCell data-label={t('members.name', {}, locale)} className={styles.identityCell}>
                        <strong>{member.name}</strong>
                        <span>{member.email}</span>
                      </TableCell>
                      <TableCell data-label={t('members.role', {}, locale)}>
                        {editable ? (
                          <Field className={styles.roleField}>
                            <FieldLabel className="sr-only" htmlFor={selectId}>
                              {t('members.role_for', { name: member.name }, locale)}
                            </FieldLabel>
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
                                aria-label={t('members.role_for', { name: member.name }, locale)}
                              >
                                <SelectValue />
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
                              <FieldDescription>{t('members.owner_transfer_hint', {}, locale)}</FieldDescription>
                            )}
                            {rowProblems[member.id] && (
                              <FieldDescription role="alert">{rowProblems[member.id]}</FieldDescription>
                            )}
                          </Field>
                        ) : (
                          <div className={styles.roleStatic}>
                            <Badge variant="secondary">{roleName(member.role, locale)}</Badge>
                            <span>{t('members.owner_transfer_hint', {}, locale)}</span>
                            {rowProblems[member.id] && <p role="alert">{rowProblems[member.id]}</p>}
                          </div>
                        )}
                      </TableCell>
                      <TableCell data-label={t('members.last_active', {}, locale)} className={styles.activityCell}>
                        {member.last_active_at
                          ? formatDateTime(member.last_active_at, locale)
                          : t('members.never_active', {}, locale)}
                      </TableCell>
                      <TableCell data-label={t('members.sign_in_methods', {}, locale)} className={styles.methodsCell}>
                        {member.sign_in_methods.length
                          ? member.sign_in_methods.map((method) => signInName(method, locale)).join(', ')
                          : t('members.no_methods', {}, locale)}
                      </TableCell>
                      <TableCell data-label={t('members.malay_reader', {}, locale)}>
                        <label className={styles.switchRow}>
                          <Switch
                            checked={member.reads_malay}
                            aria-label={`${member.name}: ${t('members.malay_reader', {}, locale)}`}
                            disabled={rowBusy}
                            onCheckedChange={(checked) => void updateMalay(member, checked)}
                          />
                          <Badge variant={member.reads_malay ? 'default' : 'outline'}>
                            {member.reads_malay ? t('members.on', {}, locale) : t('members.off', {}, locale)}
                          </Badge>
                        </label>
                      </TableCell>
                      <TableCell data-label={t('members.remove_member', {}, locale)} className={styles.actionCell}>
                        {editable && (
                          <Button
                            variant="outline"
                            disabled={rowBusy}
                            aria-label={`${t('members.remove_member', {}, locale)}: ${member.name}`}
                            onClick={() => setRemoveTarget(member)}
                          >
                            {t('members.remove_member', {}, locale)}
                          </Button>
                        )}
                      </TableCell>
                    </TableRow>
                  )
                })}
              </TableBody>
            </Table>
          </div>
        </section>
      )}

      <section className={styles.section} aria-labelledby="pending-invites-heading">
        <h3 id="pending-invites-heading" className={styles.sectionTitle}>
          {t('members.invites', { count: invites.length }, locale)}
        </h3>
        {loading ? (
          <p role="status">{t('members.loading', {}, locale)}</p>
        ) : invites.length === 0 ? (
          <Empty>
            <EmptyHeader>
              <EmptyTitle>{t('members.invites_empty', {}, locale)}</EmptyTitle>
            </EmptyHeader>
          </Empty>
        ) : (
          <div className={styles.tableFrame}>
            <Table aria-label={t('members.invites', { count: invites.length }, locale)} className={styles.inviteTable}>
              <TableHeader>
                <TableRow>
                  <TableHead>{t('members.email', {}, locale)}</TableHead>
                  <TableHead>{t('members.role', {}, locale)}</TableHead>
                  <TableHead>{t('members.sent', {}, locale)}</TableHead>
                  <TableHead>{t('members.expires', {}, locale)}</TableHead>
                  <TableHead>
                    <span className="sr-only">{t('members.resend', {}, locale)}</span>
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {invites.map((invite) => {
                  const rowBusy = activeAction === `invite:${invite.id}`
                  return (
                    <TableRow key={invite.id} className={styles.inviteRow}>
                      <TableCell data-label={t('members.email', {}, locale)}>{invite.email}</TableCell>
                      <TableCell data-label={t('members.role', {}, locale)}>{roleName(invite.role, locale)}</TableCell>
                      <TableCell data-label={t('members.sent', {}, locale)}>
                        {invite.sent_at
                          ? formatDateTime(invite.sent_at, locale)
                          : t('members.sent_unavailable', {}, locale)}
                      </TableCell>
                      <TableCell data-label={t('members.expires', {}, locale)}>
                        {formatDateTime(invite.expires_at, locale)}
                      </TableCell>
                      <TableCell data-label={t('members.resend', {}, locale)} className={styles.inviteActions}>
                        <Button variant="outline" disabled={rowBusy} onClick={() => void resendInvite(invite)}>
                          {rowBusy ? t('members.resending', {}, locale) : t('members.resend', {}, locale)}
                        </Button>
                        <Button variant="outline" disabled={rowBusy} onClick={() => setRevokeTarget(invite)}>
                          {t('members.revoke_invite', {}, locale)}
                        </Button>
                        {rowProblems[invite.id] && <p role="alert">{rowProblems[invite.id]}</p>}
                      </TableCell>
                    </TableRow>
                  )
                })}
              </TableBody>
            </Table>
          </div>
        )}
      </section>

      <section className={styles.section} aria-labelledby="invite-form-heading">
        <h3 id="invite-form-heading" className={styles.sectionTitle}>
          {t('members.invite_form', {}, locale)}
        </h3>
        <form className={styles.inviteForm} onSubmit={(event) => void createInvite(event)}>
          <FieldGroup className={styles.inviteFields}>
            <Field>
              <FieldLabel htmlFor={emailId}>{t('members.invite_email', {}, locale)}</FieldLabel>
              <Input
                id={emailId}
                name="email"
                type="email"
                autoComplete="off"
                spellCheck={false}
                required
                value={inviteEmail}
                onChange={(event) => setInviteEmail(event.currentTarget.value)}
                disabled={inviteBusy}
              />
            </Field>
            <Field>
              <FieldLabel htmlFor={roleId}>{t('members.invite_role', {}, locale)}</FieldLabel>
              <Select value={inviteRole} onValueChange={(value) => value && setInviteRole(value as ManagedRole)}>
                <SelectTrigger id={roleId} aria-label={t('members.invite_role', {}, locale)} disabled={inviteBusy}>
                  <SelectValue />
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
              {viewerRole === 'admin' && (
                <FieldDescription>{t('members.owner_transfer_hint', {}, locale)}</FieldDescription>
              )}
              {inviteError && <FieldDescription role="alert">{inviteError}</FieldDescription>}
            </Field>
          </FieldGroup>
          <Button type="submit" disabled={inviteBusy || !inviteEmail.trim()}>
            {inviteBusy ? t('members.sending_invite', {}, locale) : t('members.send_invite', {}, locale)}
          </Button>
        </form>
      </section>

      {viewerRole === 'owner' && (
        <section className={styles.section} aria-labelledby="transfer-heading">
          <h3 id="transfer-heading" className={styles.sectionTitle}>
            {t('members.transfer_heading', {}, locale)}
          </h3>
          {transferError && (
            <p role="alert" className={styles.problem}>
              {transferError}
            </p>
          )}
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
            <form className={styles.transferForm} onSubmit={(event) => void startTransfer(event)}>
              <Field>
                <FieldLabel htmlFor={transferId}>{t('members.transfer_to', {}, locale)}</FieldLabel>
                <Select value={transferTarget} onValueChange={(value) => setTransferTarget(value ?? '')}>
                  <SelectTrigger
                    id={transferId}
                    aria-label={t('members.transfer_to', {}, locale)}
                    disabled={!transferCandidates.length}
                  >
                    <SelectValue placeholder={t('members.choose_member', {}, locale)} />
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
              </Field>
              <Button type="submit" disabled={!transferTarget || activeAction === 'transfer'}>
                {t('members.transfer_start', {}, locale)}
              </Button>
            </form>
          )}
        </section>
      )}

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
