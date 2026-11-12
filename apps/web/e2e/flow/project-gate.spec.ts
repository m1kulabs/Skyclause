// #194, PRJ-8 (`projectGate`, #79 §1): an archived project, and a suspended one (its organisation's deletion requested),
// start no run, whether asked for a call or reached by the worker's Sky schedule; an open project in the same stack
// does, so each refusal is the gate's. Sending no notice and dispatching no webhook wait on windows (#139) and
// webhooks (#193).
import { expect, test, type Page } from '@playwright/test'
import {
  archiveProject,
  askForCall,
  batch,
  createOrg,
  createSkyProject,
  listRuns,
  requestDeletion,
  signInCreator,
  type Org
} from './stack'

/** Monday 2 November 2026, 06:45 MYT: CAL-1's default Sky schedule slot, as the fake clock. */
const SCHEDULE_SLOT = new Date('2026-11-02T06:45:00+08:00')

/**
 * One open, one archived and one suspended Sky project, each made through the product's routes. Each test makes its
 * own: `requestRun` folds any trigger into a project's queued run, so a project asked for a call would take the
 * schedule's trigger into that run and show no `schedule` run.
 */
async function gatedProjects(page: Page) {
  await signInCreator(page)
  const org = await createOrg(page)
  const open = await createSkyProject(page, org)
  const archived = await createSkyProject(page, org)
  await archiveProject(page, org, archived.id)
  const closing = await createOrg(page)
  const suspended = await createSkyProject(page, closing)
  await requestDeletion(page, closing)
  return { open: { org, ...open }, archived: { org, ...archived }, suspended: { org: closing, ...suspended } }
}

const runsOf = (page: Page, p: { org: Org; id: string }) => listRuns(page, p.org, p.id)

test('PRJ-8: asking for a call starts a run only in an open project', async ({ page }) => {
  const { open, archived, suspended } = await gatedProjects(page)

  expect((await askForCall(page, open.org, open.id)).status()).toBe(202)
  for (const [gate, p] of [
    ['archived', archived],
    ['suspended', suspended]
  ] as const) {
    const refused = await askForCall(page, p.org, p.id)
    expect(refused.status()).toBe(422)
    expect((await refused.json()).detail).toBe(`The project is ${gate}, so it starts no runs.`)
  }

  expect(await runsOf(page, open)).toMatchObject([{ trigger: 'request', status: 'queued' }])
  expect(await runsOf(page, archived)).toEqual([])
  expect(await runsOf(page, suspended)).toEqual([])
})

test('PRJ-8: the Sky schedule on the fake clock starts a run only in an open project', async ({ page }) => {
  const { open, archived, suspended } = await gatedProjects(page)

  // The schedule never lists an archived project; a suspended one reaches `requestRun`, whose gate refuses it.
  await batch(page.request, 'runs-sky-schedule', SCHEDULE_SLOT)

  expect(await runsOf(page, open)).toMatchObject([{ trigger: 'schedule', trigger_ref: '06:45', status: 'queued' }])
  expect(await runsOf(page, archived)).toEqual([])
  expect(await runsOf(page, suspended)).toEqual([])
})
