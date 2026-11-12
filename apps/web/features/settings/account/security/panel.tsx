'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { authClient } from '@skyclause/auth/client'
import { t } from '@skyclause/i18n'
import { useReauth, ReauthDialog } from '../../../reauth'
import { ReauthCancelledError } from '../../../step-up/flow'
import { Button } from '#ui/button'
import { Input } from '#ui/input'
import { Skeleton } from '#ui/skeleton'
import { ConfirmDialog } from '../../set-7'
import {
  SettingsAside,
  SettingsError,
  SettingsField,
  SettingsItem,
  SettingsList,
  SettingsLoading,
  SettingsPart,
  SettingsParts,
  SettingsReadError,
  SettingsStatus,
  SettingsSummaryLine,
  SettingsSwitchRow,
  focusPartHeading
} from '../../parts'
import { authError, authRequest, isProblem, unwrapAuthResult } from '../../../account/auth-api'
import { accountApi } from '../../../account/operations'
import { formatSessionDate, presentSessionAgent } from '../../../account/presentation'
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

type Where = 'methods' | 'devices'

const NAME_LIMIT = 100
const METHODS_HEADING = 'security-methods-heading'
const SESSIONS_HEADING = 'security-sessions-heading'

export default function Panel({ locale = 'en' }: { locale?: 'en' | 'ms' }) {
  const copy = useCallback(
    (key: string, vars: Record<string, string | number> = {}) => t(`account-settings.security.${key}`, vars, locale),
    [locale]
  )
  const [reauthOpen, setReauthOpen] = useState(false)
  const reauthWaiter = useRef<{ resolve: () => void; reject: (error: unknown) => void } | null>(null)
  const [loading, setLoading] = useState(true)
  const [loadFailure, setLoadFailure] = useState<{ error: unknown; at: string } | null>(null)
  const [error, setError] = useState<{ where: Where; message: string } | null>(null)
  const [notice, setNotice] = useState<{ where: Where; message: string } | null>(null)
  const [currentSessionId, setCurrentSessionId] = useState('')
  const [magicLinkEnabled, setMagicLinkEnabled] = useState(true)
  const [sessions, setSessions] = useState<SessionRow[]>([])
  const [accounts, setAccounts] = useState<AccountRow[]>([])
  const [passkeys, setPasskeys] = useState<PasskeyRow[]>([])
  const [passkeyName, setPasskeyName] = useState('')
  const [renaming, setRenaming] = useState<string | null>(null)
  const [renameValue, setRenameValue] = useState('')
  const [nameError, setNameError] = useState<{ field: 'add' | 'rename'; message: string } | null>(null)
  const [pending, setPending] = useState<PendingAction | null>(null)
  const [working, setWorking] = useState(false)
  const [linking, setLinking] = useState(false)
  const [adding, setAdding] = useState(false)
  // A control that changes under the keyboard (the magic-link switch, a row that goes) must not leave focus nowhere.
  const inFlight = useRef(false)
  const renameInput = useRef<HTMLInputElement>(null)
  const lastRenaming = useRef<string | null>(null)
  const focusHeadingAfterClose = useRef<string | null>(null)

  // Only what the panel knows how to word is shown; a server's own message is never put in front of the person.
  const messageOf = useCallback(
    (failure: unknown, fallback = 'genericFailure'): string => {
      if (isProblem(failure, 'last-sign-in-method')) return copy('lastSignInMethod')
      if (isProblem(failure, 'reauth-cancelled')) return copy('reauthCancelled')
      return copy(fallback)
    },
    [copy]
  )

  const refresh = useCallback(async () => {
    const [current, sessionRows, linkedAccounts, registeredPasskeys] = await Promise.all([
      authRequest<AccountSession | null>('/get-session'),
      authRequest<SessionRow[]>('/list-sessions'),
      authRequest<AccountRow[]>('/list-accounts'),
      authRequest<PasskeyRow[]>('/passkey/list-user-passkeys')
    ])
    if (!current) throw authError('session-expired', 401, copy('loadFailed'))
    setCurrentSessionId(current.session.id)
    setMagicLinkEnabled(current.user.magicLinkEnabled !== false)
    setSessions(sessionRows)
    setAccounts(linkedAccounts)
    setPasskeys(registeredPasskeys)
  }, [copy])

  const load = useCallback(
    async (isCurrent: () => boolean) => {
      setLoading(true)
      setLoadFailure(null)
      try {
        await refresh()
      } catch (failure) {
        if (isCurrent()) setLoadFailure({ error: failure, at: new Date().toISOString() })
      } finally {
        if (isCurrent()) setLoading(false)
      }
    },
    [refresh]
  )

  const finishReauth = useCallback(() => {
    const waiter = reauthWaiter.current
    reauthWaiter.current = null
    setReauthOpen(false)
    waiter?.resolve()
  }, [])

  const failReauth = useCallback(
    (failure: unknown) => {
      const waiter = reauthWaiter.current
      reauthWaiter.current = null
      setReauthOpen(false)
      waiter?.reject(
        failure instanceof ReauthCancelledError ? authError('reauth-cancelled', 401, copy('reauthCancelled')) : failure
      )
    },
    [copy]
  )

  // The dialog settles the step-up before it closes (resolved on success, rejected on cancel); ReauthFlow passes that
  // outcome to the waiter, so closing alone must not reject it.
  const changeReauthOpen = useCallback((open: boolean) => {
    if (open) setReauthOpen(true)
  }, [])

  useEffect(() => {
    let active = true
    void load(() => active)
    return () => {
      active = false
    }
  }, [load])

  // Opening a rename puts the cursor in its field; closing it returns to that passkey's Rename button.
  useEffect(() => {
    if (renaming) renameInput.current?.focus()
    else if (lastRenaming.current) {
      document
        .querySelector<HTMLElement>(`[data-passkey-id="${lastRenaming.current}"] [data-rename]`)
        ?.focus({ preventScroll: true })
    }
    lastRenaming.current = renaming
  }, [renaming])

  // The dialog hands focus back to the row's own button; when that row is gone, the part's heading takes it.
  useEffect(() => {
    if (pending !== null || !focusHeadingAfterClose.current) return
    const id = focusHeadingAfterClose.current
    focusHeadingAfterClose.current = null
    const frame = requestAnimationFrame(() => focusPartHeading(id))
    return () => cancelAnimationFrame(frame)
  }, [pending])

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

  function begin(where: Where) {
    setWorking(true)
    setError((current) => (current?.where === where ? null : current))
    setNotice(null)
  }

  async function saveMagicLink(enabled: boolean) {
    if (inFlight.current) return
    inFlight.current = true
    begin('methods')
    try {
      await withRecentAuth(() => accountApi('updateMySecurity', { body: { magic_link_enabled: enabled } }))
      setMagicLinkEnabled(enabled)
      setNotice({ where: 'methods', message: copy(enabled ? 'magicLinkOn' : 'magicLinkOff') })
    } catch (failure) {
      setError({ where: 'methods', message: messageOf(failure) })
    } finally {
      inFlight.current = false
      setWorking(false)
    }
  }

  async function addPasskey() {
    const name = passkeyName.trim()
    if (working) return
    if (!name) {
      setNameError({ field: 'add', message: copy('passkeyNameRequired') })
      return
    }
    setNameError(null)
    setAdding(true)
    begin('methods')
    try {
      await withRecentAuth(async () => {
        const result = await authClient.passkey.addPasskey({ name })
        return unwrapAuthResult(result)
      })
      setPasskeyName('')
      await refresh()
      setNotice({ where: 'methods', message: copy('passkeyAdded', { name }) })
    } catch (failure) {
      setError({ where: 'methods', message: messageOf(failure) })
    } finally {
      setAdding(false)
      setWorking(false)
    }
  }

  async function renamePasskey(id: string) {
    const name = renameValue.trim()
    if (working) return
    if (!name) {
      setNameError({ field: 'rename', message: copy('passkeyNameRequired') })
      return
    }
    setNameError(null)
    begin('methods')
    try {
      await authRequest('/passkey/update-passkey', { method: 'POST', body: { id, name } })
      setRenaming(null)
      await refresh()
      setNotice({ where: 'methods', message: copy('passkeyRenamed', { name }) })
    } catch (failure) {
      setError({ where: 'methods', message: messageOf(failure) })
    } finally {
      setWorking(false)
    }
  }

  async function linkGoogle() {
    if (linking) return
    setLinking(true)
    setError(null)
    try {
      const result = await authClient.linkSocial({ provider: 'google', callbackURL: window.location.href })
      if (result.error) throw authError('google-link-failed', result.error.status, copy('googleLinkFailed'))
      if (result.data.url) window.location.assign(result.data.url)
    } catch (failure) {
      setError({ where: 'methods', message: messageOf(failure, 'googleLinkFailed') })
    } finally {
      setLinking(false)
    }
  }

  async function confirmPending() {
    const action = pending
    if (!action) return
    const where: Where = action.kind === 'session' || action.kind === 'others' ? 'devices' : 'methods'
    let failed = false
    begin(where)
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
      setNotice({
        where,
        message:
          action.kind === 'passkey'
            ? copy('passkeyRemoved', { name: action.name })
            : action.kind === 'google'
              ? copy('googleUnlinked')
              : action.kind === 'session'
                ? copy('sessionRevoked', { name: action.name })
                : copy('othersSignedOut')
      })
    } catch (failure) {
      // Keep guard reasons on the panel so the person can act on them after the confirmation closes.
      failed = true
      setError({ where, message: messageOf(failure) })
    } finally {
      // After a removal the row (and the button that opened this dialog) is gone: the part's heading takes focus.
      if (!failed) focusHeadingAfterClose.current = where === 'devices' ? SESSIONS_HEADING : METHODS_HEADING
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
  // The phrase already carries the object's name in quotes, so the dialog does not add it a second time.
  const pendingAction =
    pending?.kind === 'passkey'
      ? copy('removePasskey')
      : pending?.kind === 'google'
        ? copy('unlinkNamed', { name: `“${pendingName}”` })
        : pending?.kind === 'session'
          ? copy('revokeSession')
          : copy('signOutNamed', { name: `“${pendingName}”` })
  const pendingDescription =
    pending?.kind === 'others'
      ? copy('signOutOthersDescription')
      : pending?.kind === 'passkey'
        ? copy('removePasskeyConsequence')
        : pending?.kind === 'google'
          ? copy('unlinkGoogleConsequence')
          : pending?.kind === 'session'
            ? copy('revokeSessionConsequence')
            : copy('confirmDescription')

  if (loadFailure)
    return (
      <div data-account-panel="security">
        <SettingsReadError
          source={copy('source')}
          error={loadFailure.error}
          at={loadFailure.at}
          locale={locale}
          onRetry={() => void load(() => true)}
        />
      </div>
    )

  const listSkeleton = (
    <SettingsLoading locale={locale}>
      <Skeleton className="h-16 w-full rounded-md" />
    </SettingsLoading>
  )

  return (
    <div data-account-panel="security" aria-busy={loading || working}>
      {!loading && (
        <SettingsAside>
          <SettingsSummaryLine label={copy('methods')}>
            {copy(passkeys.length === 1 ? 'summaryMethods_one' : 'summaryMethods_other', {
              passkeys: passkeys.length,
              magic: magicLinkEnabled ? copy('on') : copy('off'),
              google: google ? copy('linked') : copy('notLinked')
            })}
          </SettingsSummaryLine>
          <SettingsSummaryLine label={copy('sessions')}>
            {copy('summarySessions', { count: sessions.length })}
          </SettingsSummaryLine>
        </SettingsAside>
      )}
      <SettingsParts>
        <SettingsPart title={copy('methods')} description={copy('methodsDescription')} id={METHODS_HEADING}>
          <SettingsSwitchRow
            id="magic-link-enabled"
            title={copy('magicLink')}
            description={copy('magicLinkDescription')}
            state={magicLinkEnabled ? copy('on') : copy('off')}
            checked={magicLinkEnabled}
            disabled={loading}
            onCheckedChange={(checked) => void saveMagicLink(checked)}
          />

          <div className="grid gap-3">
            <h4 className="type-body font-medium">{copy('passkeys')}</h4>
            {loading ? (
              listSkeleton
            ) : passkeys.length ? (
              <SettingsList>
                {passkeys.map((credential) => {
                  const name = credential.name || copy('unnamedPasskey')
                  return (
                    <SettingsItem key={credential.id} data-passkey-row data-passkey-id={credential.id}>
                      {renaming === credential.id ? (
                        <form
                          className="flex min-w-0 flex-1 flex-wrap items-end gap-3"
                          onSubmit={(event) => {
                            event.preventDefault()
                            void renamePasskey(credential.id)
                          }}
                        >
                          <SettingsField
                            label={copy('passkeyName')}
                            hint={copy('nameLimit', { limit: NAME_LIMIT })}
                            error={nameError?.field === 'rename' ? nameError.message : undefined}
                            className="min-w-48 flex-1"
                          >
                            {(aria) => (
                              <Input
                                {...aria}
                                ref={renameInput}
                                name="passkey-name"
                                type="text"
                                autoComplete="off"
                                maxLength={NAME_LIMIT}
                                value={renameValue}
                                onChange={(event) => setRenameValue(event.target.value)}
                              />
                            )}
                          </SettingsField>
                          <Button type="submit" disabled={working}>
                            {copy('saveName')}
                          </Button>
                          <Button
                            type="button"
                            variant="ghost"
                            onClick={() => {
                              setNameError(null)
                              setRenaming(null)
                            }}
                          >
                            {copy('cancel')}
                          </Button>
                        </form>
                      ) : (
                        <>
                          <div className="grid min-w-0 gap-0.5">
                            <span className="type-body font-medium [overflow-wrap:anywhere]">{name}</span>
                            <span className="type-small text-muted-foreground">
                              <time dateTime={credential.createdAt}>
                                {copy('addedOn', { date: formatSessionDate(credential.createdAt, locale) })}
                              </time>
                            </span>
                          </div>
                          <div className="flex flex-wrap gap-2">
                            <Button
                              type="button"
                              variant="outline"
                              data-rename
                              aria-label={copy('renameNamed', { name })}
                              onClick={() => {
                                setNameError(null)
                                setRenameValue(name)
                                setRenaming(credential.id)
                              }}
                            >
                              {copy('rename')}
                            </Button>
                            <Button
                              type="button"
                              variant="outline"
                              aria-label={copy('removeNamed', { name })}
                              onClick={() => setPending({ kind: 'passkey', id: credential.id, name })}
                            >
                              {copy('remove')}
                            </Button>
                          </div>
                        </>
                      )}
                    </SettingsItem>
                  )
                })}
              </SettingsList>
            ) : (
              <p className="type-body text-muted-foreground">{copy('noPasskeys')}</p>
            )}
            <form
              className="flex min-w-0 flex-wrap items-start gap-3"
              onSubmit={(event) => {
                event.preventDefault()
                void addPasskey()
              }}
            >
              <SettingsField
                label={copy('newPasskeyName')}
                hint={`${copy('newPasskeyHint')} ${copy('nameLimit', { limit: NAME_LIMIT })}`}
                error={nameError?.field === 'add' ? nameError.message : undefined}
                className="min-w-56 flex-1"
              >
                {(aria) => (
                  <Input
                    {...aria}
                    name="new-passkey-name"
                    type="text"
                    autoComplete="off"
                    maxLength={NAME_LIMIT}
                    value={passkeyName}
                    onChange={(event) => setPasskeyName(event.target.value)}
                  />
                )}
              </SettingsField>
              <Button
                type="submit"
                className="transition-none sm:mt-7"
                disabled={loading || working}
                aria-busy={adding}
              >
                {adding ? copy('addingPasskey') : copy('addPasskey')}
              </Button>
            </form>
          </div>

          {loading ? (
            listSkeleton
          ) : (
            <SettingsList>
              <SettingsItem data-density-row>
                <div className="grid min-w-0 gap-0.5">
                  <span className="type-body flex flex-wrap items-baseline gap-x-2 font-medium">
                    {copy('google')}
                    <span className="type-small font-normal text-muted-foreground">
                      {google ? copy('linked') : copy('notLinked')}
                    </span>
                  </span>
                  <span className="type-small text-muted-foreground">
                    {google ? copy('googleLinked') : copy('googleNotLinked')}
                  </span>
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
                  <Button
                    type="button"
                    variant="outline"
                    disabled={linking}
                    aria-busy={linking}
                    onClick={() => void linkGoogle()}
                  >
                    {copy('linkGoogle')}
                  </Button>
                )}
              </SettingsItem>
            </SettingsList>
          )}
          {error?.where === 'methods' ? <SettingsError>{error.message}</SettingsError> : null}
          {notice?.where === 'methods' ? <SettingsStatus>{notice.message}</SettingsStatus> : null}
        </SettingsPart>

        <SettingsPart
          title={copy('sessions')}
          description={copy('sessionsDescription')}
          id={SESSIONS_HEADING}
          actions={
            <Button
              type="button"
              variant="outline"
              disabled={loading || working || sessions.length < 2}
              onClick={() => setPending({ kind: 'others' })}
            >
              {copy('signOutEverywhere')}
            </Button>
          }
        >
          {loading ? (
            listSkeleton
          ) : (
            <SettingsList>
              {sessions.map((session) => {
                const agent = presentSessionAgent(session.userAgent, locale)
                const current = session.id === currentSessionId
                const name = `${agent.device} · ${agent.browser}`
                // Two sessions on one device and browser read alike: the date they began tells them apart.
                const distinct = `${name} · ${formatSessionDate(session.createdAt, locale)}`
                return (
                  <SettingsItem key={session.id} data-session-row data-session-id={session.id}>
                    <div className="grid min-w-0 gap-0.5">
                      <span className="type-body font-medium [overflow-wrap:anywhere]">
                        {name}
                        {current ? (
                          <span className="type-small ml-2 font-normal text-muted-foreground">
                            {copy('thisDevice')}
                          </span>
                        ) : null}
                      </span>
                      <span className="type-small text-muted-foreground">
                        <time dateTime={session.createdAt}>
                          {copy('createdOn', { date: formatSessionDate(session.createdAt, locale) })}
                        </time>
                      </span>
                      <span className="type-small text-muted-foreground">
                        <time dateTime={session.updatedAt}>
                          {copy('lastActiveOn', { date: formatSessionDate(session.updatedAt, locale) })}
                        </time>
                      </span>
                    </div>
                    <Button
                      type="button"
                      variant="outline"
                      disabled={working}
                      aria-label={copy('revokeNamed', { name: distinct })}
                      onClick={() =>
                        setPending({ kind: 'session', id: session.id, token: session.token, name: distinct })
                      }
                    >
                      {copy('revoke')}
                    </Button>
                  </SettingsItem>
                )
              })}
            </SettingsList>
          )}
          {error?.where === 'devices' ? <SettingsError>{error.message}</SettingsError> : null}
          {notice?.where === 'devices' ? <SettingsStatus>{notice.message}</SettingsStatus> : null}
        </SettingsPart>
      </SettingsParts>

      <ConfirmDialog
        open={pending !== null}
        onOpenChange={(open) => !open && setPending(null)}
        objectName={pendingName}
        title={pendingAction}
        confirmLabel={pendingAction}
        description={pendingDescription}
        onConfirm={confirmPending}
        locale={locale}
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
