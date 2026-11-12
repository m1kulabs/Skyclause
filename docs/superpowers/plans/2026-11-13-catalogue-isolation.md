# Catalogue discovery isolation implementation plan

> **For agentic workers:** Use superpowers:executing-plans for this one small inline task; the parent owns one fresh whole-branch review.

**Goal:** Attempt independent provider discoveries after a peer fails while preserving failure visibility and database fail-fast behavior.

**Architecture:** Catch only discovery/capture/parse failures inside each adapter iteration. Log them, preserve their original errors, continue serially, and rethrow a single original error, or aggregate multiple original errors, after eligible providers finish. Keep the database writer outside that catch.

**Tech stack:** Existing TypeScript source-job ports, Bun and Vitest; no dependency, contract or infrastructure change.

**Spec:** [#767](https://github.com/m1kulabs/Skyclause/issues/767); existing source-core contract and #557 live evidence.

Contents:

1. [Global constraints](#global-constraints)
1. [Review focus](#review-focus)
1. [Task 1: Isolate discovery failures](#task-1-isolate-discovery-failures)

## Global constraints

- Work only in branch fix/catalogue-error-contract-20261113, isolated worktree967d. Original main and the independent window worktree stay unchanged.
- Every shell/subprocess begins rtk. Use the pinned Graphify0.9.105 for query/update. No external reference-project names in repository artifacts.
- Preserve the merged 60-second JPS discovery deadline; no further provider timeout, API family/slot budget, HTTP retry, polling/ingestion interface, public schema, source fallback, seeded production row, migration, scheduler or runtime identity change.
- Discovery failures never call that provider's writer. Each database writer remains transaction-owned by existing code; any write failure escapes immediately and prevents later provider calls.
- Full/partial outcomes are truthful: preserve individual errors and do not emit success-complete or return success after discovery failure. Map the new failure log to ERROR in the existing wrapper.
- Run tests through the approved shared-lock wrapper with Node22.22/Bun1.4.4/localPG56440, maxWorkers4 and default timeouts. Frozen CI settings/VM remain unchanged.

## Review focus

- An early failed provider must not block a later successful catalogue, or cause a fake write for the failed provider.
- Slot-plan/capture failures belong to discovery isolation, not only the ordinary discover callback.
- A database outage must remain fatal and prevent more provider requests.
- All-success/empty eligibility remains successful; partial/all-discovery failure remains rejected with every original error.
- Per-adapter logging must not suggest that a failed/partial job is healthy. External timeout remains a separate live issue.

### Task 1: Isolate discovery failures

**Files:** modify apps/worker/src/sources/jobs.ts and sources/index.ts; create apps/worker/test/source-catalogue-isolation.test.ts. Regenerate only the code graph after implementation.

**Interfaces:** Keep SourceJobPorts and every job signature unchanged. catalogueSync still returns Promise<void>. Rethrow one discovery error unchanged for typed-error compatibility; preserve multiple original discovery errors in AggregateError.errors; include adapter names/messages in its summary. The source logger recognizes the new catalogue failure event as ERROR.

- [ ] Write behavioral tests for an early discovery failure followed by persisted healthy metadata, slot-plan failure followed by healthy metadata, all failed providers with all original errors/no writes, a fatal database write stopping later discovery, and unchanged successful/non-discoverable behavior. Tests use isolated fake external ports and inspect their persisted state; no live HTTP.
- [ ] Run the new test file plus existing sources-jobs through the wrapper. Expected RED on merged #771: typed errors are wrapped and a database failure continues later discovery. Record exact output/exit.
- [ ] Add the smallest per-adapter discovery catch, explicit failure log, aggregate rejection and ERROR severity mapping. Leave database writes outside the recoverable block; no retries or fallback.
- [ ] Repeat focused tests to GREEN. Run relevant source adapter/job regressions, lint, typecheck, full native tests, OpenAPI/seed checks and worker build. Record actual exits. Update pinned graph, verify its preserved semantics, format and commit normally.
- [ ] Obtain one fresh whole-branch review, record every disposition, then use the approved exact-head Linux gate and fresh hosted-billing proof before authorized push/merge. #557 stays open for real provider/runtime acceptance. Archive evidence and remove the completed owned worktree.
