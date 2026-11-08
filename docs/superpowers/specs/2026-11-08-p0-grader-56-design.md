# P0 Sky grader (#56) design

Grade closed Sky windows once, using complete observed evidence and the clause version in force at span close. Preserve the proposed call, distinguish the mode actually sent after an edit, and keep the explanation cell under human control.

## Contents

- [Authority and boundaries](#authority-and-boundaries)
- [Approaches](#approaches)
- [Historical evidence](#historical-evidence)
- [Camera eligibility](#camera-eligibility)
- [Calls and grades](#calls-and-grades)
- [Durable grade writes](#durable-grade-writes)
- [Native composition and view](#native-composition-and-view)
- [Verification and delivery](#verification-and-delivery)
- [Author calls](#author-calls)

## Authority and boundaries

[Issue #56](https://github.com/m1kulabs/Skyclause/issues/56), the #47 workbook contract, and the grading sections of the PRD/TRD are authoritative. The ticket's explicit 06:00 catch-up overrides the stale TRD 06:30 text; correct that text in a separate documentation commit. Base is `b633b930d9880b6ae5eea012eec933d72fefc91a` on `codex/p0-grader-56`. The auditor is merged in #393, and the completed-worktree cleanup rule in #395.

The existing approved autonomous core workflow covers design, planning and technical review without repeated approval prompts. Other technical choices here are root author calls. The user explicitly selected camera eligibility recorded at the time: add timestamped decisions for future runs and leave unprovable older camera evidence unused, with no invented earlier clearance dates.

Preserve workbook columns, existing live evaluation/replay behavior, the nine OAuth scopes, Gmail v1, literal-cell safety, lazy native loading, and the executable-AST bundle guard. Add Sheets v4 for the required named view and atomic grade writes. No runtime Node APIs or logical assignment syntax. Only tests use controlled service doubles. Keep real capture timestamps unchanged.

The grader reads public windows A–I, necessary ledger/evidence/configuration/version fields, existing grade receipts, and the configured live Sky crossing folder. It writes new grade fields and its required named view. It never writes explanation column J, current source states, indicators, shadows, crossings, notices, calendar events or requester replies. It never calls the live evaluation tick or the destructive replay runner. Camera decision recording is the narrowly required historical-proof addition described below.

## Approaches

**Selected: a historical-evidence path sharing the existing arithmetic and clause evaluator.** Add a named observed-snapshot entry point, with common internals preserving the existing live entry point. A grader-owned completeness gate precedes evaluation. Keep call/outcome policy, durable append recovery, and native Sheets operations separate.

Calling the full replay runner would reject the required gapped input and late-captured APIMS history, and exposes replacement/write ports inappropriate for live grades. Duplicating the rain/APIMS/clause calculations would allow grading and live evaluation to drift. Neither is suitable for this contract.

Use Advanced Sheets v4 rather than a new authenticated REST client. The existing spreadsheet scope suffices; the binding provides Google's supported API-enablement route for a default Cloud project. A standard project may need its owner to enable Sheets API separately. Never switch Cloud projects as a workaround.

## Historical evidence

### Windows and versions

Normalize actual public window fields using the existing time/window boundary. Only active windows whose span close is strictly before the actual run time are eligible. The span is end−30 minutes through end+60 minutes. Evaluate at that exact close, including the close boundary in the snapshot/evaluator; this also supports a span closing after midnight. Identical duplicate window rows yield one grade. Conflicting definitions for one ID are reported and deferred.

Any existing grades row for the window suppresses another grade, irrespective of outcome or explanation. No historical row is regraded or repaired.

Select the greatest valid `clause_versions.saved_at` at or before close, with later physical row winning a tie. Use that row's actual `content_hash` and valid full `content_json`. Never substitute a current/default/future version. An unavailable or corrupt selected version defers that window with an explicit problem; unrelated valid windows continue.

### Shared observed snapshot

Share normalization and indicator arithmetic with `computeSkySnapshot`, and classification with `evaluateSkyClauses`. Keep the existing live path's outputs and recovery/checkpoint semantics unchanged. The named observed path does not consume mutable current `sources.state/state_since` or previous live indicator checkpoints. It derives usability from actual historical evidence, rather than announcing a recorded live state transition. Its result must not offer source-state updates for a caller to persist.

Late-arriving readings known by the grading run may establish observed ground truth; `received_at` must remain the actual receipt. Reject future receipts and observations for their respective reference clocks. Warnings use their actual issue/validity facts and decision 7's inclusive window overlap, with actual revision ordering; do not make a late first receipt into an earlier receipt. Keep marine and No Advisory exclusions. Forecast is not a grading input.

Daylight is needed only for an eligible configured camera. Missing camera configuration is not a seed source or a reason to invent hours. The observed API must represent absent daylight without a fabricated interval when no camera can contribute.

### Complete readings and error polls

The completeness gate overrides the live evaluator's rank-based No call precedence. Missing required evidence must produce observed `no_call` even if another operational clause fires.

- Gauge: use the bound gauge and `rain_5m_mm`, including valid zero values. For every five-minute stamp inside the inclusive span, all stamps used by its 60- and 240-minute rolling totals must exist. The union starts 235 minutes before the first aligned span stamp and ends at the last aligned span stamp. Select dominant revisions using the shared producer semantics; do not treat a partial sum as complete. Invalid required facts or off-cadence ambiguity cannot become zero.
- APIMS: when an enabled clause consumes APIMS, require the expected floor-hour observation at close for each of CA16W, CA19B and CA17W. An enabled consecutive-morning clause additionally requires its referenced 06:00 history. Missing required morning history is No call; do not silently disable haze in production.
- Relevant gauge errors cover the required gauge union. Relevant APIMS errors cover the required end hour and referenced morning hours, bounded by close. Match the producer's bound/shared poll conventions. A failed attempt whose actual start/receipt interval overlaps required evidence makes the observed evaluation No call, even if a later success exists. A usable single endpoint can identify the attempt instant; unusable relevant poll timing is an explicit evidence problem, never a guessed timestamp. A later backfill request is not a past error merely because it returned past observations.
- MET/camera retain their separate validity/eligibility rules. Optional camera absence does not block an operational verdict. Do not introduce a requirement for a forecast row or fabricate a successful poll to make the snapshot usable.

The real 2 November 15:30 wave has all 66 gauge stamps from 11:05 through 16:30. Its 60-minute maximum is 59.5 mm at 15:35; its four-hour maximum is 63.5 mm, first at 16:10. Actual APIMS values at 16:00 are 77/69/80, but the checked-in history lacks 31 October 06:00. The ticket's explicitly labelled haze-off test fallback is therefore available. It is test-only and uses a correspondingly explicit test clause version; never retimestamp the 7 November captures or disable production clauses automatically.

## Camera eligibility

The current boolean cannot establish historical clearance. Valid frames are stored during probation too. Add a small owned decision history to the existing **Record verdict** action, using the actual server clock when that action records its computed result.

Use a single private versioned property `SKY_CAMERA_PROBATION_HISTORY_V1`, bound to the actual workbook. Store only ordered decision events: actual UTC timestamps with millisecond precision, actual source ID, and passed boolean. Append order resolves equal timestamps. Require nondecreasing clock times; a backward clock is an error, not permission to backdate. Repeated identical decisions need not advance the eligibility boundary. Initial absence means unknown history, not an earlier failure/pass.

Persist the validated decision before updating the existing mutable source-flag mirror. A retry of an acknowledged-or-lost decision must not fabricate an earlier boundary. Keep the existing summary/count/note behavior. Reading failure, corrupt history, or an 8192-byte actual UTF-8 overflow fails recording before a new mirror update; no reset, truncation or discarded events. Factor a tiny byte-length utility if necessary rather than copying the auditor's storage algorithm.

For grading, only frames with provable passed eligibility at their actual capture/receipt times can contribute. A later failure ends that interval. Unknown old history is excluded explicitly. A contradiction between the latest decision and the current mirror makes eligibility unavailable until repaired, rather than inventing a transition. Preserve the optional camera branch's non-blocking behavior. Never create probation decisions or labeller records to make a dev check pass.

## Calls and grades

Filter ledger call rows by `pack=sky`, exact window scope, and kinds approved/edited/rejected. The last relevant physical row is the call of record: approval/recording timestamps can legitimately be blank or filled later. Ignore notice and other-pack rows.

`proposed_mode` comes from `ledger.mode`. For approved/edited calls, the call JSON in `ledger.body` records the mode actually sent; use it for sent-versus-observed comparison and mode difference. A No call may be represented by its explicit key or the documented null mode with No call inputs. A malformed selected call cannot fall back to an older call or be assumed Normal; defer that window with a bounded problem. No call row means decision `none`, empty call/proposal fields, and not sent. Rejected is not sent while retaining its proposal.

Observed No call, a No call proposal of record, or an actual sent No call is counted as `no_call`. Otherwise apply the ticket's four-way above-Normal table. All approved/edited operational modes above Normal count as a call; the grader does not inspect Gmail delivery or recipients. When both sent and observed are above Normal and differ, write `{sent}→{observed}`. Never turn a null/unknown mode into Normal.

ANL-2 is independent of the selected latest decision: any qualifying live Sky crossing change for that window to an operational mode above Normal, and no approved/edited call row at all, yields true. An older approved row defeats the flag even if a newer row is rejected. Skip replays, site-only changes, Normal and No call changes. Unreadable/malformed live crossing evidence must fail visibly before claiming absence; do not return an empty successful file list.

Each new grade has a genuine UUIDv7 from the existing native generator, the actual run time, and the selected version hash. Explanation is absent from the owned row DTO and all writes. Do not read or sanitize its content to classify a grade.

## Durable grade writes

Use one existing outer script lock. Sheet batch atomicity prevents partial A–I/K–L writes, but an unknown transport outcome still needs durable idempotency. Before provider work, save one owned `SKY_GRADE_BATCH_V1` intent containing the actual workbook/tab identity, fixed target row coordinates, and immutable computed grade rows/IDs/times. Validate closed versioned fields and actual serialized UTF-8 size ≤8192. Split a larger run into fitting batches without dropping rows; an individually oversized row is reported and deferred.

Recover that batch before fresh classification. Read actual owned grade fields, excluding J. Exact frozen receipts clear the intent. Empty reserved targets can receive the same frozen values at the same coordinates; never allocate new IDs/rows or reevaluate an uncertain batch. Conflicting or partial receipts, target identity changes, or corrupt intent block fresh writes and require repair. Preserve the previous intent on failed saves. A post-persistence property or API exception must not allow a later batch to overwrite its reservation.

For one API request, atomically issue optional row growth and two `updateCells` blocks: A–I (nine values) and K–L (two values). Use `start` coordinates and `fields: userEnteredValue`; never include a J placeholder. Use typed `stringValue`, `numberValue` or `boolValue`, never `formulaValue`; a leading `=` remains literal without inserting an apostrophe. Growth may only add rows, never shrink the grid. Recalculate needed growth on reconciliation; an old uncertain growth request can at worst add blank grid rows, not remove data.

Maintain confirmed IDs and a confirmed row cursor within the invocation, and invalidate grade caches before writes. Do not allocate over a just-written batch because of a stale native cache. Only clear the intent after confirmed atomic application or exact receipt reconciliation. Operator edits to J neither block reconciliation nor get overwritten. Existing unrelated grade rows are never repaired automatically.

A 240000ms admission budget leaves runtime headroom. Recover at least one eligible pending batch, then admit fresh snapshots/windows/batches only while time remains. Check before substantial stages and after slow reads. Report confirmed, pending and deferred work honestly; a skipped fresh snapshot is not an evaluated set of windows. Synchronous in-flight provider work cannot be preempted.

## Native composition and view

Keep native operations in a focused grade-storage adapter with type-only helper imports, a thin gas factory and parameterless `gradeSky`. Require actual workbook/live Sky folder IDs. Read only required columns, public windows, owned properties and the configured live folder. Preserve native values and physical ledger order. No global Drive lookup, replay replacement port, private window title, recipient resolution or inbox access.

Add Sheets v4 alongside Gmail v1; keep all nine explicit scopes unchanged. Calls and globals remain lazy so importing/building `main.ts` works without native services.

Ensure the reserved view **No call to explain** on `grades`, including on a first run with no eligible windows. It covers A–L with no fixed end-row bound, and uses `filterSpecs`, column index 8, `CUSTOM_FORMULA`, `=$I2=TRUE`. Include flagged rows after their explanations are filled. Preserve unrelated views, basic filters and cells.

Reuse an existing exact-title view in the grades tab. Correct drift only through narrow range/filterSpecs updates; the feature owns this specific list, so manual custom views should use another title. Multiple same-title views are an explicit ambiguity, not permission to delete them. When adding a missing view, use a stable caller-allowed integer ID derived from actual workbook/tab/name, checking collisions against existing IDs. This prevents duplicate creation after a lost acknowledgement. Adopt the actual ID of an already existing matching view. Surface API failures without a fake ready result.

Register exactly two daily entries for `gradeSky`: `{ atHour: 23, nearMinute: 55 }` and `{ atHour: 6, nearMinute: 0 }`, through existing pilot-only setup. Native `nearMinute` is approximate (±15 minutes); eligibility always uses the actual run clock. Do not install pilot triggers in personal dev or promise exact-minute executions.

Google sources: [advanced services](https://developers.google.com/apps-script/guides/services/advanced), [batchUpdate](https://developers.google.com/workspace/sheets/api/reference/rest/v4/spreadsheets/batchUpdate), [filter views](https://developers.google.com/workspace/sheets/api/guides/filters), [GridRange](https://developers.google.com/workspace/sheets/api/reference/rest/v4/spreadsheets/other#GridRange), [clock triggers](<https://developers.google.com/apps-script/reference/script/clock-trigger-builder#nearMinute(Integer)>).

## Verification and delivery

Preserve existing live snapshot/evaluator/replay, camera-label and auditor/evidence behavior with focused checks before/after shared refactors. Behavioral tasks use meaningful RED before implementation and focused iteration; run one settled full pilot suite plus type/lint/build before each task handoff. Commit refactors separately from behavior.

Cover closed/midnight/boundary windows; version cutoffs/ties/corruption; real gauge peak and missing-hour No call; actual APIMS capture provenance; labelled haze-off fallback; strict completeness overriding a higher fired rank; source-state contamination; edited sent versus proposed modes; rejected/none/Normal/No call/mode differences; ANL-2's any-approved exception; repeated grading; explanation preservation; decision-history intervals/failures/overflow; fixed-target write recovery; malformed owned intent; exact view requests/lost create acknowledgement; lock release, lazy loading, parameterless export, two registry lines and unchanged scopes.

Root refreshes the graph, performs a whole-branch review, and attempts exact committed local Linux jobs. Preserve real billing/download failures; native equivalent checks do not become green hosted checks. Validate the known personal dev target, back up unknown edits, upload the exact build, and verify parser acceptance, byte readback, nine scopes and both bindings. Preserve unrelated existing dev manifest settings. Do not switch Cloud projects or manufacture grade/window/camera rows. If genuine rows are absent, view metadata can be verified while TRUE/FALSE visual behavior remains explicitly unobserved.

Push/merge under existing authorization and verify the merged tree. Keep #56 open for its original after-merge shared-pilot row-count/execution-ID criterion until performed after #48. Do not silently move it to #380. Archive needed evidence and decisions, remove this plan's completed scratch, continue to use the active worktree only while work remains, then clean it up without touching the original checkout.

## Author calls

- Full observed evidence is distinct from live as-known recovery state; share arithmetic and evaluator, not the destructive runner. Cost if wrong: adjust the historical availability boundary while preserving live behavior.
- Require complete gauge grids and all APIMS facts referenced by enabled clauses; use the labelled haze-off fallback only in tests. Cost if wrong: conservative extra No call grades for incomplete morning history.
- Use actual attempt intervals for relevant error-poll overlap. Cost if wrong: a boundary error can conservatively invalidate a grade and needs a documented policy adjustment.
- Select saved versions by time/physical tie and defer missing/corrupt versions. Cost if wrong: a window waits for a usable genuine historical version rather than receiving a guessed grade.
- Select calls by physical append order; distinguish proposed mode from actual body mode and keep No call separate. Cost if wrong: ledger-order/edited-call compatibility adjustments, not silently rewriting grades.
- Use a bounded private journal to implement the user's recorded-at-the-time camera rule. Cost if wrong: history/mirror compatibility work may be needed; unprovable older camera evidence remains unused as requested.
- Freeze bounded grade batches and fixed targets before atomic provider writes. Cost if wrong: a corrupt/conflicting intent blocks fresh appends until repaired; no automatic overwrite or regrade.
- Reserve the required view's title/shape and use stable add IDs. Cost if wrong: the feature resets manual edits to that particular view, or a rare ID collision requires repair.
- Add Sheets v4 while retaining existing OAuth scopes/Gmail. Cost if wrong: API enablement or native binding compatibility work is needed, with no Cloud-project switch.
- Use a four-minute admission budget and honest deferred counts. Cost if wrong: backlog can require another run and operational tuning.
- Follow the ticket's 23:55/06:00 schedule and actual-clock eligibility. Cost if wrong: schedule alignment requires a later registry/trigger change; vendor timing remains approximate.
