import { AsyncLocalStorage } from 'node:async_hooks'
import { log } from '@skyclause/config'
import type { Principal, TxHandle } from '@skyclause/contracts'
import { sql, type ExtractTablesWithRelations } from 'drizzle-orm'
import { drizzle, type NodePgDatabase, type NodePgTransaction } from 'drizzle-orm/node-postgres'
import pg from 'pg'
import * as schema from './schema'

type Schema = typeof schema

/**
 * The Drizzle transaction `fn` gets from a `with*` helper, carrying who runs it. `principal` is null only in
 * `withPublicReader` (`Tx<null>`); `orgId` is the organisation in `app.org_id`, or null outside `withTenant`.
 * Contracts see it as the `TxHandle` brand (#79 §1); a §1 helper given a `TxHandle` casts it back with `as Tx`.
 */
export type Tx<P extends Principal | null = Principal> = NodePgTransaction<Schema, ExtractTablesWithRelations<Schema>> &
  TxHandle & { readonly principal: P; readonly orgId: string | null }

export type SystemPrincipal = Extract<Principal, { kind: 'system' }>

/** The #79 §6 `DATABASE_URL_*` suffixes the runtime connects with; `MIGRATE` is `migrate()`'s alone. */
export type Login = 'APP' | 'AUTH' | 'SYSTEM' | 'RETENTION'

const connections = new Map<string, { pool: pg.Pool; db: NodePgDatabase<Schema> }>()

/** Security lock waiters use a separate pool so they cannot exhaust the connections needed by the lock holder. */
export function connection(login: Login, purpose?: 'account-security') {
  const name = `DATABASE_URL_${login}`
  const url = process.env[name]
  if (!url) throw new Error(`${name} is not set`)
  const key = purpose ? `${purpose}:${url}` : url
  let found = connections.get(key)
  if (!found) {
    // D45: nothing holds an idle connection, so a sleeping Neon compute stays asleep.
    const pool = new pg.Pool({
      connectionString: url,
      idleTimeoutMillis: 5_000,
      allowExitOnIdle: true,
      ...(purpose ? { max: 2 } : {})
    })
    // A client whose connection fails (the server ended it) emits `error`, which would crash the process with no
    // listener, and pg-pool listens only while the client is idle; so each client keeps one of its own, checked out or
    // not. A query on it still rejects for its caller, the pool drops the client, and the next query connects again.
    pool.on('connect', (client) =>
      client.on('error', (error) => {
        const shared = sharedClients.get(client)
        if (shared) shared.failure ??= error
        log.warn('database connection failed', { login, error: String(error) })
      })
    )
    // pg-pool re-emits an idle client's error here, and throws it without a listener; the client's own logged it.
    pool.on('error', () => {})
    found = { pool, db: drizzle(pool, { schema }) }
    connections.set(key, found)
  }
  return found
}

/** Ends every pool, for a job or test file that's done with the database. */
export async function closeConnections() {
  const open = [...connections.values()]
  connections.clear()
  await Promise.all(open.map(({ pool }) => pool.end()))
}

interface Shared {
  db: NodePgDatabase<Schema>
  /** The end of the queue: sibling calls on the shared connection take turns. */
  tail: Promise<unknown>
  /** Set once `fn` has settled: later calls are refused, and those already queued finish before the release. */
  ended: boolean
  /** A client error makes the whole batch unusable, including queued transactions. */
  failure?: Error
}
// The permanent client error listener also poisons its current sharing scope, without adding another listener.
const sharedClients = new WeakMap<pg.PoolClient, Shared>()
const sharedConnection = new AsyncLocalStorage<{ shared: Shared; inside: boolean }>()

/**
 * Runs `fn` with one `system` connection that every `withSystem`, and `withTenant` for a system principal, inside it
 * share, one transaction at a time; it goes back to the pool when `fn` settles. For a batch run whose handlers must share
 * one connection (D45, #235). On it, call `withTenant` after `withSystem` returns, not inside its callback: a nested
 * call would need a second connection, so it throws, as does a call made after `fn` settles.
 */
export async function shareSystemConnection<T>(fn: () => Promise<T>): Promise<T> {
  const client = await connection('SYSTEM').pool.connect()
  const shared: Shared = { db: drizzle(client, { schema }), tail: Promise.resolve(), ended: false }
  sharedClients.set(client, shared)
  try {
    let result: T
    try {
      result = await sharedConnection.run({ shared, inside: false }, fn)
    } finally {
      // Refuse new calls immediately when fn settles, including while previously admitted work drains.
      shared.ended = true
    }
    await shared.tail
    if (shared.failure) throw shared.failure
    return result
  } finally {
    await shared.tail
    // Passing the error discards the client; its permanent logging listener stays owned by the pool.
    client.release(shared.failure)
    sharedClients.delete(client)
  }
}

async function run<T, P extends Principal | null>(
  login: Login,
  context: { principal: P; orgId: string | null; setRole?: 'public_reader' },
  fn: (tx: Tx<P>) => Promise<T>
): Promise<T> {
  const share = login === 'SYSTEM' ? sharedConnection.getStore() : undefined
  if (!share) return transaction(connection(login).db, context, fn)
  const { shared, inside } = share
  if (inside) throw new Error('a with* call inside another on the shared system connection needs a second connection')
  if (shared.ended) throw new Error('the shared system connection was released when its shareSystemConnection ended')
  const turn = shared.tail.then(() => {
    if (shared.failure) throw shared.failure
    return sharedConnection.run({ shared, inside: true }, () => transaction(shared.db, context, fn))
  })
  shared.tail = turn.catch(() => {})
  return turn
}

/** Runs `fn` in another transaction with the same login, connection pool and context as the one that committed. */
export type InSameContext = <T>(fn: (tx: Tx) => Promise<T>) => Promise<T>
type CommitHook = (inSameContext: InSameContext) => Promise<void>
const commitHooks = new WeakMap<object, CommitHook[]>()

/**
 * Runs `hook` once the transaction `tx` belongs to commits (never on rollback), for §1 writes with an effect outside
 * Postgres, such as emitEvent's publish. The commit already happened, so a failing hook is logged, never thrown.
 */
export function afterCommit(tx: Tx<Principal | null>, hook: CommitHook) {
  const hooks = commitHooks.get(tx)
  if (!hooks) throw new Error('afterCommit needs a transaction from a with* helper')
  hooks.push(hook)
}

/** A SQL savepoint with its own event buffer identity and commit hooks. Failed children release no effects. */
export async function withSavepoint<T>(handle: TxHandle, fn: (tx: Tx) => Promise<T>): Promise<T> {
  const parent = handle as Tx
  const parentHooks = commitHooks.get(parent)
  if (!parentHooks) throw new Error('withSavepoint needs a transaction from a with* helper')
  const hooks: CommitHook[] = []
  const result = await parent.transaction(async (nested) => {
    const child = Object.assign(nested, { principal: parent.principal, orgId: parent.orgId }) as Tx
    commitHooks.set(child, hooks)
    try {
      return await fn(child)
    } finally {
      commitHooks.delete(child)
    }
  })
  parentHooks.push(...hooks)
  return result
}

async function transaction<T, P extends Principal | null>(
  db: NodePgDatabase<Schema>,
  context: { principal: P; orgId: string | null; setRole?: 'public_reader' },
  fn: (tx: Tx<P>) => Promise<T>
): Promise<T> {
  const { principal, orgId, setRole } = context
  const hooks: CommitHook[] = []
  const result = await db.transaction(async (tx) => {
    commitHooks.set(tx, hooks)
    if (setRole) await tx.execute(sql.raw(`SET LOCAL ROLE ${setRole}`))
    if (orgId !== null && principal) {
      const accountId = 'accountId' in principal ? principal.accountId : ''
      const role = 'role' in principal ? (principal.role ?? '') : ''
      await tx.execute(
        sql`SELECT set_config('app.org_id', ${orgId}, true), set_config('app.account_id', ${accountId}, true),
          set_config('app.role', ${role}, true)`
      )
    }
    return fn(Object.assign(tx, { principal, orgId }) as unknown as Tx<P>)
  })
  const inSameContext: InSameContext = (next) =>
    transaction(db, context as { principal: Principal; orgId: string | null }, next)
  for (const hook of hooks) {
    await hook(inSameContext).catch((error: unknown) => log.error('after-commit hook failed', { error: String(error) }))
  }
  return result
}

/**
 * One transaction scoped to `orgId` (TRD tenancy enforcement): it `SET LOCAL`s `app.org_id`, `app.account_id` and
 * `app.role` (empty when the principal has no account or role), so every T table shows only that organisation's rows.
 * Runs on the `system` login for a system principal (a worker iterating organisations), else on `app`.
 */
export function withTenant<T>(ctx: { orgId: string; principal: Principal }, fn: (tx: Tx) => Promise<T>) {
  return run(ctx.principal.kind === 'system' ? 'SYSTEM' : 'APP', ctx, fn)
}

/** The principal of a worker job or script, `job` naming it in audit rows (#79 §1). */
export const systemPrincipal = (job: string): SystemPrincipal => ({
  kind: 'system',
  job,
  client: 'worker',
  clientName: null
})

/**
 * One transaction on the `system` login with no organisation set: S and G tables, and `project` and `project_pack`
 * read-only across organisations, so a worker lists its targets and returns them, then calls `withTenant` per
 * organisation with a system principal. T tables show no rows here.
 */
export function withSystem<T>(job: string, fn: (tx: Tx<SystemPrincipal>) => Promise<T>) {
  return run('SYSTEM', { principal: systemPrincipal(job), orgId: null }, fn)
}

/** One transaction as `public_reader` on the `app` login: only the `public_*` views and G tables. */
export function withPublicReader<T>(fn: (tx: Tx<null>) => Promise<T>) {
  return run('APP', { principal: null, orgId: null, setRole: 'public_reader' }, fn)
}

/**
 * One transaction on the `retention` login (retention sweeps and erasure, #112): the only role that may update or
 * delete append-only rows, and it sees every organisation's rows in T tables.
 */
export function withRetention<T>(job: string, fn: (tx: Tx<SystemPrincipal>) => Promise<T>) {
  return run('RETENTION', { principal: systemPrincipal(job), orgId: null }, fn)
}
