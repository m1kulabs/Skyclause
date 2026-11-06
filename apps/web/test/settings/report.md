# Issue 96b implementation report

Settings routes, their shared frame, and the shared React placeholders for issue #96.

1. [Files written](#files-written)
2. [Acceptance coverage](#acceptance-coverage)
3. [Interface choices and integration limits](#interface-choices-and-integration-limits)
4. [Malay copy](#malay-copy)
5. [Verification](#verification)

## Files written

All edits are within the 96b ownership list. No package manifest, lockfile, shared layout, SET-7 file, or central i18n loader was edited.

| File                                                             |
| ---------------------------------------------------------------- |
| `apps/web/app/(app)/[org]/[project]/settings/channels/page.tsx`  |
| `apps/web/app/(app)/[org]/[project]/settings/packs/page.tsx`     |
| `apps/web/app/(app)/[org]/[project]/settings/page.tsx`           |
| `apps/web/app/(app)/[org]/[project]/settings/public/page.tsx`    |
| `apps/web/app/(app)/[org]/[project]/settings/rota/page.tsx`      |
| `apps/web/app/(app)/[org]/[project]/settings/share/page.tsx`     |
| `apps/web/app/(app)/[org]/settings/ai-keys/page.tsx`             |
| `apps/web/app/(app)/[org]/settings/api-keys/page.tsx`            |
| `apps/web/app/(app)/[org]/settings/audit/page.tsx`               |
| `apps/web/app/(app)/[org]/settings/billing/page.tsx`             |
| `apps/web/app/(app)/[org]/settings/data/page.tsx`                |
| `apps/web/app/(app)/[org]/settings/general/page.tsx`             |
| `apps/web/app/(app)/[org]/settings/integrations/page.tsx`        |
| `apps/web/app/(app)/[org]/settings/members/page.tsx`             |
| `apps/web/app/(app)/[org]/settings/rota/page.tsx`                |
| `apps/web/app/(app)/[org]/settings/webhooks/page.tsx`            |
| `apps/web/app/(app)/account/ai-keys/page.tsx`                    |
| `apps/web/app/(app)/account/api-keys/page.tsx`                   |
| `apps/web/app/(app)/account/appearance/page.tsx`                 |
| `apps/web/app/(app)/account/data/page.tsx`                       |
| `apps/web/app/(app)/account/notifications/page.tsx`              |
| `apps/web/app/(app)/account/profile/page.tsx`                    |
| `apps/web/app/(app)/account/security/page.tsx`                   |
| `apps/web/e2e/settings/config.ts`                                |
| `apps/web/e2e/settings/pseudo.config.ts`                         |
| `apps/web/e2e/settings/pseudo.spec.ts`                           |
| `apps/web/e2e/settings/settings.config.ts`                       |
| `apps/web/e2e/settings/settings.spec.ts`                         |
| `apps/web/features/alerts/enable-alerts-card.tsx`                |
| `apps/web/features/brand/glyphs.tsx`                             |
| `apps/web/features/brand/index.ts`                               |
| `apps/web/features/brand/mode-badge.tsx`                         |
| `apps/web/features/bundles/bundle-detail.tsx`                    |
| `apps/web/features/data-components/bundle-card.tsx`              |
| `apps/web/features/data-components/call-row.tsx`                 |
| `apps/web/features/data-components/grade-card.tsx`               |
| `apps/web/features/data-components/index.ts`                     |
| `apps/web/features/data-components/input-age-chip.tsx`           |
| `apps/web/features/data-components/source-health-row.tsx`        |
| `apps/web/features/data-components/window-strip.tsx`             |
| `apps/web/features/org-live/index.tsx`                           |
| `apps/web/features/reauth/index.ts`                              |
| `apps/web/features/reauth/reauth-dialog.tsx`                     |
| `apps/web/features/reauth/use-reauth.ts`                         |
| `apps/web/features/settings/access.ts`                           |
| `apps/web/features/settings/account/ai-keys/panel.tsx`           |
| `apps/web/features/settings/account/api-keys/panel.tsx`          |
| `apps/web/features/settings/account/appearance/panel.tsx`        |
| `apps/web/features/settings/account/data/panel.tsx`              |
| `apps/web/features/settings/account/notifications/panel.tsx`     |
| `apps/web/features/settings/account/profile/panel.tsx`           |
| `apps/web/features/settings/account/security/panel.tsx`          |
| `apps/web/features/settings/catalogue.ts`                        |
| `apps/web/features/settings/frame.module.css`                    |
| `apps/web/features/settings/frame.tsx`                           |
| `apps/web/features/settings/gate.ts`                             |
| `apps/web/features/settings/organisation/ai-keys/panel.tsx`      |
| `apps/web/features/settings/organisation/api-keys/panel.tsx`     |
| `apps/web/features/settings/organisation/audit/panel.tsx`        |
| `apps/web/features/settings/organisation/billing/panel.tsx`      |
| `apps/web/features/settings/organisation/data/panel.tsx`         |
| `apps/web/features/settings/organisation/general/panel.tsx`      |
| `apps/web/features/settings/organisation/integrations/panel.tsx` |
| `apps/web/features/settings/organisation/members/panel.tsx`      |
| `apps/web/features/settings/organisation/rota/panel.tsx`         |
| `apps/web/features/settings/organisation/webhooks/panel.tsx`     |
| `apps/web/features/settings/project/channels/panel.tsx`          |
| `apps/web/features/settings/project/general/panel.tsx`           |
| `apps/web/features/settings/project/packs/panel.tsx`             |
| `apps/web/features/settings/project/public/panel.tsx`            |
| `apps/web/features/settings/project/rota/panel.tsx`              |
| `apps/web/features/settings/project/share/panel.tsx`             |
| `apps/web/features/settings/sections.ts`                         |
| `apps/web/features/windows/declare-window-dialog.tsx`            |
| `apps/web/test/settings/access.test.ts`                          |
| `apps/web/test/settings/catalogue.test.ts`                       |
| `apps/web/test/settings/gate.test.ts`                            |
| `apps/web/test/settings/report.md`                               |
| `apps/web/test/settings/unbuilt.test.ts`                         |
| `packages/i18n/catalogue/en/settings.json`                       |
| `packages/i18n/catalogue/ms/settings.json`                       |

## Acceptance coverage

| Acceptance line                                                                    | Test name                                                                                                                                                        | File                                              |
| ---------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------- |
| SET-1: seven signed-in routes return 200                                           | SET-1 all seven routes admit a signed-in account                                                                                                                 | `e2e/settings/settings.spec.ts`                   |
| SET-1: guests receive appearance only                                              | SET-1 guests get appearance only                                                                                                                                 | `e2e/settings/settings.spec.ts`                   |
| SET-3: ten routes return 200 for Admin and Owner                                   | SET-3 all ten routes admit admin; SET-3 all ten routes admit owner                                                                                               | `e2e/settings/settings.spec.ts`                   |
| SET-3: Approvers receive rota only                                                 | SET-3 an Approver gets only rota and its nav contains no forbidden sections                                                                                      | `e2e/settings/settings.spec.ts`                   |
| SET-3: another organisation is denied, including rota                              | SET-3 another organisation gets not-found on every route, including rota                                                                                         | `e2e/settings/settings.spec.ts`                   |
| SET-4: keyboard access to packs, channels, rota, public, share and clause versions | SET-4 keyboard navigation reaches all panels and clause sheet versions                                                                                           | `e2e/settings/settings.spec.ts`                   |
| SET-4: project settings require Admin or Owner                                     | SET-4 denies Approvers and a different organisation                                                                                                              | `e2e/settings/settings.spec.ts`                   |
| Settings geometry and stacking                                                     | settings frame uses 428/24/700 columns and stacks below 640px                                                                                                    | `e2e/settings/settings.spec.ts`                   |
| Settings axe in dark, light and high contrast                                      | settings axe: dark, standard; settings axe: light, standard; settings axe: dark, more                                                                            | `e2e/settings/settings.spec.ts`                   |
| Real 30% pseudo-locale titles at 375, 900 and 1440 pixels                          | 30% pseudo-locale clips no settings title at phone, rail and desktop widths                                                                                      | `e2e/settings/pseudo.spec.ts`, `pseudo.config.ts` |
| Every panel and shared part reports the spec owner                                 | check:unbuilt reports every settings panel and shared part under its spec owner                                                                                  | `test/settings/unbuilt.test.ts`                   |
| Missing principal renders Next not-found                                           | a missing principal gets Next not-found without a redirect                                                                                                       | `test/settings/gate.test.ts`                      |
| English and Malay catalogues load through t()                                      | every settings area and section has English and Malay copy loaded through t()                                                                                    | `test/settings/catalogue.test.ts`                 |
| Minimum-role matrix, guest restriction and organisation boundary                   | SET-1 admits signed-in accounts and limits guests to appearance; SET-3/4 deny lower roles, non-sessions and another organisation; only org rota admits Approvers | `test/settings/access.test.ts`                    |

## Interface choices and integration limits

| Topic                  | Choice or remaining dependency                                                                                                                                                                                                                                                                                                                                                         |
| ---------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Organisation scope     | The current principal exposes `orgId` but no organisation slug or membership lookup. The frame currently compares the route organisation segment directly with `principal.orgId`. Test principals use matching values. Real slug-to-ID resolution must be wired with #94/#102; this is an explicit provisional assumption, not a proof of real-session tenancy.                        |
| Panel ownership        | All 23 panels use the owner keys in spec #79 section 7. The project index panel is `features/settings/project/general/panel.tsx`. Panel contents belong to their named owners.                                                                                                                                                                                                         |
| Shared props           | Spec section 1 fixes component names but only gives explicit props for `BundleDetail`. Other props use existing contract types: windows, input, source, bundle, call and grade. Glyphs have SVG props. Org-live and window-dialog IDs remain optional so the shell can mount while real reads are unavailable. These are proposed typed interfaces for owners to retain or coordinate. |
| Reauthentication       | `useReauth(): Reauth` exposes `requireReauth(): Promise<void>` and throws `notBuilt('a-step-up')`. It never pretends to authenticate. `ReauthDialog` is a hidden placeholder with controlled open props.                                                                                                                                                                               |
| Settings rules         | The existing Separator uses an obsolete orientation selector. Settings supplies explicit `h-px w-full` classes and tests both computed heights as 1px; the shared UI file stays untouched.                                                                                                                                                                                             |
| Catalogue registration | `features/settings/catalogue.ts` registers the two catalogues through the exported catalogue map, imported only by the settings frame. The central loader and marketing imports remain untouched.                                                                                                                                                                                      |
| Area heading           | The h1 names the settings scope. The h2 names the current section beside its panel.                                                                                                                                                                                                                                                                                                    |
| Other workers          | #96a owns shared shell/layout mounting of OrgLive, ApprovalsCount and DeclareWindowDialog. #96c owns SET-7. No files in either scope were edited.                                                                                                                                                                                                                                      |
| Real sessions          | The principal resolver still belongs to #94. The gates are tested with `asPage` principals, as this ticket requires.                                                                                                                                                                                                                                                                   |
| Language review        | English and Malay keys are complete. A Malay reader still needs to review the wording below.                                                                                                                                                                                                                                                                                           |

## Malay copy

The table includes every Malay string in `packages/i18n/catalogue/ms/settings.json`.

| Key                                                       | Malay string                                                 |
| --------------------------------------------------------- | ------------------------------------------------------------ |
| `settings.scopes.account`                                 | Tetapan akaun                                                |
| `settings.scopes.organisation`                            | Tetapan organisasi                                           |
| `settings.scopes.project`                                 | Tetapan projek                                               |
| `settings.sections.account.profile.title`                 | Profil                                                       |
| `settings.sections.account.profile.description`           | Urus nama, foto dan e-mel log masuk anda.                    |
| `settings.sections.account.security.title`                | Keselamatan                                                  |
| `settings.sections.account.security.description`          | Urus kaedah log masuk dan sesi aktif.                        |
| `settings.sections.account.appearance.title`              | Paparan                                                      |
| `settings.sections.account.appearance.description`        | Pilih tema, kontras, kepadatan, gerakan dan bahasa anda.     |
| `settings.sections.account.notifications.title`           | Pemberitahuan                                                |
| `settings.sections.account.notifications.description`     | Pilih cara anda menerima amaran dan kemas kini.              |
| `settings.sections.account.ai-keys.title`                 | Kunci AI                                                     |
| `settings.sections.account.ai-keys.description`           | Urus kunci penyedia AI untuk akaun anda.                     |
| `settings.sections.account.api-keys.title`                | Kunci API                                                    |
| `settings.sections.account.api-keys.description`          | Urus kunci yang memberi alat akses kepada akaun anda.        |
| `settings.sections.account.data.title`                    | Data dan privasi                                             |
| `settings.sections.account.data.description`              | Urus data dan privasi akaun anda.                            |
| `settings.sections.organisation.general.title`            | Umum                                                         |
| `settings.sections.organisation.general.description`      | Urus nama dan pilihan organisasi.                            |
| `settings.sections.organisation.members.title`            | Ahli dan peranan                                             |
| `settings.sections.organisation.members.description`      | Urus keahlian, jemputan dan peranan.                         |
| `settings.sections.organisation.rota.title`               | Jadual pelulus                                               |
| `settings.sections.organisation.rota.description`         | Semak syif dan liputan pelulus.                              |
| `settings.sections.organisation.billing.title`            | Pengebilan                                                   |
| `settings.sections.organisation.billing.description`      | Semak pengebilan organisasi. Versi beta adalah percuma.      |
| `settings.sections.organisation.audit.title`              | Log audit                                                    |
| `settings.sections.organisation.audit.description`        | Semak perubahan yang dibuat dalam organisasi anda.           |
| `settings.sections.organisation.ai-keys.title`            | Kunci AI                                                     |
| `settings.sections.organisation.ai-keys.description`      | Urus kunci penyedia AI untuk organisasi ini.                 |
| `settings.sections.organisation.api-keys.title`           | Kunci API                                                    |
| `settings.sections.organisation.api-keys.description`     | Urus kunci yang memberi alat akses kepada organisasi ini.    |
| `settings.sections.organisation.webhooks.title`           | Webhook                                                      |
| `settings.sections.organisation.webhooks.description`     | Urus destinasi dan penghantaran webhook.                     |
| `settings.sections.organisation.integrations.title`       | Integrasi                                                    |
| `settings.sections.organisation.integrations.description` | Urus alat yang disambungkan dan kebenaran akses.             |
| `settings.sections.organisation.data.title`               | Penyimpanan data                                             |
| `settings.sections.organisation.data.description`         | Urus data, eksport dan tempoh penyimpanan organisasi.        |
| `settings.sections.project.general.title`                 | Lokasi dan zon waktu                                         |
| `settings.sections.project.general.description`           | Urus lokasi projek dan zon waktu tempatan.                   |
| `settings.sections.project.packs.title`                   | Pek dan sumber                                               |
| `settings.sections.project.packs.description`             | Urus pek dan sumber yang digunakan oleh projek ini.          |
| `settings.sections.project.channels.title`                | Saluran                                                      |
| `settings.sections.project.channels.description`          | Urus saluran yang menghantar notis yang diluluskan.          |
| `settings.sections.project.rota.title`                    | Jadual giliran                                               |
| `settings.sections.project.rota.description`              | Urus liputan pelulus untuk projek ini.                       |
| `settings.sections.project.public.title`                  | Halaman awam                                                 |
| `settings.sections.project.public.description`            | Urus maklumat projek yang dipaparkan kepada umum.            |
| `settings.sections.project.share.title`                   | Pautan perkongsian                                           |
| `settings.sections.project.share.description`             | Urus pautan yang memberi orang lain akses kepada projek ini. |
| `settings.sections.project.clauses.title`                 | Versi lembaran klausa                                        |
| `settings.sections.project.clauses.description`           | Semak versi lembaran klausa.                                 |

## Verification

Run the browser configs in sequence; both use port 49682 and configure `asPage` for the same origin. This avoids port 3100 shared by the other issue #96 worktrees.

```bash
rtk bun run lint
rtk bun run typecheck
rtk bun run test
cd apps/web
rtk bunx playwright test --config=e2e/settings/settings.config.ts settings.spec.ts pseudo.spec.ts
rtk bunx playwright test --config=e2e/settings/pseudo.config.ts pseudo.spec.ts
```

`bun run check:unbuilt` exits 1 while the requested placeholders remain. Its owner-to-file assertions run as part of Vitest. The browser tests save theme, desktop, phone and pseudo screenshots under the Playwright output directory.

Recorded results on 6 November 2026:

| Command                                   | Result                                                                                                               |
| ----------------------------------------- | -------------------------------------------------------------------------------------------------------------------- |
| `bun run lint`                            | Passed                                                                                                               |
| `bun run typecheck`                       | Passed                                                                                                               |
| `bun run test`                            | 82 files passed; 448 tests passed; 1 existing skip                                                                   |
| Settings browser config, both specs       | 13 passed                                                                                                            |
| Settings pseudo config, real pseudo build | 1 passed; text did not clip at 375, 900 or 1440 pixels                                                               |
| `bun run check:unbuilt`                   | Expected exit 1; 88 placeholders across the repository; all 23 panels and all shared part files matched their owners |

Desktop, phone, light, dark and pseudo renders were inspected. High contrast passed axe. The frame contains no invented organisation, project or person data. The panel roots remain empty until their owners replace them.
