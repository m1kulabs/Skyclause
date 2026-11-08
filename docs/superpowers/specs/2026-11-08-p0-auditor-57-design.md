# P0 auditor (#57) design

The auditor checks stored source history and live crossing files every five minutes, sends one admin notice per transition, and logs each actual sent message. It runs independently of the evaluation tick so a stopped tick cannot hide stopped polling.

## Contents

- [Authority and goals](#authority-and-goals)
- [Approaches](#approaches)
- [Modules and flow](#modules-and-flow)
- [Stored-input policy](#stored-input-policy)
- [Notification history](#notification-history)
- [Controlled draft recovery](#controlled-draft-recovery)
- [Private state](#private-state)
- [Native composition](#native-composition)
- [Author calls](#author-calls)
- [Verification and live acceptance](#verification-and-live-acceptance)

## Authority and goals

Issue #57 and the #47 workbook contract are the requirements. Base is main `7e5c18e3550386b97ca1ec4259308706754249bd`, identical to tested `df4c29b`: 910 pilot tests, four exact-candidate Linux jobs and personal dev parser/readback passed. #387 is closed; new live crossing allocations now reserve peer identifiers. #388 belongs to #62 and remains separate.

The existing approved autonomous core workflow covers design, plans and technical reviews without repeated approval prompts. Choices below are root author calls, not a claim that the user selected individual implementation details.

Preserve workbook columns, existing public behavior, nine scopes, Gmail v1 binding, literal-cell protection, lazy native composition and the executable-AST bundle guard. Runtime has no Node APIs, logical assignments, fake observations, default recipients, invented refresh dates or consent/rota records. Only tests use controlled doubles.

No source-state updates, health-endpoint work, requester replies, automatic credential refresh, history repair, new mail provider or sweeper changes. Actual recipients, consent and duty hours remain pending through Discussion #385; no live sends occur from inferred addresses.

## Approaches

1. **Selected: pure audit policy + feature-owned transition receipts + shared controlled-draft recovery.** Reuse the existing single-recipient Gmail transport. Extract only the provider-attempt mechanics from evidence delivery; keep evidence routing/privacy and auditor condition/history ownership separate.
2. **Reuse transport but duplicate recovery:** smaller immediate #58 diff, but duplicates the sensitive save-before-create/search-before-resend/save-ID-before-log protocol.
3. **Group mail:** needs a new recipient-set verifier and changes audience exposure. Individual notices fit the existing verified transport and give each admin a real message ID.

This is a bounded backend feature with policy, delivery and native integration tasks. No UI or new infrastructure is needed.

## Modules and flow

- `draft-delivery.ts`: one operation to finish/reconcile an immutable single-recipient controlled draft attempt. It knows no evidence row, rota, notification ref, workbook or scheduling.
- `evidence-notification.ts`: preserve the existing wrapper, property format, messages, stages, requester exclusion and known-ID shortcut while delegating the extracted mechanics.
- `auditor-policy.ts`: normalize public stored facts and propose per-ref `active`, `clear`, `paused`, or `unavailable` observations and one-shot candidates. It returns bounded problems rather than fabricating freshness.
- `auditor.ts`: strict admin parsing, notification-history decisions, frozen transitions, recipient recovery and actual-ID logging. It owns ordering, not native reads.
- `auditor-storage.ts`: targeted Sheet projections, Drive creation metadata, owned private records and the existing Gmail transport operations.
- Thin gas factory, parameterless `runAuditor` main export and one registry entry `{ kind: 'time', handler: 'runAuditor', every: { minutes: 5 } }`.

One existing outer script lock covers the invocation. There is no evaluation-tick callback or nested lock.

## Stored-input policy

Use actual current stored rows. Never read `sources.state`, `state_since`, indicator checkpoints or cached source responses to decide health. Date cells and calendar-valid explicit-offset ISO strings are accepted; source-specific offsetless Rapid Rail metadata is interpreted explicitly as MYT. Do not coerce blanks/numbers into timestamps or zero readings. Reject future observation/receipt facts for the current check. Zero numeric observations are valid.

### Feeds and Pi

Monitor only configured, recognized pilot inputs:

| Input        | Freshness fact                                                                   | Notification ref |
| ------------ | -------------------------------------------------------------------------------- | ---------------- |
| Gauge        | newest valid numeric `0232901RF` / `jps_rain` / `rain_5m_mm` observation         | `0232901RF`      |
| APIMS        | newest valid numeric `api` observation for CA16W, CA19B, CA17W                   | each station ID  |
| MET warnings | latest `ok` or `unchanged` met_warning/met_warning poll receipt                  | `met_warning`    |
| Camera       | later of newest valid cam-1/camera receipt and today's configured daylight start | `cam-1`          |
| Pi           | valid `last_heartbeat_at` for each device whose kind is `pi`                     | actual device ID |

For configured feeds use their finite positive numeric `stale_after_min` (nominal 10, 120, 20, 20); do not replace it with trigger cadence. Pi uses 60 minutes. A feed/Pi is active strictly after its threshold, using elapsed milliseconds; display ages as floored minutes. Missing input configuration is not a seed source. Wrong bound kind or malformed threshold is an explicit configuration problem.

Gauge/APIMS with no usable observation and MET with no successful poll are unavailable; without a time fact, do not invent a silence start or a recovery. Missing/invalid/future Pi heartbeat is unavailable and must not fall back to `last_row_at`. Report bounded problems; never create a fake heartbeat. The producer's heartbeat writer is outside this feature.

Use the latest actual attempt for diagnostic text, even if it failed. JPS uses its bound poll; APIMS uses shared apims/apims latest-map polls, excluding apims_backfill; MET uses warning polls; camera uses any matching actual camera poll if present; Rapid Rail uses rapidrail_od/SP17. With no matching poll, say no poll record rather than invent HTTP 0 or a time.

### Camera daylight

When camera is configured, require valid `HH:mm` CAMERA_DAY_START/END with start before end. No overnight window or fallback hours. Use today's MYT date, start inclusive and end exclusive.

Outside daylight, pause checks and send neither silence nor recovery. Keep the last notified episode. Within daylight, use the issue's later-of-receipt/start clock. Before the stale threshold, a day-start grace with no receipt today is neutral/paused, not proof that a prior outage recovered. A real current-day fresh receipt clears it; elapsed grace without a receipt becomes silent. Messages name the actual receipt or its absence and the daylight reference honestly.

### Rapid Rail

Group crowd_grades by actual night_id. Select the latest as-of graded_at row per night, with later physical row winning ties, before testing pending/outcome/next_update. Pending metadata may be `YYYY-MM-DD HH:mm` in MYT, a native Date or explicit-offset ISO; validate calendar values.

An unresolved latest pending row is active strictly more than two hours after next_update. A later final row for the night clears that pending state. Use one shared `rapidrail_od` condition: choose the newest overdue unresolved night for text; keep active while any valid overdue pending night remains. Unreadable latest pending metadata is unavailable, not a recovery. No grade rows is unavailable. Supported final outcomes are in_band, out_of_band, unlisted_surge and no_surge.

### Crossing stalls

Read both configured live folders and actual Drive file creation time. Do not substitute envelope t_eval, snapshot ID or filename time for when the file was written.

Parse the real Sky and Crowd envelopes separately from the sweeper. Require an object with matching pack, usable crossing_id, boolean replay and a nonempty array of changes with usable to strings. Replay true is skipped before unused live validation. Every to=normal skips the file. Malformed/unreadable live metadata yields an explicit bounded problem, never a vacuous all-Normal result.

Use the actual JSON crossing_id as ref. A qualifying file is due at age >=20 minutes. Any ledger source_ref naming that ID satisfies the ticket; do not require a particular kind, approval, hash or sent state. No recovery mail.

Detect duplicate live JSON IDs across distinct file records and report those IDs as ambiguous instead of using one ledger/notification row as proof for both. Skip only affected crossing candidates; other valid inputs can proceed. Do not rename or repair history. #387 protects new allocations, not malformed legacy data.

### Credentials

Read only GE_SCHEDULES_REFRESHED_AT, preserving a distinction between readable value and read failure. Accept a valid YYYY-MM-DD as MYT midnight or a calendar-valid explicit-offset ISO instant. Day 12 is due at +12 days; expiry text uses +14 days in MYT. If the day-12 invocation was missed, catch up later once. A future recorded refresh is unavailable, not an invented valid refresh.

For a valid value, public ref is the exact property value; one credentials_day12 mail per value/refresh. Required example: 2026-11-09 -> reminder on 21 November, expiry date 23 November; no repeat on 22 November after logging.

For missing, malformed, future or unreadable value, send one truthful unavailable-date notice per continuous unavailable episode. A small owned observer records valid/unavailable state and a safe integer episode generation. Persist the generation before planning its notice. Ref is `GE_SCHEDULES_REFRESHED_AT:unavailable:{generation}`, never a fabricated date or raw corrupt value. Repeated failures keep the generation; a valid observation resets availability so a later failure starts another episode. Corrupt observer state is an explicit per-credentials problem, never an automatic reset.

Google still documents the [14-day credential window](https://docs.cloud.google.com/gemini/enterprise/docs/workflow-builder/quotas-and-limits). The property is an owner's record, not a live authorization check.

## Notification history

Allowed pairs: feed_silent/feed_recovered for feed or rapidrail_od refs, pi_offline/pi_recovered for Pi refs. One-shots: no_bundle_20min and credentials_day12.

Select relevant rows by family/ref, valid at <= check time and nonblank real gmail_message_id. Choose greatest parsed at, then later physical row. Unrelated kinds sharing a ref never reset an episode. A silent notice starts only when the latest relevant notice is not unmatched silent; recovery only follows unmatched silent. No initial recovery.

For one-shots, a valid matching kind/ref receipt suppresses another event. A pending frozen transition takes precedence over latest-row suppression until its entire original audience is durably logged.

Plain text includes source identity, actual newest time/age and latest attempt status/time in MYT or explicit absence. Pi uses `Pi offline since HH:MM` when its heartbeat is known. Crossing body contains exactly: `No ledger row references {crossing_id} 20 minutes after its file was written. Apps Script can't see Gemini Enterprise run state, so check the Runs tab.` Include frozen detection time and pack context without window titles or addresses.

## Controlled draft recovery

Preserve the existing single-To/no-Cc/no-Bcc MIME verifier and complete Sent pagination. Do not substitute the sweeper's GmailApp.sendEmail/Sent-subject lookup.

The shared operation accepts exact prepared mail, stable marker, immutable provider-attempt snapshot and save/provider operations. It returns confirmed real ID + durable replacement state, or a bounded pending code. It must not return speculative state as durable after a failed save.

Preserve #58's recipient freeze in the same save as draftCreationAttempted; create acknowledgement, hydrate/verify, save thread, send, save final ID. On retry search all Sent candidates first; exactly one full recipient/subject/body match proves delivery. Multiple matches, edited/missing drafts, incomplete search, lost create acknowledgement without a saved draft ID, and ambiguous sends stay pending. Never make a replacement draft on an uncertain attempt.

Keep existing stage codes and distinctions between throws and malformed returns. Evidence wrapper owns eligibility, requester/duty/privacy, fair recovery, logging and cleanup. Known durable Gmail IDs still bypass requester/rota/provider work. No evidence property-format or public-pack change.

## Private state

Use auditor-owned `SKY_AUDITOR_NOTICE_V1_` plus hash(family + ref) for one current pending transition per ref/family. Use `SKY_AUDITOR_CREDENTIALS_V1` for the small unavailable-episode observer. Enumerate key names, filter the owned prefix first, then read only owned values; never bulk-read all properties or touch evidence/camera tokens.

A versioned transition freezes event ID, family/ref/kind, detection time, exact subject/body and deduplicated original recipients before any draft side effect. Each recipient has its own stable `audit:{hex}` marker and attempt fields. Persist replacements, never mutate a live parent record before acknowledgement.

Validate the entire parsed record and whitelist owned fields. Check every serialized replacement by actual UTF-8 byte length <=8192 before setProperty. Initial overflow fails before provider work; later overflow retains the prior durable attempted state and reports pending, allowing exact Sent reconciliation. No truncation, dropped recipients, implicit splitting or new configurable quota. Aggregate store exhaustion also remains an explicit persistence failure. [Google's limits](https://developers.google.com/apps-script/guides/services/quotas) are 9 KB/value and 500 KB/store.

Per recipient: a durable final ID is reconciled against exact kind/ref/to/ID receipt; otherwise use shared draft recovery. Save final ID before append. Append and flush the actual sent-message row, then mark completion. A persisted-then-thrown append is found by exact ID on retry. Clear only after all recipients are complete. A pending event blocks later/opposite events only for its own family/ref; unrelated refs continue, including when one owned record is malformed.

Freeze original authorized audience/content. Configuration changes do not silently rewrite an already attempted message. Current empty/invalid TEAM_ALERT_EMAILS prevents the invocation from sending. No invented recipient, consent field or revocation workflow.

## Native composition

Read bounded required columns only: source identity/stale threshold; reading identity/metric/time/value/revision/poll link; poll metadata; devices device_id/kind/last_heartbeat_at; crowd grades; ledger source_ref; notification fields. Do not read source/device state columns. Preserve native Date/number/boolean/text types and physical notification ordering.

Read only the two configured live crossing folders, skip trash and obtain actual getDateCreated metadata; no global folder/file-name lookup or replay reads. Folder/Sheet read failures are explicit, never empty successful snapshots. Pure per-file parse problems can isolate affected candidates.

Use existing Gmail draft/send/search operations lazily, without unrelated inbox reads. Require SHEET_ID, both live folder IDs and actual TEAM_ALERT_EMAILS. Read daylight only when camera is configured. No new scopes, API enablement, real resource creation or setup defaults.

One outer lock, no tick callback. A four-minute processing budget leaves headroom under the six-minute Apps Script limit: prioritize at least one eligible pending recovery, then progress pending and fresh work while time remains. Report unfinished/pending counts honestly; do not claim all alerts sent. Bound emitted diagnostics to codes/counts, never private frozen mail or full messages.

## Author calls

- Separate single-recipient notices and per-ref serialization preserve transport/privacy and ordering; cost if wrong: a conservatively ambiguous draft can delay later events for that ref until repair.
- Timestamp plus physical-order history avoids an older appended row resetting newer state; cost if wrong: compatibility adjustment for manually backdated notification rows.
- Unavailable facts do not fabricate silence/recovery; camera grace is neutral until a real current-day receipt; cost if wrong: an extra recovery delay during daylight grace.
- The credential observer distinguishes repaired/rebroken unavailable episodes without fake refresh dates; cost if wrong: small owned-state/receipt compatibility rework.
- 8192-byte records and a four-minute budget are fixed implementation bounds; cost if wrong: explicit pending/backlog and operational tuning, not silent data truncation.
- Existing conservative lost-create behavior is retained; cost if wrong: human repair may be required for a genuinely unsent draft whose acknowledgement was lost.

## Verification and live acceptance

Use real JPS fixture rows for the gauge boundary; doubles only for clocks, native services and controlled variants. Prove 21:05 no mail, by 21:15 one silent, 21:20 none, and a later valid reading one recovery. Cover all nominal thresholds and exact boundaries, shared APIMS attempts/backfill exclusion, MET latest successful receipt, camera buffered receipt/daylight/grace, Pi missing/future heartbeats, per-night pending revisions/finals and MYT metadata.

Crossing tests cover actual creation time versus old t_eval, inclusive 20 minutes, both packs, ledger presence, replay/all-Normal exclusions, malformed files and ambiguous legacy IDs. Credential tests cover date-only/instant/MYT boundaries, day12 catch-up, refresh values, unavailable repeat/repair/rebreak and failed observer saves.

Preserve all #58 recovery/privacy/stage tests before and after extraction. Exercise frozen multi-admin delivery, partial recipient/provider/property/Sheet failures before and persisted-then-thrown, exact real-ID dedupe, opposite-transition ordering, cross-ref progress, byte overflow and runtime budget. Native tests cross the actual factory/core with external doubles. Keep parameterless exports, exact trigger, pilot-only setup, scope and native-free/AST bundle tests.

Root runs independent gates, graph refresh, exact-candidate Linux jobs, personal dev parser/readback and authorized PR/merge. Keep #57 open for missing original live acceptance. Real dev gauge silent/recovery emails require actual consenting admins and provider IDs, with genuine polls and elapsed time. Shared-pilot 24-hour notifications depend on #48. Never manufacture source rows, recipients, heartbeats, crossings or refreshes to close a criterion.
