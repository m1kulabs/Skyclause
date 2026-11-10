'use client'

import type { SubscriberData } from '@skyclause/contracts'
import { formatDateTime } from '@skyclause/i18n/format'
import { useEffect, useRef, useState, type FormEvent } from 'react'
import { t } from './i18n'
import styles from './subscriber-rights.module.css'

type Locale = 'en' | 'ms'

const label = (key: string, locale: Locale, vars: Record<string, string> = {}) =>
  t(`subscriber-rights.${key}`, vars, locale)

function date(value: string | null, locale: Locale) {
  if (!value) return '—'
  return formatDateTime(value, locale)
}

function EmptyRow({ children, columns }: { children: string; columns: number }) {
  return (
    <tr>
      <td colSpan={columns}>{children}</td>
    </tr>
  )
}

export function SubscriberRights({ initialData, token }: { initialData: SubscriberData; token: string }) {
  const [data, setData] = useState(initialData)
  const [email, setEmail] = useState(initialData.subscriber.email)
  const [role, setRole] = useState(initialData.subscriber.role ?? '')
  const [saving, setSaving] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [confirming, setConfirming] = useState(false)
  const [deleted, setDeleted] = useState(false)
  const [message, setMessage] = useState('')
  const [saveError, setSaveError] = useState('')
  const [deleteError, setDeleteError] = useState('')
  const resultRef = useRef<HTMLHeadingElement>(null)
  const locale: Locale = data.subscriber.language === 'ms' ? 'ms' : 'en'
  const base = `/api/subscribe/${encodeURIComponent(token)}/data`

  useEffect(() => {
    if (deleted) resultRef.current?.focus()
  }, [deleted])

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setSaving(true)
    setSaveError('')
    setMessage('')
    try {
      const response = await fetch(base, {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ email, role })
      })
      if (!response.ok) throw new Error('save')
      const result = (await response.json()) as SubscriberData
      setData(result)
      setRole(result.subscriber.role ?? '')
      setMessage(result.address_confirmation_sent ? label('address_confirmation', locale) : label('saved', locale))
    } catch {
      setSaveError(label('save_error', locale))
    } finally {
      setSaving(false)
    }
  }

  async function erase() {
    setDeleting(true)
    setDeleteError('')
    try {
      const response = await fetch(base, { method: 'DELETE' })
      if (!response.ok) throw new Error('delete')
      setDeleted(true)
      setConfirming(false)
    } catch {
      setDeleteError(label('delete_error', locale))
      setDeleting(false)
    }
  }

  if (deleted) {
    return (
      <main className={styles.page}>
        <div className={styles.column}>
          <section className={styles.result}>
            <h1 ref={resultRef} tabIndex={-1}>
              {label('deleted', locale)}
            </h1>
          </section>
        </div>
      </main>
    )
  }

  const suppression = data.suppression
    ? label('suppression_value', locale, {
        reason: data.suppression.reason,
        time: date(data.suppression.at, locale),
        hash: data.suppression.email_hash
      })
    : label('none', locale)
  const status = label(`status_${data.subscriber_status}`, locale)
  const selectedWindows = data.subscriber.window_ids
    .map((id) => {
      const row = data.windows.find((window) => window.id === id)
      return row ? `${row.title} (${id})` : id
    })
    .join(', ')

  return (
    <main className={styles.page}>
      <div className={styles.column}>
        <header>
          <p className={styles.project}>{data.project_name}</p>
          <h1>{label('title', locale)}</h1>
          <p className={styles.intro}>{label('description', locale, { project: data.project_name })}</p>
        </header>

        <section className={styles.section}>
          <h2>{label('overview', locale)}</h2>
          <div className={styles.tableWrap}>
            <table className={`${styles.table} ${styles.summary}`}>
              <caption>{label('overview', locale)}</caption>
              <tbody>
                <tr>
                  <th scope="row">{label('subscriber_id', locale)}</th>
                  <td>{data.subscriber.id}</td>
                </tr>
                <tr>
                  <th scope="row">{label('email', locale)}</th>
                  <td>{data.subscriber.email}</td>
                </tr>
                <tr>
                  <th scope="row">{label('role', locale)}</th>
                  <td>{data.subscriber.role || '—'}</td>
                </tr>
                <tr>
                  <th scope="row">{label('windows_selected', locale)}</th>
                  <td>{selectedWindows || '—'}</td>
                </tr>
                <tr>
                  <th scope="row">{label('channels', locale)}</th>
                  <td>{data.subscriber.channels.join(', ') || '—'}</td>
                </tr>
                <tr>
                  <th scope="row">{label('language', locale)}</th>
                  <td>{data.subscriber.language}</td>
                </tr>
                <tr>
                  <th scope="row">{label('status', locale)}</th>
                  <td>{status}</td>
                </tr>
                <tr>
                  <th scope="row">{label('suppression', locale)}</th>
                  <td>{suppression}</td>
                </tr>
              </tbody>
            </table>
          </div>
          <form className={styles.form} onSubmit={save}>
            <label className={styles.field}>
              {label('email', locale)}
              <input
                autoComplete="email"
                type="email"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
              />
            </label>
            <label className={styles.field}>
              {label('role', locale)}
              <input value={role} onChange={(event) => setRole(event.target.value)} />
            </label>
            <button className={styles.button} disabled={saving} type="submit">
              {saving ? label('sending', locale) : label('save', locale)}
            </button>
          </form>
          {message && (
            <p className={styles.status} role="status">
              {message}
            </p>
          )}
          {saveError && (
            <p className={styles.error} role="alert">
              {saveError}
            </p>
          )}
        </section>

        <section className={styles.section}>
          <h2>{label('windows', locale)}</h2>
          <div className={styles.tableWrap}>
            <table className={styles.table}>
              <caption>{label('windows', locale)}</caption>
              <thead>
                <tr>
                  <th scope="col">{label('id', locale)}</th>
                  <th scope="col">{label('windows', locale)}</th>
                  <th scope="col">{label('starts', locale)}</th>
                  <th scope="col">{label('ends', locale)}</th>
                  <th scope="col">{label('time_zone', locale)}</th>
                </tr>
              </thead>
              <tbody>
                {data.windows.length ? (
                  data.windows.map((row) => (
                    <tr key={row.id}>
                      <td>{row.id}</td>
                      <td>{label('window_title', locale, { title: row.title, kind: row.kind })}</td>
                      <td>{date(row.starts_at, locale)}</td>
                      <td>{date(row.ends_at, locale)}</td>
                      <td>{row.tz}</td>
                    </tr>
                  ))
                ) : (
                  <EmptyRow columns={5}>{label('no_windows', locale)}</EmptyRow>
                )}
              </tbody>
            </table>
          </div>
        </section>

        <section className={styles.section}>
          <h2>{label('consent', locale)}</h2>
          <div className={styles.tableWrap}>
            <table className={styles.table}>
              <caption>{label('consent', locale)}</caption>
              <thead>
                <tr>
                  <th scope="col">{label('time', locale)}</th>
                  <th scope="col">{label('form', locale)}</th>
                  <th scope="col">{label('notice_version', locale)}</th>
                  <th scope="col">{label('language', locale)}</th>
                </tr>
              </thead>
              <tbody>
                {data.consent_records.length ? (
                  data.consent_records.map((row, index) => (
                    <tr key={`${row.at}-${index}`}>
                      <td>{date(row.at, locale)}</td>
                      <td>{row.form}</td>
                      <td>{row.notice_version}</td>
                      <td>{row.language}</td>
                    </tr>
                  ))
                ) : (
                  <EmptyRow columns={4}>{label('no_consent', locale)}</EmptyRow>
                )}
              </tbody>
            </table>
          </div>
        </section>

        <section className={styles.section}>
          <h2>{label('delivery', locale)}</h2>
          <div className={styles.tableWrap}>
            <table className={styles.table}>
              <caption>{label('delivery', locale)}</caption>
              <thead>
                <tr>
                  <th scope="col">{label('id', locale)}</th>
                  <th scope="col">{label('time', locale)}</th>
                  <th scope="col">{label('kind', locale)}</th>
                  <th scope="col">{label('call', locale)}</th>
                  <th scope="col">{label('channel', locale)}</th>
                  <th scope="col">{label('delivery_status', locale)}</th>
                </tr>
              </thead>
              <tbody>
                {data.delivery_history.length ? (
                  data.delivery_history.map((row) => (
                    <tr key={row.id}>
                      <td>{row.id}</td>
                      <td>{date(row.at, locale)}</td>
                      <td>{row.kind}</td>
                      <td>{row.call_permalink ? <a href={row.call_permalink}>{row.call_id}</a> : '—'}</td>
                      <td>{row.channel}</td>
                      <td>
                        {row.status}
                        {row.accepted_at ? ` · ${label('accepted', locale)} ${date(row.accepted_at, locale)}` : ''}
                      </td>
                    </tr>
                  ))
                ) : (
                  <EmptyRow columns={6}>{label('no_delivery', locale)}</EmptyRow>
                )}
              </tbody>
            </table>
          </div>
        </section>

        <section className={styles.section}>
          <h2>{label('replies', locale)}</h2>
          <div className={styles.tableWrap}>
            <table className={styles.table}>
              <caption>{label('replies', locale)}</caption>
              <thead>
                <tr>
                  <th scope="col">{label('id', locale)}</th>
                  <th scope="col">{label('time', locale)}</th>
                  <th scope="col">{label('window', locale)}</th>
                  <th scope="col">{label('call', locale)}</th>
                  <th scope="col">{label('reply', locale)}</th>
                  <th scope="col">{label('shift_to', locale)}</th>
                </tr>
              </thead>
              <tbody>
                {data.crowd_replies.length ? (
                  data.crowd_replies.map((row) => (
                    <tr key={row.id}>
                      <td>{row.id}</td>
                      <td>{date(row.at, locale)}</td>
                      <td>{data.windows.find((window) => window.id === row.window_id)?.title ?? row.window_id}</td>
                      <td>
                        <a href={`/c/${row.call_id}`}>{row.call_id}</a>
                      </td>
                      <td>{row.kind}</td>
                      <td>{row.shift_to ? date(row.shift_to, locale) : '—'}</td>
                    </tr>
                  ))
                ) : (
                  <EmptyRow columns={6}>{label('no_replies', locale)}</EmptyRow>
                )}
              </tbody>
            </table>
          </div>
        </section>

        <section className={styles.section}>
          <h2>{label('correct', locale)}</h2>
          <div className={styles.actions}>
            <a className={styles.download} href={`${base}/export`}>
              {label('download', locale)}
            </a>
            <button className={`${styles.button} ${styles.danger}`} type="button" onClick={() => setConfirming(true)}>
              {label('delete', locale)}
            </button>
          </div>
          {confirming && (
            <div className={styles.confirmBox}>
              <p>{label('delete_explanation', locale, { project: data.project_name })}</p>
              <div className={styles.actions}>
                <button
                  className={`${styles.button} ${styles.danger}`}
                  disabled={deleting}
                  type="button"
                  onClick={() => void erase()}
                >
                  {deleting
                    ? label('deleting', locale)
                    : label('confirm_delete', locale, { project: data.project_name })}
                </button>
                <button
                  className={styles.download}
                  disabled={deleting}
                  type="button"
                  onClick={() => setConfirming(false)}
                >
                  {label('cancel', locale)}
                </button>
              </div>
            </div>
          )}
          {deleteError && (
            <p className={styles.error} role="alert">
              {deleteError}
            </p>
          )}
        </section>
        <p className={styles.footnote}>{label('not_a_safety_service', locale)}</p>
      </div>
    </main>
  )
}

export function SubscriberRightsLinkError({ expired }: { expired: boolean }) {
  return (
    <main className={styles.page}>
      <div className={styles.column}>
        <h1>{label(expired ? 'expired' : 'unavailable', 'en')}</h1>
      </div>
    </main>
  )
}
