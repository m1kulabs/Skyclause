# Remaining window lifecycle proposal

Read-only planning for [#139](https://github.com/m1kulabs/Skyclause/issues/139), against `f69fee4ff98acdb41e277af6958079ea9e2c7073` on 13 November 2026. This proposal implements the agreed ownership split: AlaskanTuna owns single-window list/create; our work covers series, edit/cancel, imported calendars and due checks. Frontend and Apps Script are outside this work.

Contents:

1.  [Recommendation](#recommendation)
1.  [Verified seams and gaps](#verified-seams-and-gaps)
1.  [Decisions for the parent](#decisions-for-the-parent)
1.  [Contract work](#contract-work)
1.  [Execution dependencies](#execution-dependencies)

## Recommendation

Use the existing contracts, tenant transactions, event bus, ledger, guarded HTTP transport and 15-minute worker batch. Promote the already locked `ical.js` `2.2.1` dependency to production in `packages/api`; add no calendar framework or scheduler. First build pure recurrence/parser modules and their tests independently of the teammate's routes. Integrate only after their actual service helpers are published. The [design](/docs/superpowers/specs/2026-11-13-window-lifecycle-design.md) and [implementation plan](/docs/superpowers/plans/2026-11-13-window-lifecycle.md) describe this option.

Alternatives considered: placing another calendar engine in a new package adds a package boundary for one domain; implementing ICS syntax ourselves violates the maintained-parser requirement. Neither solves the missing persistence identity or immutable event revision. The recommended option is the smallest one that handles those problems durably.

## Verified seams and gaps

| Current file                                                                        | What exists; implication                                                                                                                                                                                                      |
| ----------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `packages/contracts/src/api/v1/windows.ts`                                          | All window operations; recurrence uses `until`, not `until_date`. Request objects currently strip unknown fields. Exactly one recurrence bound and real calendar dates are not enforced.                                      |
| `packages/contracts/src/api/v1/ics-feeds.ts`                                        | List/create/delete feed; no `getIcsFeed`. Strict URL-or-file request has no `kind`.                                                                                                                                           |
| `packages/contracts/src/api/shared.ts:198`                                          | Feed only exposes ID/project/URL/optional filename; no skipped events or refresh status.                                                                                                                                      |
| `packages/db/src/schema/windows.ts`                                                 | Series has rule/local times/materialised-until; no durable template/anchor, exception marker, stop state or daily-check state. Feed lacks occurrence identity, retained recurrence source, failure state and due-check claim. |
| `packages/db/src/ledger/append.ts`                                                  | Real, transaction-scoped `appendLedger`, hash chain and email rejection; use it directly.                                                                                                                                     |
| `packages/config/src/net.ts`                                                        | Real `assertPublicUrl` and `safeFetch`, DNS pinning and every-hop redirect checks. Explicitly set HTTPS, 3 redirects, 10 seconds and 5 MiB instead of relying on differing defaults.                                          |
| `packages/db/src/runs/clock.ts`, `bundles/repository.ts:632`, `evidence/inbound.ts` | PostgreSQL zone conversion and local clock helpers exist. Reuse their SQL pattern inside DB; do not add a timezone package or add 24 hours to a local midnight across DST.                                                    |
| `packages/db/src/placeholders/d-guest-rules.ts`, API equivalent                     | `budgetGate` is still `notBuilt`. No `applyGuestWindowPolicy` implementation or typed port exists. These are real prerequisites, not permission to wire a stub into new runtime code.                                         |
| `apps/worker/src/runs/consumers.ts`                                                 | ICS run keys read mutable feed metadata at event delivery. Separate window events only merge while a run remains queued. Delayed events and early run claims need immutable revision plus the complete changed-window set.    |
| `packages/api/package.json`, `apps/worker/package.json`, `bun.lock`                 | `ical.js` `2.2.1` already pinned as test dependency. No new parser selection is needed.                                                                                                                                       |

The teammate branch `feat/windows-list-create` returned 404 on the single canonical-repository check. There is no verified helper signature to copy yet. The parent issue has the ownership split recorded. The initial pinned graph query located the contracts, schema and existing conditions-calendar code; subsequent reads were scoped to those paths and their ports.

## Decisions for the parent

The parent settles these decisions under the user's existing execution authorization. Their reasons and costs are recorded in the task ledger. Count-before-skips, preservation of started series history, normalized ICS storage, bounded expansion, pending URL registration and one representative calendar event are accepted.

1.  **Recurrence count:** use occurrence count before skips (`count: 12`, one skipped date yields 11), with inclusive `until`. The alternative, number of weeks, conflicts with ordinary recurrence count semantics and would need another field. Keep the existing wire name `until`; explain `until_date` in the ticket as acceptance prose.
1.  **Whole-series edit:** edit all not-yet-started occurrences and future generation; retain started occurrences and their calls. Whole-series cancel stops future generation and cancels all not-yet-started members; occurrence cancellation can still record a retrospective cancellation if explicitly selected. WIN-8 still prohibits past creation and past time edits: cancellation records a new audited withdrawal at the current time and preserves historical times and calls. Alternative is rewriting/cancelling historical series members too. Recommend preserving history, and record this interpretation in #79/#139 because “whole series” currently does not resolve it.
1.  **Imported edits:** preserve explicit local occurrence overrides across refresh; preserve series overrides for title/kind/local times. The feed remains authoritative for membership/RRULE, so recurrence changes on an imported series return field-specific 422 directing callers to the source. The alternative is converting imports into detached manual series, a larger ownership feature. Feed deletion soft-deletes the subscription and cancels its upcoming imported windows, preserving calls and ledger. These semantics need the parent ruling.
1.  **Guest/share automation:** do not infer that a one-time budget check permits unlimited future materialisation. Require the real #181 port and explicit unattended series/feed policy before activating guest/share series or feeds; build member/API-key/member-OAuth functionality and isolated budget-denial tests meanwhile. Recommend charging each newly created occurrence atomically and reauthorizing the originating grant before unattended growth, subject to #181's actual policy. Do not persist a bearer token or fabricate guest device/IP hashes.
1.  **ICS scope limits:** reject whole documents that cannot be safely parsed/expanded, with 422 and no destructive diff. Propose 5 MiB UTF-8, 10,000 VEVENT components, 100,000 iterator steps and 10,000 emitted occurrences per document; no silent truncation. Invalid individual WIN-8 events are listed as skipped. These are implementation limits, not already approved product requirements. Support UTC, floating-in-project-zone and embedded VTIMEZONE; report TZID-without-VTIMEZONE as unsupported instead of silently treating it as floating. Supporting such incomplete calendars would require additional timezone/recurrence conversion work, so recommend that narrower compatibility boundary for this slice.

## Contract work

Parent must align #79 and affected children, then use a `contract`-labelled PR for non-optional changes:

- Add `getIcsFeed` (`GET /v1/ics-feeds/{id}`, `project.view`), import `kind` default `class`, strict window/recurrence request bodies, exactly one of `until`/`count`, and scope semantics above. No `until_date` alias.
- Feed response gains optional `status` (`pending|ready|error|removed`), `kind`, `refreshed_at`, `last_attempt_at`, `last_error`, `skipped`, `deleted_at`; populate new writes from actual storage. Optional owned response fields alone qualify for #79's exception; route/input/event semantics do not.
- Add optional `calendar: { feed_id, revision, window_ids? }` to window event data. Every new ICS mutation batch supplies a fresh UUIDv7 revision on all its events; exactly one deterministic representative event supplies the complete changed ID set. The other events omit `window_ids`, avoiding quadratic payloads. Amend calendar dedupe to `calendar:{feed_id}:{revision}`; #151 consumes that immutable payload. Missing metadata on a new ICS event is a producer error, never a cue to guess a version from mutable rows.
- URL creation returns 201 for an authenticated registered feed with `status: pending`, `next_refresh_at=now`, null successful-refresh/attempt fields and no windows; the existing batch performs its first guarded HTTP fetch. Initial HTTPS/public-URL preflight still returns 422 `unsafe-url`; later fetch/redirect/import failures appear on the feed. Files import immediately in the request transaction without HTTP. This changes the current 201 description “An imported ICS calendar” and #139's immediate “cannot be imported” 422 expectation for remote content; align both descriptions explicitly. Keep existing idempotency middleware, without a new engine.
- Record manual/ICS identity storage, worker cadence, source-controlled recurrence and missing legacy metadata behavior. Notify #143/#151/#133/#154/#181 when the parent actually applies this contract; this planning task posts nothing.

## Execution dependencies

Independent now: recurrence enumeration, ICS parsing/normalization and test-only calendar fixtures, safe-fetch tests, schema design. No product source or dependency was changed by this planning task.

Existing UI conflict: `apps/web/features/windows/import-form.tsx:66–69` discards the create response and calls `onSaved`; `declare-window-dialog.tsx:147` then selects the `imported` status, whose English text at `packages/i18n/catalogue/en/windows.json:102` is “Calendar imported.” The UI response parser at `operations.ts:79` expects 201, so keep 201 for the newly registered resource but have @kymil4 distinguish pending URL registration from completed file import and surface later status/errors. This plan makes no frontend edits; the current success message must not be represented as truthful queued-import acceptance.

Integration prerequisites: the teammate's list/create helpers; parent contract rulings; the real #181 budgets and guest policy for guest/share runtime. Existing `can`, ledger, events, network guard and runs are implemented. Public calendar live acceptance remains a separate human-owned check: register a real public event, move its end time and observe refresh plus calendar run. Pure/local tests cannot claim it.

No new runtime stub, permissive budget, seeded window, fabricated provider response, production mutation or frontend edit is part of this proposal. The scope is not fully complete while these integration/live prerequisites remain open.
