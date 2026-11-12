'use client'

import { useCallback, useEffect, useState } from 'react'
import Link from 'next/link'
import { formatDate, formatTime } from '@skyclause/i18n/format'
import { Button } from '#ui/button'
import { Card, CardContent } from '#ui/card'
import { CodeBlock, CodeBlockContent, CodeBlockHeader } from '#ui/code-block'
import { Skeleton } from '#ui/skeleton'
import { cn } from '#lib/utils'
import { Glyph } from '../brand/glyph'
import { t } from './i18n'
import { apiFetch, targets, readTools, type Target, type Transport, type Verification } from './operations'
import { UnsafeConfigError, safeConfig, verificationState } from './model'
import { useResource } from './resource'
import { CopyButton } from './copy-button'
import { Failure } from './failure'
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

type VerificationState = ReturnType<typeof verificationState>

const verificationGlyph = { verified: 'fresh', reverify_due: 'stale' } as const

function VerificationGlyph({ state }: { state: VerificationState }) {
  return <Glyph state={state === 'verified' || state === 'reverify_due' ? verificationGlyph[state] : 'pending'} />
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
    <Card aria-labelledby="config-title" role="region" data-connect-config>
      <CardContent className="grid min-w-0 gap-4">
        <h2 id="config-title" className="type-card-title">
          {t('connect.config')}
        </h2>
        {config.kind === 'loading' ? (
          <div className="grid gap-2">
            <Skeleton className="h-5 w-full rounded-full" />
            <Skeleton className="h-5 w-4/5 rounded-full" />
            <Skeleton className="h-5 w-3/5 rounded-full" />
            <p role="status" className="sr-only">
              {t('connect.loading_config')}
            </p>
          </div>
        ) : config.kind === 'error' ? (
          config.error instanceof UnsafeConfigError ? (
            <div className="grid justify-items-start gap-3">
              <p role="alert" className="flex items-start gap-2 font-medium">
                <Glyph state="error" className="mt-1.5" />
                <span>{t('connect.config_error')}</span>
              </p>
              <Button variant="outline" onClick={retry}>
                {t('connect.retry')}
              </Button>
            </div>
          ) : (
            <Failure source={t('connect.source_config')} error={config.error} at={config.at} retry={retry} />
          )
        ) : (
          <CodeBlock>
            <CodeBlockHeader className="justify-end">
              <CopyButton key={config.value} value={config.value} label="copy_config" />
            </CodeBlockHeader>
            <CodeBlockContent wrap translate="no">
              {config.value}
            </CodeBlockContent>
          </CodeBlock>
        )}
      </CardContent>
    </Card>
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
    <Card aria-labelledby="activity-title" role="region">
      <CardContent className="grid min-w-0 gap-3">
        <h2 id="activity-title" className="type-card-title">
          {t('connect.activity')}
        </h2>
        <p
          role="status"
          data-connect-activity
          translate={state.kind === 'received' ? 'no' : undefined}
          className="type-body flex min-w-0 flex-wrap items-center gap-x-3 gap-y-1"
        >
          {state.kind === 'received' ? (
            <>
              <time dateTime={state.request.at} data-numeric className="font-semibold">
                {formatTime(state.request.at, 'en')}
              </time>
              <span className="[overflow-wrap:anywhere]">{state.request.tool}</span>
              <span className="text-muted-foreground [overflow-wrap:anywhere]">
                {state.request.client_name ?? t('connect.unknown_client')}
              </span>
            </>
          ) : (
            <>
              {state.kind === 'error' ? <Glyph state="error" /> : <Glyph state="pending" />}
              <span>{t(`connect.${state.kind === 'error' ? 'activity_error' : state.kind}`)}</span>
            </>
          )}
        </p>
        {(state.kind === 'timeout' || state.kind === 'error') && (
          <Button variant="outline" className="justify-self-start" onClick={() => setAttempt((value) => value + 1)}>
            {t('connect.retry')}
          </Button>
        )}
      </CardContent>
    </Card>
  )
}

function ToolList({ origin }: { origin: string }) {
  const read = useCallback((signal: AbortSignal) => readTools(origin, signal), [origin])
  const [tools, retry] = useResource(read)
  return (
    <section aria-labelledby="tools-title" className="grid min-w-0 gap-4">
      <div className="grid gap-1">
        <h2 id="tools-title" className="type-section">
          {t('connect.tools')}
        </h2>
        <p className="type-card-title">{t('connect.no_approval')}</p>
      </div>
      {tools.kind === 'loading' ? (
        <div className="grid gap-3">
          <Skeleton className="h-6 w-full rounded-full" />
          <Skeleton className="h-6 w-full rounded-full" />
          <p role="status" className="sr-only">
            {t('connect.loading_tools')}
          </p>
        </div>
      ) : tools.kind === 'error' ? (
        <Failure source={t('connect.source_tools')} error={tools.error} at={tools.at} retry={retry} />
      ) : tools.value.length === 0 ? (
        <div className="grid justify-items-start gap-3">
          <p className="type-body flex items-center gap-2">
            <Glyph state="pending" />
            <span>{t('connect.empty_tools')}</span>
          </p>
          <Button variant="outline" onClick={retry}>
            {t('connect.retry')}
          </Button>
        </div>
      ) : (
        <table className="connect-tools type-body">
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
                <th scope="row" translate="no">
                  {tool.name}
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

const segment =
  'relative inline-flex h-9 min-w-9 flex-none items-center justify-center gap-1.5 rounded-full border-2 border-transparent px-3.5 text-[14px] leading-5 font-medium whitespace-nowrap text-muted-foreground outline-none hover:text-foreground pointer-coarse:h-11'
const strip =
  'inline-flex w-fit max-w-full flex-wrap items-center gap-1 rounded-full border-2 border-input bg-muted p-1'

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
  const record = records?.get(target)
  const state = verificationState(record?.result)
  return (
    <div className="connect-page grid min-w-0 gap-section" data-connect-page>
      <header className="grid gap-2">
        <h1 className="type-title">{t('connect.title')}</h1>
        {verifications.kind === 'error' ? (
          <Failure
            source={t('connect.source_verifications')}
            error={verifications.error}
            at={verifications.at}
            retry={retry}
          />
        ) : (
          <p role="status" className="type-text text-muted-foreground">
            {verified === undefined ? t('connect.loading_verifications') : t('connect.finding', { n: verified })}
          </p>
        )}
      </header>
      <div className="grid min-w-0 gap-4">
        <nav aria-label={t('connect.pick')} className={cn('connect-targets', strip)}>
          {targets.map((id) => {
            const item = records?.get(id)
            const itemState = verificationState(item?.result)
            return (
              <Link
                key={id}
                href={`/connect?target=${id}&transport=${transport}`}
                aria-current={id === target ? 'page' : undefined}
                className={cn(
                  segment,
                  'current-mark aria-[current=page]:bg-primary aria-[current=page]:text-primary-foreground'
                )}
              >
                {records && <VerificationGlyph state={itemState} />}
                <span translate="no">{t(`connect.targets.${id}`)}</span>
                {records && (
                  <span className="connect-verification sr-only">
                    {itemState === 'verified' && item
                      ? t('connect.verified', { date: formatDate(item.tested_at, 'en') })
                      : t(`connect.${itemState}`)}
                  </span>
                )}
              </Link>
            )
          })}
        </nav>
        <div className="flex min-w-0 flex-wrap items-center justify-between gap-x-6 gap-y-3">
          <div className="grid min-w-0 gap-1">
            <h2 className="type-section" translate="no">
              {t(`connect.targets.${target}`)}
            </h2>
            {records ? (
              <p className="type-body flex items-center gap-2" data-connect-verified>
                <VerificationGlyph state={state} />
                <span>
                  {state === 'verified' && record
                    ? t('connect.verified', { date: formatDate(record.tested_at, 'en') })
                    : t(`connect.${state}`)}
                </span>
              </p>
            ) : (
              <Skeleton className="h-5 w-48 rounded-full" />
            )}
          </div>
          <fieldset className="grid gap-1.5">
            <legend className="type-small mb-1.5 text-muted-foreground">{t('connect.transport')}</legend>
            <div className={strip}>
              {(['remote', 'stdio'] as const).map((method) => (
                <label
                  key={method}
                  className={cn(
                    segment,
                    'cursor-pointer has-[:checked]:bg-primary has-[:checked]:text-primary-foreground has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-ring has-[:focus-visible]:outline-solid'
                  )}
                >
                  <input
                    type="radio"
                    name="transport"
                    value={method}
                    checked={transport === method}
                    className="sr-only"
                    onChange={() => {
                      window.location.assign(`/connect?target=${target}&transport=${method}`)
                    }}
                  />
                  {t(`connect.${method}`)}
                </label>
              ))}
            </div>
          </fieldset>
        </div>
      </div>
      <div className="connect-main">
        <Config key={`${target}-${transport}`} target={target} transport={transport} />
        <Listener />
      </div>
      {target === 'gemini_enterprise' && <Enterprise orgId={orgId} />}
      <ToolList origin={mcpOrigin} />
    </div>
  )
}
