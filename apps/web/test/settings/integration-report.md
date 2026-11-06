# Issue #96 integration report

The merged shell, settings frame, palette and SET-7 helpers pass the required checks. No Git commands ran. No package manifest or lockfile changed.

1. [Failures and fixes](#failures-and-fixes)
1. [Files written](#files-written)
1. [Acceptance and tests](#acceptance-and-tests)
1. [Verification](#verification)
1. [Assumptions, Malay and remaining work](#assumptions-malay-and-remaining-work)

## Failures and fixes

| Failure                                                 | Cause and fix                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           |
| ------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Forecast and sources package-export smoke tests         | Both passed on the first isolated reproduction, before edits, and in both full unit runs. Their TypeScript sources, tests and manifests match local `origin/main` at `4c09dcb879e2c11004dd8a6174d37a50ea2fe246`. The same two tests pass in a separate copy of that revision using the installed dependency versions. The original failure is not reproducible on either revision; no package fix was justified.                                                                                                        |
| Signed-out `/account/*` crawl                           | The unfinished #94 resolver threw instead of supplying a signed-out principal. The existing test-only principal cookie now accepts explicit JSON `null`; production still ignores it. The crawl supplies that fixture, expects the account gate to deny access, requires the not-found h1 and no settings frame, and continues every accessibility check. A streamed HTTP 200 is accepted only with that rendered not-found result, as Next documents.                                                                  |
| Signed-out gate loses CSS, title and accessible targets | The shared document assigned raw HTML to the entire `<head>`. During not-found recovery, React replaced the head and removed Next's stylesheets and metadata. The head now renders children. The appearance script owns its live theme-color meta; `<noscript>` supplies the SSR colour without JavaScript. This also avoids duplicate React-hoisted metas when OS high contrast changes the colour before hydration. The shared document and theme helper needed this integration fix even though #95 introduced them. |
| `/_test/set-7` target-size finding                      | The standalone leave link was 20 px high. It now has a 44 px minimum height and vertically centred text. No crawl rule or known-gap entry changed.                                                                                                                                                                                                                                                                                                                                                                      |
| Settings `428/24/700` test                              | The merged sidebar and shell padding reduced the frame's available width at a 1440 px viewport. The existing grid correctly scales its two tracks. The test now measures the exact 428/700 px tracks and 24 px gap at 1680 px, verifies the same ratio without page overflow at 1440 and 900 px, then verifies the stack at 375 px. No frame CSS changed.                                                                                                                                                               |
| Pseudo skip-link assertion                              | AppShell hides the shared document's public skip link and supplies its own target after navigation. The pseudo test now verifies and focuses the visible skip link. The crawl still requires the first keyboard stop to be a working skip link.                                                                                                                                                                                                                                                                         |

The graph refresh emitted JSON outside the repository’s Prettier style. The generated graph was formatted before the final lint run.

The planted SET-7 and shell pages remain part of automatic manifest discovery. The production smoke test now also checks that both new planted routes are absent from deployed builds.

## Files written

| File                                                | Change                                                                              |
| --------------------------------------------------- | ----------------------------------------------------------------------------------- |
| `apps/web/components/root-document.tsx`             | Preserve React-managed head resources; provide no-JavaScript theme metadata.        |
| `apps/web/lib/theme.ts`                             | Create and update the single script-owned live theme-color meta.                    |
| `apps/web/lib/principal.ts`                         | Honour an explicit signed-out test fixture only in `APP_ENV=test`.                  |
| `apps/web/features/settings/set-7/test-harness.tsx` | Give the leave link a 44 px target.                                                 |
| `apps/web/e2e/settings/settings.spec.ts`            | Measure full-size columns with room for the sidebar; verify proportional shrinking. |
| `apps/web/e2e/quality/roles.ts`                     | Supply an explicit signed-out browser fixture.                                      |
| `apps/web/e2e/quality/visit.ts`                     | Share role-aware gate expectations between normal and pseudo visits.                |
| `apps/web/e2e/quality/crawl.spec.ts`                | Use the fixture and gate-aware visitor while retaining all quality checks.          |
| `apps/web/e2e/quality/pseudo.spec.ts`               | Reuse gate expectations and exercise the visible skip link.                         |
| `apps/web/e2e/quality/planted.spec.ts`              | Include the shell and SET-7 harnesses in the production absence check.              |
| `apps/web/test/settings/signed-out.test.ts`         | Test explicit signed-out resolution and production isolation.                       |
| `apps/web/test/settings/integration-report.md`      | This report.                                                                        |
| `graphify-out/graph.json`                           | Refresh the code graph; generated HTML and graph report were refreshed too.         |

## Acceptance and tests

| Issue acceptance                                                              | Test names                                                                                                                                                                                                                                                                                                                                                  |
| ----------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Signed-out visitors receive not-found from settings gates                     | All seven `/account/<section> as signed out` crawl cases; `pseudo copy fits /account/<section>`; `an explicit signed-out fixture resolves to null without calling unfinished auth`; `production ignores the signed-out fixture and resolves real credentials`.                                                                                              |
| SET-1, SET-3 and SET-4 route visibility and keyboard access                   | `SET-1 all seven routes admit a signed-in account`; `SET-1 guests get appearance only`; both `SET-3 all ten routes admit ...` cases; Approver and cross-organisation denial cases; `SET-4 keyboard navigation reaches all panels and clause sheet versions`; `SET-4 denies Approvers and a different organisation`.                                         |
| Settings dimensions, phone stack and pseudo copy                              | `settings frame uses 428/24/700 columns and stacks below 640px`; `30% pseudo-locale clips no settings title at phone, rail and desktop widths`.                                                                                                                                                                                                             |
| Axe, skip link, headings, targets, reflow, tabular figures and reduced motion | The unchanged quality checks run on every visit, including `/_test/set-7` and all seven signed-out account routes, across dark, light, high contrast, 375 px and 320 px. Shell and settings axe cases pass in all three themes.                                                                                                                             |
| SET-7 interaction and worst-case text                                         | Exact-name typing/reset; named confirmation with trapped/restored focus; deferred commit after 10 s; Undo cancels all writes; pagehide commits with keepalive exactly once; beforeunload and link/imperative/history guards; long Malay, identifier and Chinese object names at 320 px; all three dialog axe cases. See `e2e/set-7.spec.ts` for full names. |
| Shell keyboard order, widths, empty data and supplied memberships             | All 15 cases in `e2e/shell/shell.spec.ts`, including `keyboard order is skip link, sidebar, top line, then the nine project tabs`, `labels and tabs do not clip, including the 30 percent pseudo locale`, and both n=0 next-action cases.                                                                                                                   |
| Palette keyboard and accessible dialogs                                       | Cmd+K, Ctrl+K, Escape/focus restoration and all theme cases in `e2e/palette/palette.spec.ts`; source role filtering in `test/palette/sources.test.ts`.                                                                                                                                                                                                      |
| Every placeholder has an owner                                                | `check:unbuilt reports every settings panel and shared part under its spec owner` verifies all 23 panels and all shared-part files. `check:unbuilt --owner f-ui-shell` finds no placeholders owned by this ticket.                                                                                                                                          |
| Landing remains isolated and within budget                                    | `the landing page ships at most 150 KB of compressed JavaScript before first interaction`: 148.8 KB. Prerender and JavaScript-off public-page checks also pass.                                                                                                                                                                                             |

The shared document fix was separately checked against 11 browser cases covering denied account routes, SSR appearance, light/dark/high contrast, live OS changes and unmatched-route documents. Desktop and phone settings screenshots were inspected.

## Verification

Required commands ran in order after the code fixes. Final output lines and exit status:

| Command                                                                                             | Final lines                                                                                     | Exit               |
| --------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------- | ------------------ |
| `bun run lint`                                                                                      | `All matched files use Prettier code style!` followed by successful ESLint and boundary checks. | 0                  |
| `bun run typecheck`                                                                                 | `$ tsc --noEmit -p pilot && tsc -b`                                                             | 0                  |
| `bun run test`                                                                                      | `Test Files 91 passed (91)`; `Tests 479 passed \| 1 skipped (480)`                              | 0                  |
| `bun run test:e2e`, normal                                                                          | `58 skipped`; `107 passed (2.1m)`                                                               | 0                  |
| `bun run test:e2e`, pseudo                                                                          | `16 skipped`; `14 passed (36.6s)`                                                               | 0                  |
| `I18N_PSEUDO=1 bunx playwright test --config=e2e/shell/playwright.pseudo.config.ts` in `apps/web`   | `15 passed (31.1s)`                                                                             | 0                  |
| `I18N_PSEUDO=1 bunx playwright test --config=e2e/palette/playwright.pseudo.config.ts` in `apps/web` | `12 skipped`; `18 passed (29.2s)`                                                               | 0                  |
| `bunx playwright test --config=e2e/settings/pseudo.config.ts` in `apps/web`                         | `1 passed (18.5s)`                                                                              | 0                  |
| Main-revision forecast/sources smoke tests                                                          | `Test Files 2 passed (2)`; `Tests 2 passed (2)`                                                 | 0                  |
| `bun run check:unbuilt`                                                                             | `88 unbuilt placeholder(s) remain`; the script exits 1 while placeholders remain.               | 1, expected report |
| `bun run check:unbuilt --owner f-ui-shell`                                                          | `no unbuilt placeholders`                                                                       | 0                  |
| `graphify update .`                                                                                 | `Rebuilt: 6047 nodes, 9474 edges, 417 communities`; `Code graph updated.`                       | 0                  |

## Assumptions, Malay and remaining work

The column sizes are the full-width design values. Narrower desktop and rail viewports keep their existing 428:700 ratio; below 640 px the frame stacks. Explicit test `null` means signed out; a missing or malformed fixture still delegates to real auth. No production authentication fallback was added.

This integration adds no user-facing strings and changes no Malay catalogue. The Malay-reader lists remain in `features/shell/REPORT.md` and `test/settings/report.md`; palette and SET-7 copy is in `packages/i18n/catalogue/ms/palette.json` and `packages/i18n/catalogue/ms/set7.json`.

Real-session gates still require #94. The 12 action-owner SET-7 cases remain `test.fixme` until their panels land, as #96 requires. Dynamic quality-crawl URLs still await the existing parameter fixtures; their settings role matrix is exercised by the explicit settings suite. The embed budget awaits #191, and the production planted-route smoke runs only against a deployed build. These are existing, explicit suite skips; no new skip or known gap was added.

The graph refresh reports the environment's missing `tree_sitter_hcl` dependency for Terraform files; TypeScript code extraction completed. No #96 integration failure remains in the required commands.
