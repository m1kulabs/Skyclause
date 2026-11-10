# P1 core delivery design

## Intent and authority

Implement WhiteAvocad0’s assigned core packages against GitHub #79 and each child issue, beginning with #131, #132, #133 and #120, then their newly unblocked consumers. The user explicitly requested autonomous execution, branches, reviewed merges, issue closure and completed-worktree cleanup. On 9 November they authorized simulated data to verify components when live data is unavailable and delegated which material checks remain open.

## Approach

Keep the committed TypeScript interfaces, domain ownership and one-concern PRs. Implement deterministic pure engine behavior first, then database/worker coordination and source infrastructure. Test isolated simulation inputs, transport failures, clocks and concurrency without creating artificial runtime data. This preserves real-service data while removing live availability as the code-delivery gate. A single combined PR would obscure review and conflict with issue ownership; waiting for every deployment observation would block the requested core delivery.

## Boundaries

No public releases, credentials changes, shared-pilot deployment, unsolicited email, seeded production rows or security bypass. Existing main and personal-dev history remain intact. Optional UI handoffs stay with their existing owner. Material deployment, privacy, authentication, device and provider checks remain explicitly open in linked follow-ups; source issues close only after their owned code is merged and verified. Never label a simulation as a live run.

## Engine

Keep packages/clauses browser-safe and synchronous, with only @bufbuild/cel 0.6.2 at runtime. Preserve canonical JSON/SHA implementation. Split CEL validation, temporal/input reducers and evaluation into focused private modules. Check types and allowed CEL AST forms, retain exact source positions, and keep optional absent inputs absent. Snapshot history is frozen by receipt/poll time; scoped verdicts preserve precedence, blocked-input provenance, not_open and complete spans. Explain must retain published conditions and wording through serialization without an ambient clock or I/O.

## Verification and closure

Use test-first regressions and real captured rainfall replay plus isolated fabricated edge cases. Exercise CEL conformance and Node/Bun/browser parity. Verify lint, typecheck, repository tests, package boundaries and applicable API/schema checks; run committed local CI where available. Every PR records evidence and limitations. Transfer material runtime checks to an open issue before closing source delivery; do not silently check unfinished acceptance boxes.
