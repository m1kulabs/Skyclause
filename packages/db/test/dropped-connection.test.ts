import { sql } from 'drizzle-orm'
import { afterEach, beforeEach, expect, test } from 'vitest'
import type { Principal } from '@skyclause/contracts'
import { shareSystemConnection, withSystem, type Tx } from '../src'
import { asLogin } from './harness'

// A backend that goes away while its client is checked out (a Neon compute restart, a network drop) fails the call
// using it, and nothing else: an error with no listener on the client would be an uncaught exception, and crash the app.

const pid = async (tx: Tx<Principal | null>) =>
  Number((await tx.execute<{ pid: number }>(sql`SELECT pg_backend_pid() AS pid`)).rows[0]!.pid)

/** Ends a backend as the server would, waiting until it has exited. */
const terminate = (backend: number) =>
  asLogin('postgres', (client) => client.query('SELECT pg_terminate_backend($1, 5000)', [backend]))

let uncaught: unknown[] = []
const recordUncaught = (error: unknown) => uncaught.push(error)
beforeEach(() => {
  uncaught = []
  process.on('uncaughtException', recordUncaught)
})
afterEach(() => {
  process.off('uncaughtException', recordUncaught)
})

test('a backend terminated during a withSystem transaction rejects the call without an uncaught exception', async () => {
  let started!: (backend: number) => void
  const backend = new Promise<number>((resolve) => (started = resolve))
  const rejection = expect(
    withSystem('batch', async (tx) => {
      started(await pid(tx))
      await tx.execute(sql`SELECT pg_sleep(5)`)
    })
  ).rejects.toThrow()
  await terminate(await backend)
  await rejection
  const next = await withSystem('batch', pid)
  expect(next).not.toBe(await backend)
  expect(uncaught.map(String)).toEqual([])
})

test('a shared backend terminated between turns rejects the next call without an uncaught exception', async () => {
  let backend = 0
  await expect(
    shareSystemConnection(async () => {
      backend = await withSystem('batch', pid)
      await terminate(backend)
      return withSystem('batch', pid)
    })
  ).rejects.toThrow()
  const next = await withSystem('batch', pid)
  expect(next).not.toBe(backend)
  expect(uncaught.map(String)).toEqual([])
})
