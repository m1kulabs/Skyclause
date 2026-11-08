# Live crossing identity fix (#387)

Sky and Crowd currently allocate the same identifier in separate live folders. A first crossing in the same MYT minute can produce two `X-...-01` values. Ledger and notification references use the identifier alone, so this can suppress a missing-bundle alert in #57. This fix establishes uniqueness among new live allocations without changing the documented identifiers or semantic histories.

## Contents

- [Authority and scope](#authority-and-scope)
- [Approaches and author calls](#approaches-and-author-calls)
- [Reservation interface](#reservation-interface)
- [Native reservation scan](#native-reservation-scan)
- [Allocation and retry behavior](#allocation-and-retry-behavior)
- [Legacy ambiguity and errors](#legacy-ambiguity-and-errors)
- [Verification and delivery](#verification-and-delivery)

## Authority and scope

- #47 fixes IDs as `X-{yyyyMMdd-HHmm}-{nn}` and filenames as `crossing-{yyyyMMdd-HHmm}-{nn}.json`.
- #387 is a prerequisite for #57. Work occurs on `codex/p0-crossing-identity-387`, based on main `ee8f1bffdd3f4eb5184d41884b8fb16c956f02b8`.
- The existing isolated worktree and dependencies remain in use. Its base tree is identical to tested candidate `223ca38`: 885 pilot tests and the four exact-candidate local Linux jobs passed. No unchanged baseline suite is repeated.
- Only live Sky and Crowd share this namespace. Replay has a separate workbook and folder, is excluded from #57, and retains its current allocation and capability behavior.
- Preserve workbook columns, identifier spelling, scopes, existing outer script locks, published input data and the native bundle guard. No new property counter, runtime fallback, dependency, trigger, public handler or history migration.
- Real source data only in runtime. Controlled doubles and mutations belong only in tests. Root owns graph updates, CI, dev parser/readback, pushes, PR, merge and closure.

## Approaches and author calls

1. **Peer reservations (selected by root):** keep each producer's semantic list and allocation policy. Add a small required interface for identifiers already claimed by the opposite live folder. This preserves Sky's immutable-file recovery and Crowd's first-free 1–99 selection.
2. **Shared next-sequence allocator:** concentrates allocation but changes Crowd's gap-filling policy and still needs a separate legacy-reuse check.
3. **Pack prefixes or a persistent counter:** changes #47's format or introduces durable reservation recovery. Neither is required for the live collision fix.

Author calls under the existing approved core-work workflow:

- Limit the guarantee to the two live producers sharing ledger/notification references. Cost if wrong: extend reservation wiring if another producer later shares that namespace.
- Make the reservation method required, rather than silently retaining local-only allocation in a missing adapter. Cost if wrong: a few test/caller interface updates; production cannot omit the guarantee.
- Reserve both actual filenames and usable JSON-ID claims. Cost if wrong: conservative reservation can consume an ordinal for malformed legacy metadata; it does not alter history.

## Reservation interface

Add `reservedCrossingNames(): readonly string[]` to `SkyClauseRuntimePorts` and `CrowdTickStore`. Return canonical filename tokens from the configured opposite live folder, using #47's existing filename format.

Keep `listCrossings()` Sky-only and `crowdFiles()` Crowd-only. Peer files must never enter verdict reconstruction, Sky semantic validation, clause matching or own content-identity reuse.

The native Sky factory reads `CROSSINGS_CROWD_FOLDER_ID` lazily when reservations are requested. The native Crowd factory reads `CROSSINGS_SKY_FOLDER_ID` at that point. Their existing destination IDs remain authoritative for writes. A missing or blank peer property means that peer is not configured. A configured peer read failure is an error, never an empty successful inventory. Reject a configured peer ID equal to the destination before allocation; the contract gives the packs separate folders.

A small feature-specific helper may encapsulate reservation extraction/native iteration. Choose its exact private file organization while implementing; do not build a registry framework.

## Native reservation scan

- Read only the configured opposite live folder, never global Drive names or unrelated properties. Adding reservations must introduce no new native access during factory construction; Crowd's existing destination-property read remains unchanged.
- Skip trashed files as existing readers do. A contract-shaped physical filename independently reserves its token.
- For readable JSON objects, a contract-shaped `crossing_id` independently reserves the corresponding filename token. Reserve both if the filename and JSON claim disagree.
- A JSON syntax/schema mismatch supplies no JSON claim; it must not release a valid physical filename reservation or feed fabricated data to a semantic parser. Do not catch folder iteration, blob-read or other storage failures as malformed JSON.
- Deduplicate the returned tokens. Do not rename, delete, rewrite or repair peer files.
- Caller selection must operate on the current evaluation stamp. Handle unsupported/unsafe ordinal calculations explicitly before creating a file.

## Allocation and retry behavior

### Sky

Preserve the current order: evaluate and replace display shadow; inspect own semantic files; find an identical canonical crossing (identity excludes only `crossing_id`); otherwise allocate; create/reuse; finally commit `shadow_state`.

Only request peer reservations when a crossing exists. For a reusable own crossing, test its identifier/name against peer reservations first. If unambiguous, reuse it even when a peer has a higher different ordinal. This preserves persisted-then-thrown creation recovery.

For a new crossing, choose above the maximum own/peer ordinal for the same stamp, reconstruct the plan as currently required, create it and persist the final ID in state. Peer semantic `t_eval` is irrelevant to whether an ID token is reserved.

### Crowd

Keep previous-verdict reconstruction based only on own Crowd files. When a crossing is needed, union own taken filenames with peer reservations before the existing first-free 1–99 allocator. A peer claim must not become a previous Crowd verdict. Preserve the existing exhaustion behavior and persisted-file retry behavior.

### Lock ownership

Existing main/feeder handlers already hold one outer script lock through allocation, file creation and state progression. Add no nested lock. This coordinates these script writers; external or manual writers do not participate in that lock.

## Legacy ambiguity and errors

A forward allocator cannot repair previously collided immutable IDs. If Sky's reusable own crossing is also peer-reserved, fail with a bounded actionable ambiguity error before creating a replacement or committing `shadow_state`. The display shadow may already have been refreshed under the existing order.

Do not silently relabel an old event or let peer ownership masquerade as successful own recovery. Preserve every existing file and ledger/notification row. #57 will separately report ambiguous legacy inputs if it encounters them.

Peer read/iteration failures propagate. No partial inventory may be returned as complete. No guessed HTTP error poll or synthetic observation is created for an allocation/storage failure.

## Verification and delivery

Use meaningful RED regressions before implementation, then focused GREEN. Required coverage:

- Same-stamp peer `01` forces a distinct new live ID in both serial creation orders; different stamps do not consume the current stamp.
- Sky identical-own reuse precedes new allocation; a higher peer ordinal does not defeat unambiguous reuse.
- A peer claim on reusable own identity fails without rewriting history or committing state.
- Existing Sky create-before-persist, persist-then-throw and state-commit retry cases remain valid.
- Crowd peer reservations affect allocation, not previous verdicts; preserve its 1–99 exhaustion and ordinary persisted-file retry.
- Actual native reservation wiring, both filename/JSON-ID claims, malformed JSON with a valid name, configured-folder/blob/iteration failure, missing peer, alias rejection, trash exclusion, laziness and no-reservation work when no crossing exists.
- Replay capability keys and isolated behavior, fixed formats, workbook schema, nine scopes and native-compatible bundle remain covered by existing tests.

Run covering tests during iteration, required pilot typecheck and repository lint, then one final pilot suite. Keep source corrections surgical and commit before review. Root performs task and whole-branch review, refreshes Graphify and checks scratch exclusion, runs exact-candidate local Linux test/lint/build/secrets, verifies personal dev parser/readback, pushes and merges under the existing authorization, and verifies main's complete tree matches the tested candidate before closing #387.

The unrelated Crowd sweeper parser problem is tracked in #388 for #62; it is not part of this fix. Actual MET/live email/pilot checks remain with their original issues.
