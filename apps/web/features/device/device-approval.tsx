'use client'

import { useEffect, useState } from 'react'
import { Button } from '../../components/ui/button'
import { t } from './i18n'
import { normalizeDeviceCode, type CliDevice } from './model'

export type DevicePageState = 'empty' | 'ready' | 'expired' | 'unknown' | 'done' | 'denied'

interface MembershipSummary {
  organization: string
  role: string
}

interface DeviceApprovalProps {
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

export function DeviceApproval({ code, initialState, device, memberships }: DeviceApprovalProps) {
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
    <main className="mx-auto w-full max-w-xl space-y-6">
      <header className="space-y-2">
        <h1 className="text-2xl font-semibold">{t('device.title')}</h1>
        <p className="text-sm text-muted-foreground">{t('device.intro')}</p>
      </header>

      <form action="/device" method="get" className="flex flex-col gap-3">
        <label htmlFor="device-code" className="text-sm font-medium">
          {t('device.code')}
        </label>
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
          className="min-h-11 rounded-md border border-input bg-background px-3 font-mono text-base uppercase tracking-[0.16em] outline-none focus-visible:ring-2 focus-visible:ring-ring"
        />
        <Button type="submit" variant="outline" className="min-h-11 w-full">
          {t('device.continue')}
        </Button>
      </form>

      {state === 'ready' && (
        <section aria-labelledby="device-access-title" className="space-y-5 rounded-xl border border-border p-5">
          <h2 id="device-access-title" className="text-lg font-semibold">
            {t('device.access')}
          </h2>
          <dl className="grid gap-3 text-sm sm:grid-cols-2">
            <div>
              <dt className="font-medium">{t('device.device')}</dt>
              <dd>{deviceName}</dd>
            </div>
            <div>
              <dt className="font-medium">{t('device.operating_system')}</dt>
              <dd>{t(`device.os_${device.os}`)}</dd>
            </div>
          </dl>
          <div className="space-y-2">
            <h3 className="text-sm font-medium">{t('device.organisations')}</h3>
            {memberships.length ? (
              <ul className="space-y-2">
                {memberships.map(({ organization, role }) => (
                  <li
                    key={`${organization}:${role}`}
                    className="flex min-h-11 items-center justify-between gap-3 border-b border-border py-2"
                  >
                    <span>{organization}</span>
                    <span className="text-sm text-muted-foreground">{role}</span>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-sm text-muted-foreground">{t('device.no_organisations')}</p>
            )}
          </div>

          {verified && (
            <div className="grid grid-cols-2 gap-3">
              <Button type="button" disabled={busy} className="min-h-11 w-full" onClick={() => void decide('approve')}>
                {t('device.confirm')}
              </Button>
              <Button type="button" disabled={busy} className="min-h-11 w-full" onClick={() => void decide('deny')}>
                {t('device.deny')}
              </Button>
            </div>
          )}
        </section>
      )}

      <p role="status" aria-live="polite" className="min-h-6 text-sm">
        {statusMessage}
      </p>
      {actionError && (
        <p role="alert" className="text-sm text-destructive">
          {t('device.action_error')}
        </p>
      )}
    </main>
  )
}
