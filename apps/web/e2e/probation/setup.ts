import type { Page } from '@playwright/test'
import type { Principal } from '@skyclause/contracts'
import { expect } from '../fixtures'
import { asPage } from '../harness/as-page'
import { E2E_FRAMES_BUCKET } from '../harness/env'
import { stubApi } from '../harness/stub-api'
import { probationOperations } from '../../features/probation/operations'

export const orgId = 'test-org'
export const projectId = 'bukit-jalil'
export const sourceId = 'camera-1'
/** Where frame URLs point: the frames bucket the app's CSP allows (e2e/harness/env.ts). */
export const framesBase = `https://storage.googleapis.com/${E2E_FRAMES_BUCKET}/`

export const member: Extract<Principal, { kind: 'session' }> = {
  kind: 'session',
  via: 'cookie',
  accountId: 'account-test',
  sessionId: 'session-test',
  isGuest: false,
  staff: false,
  orgId,
  role: 'admin',
  authenticatedAt: new Date('2026-11-06T01:00:00Z'),
  client: 'app',
  clientName: null
}

export const labellerOne = 'account-labeller-one'
export const labellerTwo = 'account-labeller-two'

export const members = [
  {
    id: 'member-1',
    org_id: orgId,
    account_id: labellerOne,
    role: 'editor',
    reads_malay: true,
    name: 'Amina Labeller',
    email: 'amina@example.com',
    last_active_at: null,
    sign_in_methods: ['magic_link']
  },
  {
    id: 'member-2',
    org_id: orgId,
    account_id: labellerTwo,
    role: 'editor',
    reads_malay: false,
    name: 'Bala Labeller',
    email: 'bala@example.com',
    last_active_at: null,
    sign_in_methods: ['magic_link']
  },
  {
    id: 'member-3',
    org_id: orgId,
    account_id: 'account-test',
    role: 'admin',
    reads_malay: false,
    name: 'Citra Admin',
    email: 'citra@example.com',
    last_active_at: null,
    sign_in_methods: ['magic_link']
  }
]

export function probationUrl(view: string): string {
  return `/${orgId}/${projectId}/signals/probation/${sourceId}?view=${view}`
}

export interface FrameFixture {
  frame_reading_id: string
  observed_at: string
  frame_url: string
  phone_obscured: boolean
}

export function frameFixture(id: string, observedAt = '2026-11-06T01:15:00Z'): FrameFixture {
  return {
    frame_reading_id: id,
    observed_at: observedAt,
    frame_url: `${framesBase}${id}.svg`,
    // Adversarial: the phone flag is served but must never reach the DOM.
    phone_obscured: true
  }
}

export interface StatusFixture {
  source_id: string
  probation: boolean
  labeller_ids: string[]
  n: number
  obscured_frames: number
  agreement: number | null
}

export function statusFixture(overrides: Partial<StatusFixture> = {}): StatusFixture {
  return {
    source_id: sourceId,
    probation: true,
    labeller_ids: [labellerOne, labellerTwo],
    n: 0,
    obscured_frames: 0,
    agreement: null,
    ...overrides
  }
}

const frameImage = (id: string) =>
  `<svg xmlns="http://www.w3.org/2000/svg" width="640" height="360"><rect width="640" height="360" fill="#223"/><text x="20" y="40" fill="#fff">${id}</text></svg>`

/** Stub the frame bytes behind every frame_url the test serves. */
export async function stubFrameImages(page: Page): Promise<void> {
  await page.route(`${framesBase}*.svg`, (route) => {
    const id = new URL(route.request().url()).pathname.split('/').pop()?.replace('.svg', '') ?? 'frame'
    return route.fulfill({ contentType: 'image/svg+xml', body: frameImage(id) })
  })
}

/** Serve `frames` in order from `getNextProbationFrame`, then `after` for every later call. */
export async function stubNextSequence(page: Page, frames: FrameFixture[], after: 'empty' | FrameFixture = 'empty') {
  let calls = 0
  await page.route('**/api/sources/*/probation/next*', async (route) => {
    expect(route.request().method()).toBe('GET')
    expect(route.request().headers()['skyclause-organization']).toBe(orgId)
    calls += 1
    const frame = calls <= frames.length ? frames[calls - 1]! : after === 'empty' ? undefined : after
    if (!frame) return route.fulfill({ status: 204 })
    return route.fulfill({
      json: probationOperations.getNextProbationFrame.response.parse(frame)
    })
  })
  return () => calls
}

export async function prepare(page: Page, principal: Principal = member) {
  await asPage(page, principal)
  await stubFrameImages(page)
  await stubApi(page, 'listMembers', { data: members, next_cursor: null }, { registry: probationOperations })
}
