# Live Crossing Identity Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Prevent new live Sky and Crowd crossing IDs from colliding while preserving their current formats, histories and recovery behavior.

**Architecture:** Both live stores gain a required peer-reservation method. One native helper extracts actual filename/JSON-ID claims from the configured opposite live folder; each pure producer keeps its own allocation policy and semantic files.

**Tech Stack:** Existing TypeScript, Bun, Apps Script Drive/Properties adapters and test doubles; no dependencies.

**Spec:** `docs/superpowers/specs/2026-11-08-p0-crossing-identity-387-design.md`.

## Contents

- [Global Constraints](#global-constraints)
- [Review Focus](#review-focus)
- [File Responsibilities](#file-responsibilities)
- [Task 1: Coordinate live reservations](#task-1-coordinate-live-reservations)
- [Root Delivery](#root-delivery)

## Global Constraints

- Work only in `/Users/jeremywoon/.codex/worktrees/298a/gdgocapu`, branch `codex/p0-crossing-identity-387`. Every shell command, including nested subprocesses, begins `rtk`.
- #47 fixes IDs as `X-{yyyyMMdd-HHmm}-{nn}` and filenames as `crossing-{yyyyMMdd-HHmm}-{nn}.json`.
- Only live Sky and Crowd share this namespace. Replay has a separate workbook and folder, is excluded from #57, and retains its current allocation and capability behavior.
- Preserve workbook columns, identifier spelling, scopes, existing outer script locks, published input data and the native bundle guard. No new property counter, runtime fallback, dependency, trigger, public handler or history migration.
- Real source data only in runtime. Controlled doubles and mutations belong only in tests. Root owns graph updates, CI, dev parser/readback, pushes, PR, merge and closure.
- Keep `listCrossings()` Sky-only and `crowdFiles()` Crowd-only. Peer files must never enter verdict reconstruction, Sky semantic validation, clause matching or own content-identity reuse.
- A configured peer read failure is an error, never an empty successful inventory. Reject a configured peer ID equal to the destination before allocation; the contract gives the packs separate folders.
- A forward allocator cannot repair previously collided immutable IDs. Preserve every existing file and ledger/notification row.
- No runtime logical assignments (`??=`, `&&=`, `||=`). Preserve the existing nine scopes. No live resource calls by implementation workers.

## Review Focus

- A peer filename and its JSON ID disagree: reserve both actual claims, so neither can be reallocated.
- The peer iterator/blob read fails after yielding one file: fail instead of treating the partial inventory as complete.
- An own Sky file was persisted before an exception and a peer now has a higher ordinal: reuse the own identity before allocating again.
- A peer claims Sky's reusable identity: surface ambiguity instead of relabeling the event or committing state.
- No crossing is needed: new peer configuration/Drive access must not occur.

## File Responsibilities

- `crossing-reservations.ts`: feature-specific native reservation scan and canonical token extraction.
- `sky-runtime.ts`, `crowd-tick.ts`: required interface and minimal allocation integration.
- `gas.ts`: lazy live-factory wiring to the opposite configured folder.
- Covering tests remain beside these files. Direct typed test ports receive the required empty reservation method where appropriate.
- No sweeper behavior changes; #388 is separate.

### Task 1: Coordinate live reservations

**Files:**

- Create: `pilot/apps-script/src/crossing-reservations.ts`, `crossing-reservations.test.ts`.
- Modify: `pilot/apps-script/src/sky-runtime.ts`, `crowd-tick.ts`, `gas.ts`.
- Modify tests: `sky-runtime.test.ts`, `crowd-tick.test.ts`, `sky-runtime.integration.test.ts`, `sky-sweep.integration.test.ts`.
- Adapt another direct test fixture only if the new required interface makes it necessary; no unrelated behavior edits.

**Interfaces:**

```ts
// New native helper; construction/import performs no native access.
export function peerCrossingReservations(
  destinationFolderId: string,
  peerFolderId: string | null
): string[]

// Required on both existing live port interfaces:
reservedCrossingNames(): readonly string[]
```

Consumes existing `runSkyClauseTick(input: SkyClauseTickInput, ports: SkyClauseRuntimePorts)` and `runCrowdForecast(store: CrowdTickStore, now: Date, thresholdOverride?: number)`. Their public call shapes remain unchanged. The new helper uses native services only when invoked. Keep replay's interface unchanged.

- [ ] **Write collision/recovery RED in the existing pure harnesses.** Use `createHarness`/`buildTickInput` in Sky tests and `fakeStore` in Crowd tests. Extend harness inputs with test-only peer reservations. The existing Sky fixture is 2 November at 15:05 MYT:

```ts
const harness = createHarness()
harness.ports.reservedCrossingNames = () => ['crossing-20261102-1505-01.json']
runSkyClauseTick(buildTickInput(), harness.ports)
expect(harness.crossings[0]?.filename).toBe('crossing-20261102-1505-02.json')
expect(harness.shadowState.some((r) => r.last_crossing_id === 'X-20261102-1505-02')).toBe(true)
```

Add the reverse allocation direction for Crowd's existing producing fixture. Assert peer entries never enter previous Crowd verdicts. Pin different-stamp peers, own persisted-then-thrown reuse with a higher peer ordinal, a peer claim on reusable own identity, no-crossing zero reservation reads, and existing Crowd 1–99 exhaustion. Use the existing fault harness and assert unchanged file count/state on ambiguous reuse.

- [ ] **Run RED before production behavior changes.** Run `rtk proxy bun test pilot/apps-script/src/sky-runtime.test.ts pilot/apps-script/src/crowd-tick.test.ts`. Expected failures must expose local-only allocation/recovery assertions, not missing imports. Minimal behaviorless export/type scaffolds may make new tests load; no implementation before recorded RED.

- [ ] **Implement the required live interfaces and pure integration.** Sky searches own semantic identity first, then uses peer tokens to reject ambiguous reuse or extend the same-stamp maximum for a new ID. Crowd unions peer tokens into its current taken-name set only when writing a crossing. Preserve own semantic history, order of display/state writes, retry behavior and sequence policies; reject unsafe calculations before file creation. No optional-method production fallback.

- [ ] **Write native-scan RED and factory-wiring controls.** With external Drive/Properties doubles, pin these actual tokens:

```ts
// Physical peer name and a different JSON-ID claim both reserve:
const physical = 'crossing-20261102-1505-01.json'
const body = JSON.stringify({ crossing_id: 'X-20261102-1505-03', pack: 'crowd' })
expect(peerCrossingReservations('own', 'peer').sort()).toEqual([
  'crossing-20261102-1505-01.json',
  'crossing-20261102-1505-03.json'
])
```

Install that file through the test's native double. Also cover malformed JSON with a valid physical name, nonobject/missing-ID JSON, trash, missing/blank peer, alias rejection, configured-folder/blob/partial-iterator failures, no import/factory-time added native calls, and no replay-folder access. Use actual `skyClauseRuntimePorts` and `crowdForecastStore` wiring over shared external folder doubles to prove both directions; combine with pure allocation assertions to prove serial Sky→Crowd and Crowd→Sky IDs differ.

- [ ] **Implement `peerCrossingReservations` and lazy native wiring.** Validate the destination when the helper is invoked; missing/blank peer returns no claims, an alias throws. Physical contract-shaped names reserve independently. Read JSON objects without interpreting their pack-specific payloads; usable string `crossing_id` claims add canonical filename tokens. A JSON parse/schema mismatch has no JSON claim but retains an actual valid physical-name claim. Catch only parsing mismatch, never native reads/iteration failure. Deduplicate tokens. Sky callback reads `CROSSINGS_CROWD_FOLDER_ID`; Crowd callback reads `CROSSINGS_SKY_FOLDER_ID`. No newly introduced native reads during factory construction.

- [ ] **Run focused GREEN and self-review.** Run the new reservation tests, both runtime suites, native Sky integration, Sky/sweep integration and existing crossing/replay suites. Assert zero failures; inspect actual output and any diagnostics. Preserve all RED/GREEN command, exit and output logs in this plan's owned workspace.

- [ ] **Run final local gates once after source/formatting settles.** `rtk proxy bunx tsc --noEmit -p pilot`, `rtk proxy bun run lint`, and one final `rtk proxy bun test pilot`. Check `rtk proxy git diff --check`. Do not run unrelated broad checks repeatedly.

- [ ] **Commit and report.** Commit `fix: reserve live crossing IDs across packs`. Full report in `task-1-report.md` with interface details, files, meaningful RED/GREEN, actual commands/output, self-review and concerns. Return only status, commit, one-line results, concerns and report path. Root supplies independent task and whole-branch review.

## Root Delivery

Root refreshes Graphify, verifies structural integrity/coverage/scratch exclusion and commits the generated graph separately. Review the full source branch and resolve source findings under the single final fix-wave rule. Run four exact-candidate local Linux jobs (`test`, `lint`, `build`, `secrets`) with actual selected-job/commit evidence; hosted billing failures are not green checks.

Use the known personal dev project only, exact tested SHA and explicitly empty pilot ID. Back up current remote code, compare known fingerprints, build/push and verify byte-identical readback plus nine scopes. No fabricated live crossings are generated for acceptance. Push a dedicated PR closing #387 only after source/native parser gates, honor squash-only repository policy and verify main's whole tree equals the tested candidate.

Return to `codex/p0-auditor-57`, fast-forward it to the merged main, and continue its design/implementation. Keep #52's unperformed acceptance and #388's unrelated sweep work explicit.
