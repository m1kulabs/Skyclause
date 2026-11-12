'use client'

import { useEffect, useState } from 'react'
import { InfoIcon } from 'lucide-react'
import { Button } from '../../components/ui/button'
import { AuthHeader, AuthMessage } from '../public-chrome/auth'
import { t as translate, type Locale } from './i18n'
import { normalizeDeviceCode, type CliDevice } from './model'

export type DevicePageState = 'empty' | 'ready' | 'expired' | 'unknown' | 'done' | 'denied'

interface MembershipSummary {
  organization: string
  role: string
}

interface DeviceApprovalProps {
  locale?: Locale
  code: string
  initialState: DevicePageState
  device: CliDevice
  memberships: MembershipSummary[]
}

type Verification = { status?: string; client_id?: string }

async function requestDevice<T>(path: string, options: { method: 'GET' | 'POST'; body?: unknown }): Promise<T> {
  const response = await fetch(`/api/auth${path}`, {
    method: options.method,
    credentials: 'same-origin',
    cache: 'no-store',
    ...(options.body === undefined
      ? {}
      : { headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(options.body) })
  })
  const result = await response.json()
  if (!response.ok) throw result
  return result as T
}

function errorCode(error: unknown) {
  if (typeof error !== 'object' || error === null) return ''
  const candidate = error as { error?: unknown; message?: unknown; statusText?: unknown; body?: { error?: unknown } }
  return [candidate.error, candidate.body?.error, candidate.message, candidate.statusText]
    .filter((value) => typeof value === 'string')
    .join(' ')
}

export function DeviceApproval({ code, initialState, device, memberships, locale = 'en' }: DeviceApprovalProps) {
  const t = (key: string) => translate(key, {}, locale)
  const [enteredCode, setEnteredCode] = useState(code)
  const [state, setState] = useState<DevicePageState>(initialState)
  const [verified, setVerified] = useState(false)
  const [loading, setLoading] = useState(initialState === 'ready')
  const [busy, setBusy] = useState(false)
  const [actionError, setActionError] = useState(false)

  useEffect(() => {
    setEnteredCode(code)
    setState(initialState)
    setVerified(false)
    setLoading(initialState === 'ready')
    setActionError(false)

    if (initialState !== 'ready' || !code) return

    let active = true
    const query = new URLSearchParams({ user_code: normalizeDeviceCode(code) })
    void requestDevice<Verification>(`/device?${query}`, { method: 'GET' })
      .then((data) => {
        if (!active) return
        if (data.client_id !== 'skyclause-cli') {
          setState('unknown')
        } else if (data.status === 'approved') {
          setState('done')
        } else if (data.status === 'denied') {
          setState('denied')
        } else if (data.status === 'pending') {
          setVerified(true)
        } else {
          setState('unknown')
        }
        setLoading(false)
      })
      .catch((error: unknown) => {
        if (!active) return
        setState(errorCode(error).includes('expired_token') ? 'expired' : 'unknown')
        setLoading(false)
      })

    return () => {
      active = false
    }
  }, [code, initialState])

  async function decide(decision: 'approve' | 'deny') {
    setBusy(true)
    setActionError(false)
    try {
      const result = await requestDevice<{ success: boolean }>(`/device/${decision}`, {
        method: 'POST',
        body: { userCode: normalizeDeviceCode(enteredCode) }
      })
      if (!result.success) throw new Error('device request failed')
      setState(decision === 'approve' ? 'done' : 'denied')
    } catch {
      setActionError(true)
    } finally {
      setBusy(false)
    }
  }

  const statusMessage =
    state === 'expired'
      ? t('device.expired')
      : state === 'unknown'
        ? t('device.unknown')
        : state === 'done'
          ? t('device.done')
          : state === 'denied'
            ? t('device.denied')
            : loading
              ? t('device.loading')
              : ''
  const deviceName = device.name === 'Unknown device' ? t('device.unknown_device') : device.name

  return (
    <main className="auth-page" lang={locale}>
      <AuthHeader title={t('device.title')} lead={t('device.intro')} locale={locale} />

      <form action="/device" method="get" className="auth-form">
        <div className="auth-field">
          <label htmlFor="device-code">{t('device.code')}</label>
          <input
            id="device-code"
            name="user_code"
            type="text"
            autoComplete="one-time-code"
            autoCapitalize="characters"
            spellCheck={false}
            inputMode="text"
            required
            value={enteredCode}
            onChange={(event) => setEnteredCode(event.currentTarget.value)}
            className="figures h-12 w-full min-w-0 rounded-md border-2 border-input bg-field px-3 text-xl uppercase tracking-[0.12em] text-foreground outline-none placeholder:text-muted-foreground"
          />
        </div>
        <Button type="submit" size="lg" variant={state === 'ready' ? 'outline' : 'default'} className="w-full">
          {t('device.continue')}
        </Button>
      </form>

      {state === 'ready' && (
        <section aria-labelledby="device-access-title" className="auth-tile">
          <h2 id="device-access-title" className="auth-h2">
            {t('device.access')}
          </h2>
          <dl className="auth-facts">
            <div>
              <dt>{t('device.device')}</dt>
              <dd>{deviceName}</dd>
            </div>
            <div>
              <dt>{t('device.operating_system')}</dt>
              <dd>{t(`device.os_${device.os}`)}</dd>
            </div>
          </dl>
          <div className="auth-fieldset">
            <h3 className="auth-legend m-0">{t('device.organisations')}</h3>
            {memberships.length ? (
              <ul className="auth-grant">
                {memberships.map(({ organization, role }) => (
                  <li key={`${organization}:${role}`}>
                    <span>{organization}</span>
                    <span>{role}</span>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="auth-hint">{t('device.no_organisations')}</p>
            )}
          </div>

          {verified && (
            <>
              <p className="auth-hint">{t('device.warning')}</p>
              <div className="auth-pair">
                <Button type="button" size="lg" disabled={busy} onClick={() => void decide('approve')}>
                  {t('device.confirm')}
                </Button>
                <Button type="button" size="lg" disabled={busy} onClick={() => void decide('deny')}>
                  {t('device.deny')}
                </Button>
              </div>
            </>
          )}
        </section>
      )}

      <div role="status" aria-live="polite">
        {statusMessage ? (
          <p className="auth-error m-0">
            <InfoIcon aria-hidden="true" />
            {statusMessage}
          </p>
        ) : null}
      </div>
      {actionError && <AuthMessage>{t('device.action_error')}</AuthMessage>}
    </main>
  )
}
