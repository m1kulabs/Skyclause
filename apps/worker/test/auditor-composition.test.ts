import { spawnSync } from 'node:child_process'
import { expect, test } from 'vitest'
import { registry } from '../src/registry'
import { auditChecks } from '../src/auditor'

test('actual registry contains only the batch auditor and registers no checks', () => {
  expect(registry.batch.auditor).toBeTypeOf('function')
  expect(registry.ticks).not.toHaveProperty('auditor')
  expect(auditChecks()).toEqual([])
  expect(registry.jobs['grade-sky']).toBeTypeOf('function')
  expect(registry.jobs['grade-crowd']).toBeTypeOf('function')
  expect(registry.events.some(({ consumer }) => consumer === 'plan-feedback')).toBe(true)
})

test('cold importing the registry opens no network connections and needs no credentials', () => {
  const entry = new URL('../src/registry.ts', import.meta.url).pathname
  const result = spawnSync(
    'bun',
    [
      '--eval',
      `
    const net = await import('node:net');
    net.Socket.prototype.connect = () => { throw new Error('import opened a socket') };
    globalThis.fetch = () => { throw new Error('import called fetch') };
    await import(${JSON.stringify(entry)});
  `
    ],
    { env: { PATH: process.env.PATH }, encoding: 'utf8' }
  )
  expect(result.stderr).toBe('')
  expect(result.status).toBe(0)
})
