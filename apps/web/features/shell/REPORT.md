# App shell handoff for issue #96, part 96a

The shell is implemented within the assigned paths. Its isolated browser harness passes in English and the 30% pseudo locale. The combined app still needs worker 96b and 96c files before its typecheck and production build can pass.

1. [Files written](#files-written)
1. [Acceptance and tests](#acceptance-and-tests)
1. [Verification](#verification)
1. [Assumptions and remaining integration](#assumptions-and-remaining-integration)
1. [Malay catalogue for review](#malay-catalogue-for-review)

## Files written

| Path                                             | Purpose                                                                    |
| ------------------------------------------------ | -------------------------------------------------------------------------- |
| `apps/web/features/shell/types.ts`               | ShellData, membership and project interfaces                               |
| `apps/web/features/shell/operations.ts`          | Registry operations adapted for apiFetch and stubApi                       |
| `apps/web/features/shell/load.ts`                | Server reads, session forwarding, pagination and empty results on failure  |
| `apps/web/features/shell/preferences.ts`         | PATCH the rail preference; require the server to confirm the saved value   |
| `apps/web/features/shell/navigation.ts`          | Sidebar destinations and the nine project destinations                     |
| `apps/web/features/shell/shell.tsx`              | Sidebar, rail, top line, project navigation, phone bar and mount slots     |
| `apps/web/features/shell/shell.css`              | Responsive dimensions, wrapping and selection tokens                       |
| `apps/web/features/shell/switchers.tsx`          | Organisation and project menus and the phone scope sheet                   |
| `apps/web/features/shell/i18n.ts`                | Feature-local catalogue registration with shared t()                       |
| `apps/web/features/shell/index.ts`               | Public shell exports                                                       |
| `apps/web/features/shell/test-request.ts`        | Validate the planted harness request data                                  |
| `apps/web/features/shell/test-harness.tsx`       | Test-only hydration readiness marker                                       |
| `apps/web/features/shell/REPORT.md`              | This handoff and Malay review list                                         |
| `apps/web/app/(app)/layout.tsx`                  | Load ShellData; mount AppShell, ApprovalsCount and CommandPalette          |
| `apps/web/app/(app)/[org]/layout.tsx`            | Mount OrgLive                                                              |
| `apps/web/app/(app)/[org]/[project]/layout.tsx`  | Mount DeclareWindowDialog                                                  |
| `apps/web/app/%5Ftest/shell/page.plant.tsx`      | Harness; absent without PLANTED_ROUTES=1 and not found unless APP_ENV=test |
| `apps/web/e2e/shell/shell.spec.ts`               | Browser acceptance tests                                                   |
| `apps/web/e2e/shell/playwright.pseudo.config.ts` | Run the same shell matrix against the pseudo build                         |
| `apps/web/test/shell/load.test.ts`               | Registry loading and failure tests                                         |
| `apps/web/test/shell/preferences.test.ts`        | Preference wire and confirmation tests                                     |
| `apps/web/test/shell/catalogue.test.ts`          | English/Malay registration and parity                                      |
| `packages/i18n/catalogue/en/app-shell.json`      | English shell copy                                                         |
| `packages/i18n/catalogue/ms/app-shell.json`      | Malay shell copy                                                           |

## Acceptance and tests

Browser test names below are in `apps/web/e2e/shell/shell.spec.ts`. The same 15 tests pass in English and pseudo mode.

| Issue acceptance                                                        | Test names and evidence                                                                                                                                                                                                                                                                                                                                                             |
| ----------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Keyboard order: skip link, sidebar, top line, tabs                      | `keyboard order is skip link, sidebar, top line, then the nine project tabs`; `skip link moves focus to page content`                                                                                                                                                                                                                                                               |
| 375px phone: five labelled 44px items, collapsed breadcrumb and sheet   | `375px has five labelled bottom items with 44px targets and a scope sheet`                                                                                                                                                                                                                                                                                                          |
| 900px: 50px rail, tooltips and accessible names                         | `900px uses a 50px rail with accessible names and dismissable tooltips`                                                                                                                                                                                                                                                                                                             |
| 1280px: 224px sidebar, 48px top line, catalogue wordmark                | `1280px shows the 224px labelled sidebar and 48px top line`                                                                                                                                                                                                                                                                                                                         |
| Nine project destinations; selection 1px, 2px in high contrast          | Keyboard test counts all nine links; `axe passes in dark and the active label uses the selection thickness`, and the light/high contrast variants. Selection uses text decoration on the label span, so its width follows the text; rail selection uses a 16px bar and the same thickness token.                                                                                    |
| Switchers show only supplied memberships with roles and scoped projects | `switchers list only supplied memberships with roles and projects in that organisation`                                                                                                                                                                                                                                                                                             |
| Empty real data: n=0 and next action                                    | `empty data prints n=0 with the next action and no sample organisations`; `a membership without projects shows n=0 and its role-appropriate next action`                                                                                                                                                                                                                            |
| Preference writes use the registry PATCH and stubApi                    | `rail preference PATCH uses stubApi and survives the next server-provided preference`; `a failed preference write restores the sidebar and explains how to retry`                                                                                                                                                                                                                   |
| Axe clean in dark, light and high contrast                              | The three `axe passes in ...` tests                                                                                                                                                                                                                                                                                                                                                 |
| 30% expanded copy does not clip labels or tabs                          | `labels and tabs do not clip, including the 30 percent pseudo locale`; `long organisation and project names wrap without hiding controls`                                                                                                                                                                                                                                           |
| Server uses membership/project registry reads, with no sample fallback  | Unit tests: `loads only real memberships and their scoped projects, following cursors and forwarding the session`; parameterised `returns empty data when memberships answer %s` for 501/500/401; `keeps memberships when project reads fail and never supplies sample projects`; `invalid response data produces an empty result`; `reads a saved rail preference from the server` |
| Saved rail state must be acknowledged by the backend                    | Unit tests: `persists the rail choice through the registry PATCH operation`; `does not report persistence when an old backend ignores the collapse field`                                                                                                                                                                                                                           |
| English and real Malay keys                                             | `the shell registers its English and Malay catalogues with the shared translator`                                                                                                                                                                                                                                                                                                   |
| Three shared mounts and palette rendering                               | Imports and mount points exist in the three layouts. Their rendering and the actual Cmd+K/Ctrl+K/escape palette flow await workers 96b/96c; the harness does not substitute fake product placeholders.                                                                                                                                                                              |

## Verification

| Command                                                                                                                                          | Result                                                                                                                                                                 |
| ------------------------------------------------------------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `bun run lint`                                                                                                                                   | Passed: Prettier, ESLint and dependency boundaries                                                                                                                     |
| `bun run typecheck`                                                                                                                              | Fails only on four expected unresolved imports: windows/declare-window-dialog in project layout; org-live in organisation layout and app layout; palette in app layout |
| `bun run test`                                                                                                                                   | 453 passed, 1 existing skip; all 10 shell tests pass                                                                                                                   |
| `E2E_BASE_URL=http://localhost:3196 bunx playwright test e2e/shell/shell.spec.ts --workers=1` from apps/web                                      | 15 passed                                                                                                                                                              |
| `I18N_PSEUDO=1 E2E_BASE_URL=http://localhost:3197 bunx playwright test --config e2e/shell/playwright.pseudo.config.ts --workers=1` from apps/web | 15 passed                                                                                                                                                              |

Browser runs used real Chromium against isolated Next development servers with APP_ENV=test and PLANTED_ROUTES=1. The pseudo server also used I18N_PSEUDO=1. They bypass the production-build prerequisite because its TypeScript step is blocked by the missing worker imports. A pre-existing RootDocument head hydration warning appears in development. The harness waits for hydration before testing event-driven controls. Preference tests activate the control by keyboard to avoid the development indicator covering the sidebar footer.

## Assumptions and remaining integration

1. The registry's Preferences schema has no collapse field. This slice assumes `sidebar_collapsed: boolean`, permits it only at its local adapter, reads it from server preferences, and requires PATCH responses to confirm it. No shared contract was changed. Issue #99 must add the agreed field and persistence. A backend that ignores it produces a visible save error and restores the previous state.
1. Worker 96b supplies `features/org-live` and `features/windows/declare-window-dialog`; worker 96c supplies `features/palette`. Current mount assumptions are `OrgLive({org})`, `DeclareWindowDialog({org, project})`, and no required props for ApprovalsCount or CommandPalette. Values named org/project are route slugs. Reconcile these signatures when the placeholder files arrive, then rerun the combined app checks and palette keyboard tests.
1. This repo has no `@/` alias, so mount imports use relative paths to the requested modules. Existing shadcn components are composed without adding or changing any UI component. Route destinations use navigation links with aria-current rather than an ARIA tab widget that would require local tab panels.
1. The explicit shared catalogue loader was outside this slice. The shell registers its catalogue locally when imported, then calls the shared t(). Marketing imports no shell module or shell catalogue. No package.json, bun.lock or shared i18n source file was edited.
1. No git commands ran. Graph artifacts were not refreshed because they are outside the assigned write boundary. Real-session gates await #94; full app rendering and the production browser build await the other #96 slices. No temporary worker placeholders were added.

## Malay catalogue for review

All strings are under `app-shell`. This is the full English/Malay list for the issue's Malay reader. The brand and keyboard hint intentionally retain their spelling.

| Key                  | English                                                                 | Malay                                                             |
| -------------------- | ----------------------------------------------------------------------- | ----------------------------------------------------------------- |
| `brand`              | Skyclause                                                               | Skyclause                                                         |
| `skip`               | Skip to content                                                         | Langkau ke kandungan                                              |
| `navigation`         | Main navigation                                                         | Navigasi utama                                                    |
| `projectNavigation`  | Project navigation                                                      | Navigasi projek                                                   |
| `mobileNavigation`   | Phone navigation                                                        | Navigasi telefon                                                  |
| `dashboard`          | Dashboard                                                               | Papan pemuka                                                      |
| `approvals`          | Approvals                                                               | Kelulusan                                                         |
| `projects`           | Projects                                                                | Projek                                                            |
| `analysis`           | Analysis                                                                | Analisis                                                          |
| `developers`         | Developers                                                              | Pembangun                                                         |
| `connect`            | Connect your AI                                                         | Sambungkan AI anda                                                |
| `settings`           | Settings                                                                | Tetapan                                                           |
| `account`            | Account                                                                 | Akaun                                                             |
| `help`               | Help                                                                    | Bantuan                                                           |
| `more`               | More                                                                    | Lagi                                                              |
| `collapse`           | Collapse sidebar                                                        | Kecilkan bar sisi                                                 |
| `expand`             | Expand sidebar                                                          | Kembangkan bar sisi                                               |
| `organisations`      | Organisations                                                           | Organisasi                                                        |
| `switchOrganisation` | Switch organisation                                                     | Tukar organisasi                                                  |
| `membershipLabel`    | {name}, {role}                                                          | {name}, {role}                                                    |
| `switchProject`      | Switch project                                                          | Tukar projek                                                      |
| `switchScope`        | Switch organisation or project                                          | Tukar organisasi atau projek                                      |
| `organisationLabel`  | Switch organisation: {name}                                             | Tukar organisasi: {name}                                          |
| `projectLabel`       | Switch project: {name}                                                  | Tukar projek: {name}                                              |
| `scopeLabel`         | Switch organisation or project: {name}                                  | Tukar organisasi atau projek: {name}                              |
| `scopeDescription`   | Choose from your organisations and their projects.                      | Pilih daripada organisasi anda dan projeknya.                     |
| `noOrganisations`    | Organisations: n=0                                                      | Organisasi: n=0                                                   |
| `createOrganisation` | Create an organisation                                                  | Cipta organisasi                                                  |
| `noProjects`         | Projects: n=0                                                           | Projek: n=0                                                       |
| `createProject`      | Create a project                                                        | Cipta projek                                                      |
| `askProject`         | Ask an organisation admin to add a project                              | Minta pentadbir organisasi menambah projek                        |
| `loadUnavailable`    | Organisation data is unavailable. Try again, or create an organisation. | Data organisasi tidak tersedia. Cuba lagi, atau cipta organisasi. |
| `reload`             | Try again                                                               | Cuba lagi                                                         |
| `palette`            | Open command palette                                                    | Buka palet perintah                                               |
| `paletteHint`        | ⌘K                                                                      | ⌘K                                                                |
| `freshness`          | Data freshness                                                          | Kesegaran data                                                    |
| `overview`           | Overview                                                                | Gambaran keseluruhan                                              |
| `windows`            | Windows                                                                 | Tetingkap                                                         |
| `signals`            | Signals                                                                 | Isyarat                                                           |
| `clauses`            | Clauses                                                                 | Klausa                                                            |
| `calls`              | Calls                                                                   | Keputusan                                                         |
| `ledger`             | Ledger                                                                  | Lejar                                                             |
| `subscribers`        | Subscribers                                                             | Pelanggan                                                         |
| `preferenceFailed`   | Sidebar preference was not saved. Try again.                            | Pilihan bar sisi tidak disimpan. Cuba lagi.                       |
| `roles.owner`        | Owner                                                                   | Pemilik                                                           |
| `roles.admin`        | Admin                                                                   | Pentadbir                                                         |
| `roles.approver`     | Approver                                                                | Pelulus                                                           |
| `roles.editor`       | Editor                                                                  | Penyunting                                                        |
| `roles.viewer`       | Viewer                                                                  | Pembaca                                                           |
| `roles.guest`        | Guest                                                                   | Tetamu                                                            |
