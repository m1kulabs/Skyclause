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

/** The pool for a login, made on first use from `DATABASE_URL_<login>`. */
export function connection(login: Login) {
  const name = `DATABASE_URL_${login}`
  const url = process.env[name]
  if (!url) throw new Error(`${name} is not set`)
  let found = connections.get(url)
  if (!found) {
    // D45: nothing holds an idle connection, so a sleeping Neon compute stays asleep.
    const pool = new pg.Pool({ connectionString: url, idleTimeoutMillis: 5_000, allowExitOnIdle: true })
    // An idle client that errors (the server ended it) leaves the pool, and the next query connects again; without a
    // listener the error would crash the process.
    pool.on('error', (error) => log.warn('idle database connection failed', { login, error: String(error) }))
    found = { pool, db: drizzle(pool, { schema }) }
    connections.set(url, found)
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
  /** Set once `fn` has settled and the connection is back in the pool. */
  released: boolean
}
const sharedConnection = new AsyncLocalStorage<{ shared: Shared; inside: boolean }>()

/**
 * Runs `fn` with one `system` connection that every `withSystem`, and `withTenant` for a system principal, inside it
 * share, one transaction at a time; it goes back to the pool when `fn` settles. For a batch run whose handlers must share
 * one connection (D45, #235). On it, call `withTenant` after `withSystem` returns, not inside its callback: a nested
 * call would need a second connection, so it throws, as does a call made after `fn` settles.
 */
export async function shareSystemConnection<T>(fn: () => Promise<T>): Promise<T> {
  const client = await connection('SYSTEM').pool.connect()
  const shared: Shared = { db: drizzle(client, { schema }), tail: Promise.resolve(), released: false }
  try {
    return await sharedConnection.run({ shared, inside: false }, fn)
  } finally {
    await shared.tail
    shared.released = true
    client.release()
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
  if (shared.released) throw new Error('the shared system connection was released when its shareSystemConnection ended')
  if (inside) throw new Error('a with* call inside another on the shared system connection needs a second connection')
  const turn = shared.tail.then(() =>
    sharedConnection.run({ shared, inside: true }, () => transaction(shared.db, context, fn))
  )
  shared.tail = turn.catch(() => {})
  return turn
}

/** Runs `fn` in another transaction with the same login, connection pool and context as the one that committed. */
export type Again = <T>(fn: (tx: Tx) => Promise<T>) => Promise<T>
type CommitHook = (again: Again) => Promise<void>
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
  const again: Again = (next) => transaction(db, context as { principal: Principal; orgId: string | null }, next)
  for (const hook of hooks) {
    await hook(again).catch((error: unknown) => log.error('after-commit hook failed', { error: String(error) }))
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

const system = (job: string): SystemPrincipal => ({ kind: 'system', job, client: 'worker', clientName: null })

/**
 * One transaction on the `system` login with no organisation set: S and G tables, and `project` and `project_pack`
 * read-only across organisations, so a worker lists its targets and returns them, then calls `withTenant` per
 * organisation with a system principal. T tables show no rows here.
 */
export function withSystem<T>(job: string, fn: (tx: Tx<SystemPrincipal>) => Promise<T>) {
  return run('SYSTEM', { principal: system(job), orgId: null }, fn)
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
  return run('RETENTION', { principal: system(job), orgId: null }, fn)
}
