// #372: a bundle double as rows in Playwright's scratch database (#94), written through #92's factories, so the Next
// server's own read renders it. The client's reads still go to `stubReads`, answered with the same double under the
// rows' IDs, so its refresh paints the same review. (Playwright's loader can't import `@skyclause/api`'s services: their
// graph imports catalogue JSON without an import attribute.) Test rows only (NFR-15); the database is dropped after.
import { randomUUID } from 'node:crypto'
import { inOrg } from '@skyclause/auth/testing'
import type { InputValue } from '@skyclause/contracts'
import {
  makeBundle,
  makeCall,
  makeClauseSheet,
  makeNotice,
  makeProject,
  makeRun,
  makeRunStep,
  makeSheetVersion,
  makeSubscriber,
  makeWindow
} from '@skyclause/db/test/factories/index'
import type { BundleView, CallDetail } from '../../features/bundles/operations'
import type { TestOrg } from '../harness/sign-in-as'
import { callDouble } from './doubles'

const at = (instant: string | null) => (instant ? new Date(instant) : null)

export interface SeededReview {
  /** The bundle page's path in the seeded organisation and project. */
  path: string
  bundle: BundleView
  calls: CallDetail[]
}

/**
 * Writes `double` and its calls (as `callDouble` details) in a new project of `org`; each recipient becomes a subscriber
 * and each delivery a queued notice to it. Returns the double as stored, under the rows' IDs.
 */
export function seedReview(org: TestOrg, double: BundleView): Promise<SeededReview> {
  // Stored inputs name their readings by ID, which getCallExplanation looks MET warnings up by: give each a UUID.
  const readingIds = new Map<string, string>()
  const read = (input: InputValue): InputValue => ({
    ...input,
    reading_ids: input.reading_ids.map((id) => readingIds.get(id) ?? readingIds.set(id, randomUUID()).get(id)!)
  })
  const details = double.calls.map((call) => {
    const detail = callDouble(call.id, call)
    return {
      ...detail,
      inputs: detail.inputs.map(read),
      clauses: detail.clauses.map((clause) => ({ ...clause, inputs: clause.inputs.map(read) })),
      trace: detail.trace.map((step) => ({ ...step, inputs: step.inputs.map(read) }))
    }
  })
  return inOrg(org.id, async (tx) => {
    const project = await makeProject(tx)
    // A call's recipients are subscriber IDs; each double recipient is a subscriber in its delivery's language.
    const subscribers = new Map<string, string>()
    for (const { recipient_id: email, language } of details.flatMap((d) => d.deliveries))
      if (!subscribers.has(email))
        subscribers.set(email, (await makeSubscriber(tx, { projectId: project.id, email, language })).id)
    for (const email of details.flatMap((d) => d.recipients))
      if (!subscribers.has(email))
        subscribers.set(email, (await makeSubscriber(tx, { projectId: project.id, email })).id)
    const subscriberOf = (email: string) => subscribers.get(email)!
    const sheet = await makeClauseSheet(tx, { projectId: project.id, pack: double.pack })
    // The pinned sheet version holds each explained clause's CEL and wording (getCallExplanation joins them).
    const clauses = new Map(
      details.flatMap((d) => d.clauses).map((c) => [c.key, { key: c.key, when: c.cel, wording: c.wording }])
    )
    const version = await makeSheetVersion(tx, {
      sheetId: sheet.id,
      status: 'published',
      publishedAt: new Date(double.triggered_at),
      content: { clauses: [...clauses.values()] }
    })
    const run = await makeRun(tx, {
      projectId: project.id,
      pack: double.pack,
      trigger: double.trigger,
      status: 'drafted',
      sheetVersionId: version.id,
      triggeredAt: new Date(double.triggered_at)
    })
    // A run's steps are every call's trace.
    const steps = new Map(details.flatMap((d) => d.trace).map((step) => [step.step, step]))
    for (const step of steps.values()) {
      const startedAt = new Date(double.triggered_at)
      await makeRunStep(tx, {
        runId: run.id,
        step: step.step,
        status: 'done',
        output: { detail: step.detail, inputs: step.inputs },
        startedAt,
        finishedAt: new Date(startedAt.getTime() + step.duration_ms)
      })
    }
    const bundle = await makeBundle(tx, {
      runId: run.id,
      state: double.state,
      reviewHash: double.review_hash,
      slaDueAt: at(double.sla_due_at),
      needsReviewAt: at(double.needs_review_at),
      draftOnly: double.draft_only
    })
    const calls: CallDetail[] = []
    for (const detail of details) {
      const window = detail.window
        ? await makeWindow(tx, {
            projectId: project.id,
            startsAt: new Date(detail.window.starts_at),
            endsAt: new Date(detail.window.ends_at),
            title: detail.window.title,
            kind: detail.window.kind,
            tz: detail.window.tz,
            declaredBy: detail.window.declared_by,
            guest: detail.window.guest,
            via: detail.window.via
          })
        : undefined
      const row = await makeCall(tx, {
        bundleId: bundle.id,
        windowId: window?.id ?? null,
        mode: detail.mode,
        watch: detail.watch,
        noCall: detail.no_call,
        fired: detail.fired,
        recommendations: detail.recommendations,
        recipients: detail.recipients.map(subscriberOf),
        notices: detail.notices,
        reason: detail.reason,
        state: detail.state,
        // The stored verdict carries each clause's result and inputs; the sheet version adds CEL and wording.
        shadow: {
          ...detail.shadow,
          scope: { kind: 'window', id: window?.id ?? null },
          clauses: detail.clauses.map(({ key, result, blocked_by, inputs }) => ({ key, result, blocked_by, inputs }))
        },
        chosen: detail.chosen,
        agrees: detail.agrees,
        decision: detail.decision,
        expiresAt: new Date(detail.expires_at),
        triggeredAt: new Date(detail.triggered_at),
        draftedAt: new Date(detail.drafted_at)
      })
      for (const delivery of detail.deliveries)
        await makeNotice(tx, {
          projectId: project.id,
          callId: row.id,
          subscriberId: subscriberOf(delivery.recipient_id),
          language: delivery.language,
          status: delivery.status,
          acceptedAt: delivery.accepted_at ? new Date(delivery.accepted_at) : null
        })
      calls.push({
        ...detail,
        id: row.id,
        call_id: row.id,
        bundle_id: bundle.id,
        project_id: project.id,
        window_id: window?.id ?? null,
        window: window && detail.window ? { ...detail.window, id: window.id, project_id: project.id } : null,
        recipients: detail.recipients.map(subscriberOf),
        deliveries: detail.deliveries.map((d) => ({ ...d, recipient_id: subscriberOf(d.recipient_id) })),
        sheet_version_id: version.id,
        permalink: new URL(`/c/${row.id}`, process.env.APP_ORIGIN).toString()
      })
    }
    const view: BundleView = {
      ...double,
      id: bundle.id,
      project_id: project.id,
      run_id: run.id,
      sheet_version_id: version.id,
      calls: double.calls.map((call, index) => {
        const { id, bundle_id, window_id } = calls[index]!
        return { ...call, id, bundle_id, window_id, recipients: call.recipients.map(subscriberOf) }
      })
    }
    return { path: `/${org.slug}/${project.slug}/bundles/${bundle.id}`, bundle: view, calls }
  })
}
