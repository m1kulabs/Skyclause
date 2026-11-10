import type { TxHandle } from '@skyclause/contracts'
import { sql, type SQL } from 'drizzle-orm'
import { NodePgTransaction } from 'drizzle-orm/node-postgres'
import { PgDialect, PgSession, type PgPreparedQuery, type PreparedQueryConfig } from 'drizzle-orm/pg-core'
import type { Tx } from '../client'

type Session = Tx['_']['session']

/**
 * Runs a check with a revocable SQL lease. All builders, prepared queries and savepoints share its serial queue.
 * On every exit, revoke first and drain SQL before the outer transaction may commit/rollback and reuse its client.
 * JavaScript CPU loops and third-party promises cannot be interrupted by this database lease.
 */
export async function runAuditCheck<T>(tx: Tx, run: (scoped: TxHandle) => Promise<T>, timeoutMs = 20_000): Promise<T> {
  if (!Number.isFinite(timeoutMs) || timeoutMs <= 0) throw new Error('audit deadline must be positive')
  const previous = (await tx.execute<{ statement_timeout: string }>(sql`SHOW statement_timeout`)).rows[0]!
    .statement_timeout
  const deadline = performance.now() + timeoutMs
  const expired = new Error('audit check deadline exceeded')
  const revoked = new Error('audit check scope is closed')
  let closed = false
  let failure: unknown
  let failed = false
  let tail: Promise<void> = Promise.resolve()
  const assertOpen = () => {
    if (failed) throw failure
    if (performance.now() >= deadline) throw expired
    if (closed) throw revoked
  }
  function enqueue<R>(execute: () => Promise<R>): Promise<R> {
    const result = tail.then(async () => {
      assertOpen()
      try {
        const remaining = Math.max(1, Math.ceil(deadline - performance.now()))
        await tx.execute(sql`SELECT set_config('statement_timeout', ${String(remaining)}, true)`)
        assertOpen()
        return await execute()
      } catch (error) {
        if (!failed) {
          failed = true
          failure = error
        }
        throw error
      }
    })
    // Handle detached rejections as well as queued ones; drain waits on the entire admitted queue.
    tail = result.then(
      () => {},
      () => {}
    )
    return result
  }
  const dialect = new PgDialect()
  const original = tx._.session
  class ScopedSession extends PgSession {
    prepareQuery<P extends PreparedQueryConfig = PreparedQueryConfig>(
      ...args: Parameters<Session['prepareQuery']>
    ): PgPreparedQuery<P> {
      const prepared = original.prepareQuery(...args)
      const guarded = new Proxy(prepared, {
        get(target, property, receiver) {
          const value: unknown = Reflect.get(target, property, receiver)
          if (typeof value !== 'function') return value
          if (property === 'execute' || property === 'all') {
            return (...parameters: unknown[]) => enqueue(() => Reflect.apply(value, target, parameters))
          }
          return (...parameters: unknown[]) => {
            const result: unknown = Reflect.apply(value, target, parameters)
            return result === target ? guarded : result
          }
        }
      })
      return guarded as PgPreparedQuery<P>
    }
    override async count(query: SQL): Promise<number> {
      const result = await this.execute<{ rows: Array<{ count: string }> }>(query)
      return Number(result.rows[0]!.count)
    }
    transaction<R>(
      callback: (nested: NodePgTransaction<Record<string, never>, Record<string, never>>) => Promise<R>
    ): Promise<R> {
      return new NodePgTransaction<Record<string, never>, Record<string, never>>(dialect, this, undefined).transaction(
        callback
      )
    }
  }
  const scoped = Object.assign(
    new NodePgTransaction(dialect, new ScopedSession(dialect), {
      fullSchema: tx._.fullSchema,
      schema: tx._.schema!,
      tableNamesMap: tx._.tableNamesMap
    }),
    { principal: tx.principal, orgId: tx.orgId }
  ) as unknown as Tx
  let timer!: ReturnType<typeof setTimeout>
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => {
      closed = true
      reject(expired)
    }, timeoutMs)
  })
  try {
    // The callback may outlive this race, but its SQL scope cannot. Promise.race observes its late rejection.
    const result = await Promise.race([Promise.resolve().then(() => run(scoped)), timeout])
    closed = true
    await tail
    if (failed) throw failure
    if (performance.now() >= deadline) throw expired
    await tx.execute(sql`SELECT set_config('statement_timeout', ${previous}, true)`)
    return result
  } finally {
    closed = true
    clearTimeout(timer)
    await tail
  }
}
