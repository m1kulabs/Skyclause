// #194's ephemeral stack as a test drives it: a signed-in creator, rows made through the product's own routes (never
// seeded, `db:seed-check`), and the worker harness (apps/worker/test/flow/server.ts) run at the suite's fake clock. Its
// organisations and projects exist only in this run's scratch database (NFR-15).
import { randomUUID } from 'node:crypto'
import { expect, type APIRequestContext, type APIResponse, type Page } from '@playwright/test'
import { makeAccount, signIn } from '@skyclause/auth/testing'

/** Signs `page` in as a new account with no membership yet: what `signInAs` does, before any organisation exists. */
export async function signInCreator(page: Page) {
  const account = await makeAccount()
  const { cookies } = await signIn(account.id)
  await page.context().addCookies(cookies)
  return account
}

/** A write as the app's own pages send it: a cookie write must come from APP_ORIGIN (spec §4). */
const write = (page: Page, path: string, data?: object, headers: Record<string, string> = {}) =>
  page.request.post(path, { headers: { ...headers, Origin: process.env.APP_ORIGIN! }, data })

async function body<T>(response: APIResponse, status: number): Promise<T> {
  expect(response.status(), await response.text()).toBe(status)
  return (await response.json()) as T
}

const slug = (prefix: string) => `${prefix}-${randomUUID().slice(0, 8)}`
const once = () => ({ 'Idempotency-Key': randomUUID() })

export interface Org {
  id: string
  slug: string
}

export async function createOrg(page: Page): Promise<Org> {
  const name = slug('flow')
  return body(await write(page, '/api/orgs', { name, slug: name }, once()), 201)
}

/** A Sky project at APU, Bukit Jalil, the 2 November 2026 replay's site. */
export async function createSkyProject(page: Page, org: Org): Promise<{ id: string }> {
  const name = slug('sky')
  const project = {
    name,
    slug: name,
    site_name: 'APU, Bukit Jalil',
    site_lat: 3.0553,
    site_lon: 101.7006,
    packs: ['sky']
  }
  return body(await write(page, `/api/orgs/${org.slug}/projects`, project, once()), 201)
}

export async function archiveProject(page: Page, org: Org, projectId: string) {
  await body(
    await write(page, `/api/projects/${projectId}/archive`, undefined, { 'Skyclause-Organization': org.slug }),
    200
  )
}

/** Starts the organisation's deletion grace period, which suspends its projects (`projectGate`). */
export async function requestDeletion(page: Page, org: Org) {
  await body(await write(page, `/api/orgs/${org.slug}/deletion`, { slug: org.slug }), 202)
}

/** `POST /v1/projects/{id}/runs` ("Ask for a call") for the Sky pack. */
export function askForCall(page: Page, org: Org, projectId: string) {
  return write(
    page,
    `/v1/projects/${projectId}/runs`,
    { pack: 'sky' },
    { ...once(), 'Skyclause-Organization': org.slug }
  )
}

export async function listRuns(page: Page, org: Org, projectId: string) {
  const runs = await body<{ data: Array<{ id: string; trigger: string; status: string }> }>(
    await page.request.get(`/v1/projects/${projectId}/runs`, { headers: { 'Skyclause-Organization': org.slug } }),
    200
  )
  return runs.data
}

const worker = () => `http://127.0.0.1:${process.env.E2E_WORKER_PORT}`

/** Runs the worker's registered 15-minute batch handler `name` at `now` on the fake clock. */
export async function batch(request: APIRequestContext, name: string, now: Date) {
  const response = await request.post(`${worker()}/batch/${name}`, { data: { now: now.toISOString() } })
  expect(response.status(), await response.text()).toBe(204)
}
