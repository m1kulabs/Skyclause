'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { Alert, AlertDescription } from '#ui/alert'
import { Badge } from '#ui/badge'
import { Button } from '#ui/button'
import { errorMessageKey, maskEmail, problemCode } from './model'
import { inviteApiFetch } from './operations'
import { t, type Locale } from './i18n'
import styles from './invite.module.css'

type TokenInfo = {
  kind: 'invitation' | 'ownership_transfer'
  state: 'valid' | 'expired' | 'withdrawn' | 'used'
  org_name?: string
  org_slug?: string
  org?: string
  role?: string
  masked_email?: string
  email?: string
}

interface InvitePanelProps {
  token: string
  locale: Locale
  signedIn: boolean
}

function organisationName(info: TokenInfo | null): string {
  return info?.org_name ?? info?.org ?? 'your organisation'
}

function roleName(role: string, locale: Locale): string {
  const key = `members.role_names.${role}`
  return t(key, {}, locale)
}

function problem(error: unknown): { code: string; body: Record<string, unknown> } {
  if (typeof error !== 'object' || error === null) return { code: '', body: {} }
  const body =
    'body' in error && typeof error.body === 'object' && error.body !== null
      ? (error.body as Record<string, unknown>)
      : {}
  const direct = typeof body.code === 'string' ? body.code : typeof body.type === 'string' ? body.type : ''
  const code = direct.split(/[/:#]/).filter(Boolean).at(-1)?.toLowerCase() ?? problemCode(error) ?? ''
  return { code, body }
}

function statusIs(error: unknown, status: number): boolean {
  return typeof error === 'object' && error !== null && 'status' in error && error.status === status
}

export function InvitePanel({ token, locale, signedIn }: InvitePanelProps) {
  const [info, setInfo] = useState<TokenInfo | null>(null)
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState(false)
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState('')
  const [accepted, setAccepted] = useState(false)
  const [wrongEmail, setWrongEmail] = useState('')
  const [reload, setReload] = useState(0)
  const next = `/invite/${encodeURIComponent(token)}`
  const authQuery = `?next=${encodeURIComponent(next)}`

  useEffect(() => {
    const controller = new AbortController()
    setLoading(true)
    setLoadError(false)
    setMessage('')
    inviteApiFetch('inspectMemberToken', { params: { token }, signal: controller.signal })
      .then((result) => {
        if (!controller.signal.aborted) setInfo(result as TokenInfo)
      })
      .catch(() => {
        if (!controller.signal.aborted) setLoadError(true)
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false)
      })
    return () => controller.abort()
  }, [token, reload])

  async function accept() {
    if (!info || info.state !== 'valid') return
    setBusy(true)
    setMessage('')
    setWrongEmail('')
    try {
      if (info.kind === 'ownership_transfer') {
        await inviteApiFetch('acceptOwnershipTransfer', { params: { token } })
      } else {
        await inviteApiFetch('acceptInvitation', { params: { token } })
      }
      setAccepted(true)
    } catch (error) {
      const { code, body } = problem(error)
      const address =
        typeof body.masked_email === 'string'
          ? body.masked_email
          : typeof body.email === 'string'
            ? maskEmail(body.email)
            : ''
      if (code.includes('email') || address) {
        if (address) setWrongEmail(address)
        else setMessage(t('members.accept_failed', {}, locale))
      } else if (code === 'too-many-requests' || code === 'rate-limited' || statusIs(error, 429)) {
        setMessage(t('members.rate_limited', {}, locale))
      } else if (code === 'link-expired') {
        setInfo({ ...info, state: 'expired' })
      } else if (code === 'invite-withdrawn') {
        setInfo({ ...info, state: 'withdrawn' })
      } else if (statusIs(error, 409) || statusIs(error, 410)) {
        try {
          const current = await inviteApiFetch('inspectMemberToken', { params: { token } })
          setInfo(current as TokenInfo)
          if (current.state === 'valid') setMessage(t('members.accept_failed', {}, locale))
        } catch {
          setMessage(t('members.accept_failed', {}, locale))
        }
      } else {
        setMessage(t(errorMessageKey(error, 'members.accept_failed'), {}, locale))
      }
    } finally {
      setBusy(false)
    }
  }

  let statusText = ''
  if (info?.state === 'withdrawn') {
    statusText = t(
      info.kind === 'ownership_transfer' ? 'members.transfer_withdrawn' : 'members.invite_withdrawn',
      {},
      locale
    )
  } else if (info?.state === 'expired') {
    statusText =
      info.kind === 'ownership_transfer'
        ? t('members.transfer_expired', {}, locale)
        : t('members.invite_expired', { org: organisationName(info) }, locale)
  } else if (info?.state === 'used') {
    statusText = t(info.kind === 'ownership_transfer' ? 'members.transfer_used' : 'members.invite_used', {}, locale)
  }

  return (
    <main className={styles.page}>
      <section className={styles.card} aria-labelledby="invite-heading">
        <h1 id="invite-heading">{t('members.invite_page_title', {}, locale)}</h1>
        {loading && <p role="status">{t('members.invite_loading', {}, locale)}</p>}
        {loadError && (
          <Alert variant="destructive" role="alert">
            <AlertDescription className={styles.retryRow}>
              <span>{t('members.invite_load_failed', {}, locale)}</span>
              <button className={styles.retry} type="button" onClick={() => setReload((value) => value + 1)}>
                {t('members.retry', {}, locale)}
              </button>
            </AlertDescription>
          </Alert>
        )}

        {!loading && !loadError && info && (
          <>
            {info.state !== 'valid' ? (
              <p role="status">{statusText}</p>
            ) : accepted ? (
              <>
                <p role="status">
                  {t(
                    info.kind === 'ownership_transfer' ? 'members.transfer_accepted' : 'members.invite_accepted',
                    {
                      org: organisationName(info)
                    },
                    locale
                  )}
                </p>
                {info.org_slug && (
                  <Button render={<Link href={`/${encodeURIComponent(info.org_slug)}`} />}>
                    {t('members.continue_to_org', {}, locale)}
                  </Button>
                )}
              </>
            ) : (
              <>
                <div className={styles.summary}>
                  <h2>
                    {info.kind === 'ownership_transfer'
                      ? t('members.transfer_accept_title', { org: organisationName(info) }, locale)
                      : t('members.invite_for', { org: organisationName(info) }, locale)}
                  </h2>
                  {info.role && (
                    <Badge variant="secondary">
                      {t('members.invite_role_summary', { role: roleName(info.role, locale) }, locale)}
                    </Badge>
                  )}
                  {!info.role && info.kind === 'invitation' && (
                    <p>{t('members.invite_details_unavailable', {}, locale)}</p>
                  )}
                </div>
                {wrongEmail && (
                  <Alert variant="destructive" role="alert">
                    <AlertDescription>{t('members.wrong_email', { address: wrongEmail }, locale)}</AlertDescription>
                  </Alert>
                )}
                {message && (
                  <p role="alert" className={styles.problem}>
                    {message}
                  </p>
                )}
                {signedIn ? (
                  <Button type="button" disabled={busy} onClick={() => void accept()}>
                    {busy
                      ? t('members.accepting', {}, locale)
                      : info.kind === 'ownership_transfer'
                        ? t('members.transfer_accept_generic', {}, locale)
                        : t('members.invite_accept_generic', {}, locale)}
                  </Button>
                ) : (
                  <div className={styles.authActions}>
                    <Button render={<Link href={`/sign-in${authQuery}`} />}>{t('members.sign_in', {}, locale)}</Button>
                    <Button variant="outline" render={<Link href={`/sign-up${authQuery}`} />}>
                      {t('members.create_account', {}, locale)}
                    </Button>
                  </div>
                )}
              </>
            )}
          </>
        )}
      </section>
    </main>
  )
}
