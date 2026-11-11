# SDK null schema repair

Fix #560's generated draft number type without changing the server contract. The canonical generator currently filters null before handling the null-only case and emits `unknown | null` for an exactly-null response field.

Contents:

1. [Constraints](#constraints)
1. [Task: Repair and verify generation](#task-repair-and-verify-generation)
1. [Review and completion](#review-and-completion)

## Constraints

- Work only in isolated `fix/sdk-null-schema`, base main `d01d36b48bdca6ed9025fb1f25885ee85a20f0e2`.
- Change shared generator null-only handling and a meaningful public generated-type regression; regenerate canonically. Never hand-edit generated TypeScript.
- Preserve typed-nullable, unions and unconstrained schema meanings. No server/API wire or runtime change.
- Every shell command starts `rtk`; heavy install/build/check/graph commands use the shared controller lock. No cloud, production data, GitHub or other-worktree changes.

## Task: Repair and verify generation

1. Read `packages/sdk/scripts/generate.ts`, the actual generated clause draft response types and current SDK tests. Confirm the reported null-filter fallthrough.
1. Add a focused RED test against actual generated public types: draft n is exactly null, accepts null and rejects another value. Protect nullable typed and unconstrained cases at an appropriate public/generation seam without asserting a private implementation line.
1. Run the focused test/type check and retain the actual failure.
1. Correct only null-only schema handling, then run `bun run --cwd packages/sdk generate`. Inspect the generated delta; no operation/schema hash should change because authoritative OpenAPI is unchanged.
1. Run SDK parity/runtime/smoke tests, the new type regression, affected typecheck and full lint. Avoid repeating the full repository runtime suite for a type-generation-only fix unless an observed failure warrants it.
1. Commit the generator/test behavior, refresh the AST graph once in a separate commit and record exact source/tree/final pins and command results.

## Review and completion

Root owns an independent full-change review covering specification and quality, then the guarded push/PR/merge and #560 closure. Preserve test evidence and rulings before cleanup. The user already authorized these actions; no new approval is needed.
