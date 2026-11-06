'use client'

import { useCallback, useEffect, useState } from 'react'
import Link from 'next/link'
import { formatDate, formatTime } from '@skyclause/i18n/format'
import { Button } from '#ui/button'
import { CodeBlock, CodeBlockContent } from '#ui/code-block'
import { t } from './i18n'
import { apiFetch, targets, readTools, type Target, type Transport, type Verification } from './operations'
import { safeConfig, verificationState } from './model'
import { useResource } from './resource'
import { CopyButton } from './copy-button'
import { startListening, type Listening } from './listen'
import { Enterprise } from './enterprise'
import './connect.css'

async function readVerifications(signal: AbortSignal) {
  const records: Verification[] = []
  const seen = new Set<string>()
  let cursor: string | undefined
  do {
    const page = await apiFetch('listConnectVerifications', { query: { cursor }, signal })
    records.push(...page.data)
    cursor = page.next_cursor ?? undefined
    if (cursor && seen.has(cursor)) throw new Error('Repeated verification cursor')
    if (cursor) seen.add(cursor)
  } while (cursor)
  return records
}

function Failure({ message, retry }: { message: string; retry: () => void }) {
  return (
    <div className="connect-failure">
      <p role="alert">{t(`connect.${message}`)}</p>
      <Button variant="outline" onClick={retry}>
        {t('connect.retry')}
      </Button>
    </div>
  )
}

function Config({ target, transport }: { target: Target; transport: Transport }) {
  const read = useCallback(
    async (signal: AbortSignal) => {
      const response = await apiFetch('getConnectConfig', { query: { target, transport }, signal })
      if (response.target !== target || response.transport !== transport)
        throw new Error('Config does not match selection')
      return safeConfig(response.config)
    },
    [target, transport]
  )
  const [config, retry] = useResource(read)
  return (
    <section className="connect-section" aria-labelledby="config-title">
      <h2 id="config-title">{t('connect.config')}</h2>
      {config.kind === 'loading' ? (
        <p role="status">{t('connect.loading_config')}</p>
      ) : config.kind === 'error' ? (
        <Failure message="config_error" retry={retry} />
      ) : (
        <>
          <CodeBlock>
            <CodeBlockContent wrap translate="no">
              {config.value}
            </CodeBlockContent>
          </CodeBlock>
          <CopyButton key={config.value} value={config.value} label="copy_config" />
        </>
      )}
    </section>
  )
}

function Listener() {
  const [state, setState] = useState<Listening>({ kind: 'waiting' })
  const [attempt, setAttempt] = useState(0)
  useEffect(() => {
    setState({ kind: 'waiting' })
    const since = new Date().toISOString()
    return startListening({
      read: (signal) => apiFetch('listConnectActivity', { query: { since }, signal }),
      change: setState,
      visibility: document
    })
  }, [attempt])
  return (
    <section className="connect-section" aria-labelledby="activity-title">
      <h2 id="activity-title">{t('connect.activity')}</h2>
      <p role="status" data-connect-activity translate={state.kind === 'received' ? 'no' : undefined}>
        {state.kind === 'received'
          ? t('connect.first_request', {
              time: formatTime(state.request.at, 'en'),
              tool: state.request.tool,
              client: state.request.client_name ?? t('connect.unknown_client')
            })
          : t(`connect.${state.kind === 'error' ? 'activity_error' : state.kind}`)}
      </p>
      {(state.kind === 'timeout' || state.kind === 'error') && (
        <Button variant="outline" onClick={() => setAttempt((value) => value + 1)}>
          {t('connect.retry')}
        </Button>
      )}
    </section>
  )
}

function ToolList({ origin }: { origin: string }) {
  const read = useCallback((signal: AbortSignal) => readTools(origin, signal), [origin])
  const [tools, retry] = useResource(read)
  return (
    <section className="connect-section" aria-labelledby="tools-title">
      <h2 id="tools-title">{t('connect.tools')}</h2>
      <p>{t('connect.no_approval')}</p>
      {tools.kind === 'loading' ? (
        <p role="status">{t('connect.loading_tools')}</p>
      ) : tools.kind === 'error' ? (
        <Failure message="tools_error" retry={retry} />
      ) : tools.value.length === 0 ? (
        <>
          <p>{t('connect.empty_tools')}</p>
          <Button variant="outline" onClick={retry}>
            {t('connect.retry')}
          </Button>
        </>
      ) : (
        <table className="connect-tools">
          <thead className="sr-only sm:not-sr-only">
            <tr>
              <th scope="col">{t('connect.tool_name')}</th>
              <th scope="col">{t('connect.tool_description')}</th>
              <th scope="col">{t('connect.scopes')}</th>
            </tr>
          </thead>
          <tbody>
            {tools.value.map((tool) => (
              <tr key={tool.name}>
                <th scope="row">
                  <code translate="no">{tool.name}</code>
                </th>
                <td>{tool.description}</td>
                <td>{tool.scopes.map((scope) => t(`connect.scope_${scope}`)).join(t('connect.scope_separator'))}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </section>
  )
}

export function ConnectPanel({
  target,
  transport,
  mcpOrigin,
  orgId
}: {
  target: Target
  transport: Transport
  mcpOrigin: string
  orgId: string | null
}) {
  const [verifications, retry] = useResource(readVerifications)
  const records =
    verifications.kind === 'ready'
      ? new Map(targets.map((id) => [id, verifications.value.find((record) => record.target === id)]))
      : undefined
  const verified =
    records && [...records.values()].filter((record) => verificationState(record?.result) === 'verified').length
  return (
    <div className="connect-page" data-connect-page>
      <header>
        <h1>{t('connect.title')}</h1>
        {verifications.kind === 'error' ? (
          <Failure message="verification_error" retry={retry} />
        ) : (
          <p role="status">
            {verified === undefined ? t('connect.loading_verifications') : t('connect.finding', { n: verified })}
          </p>
        )}
      </header>
      <nav aria-label={t('connect.pick')} className="connect-targets">
        {targets.map((id) => {
          const record = records?.get(id)
          const state = verificationState(record?.result)
          return (
            <Link
              key={id}
              href={`/connect?target=${id}&transport=${transport}`}
              aria-current={id === target ? 'page' : undefined}
            >
              <span translate="no">{t(`connect.targets.${id}`)}</span>
              {records && (
                <span className="connect-verification">
                  {state === 'verified' && record
                    ? t('connect.verified', { date: formatDate(record.tested_at, 'en') })
                    : t(`connect.${state}`)}
                </span>
              )}
            </Link>
          )
        })}
      </nav>
      <fieldset className="connect-transport">
        <legend>{t('connect.transport')}</legend>
        {(['remote', 'stdio'] as const).map((method) => (
          <label key={method}>
            <input
              type="radio"
              name="transport"
              value={method}
              checked={transport === method}
              onChange={() => {
                window.location.assign(`/connect?target=${target}&transport=${method}`)
              }}
            />
            {t(`connect.${method}`)}
          </label>
        ))}
      </fieldset>
      <Config key={`${target}-${transport}`} target={target} transport={transport} />
      <Listener />
      {target === 'gemini_enterprise' && <Enterprise orgId={orgId} />}
      <ToolList origin={mcpOrigin} />
    </div>
  )
}
