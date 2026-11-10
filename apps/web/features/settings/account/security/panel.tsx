'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { authClient } from '@skyclause/auth/client'
import { t } from '@skyclause/i18n'
import { useReauth, ReauthDialog } from '../../../reauth'
import { ReauthCancelledError } from '../../../step-up/flow'
import { Button } from '#ui/button'
import { Input } from '#ui/input'
import { Label } from '#ui/label'
import { Switch } from '#ui/switch'
import { ConfirmDialog } from '../../set-7'
import { authRequest, isProblem, unwrapAuthResult } from '../../../account/auth-api'
import { accountApi } from '../../../account/operations'
import { formatSessionDate, presentSessionAgent } from '../../../account/presentation'
import styles from '../../../account/account-settings.module.css'
import '../../catalogue'

interface AccountSession {
  session: { id: string; createdAt: string; updatedAt: string }
  user: { id: string; name: string; email: string; magicLinkEnabled?: boolean }
}

interface SessionRow {
  id: string
  token: string
  createdAt: string
  updatedAt: string
  userAgent?: string | null
}

interface AccountRow {
  id: string
  accountId: string
  providerId: string
}

interface PasskeyRow {
  id: string
  name?: string | null
  createdAt: string
  userAgent?: string | null
}

type PendingAction =
  | { kind: 'passkey'; id: string; name: string }
  | { kind: 'google'; id: string }
  | { kind: 'session'; id: string; token: string; name: string }
  | { kind: 'others' }

const copy = (key: string) => t(`account-settings.security.${key}`)

export default function Panel() {
  const [reauthOpen, setReauthOpen] = useState(false)
  const reauthWaiter = useRef<{ resolve: () => void; reject: (error: unknown) => void } | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [currentSessionId, setCurrentSessionId] = useState('')
  const [magicLinkEnabled, setMagicLinkEnabled] = useState(true)
  const [sessions, setSessions] = useState<SessionRow[]>([])
  const [accounts, setAccounts] = useState<AccountRow[]>([])
  const [passkeys, setPasskeys] = useState<PasskeyRow[]>([])
  const [passkeyName, setPasskeyName] = useState('')
  const [renaming, setRenaming] = useState<string | null>(null)
  const [renameValue, setRenameValue] = useState('')
  const [pending, setPending] = useState<PendingAction | null>(null)
  const [working, setWorking] = useState(false)

  const refresh = useCallback(async () => {
    const [current, sessionRows, linkedAccounts, registeredPasskeys] = await Promise.all([
      authRequest<AccountSession | null>('/get-session'),
      authRequest<SessionRow[]>('/list-sessions'),
      authRequest<AccountRow[]>('/list-accounts'),
      authRequest<PasskeyRow[]>('/passkey/list-user-passkeys')
    ])
    if (!current) throw new Error(copy('loadFailed'))
    setCurrentSessionId(current.session.id)
    setMagicLinkEnabled(current.user.magicLinkEnabled !== false)
    setSessions(sessionRows)
    setAccounts(linkedAccounts)
    setPasskeys(registeredPasskeys)
  }, [])

  const finishReauth = useCallback(() => {
    const waiter = reauthWaiter.current
    reauthWaiter.current = null
    setReauthOpen(false)
    waiter?.resolve()
  }, [])

  const failReauth = useCallback((failure: unknown) => {
    const waiter = reauthWaiter.current
    reauthWaiter.current = null
    setReauthOpen(false)
    waiter?.reject(failure instanceof ReauthCancelledError ? new Error(copy('reauthCancelled')) : failure)
  }, [])

  // The dialog settles the step-up before it closes (resolved on success, rejected on cancel); ReauthFlow passes that
  // outcome to the waiter, so closing alone must not reject it.
  const changeReauthOpen = useCallback((open: boolean) => {
    if (open) setReauthOpen(true)
  }, [])

  useEffect(() => {
    let active = true
    void refresh()
      .catch((failure: unknown) => {
        if (active) setError(messageOf(failure))
      })
      .finally(() => active && setLoading(false))
    return () => {
      active = false
    }
  }, [refresh])

  async function withRecentAuth<T>(action: () => Promise<T>): Promise<T> {
    try {
      return await action()
    } catch (failure) {
      if (!isProblem(failure, 'reauth-required')) throw failure
      await new Promise<void>((resolve, reject) => {
        reauthWaiter.current = { resolve, reject }
        setReauthOpen(true)
      })
      return action()
    }
  }

  async function saveMagicLink(enabled: boolean) {
    setWorking(true)
    setError(null)
    try {
      await withRecentAuth(() => accountApi('updateMySecurity', { body: { magic_link_enabled: enabled } }))
      setMagicLinkEnabled(enabled)
    } catch (failure) {
      setError(messageOf(failure))
    } finally {
      setWorking(false)
    }
  }

  async function addPasskey() {
    if (!passkeyName.trim() || working) return
    setWorking(true)
    setError(null)
    try {
      await withRecentAuth(async () => {
        const result = await authClient.passkey.addPasskey({ name: passkeyName.trim() })
        return unwrapAuthResult(result)
      })
      setPasskeyName('')
      await refresh()
    } catch (failure) {
      setError(messageOf(failure))
    } finally {
      setWorking(false)
    }
  }

  async function renamePasskey(id: string) {
    if (!renameValue.trim() || working) return
    setWorking(true)
    setError(null)
    try {
      await authRequest('/passkey/update-passkey', { method: 'POST', body: { id, name: renameValue.trim() } })
      setRenaming(null)
      await refresh()
    } catch (failure) {
      setError(messageOf(failure))
    } finally {
      setWorking(false)
    }
  }

  async function linkGoogle() {
    setError(null)
    try {
      const result = await authClient.linkSocial({ provider: 'google', callbackURL: window.location.href })
      if (result.error) throw new Error(result.error.message ?? copy('googleLinkFailed'))
      if (result.data.url) window.location.assign(result.data.url)
    } catch (failure) {
      setError(messageOf(failure))
    }
  }

  async function confirmPending() {
    const action = pending
    if (!action) return
    setWorking(true)
    setError(null)
    try {
      if (action.kind === 'passkey') {
        await authRequest('/passkey/delete-passkey', { method: 'POST', body: { id: action.id } })
      } else if (action.kind === 'google') {
        await withRecentAuth(() => authRequest('/unlink-account', { method: 'POST', body: { accountId: action.id } }))
      } else if (action.kind === 'session') {
        await authRequest('/revoke-session', { method: 'POST', body: { token: action.token } })
      } else {
        await authRequest('/revoke-other-sessions', { method: 'POST', body: {} })
      }
      await refresh()
    } catch (failure) {
      // Keep guard reasons on the panel so the person can act on them after the confirmation closes.
      setError(messageOf(failure))
    } finally {
      setPending(null)
      setWorking(false)
    }
  }

  const google = accounts.find((account) => account.providerId === 'google')
  const pendingName =
    pending?.kind === 'passkey'
      ? pending.name
      : pending?.kind === 'google'
        ? copy('google')
        : pending?.kind === 'session'
          ? pending.name
          : pending?.kind === 'others'
            ? copy('otherSessions')
            : ''
  const pendingTitle =
    pending?.kind === 'passkey'
      ? copy('removePasskey')
      : pending?.kind === 'google'
        ? copy('unlinkGoogle')
        : pending?.kind === 'session'
          ? copy('revokeSession')
          : copy('signOutEverywhere')
  const pendingConfirm =
    pending?.kind === 'passkey'
      ? copy('removePasskey')
      : pending?.kind === 'google'
        ? copy('unlinkGoogle')
        : pending?.kind === 'session'
          ? copy('revokeSession')
          : copy('signOutEverywhere')

  return (
    <div className={styles.panel} data-account-panel="security" aria-busy={loading || working}>
      {error && (
        <p className={styles.alert} role="alert">
          {error}
        </p>
      )}
      {loading ? (
        <p className={styles.status} role="status">
          {copy('load')}
        </p>
      ) : (
        <>
          <section className={styles.section} aria-labelledby="security-sign-in">
            <div>
              <h3 id="security-sign-in" className={styles.sectionTitle}>
                {copy('methods')}
              </h3>
              <p className={styles.description}>{copy('methodsDescription')}</p>
            </div>
            <div className={styles.field} data-density-row>
              <div className={styles.fieldLabel}>
                <Label htmlFor="magic-link-enabled" className={styles.fieldTitle}>
                  {copy('magicLink')}
                </Label>
                <p className={styles.help}>{copy('magicLinkDescription')}</p>
              </div>
              <Switch
                id="magic-link-enabled"
                aria-label={copy('magicLink')}
                checked={magicLinkEnabled}
                disabled={working}
                onCheckedChange={(checked) => void saveMagicLink(checked)}
              />
            </div>
            <div>
              <h4 className={styles.fieldTitle}>{copy('passkeys')}</h4>
              {passkeys.length ? (
                <div className={styles.rows}>
                  {passkeys.map((credential) => {
                    const name = credential.name || copy('unnamedPasskey')
                    return (
                      <article
                        className={styles.item}
                        key={credential.id}
                        data-passkey-row
                        data-passkey-id={credential.id}
                      >
                        <div className={styles.itemBody}>
                          {renaming === credential.id ? (
                            <div className={styles.inlineForm}>
                              <div className="grid gap-1">
                                <Label htmlFor={`passkey-name-${credential.id}`}>{copy('passkeyName')}</Label>
                                <Input
                                  id={`passkey-name-${credential.id}`}
                                  name="passkey-name"
                                  value={renameValue}
                                  onChange={(event) => setRenameValue(event.target.value)}
                                />
                              </div>
                              <Button
                                type="button"
                                onClick={() => void renamePasskey(credential.id)}
                                disabled={working || !renameValue.trim()}
                              >
                                {copy('saveName')}
                              </Button>
                            </div>
                          ) : (
                            <>
                              <span className={styles.itemTitle}>{name}</span>
                              <span className={styles.itemMeta}>
                                <span>{copy('added')}</span>
                                <time dateTime={credential.createdAt}>{formatSessionDate(credential.createdAt)}</time>
                              </span>
                            </>
                          )}
                        </div>
                        {renaming !== credential.id && (
                          <div className="flex flex-wrap gap-2">
                            <Button
                              type="button"
                              variant="outline"
                              onClick={() => {
                                setRenameValue(name)
                                setRenaming(credential.id)
                              }}
                            >
                              {copy('rename')}
                            </Button>
                            <Button
                              type="button"
                              variant="outline"
                              onClick={() => setPending({ kind: 'passkey', id: credential.id, name })}
                            >
                              {copy('remove')}
                            </Button>
                          </div>
                        )}
                      </article>
                    )
                  })}
                </div>
              ) : (
                <p className={styles.help}>{copy('noPasskeys')}</p>
              )}
              <form
                className={`${styles.inlineForm} mt-3`}
                onSubmit={(event) => {
                  event.preventDefault()
                  void addPasskey()
                }}
              >
                <div className="grid gap-1">
                  <Label htmlFor="new-passkey-name">{copy('newPasskeyName')}</Label>
                  <Input
                    id="new-passkey-name"
                    name="new-passkey-name"
                    value={passkeyName}
                    onChange={(event) => setPasskeyName(event.target.value)}
                    autoComplete="off"
                  />
                </div>
                <Button type="submit" disabled={working || !passkeyName.trim()}>
                  {copy('addPasskey')}
                </Button>
              </form>
            </div>
            <div className={styles.field} data-density-row>
              <div className={styles.fieldLabel}>
                <span className={styles.fieldTitle}>{copy('google')}</span>
                <p className={styles.help}>{google ? copy('googleLinked') : copy('googleNotLinked')}</p>
              </div>
              {google ? (
                <Button
                  type="button"
                  variant="outline"
                  disabled={working}
                  onClick={() => setPending({ kind: 'google', id: google.id })}
                >
                  {copy('unlinkGoogle')}
                </Button>
              ) : (
                <Button type="button" variant="outline" onClick={() => void linkGoogle()}>
                  {copy('linkGoogle')}
                </Button>
              )}
            </div>
          </section>

          <section className={styles.section} aria-labelledby="security-sessions">
            <div>
              <h3 id="security-sessions" className={styles.sectionTitle}>
                {copy('sessions')}
              </h3>
              <p className={styles.description}>{copy('sessionsDescription')}</p>
            </div>
            <div className={styles.rows}>
              {sessions.map((session) => {
                const agent = presentSessionAgent(session.userAgent)
                const current = session.id === currentSessionId
                const name = `${agent.device} · ${agent.browser}`
                return (
                  <article className={styles.item} key={session.id} data-session-row data-session-id={session.id}>
                    <div className={styles.itemBody}>
                      <span className={styles.itemTitle} aria-label={name}>
                        <span>{agent.device}</span>
                        <span aria-hidden="true" className={styles.sessionSeparator} />
                        <span>{agent.browser}</span>
                      </span>
                      {current && <span className={styles.itemMeta}>{copy('thisDevice')}</span>}
                      <span className={styles.itemMeta}>
                        <span>{copy('created')}</span>
                        <time dateTime={session.createdAt}>{formatSessionDate(session.createdAt)}</time>
                      </span>
                      <span className={styles.itemMeta}>
                        <span>{copy('lastActive')}</span>
                        <time dateTime={session.updatedAt}>{formatSessionDate(session.updatedAt)}</time>
                      </span>
                    </div>
                    <Button
                      type="button"
                      variant="outline"
                      disabled={working}
                      onClick={() => setPending({ kind: 'session', id: session.id, token: session.token, name })}
                    >
                      {copy('revoke')}
                    </Button>
                  </article>
                )
              })}
            </div>
            <div>
              <Button
                type="button"
                variant="outline"
                disabled={working || sessions.length < 2}
                onClick={() => setPending({ kind: 'others' })}
              >
                {copy('signOutEverywhere')}
              </Button>
            </div>
          </section>
        </>
      )}
      <ConfirmDialog
        open={pending !== null}
        onOpenChange={(open) => !open && setPending(null)}
        objectName={pendingName}
        title={pendingTitle}
        confirmLabel={pendingConfirm}
        description={pending?.kind === 'others' ? copy('signOutOthersDescription') : copy('confirmDescription')}
        onConfirm={confirmPending}
      />
      {reauthOpen && (
        <ReauthFlow
          open={reauthOpen}
          onOpenChange={changeReauthOpen}
          onComplete={finishReauth}
          onFailure={failReauth}
        />
      )}
    </div>
  )
}

function ReauthFlow({
  open,
  onOpenChange,
  onComplete,
  onFailure
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  onComplete: () => void
  onFailure: (error: unknown) => void
}) {
  const { requireReauth } = useReauth()
  const requireRef = useRef(requireReauth)
  const handlers = useRef({ onComplete, onFailure })
  requireRef.current = requireReauth
  handlers.current = { onComplete, onFailure }

  useEffect(() => {
    if (!open) return
    let active = true
    void requireRef.current().then(
      () => active && handlers.current.onComplete(),
      (failure: unknown) => active && handlers.current.onFailure(failure)
    )
    return () => {
      active = false
    }
  }, [open])

  return <ReauthDialog open={open} onOpenChange={onOpenChange} />
}

function messageOf(error: unknown): string {
  if (isProblem(error, 'last-sign-in-method')) return copy('lastSignInMethod')
  if (error instanceof Error) return error.message
  return copy('genericFailure')
}
