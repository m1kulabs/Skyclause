import { afterEach, expect, test, vi } from 'vitest'

const published = vi.hoisted(() => [] as string[])
vi.mock('@skyclause/config', () => ({
  startTelemetry: () => {},
  loadEnv: () => ({ GCP_PROJECT: process.env.GCP_PROJECT }),
  pubsubPublisher: (project: string, topic: string) => {
    published.push(`${project}/${topic}`)
    return async () => {}
  }
}))

const { startServer } = await import('../lib/start')
const { runPublisher, setRunPublisher, setEventPublisher } = await import('@skyclause/db')

afterEach(() => {
  vi.unstubAllEnvs()
  published.length = 0
  setRunPublisher(null)
  setEventPublisher(null)
})

test('the web publishes requested runs to runs-requested at commit, beside domain events', () => {
  vi.stubEnv('GCP_PROJECT', 'skyclause')
  startServer()
  expect(published).toEqual(['skyclause/domain-events', 'skyclause/runs-requested'])
  expect(runPublisher()).not.toBeNull()
})

test('without GCP_PROJECT nothing is published, and the batch republishes queued runs', () => {
  vi.stubEnv('GCP_PROJECT', '')
  startServer()
  expect(published).toEqual([])
  expect(runPublisher()).toBeNull()
})
