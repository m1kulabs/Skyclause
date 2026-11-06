# Ledger and evidence implementation

Issue: [#167](https://github.com/m1kulabs/Skyclause/issues/167).
The approved Ledger and Evidence screens in DESIGN.md define this work.

1. [Plan](#plan)
1. [Contract seams](#contract-seams)
1. [Files written](#files-written)
1. [Acceptance evidence](#acceptance-evidence)
1. [Verification](#verification)
1. [Human steps and remaining dependencies](#human-steps-and-remaining-dependencies)
1. [Malay copy review](#malay-copy-review)

## Plan

1. Test URL filters, permission gates, request states, table windowing and CSV response handling.
1. Build the ledger route, measured windowed table, filters, exports, verification and archive sheet.
1. Build evidence creation, list, status refresh, pack sheet, reading provenance, downloads and approval.
1. Exercise all acceptance criteria in Chromium, including mobile CPU throttling, keyboard, themes and pseudo copy.
1. Run frozen install, lint, typecheck, unit tests, normal and pseudo e2e, and graph update. Record the results below.

## Contract seams

The central registry has no evidence list operation. The frontend adapter uses
`GET /v1/projects/{id}/evidence-requests`, cursor pagination and the existing
`EvidenceRequest` response schema, as required by #167. #159 owns its route.
The archive contract exposes file kinds and capture times but no label field;
the screen uses translated labels for the three documented file kinds.
Backend handlers, production rollout and physical-device measurements remain
with their named owners and human steps.

The delay's crossing instant uses `CallView.triggered_at`, the call trigger time exposed by the current contract. Missing times read “Not recorded”; no timestamp is inferred. Dates in the filter are local calendar dates; request-form times are explicitly MYT and sent as UTC instants.

## Files written

This list includes the earlier partial implementation retained and completed in this session. No dependency was added. No marketing route or shared marketing import was changed. No git command was run.

| Area             | Files                                                                                                                          | Purpose                                                                                                                                                |
| ---------------- | ------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Route            | `apps/web/app/(app)/[org]/[project]/ledger/page.tsx`                                                                           | Resolve route parameters, principal and locale; mount the ledger inside the existing project shell.                                                    |
| Ledger           | `apps/web/features/ledger/page.tsx`, `table.tsx`, `model.ts`, `ledger.css`                                                     | URL filters and removable chips, pagination, corrections, CSV, integrity, measured table windowing and phone containment.                              |
| Ledger support   | `apps/web/features/ledger/operations.ts`, `use-read.ts`, `problem.ts`, `feedback.tsx`, `archive.tsx`, `download.ts`, `i18n.ts` | Contract adapters, abortable reads, error/loading states, archive sheet, downloads and feature-only catalogue registration.                            |
| Evidence         | `apps/web/features/evidence/request.tsx`, `list.tsx`, `pack.tsx`                                                               | Request validation and MYT conversion, status polling, URL sheets, provenance, JSON downloads and human approval gates.                                |
| Copy             | `packages/i18n/catalogue/en/ledger.json`, `ms/ledger.json`, `en/evidence.json`, `ms/evidence.json`                             | All new interface copy; Malay strings listed below.                                                                                                    |
| Fetch            | `apps/web/lib/api-fetch.ts`, `apps/web/test/lib/api-fetch.test.ts`                                                             | Parse CSV responses as text; test response bytes through the operation schema.                                                                         |
| Browser harness  | `apps/web/e2e/harness/stub-api.ts`, `expect-unclipped-text.ts`, `apps/web/playwright.config.ts`                                | GET/POST stubs sharing a path, modal scroll-lock clipping regression, ledger pseudo coverage and optional `E2E_WORKERS` for reproducible measurements. |
| Tests            | `apps/web/e2e/ledger/fixtures.ts`, `ledger.spec.ts`, `performance.spec.ts`, `apps/web/test/ledger/model.test.ts`               | Test doubles, acceptance flows, worst-case layout, themes, Malay, keyboard, axe and LED-7 measurements.                                                |
| Report and graph | `docs/implementation/issue-167.md`, `graphify-out/graph.json`                                                                  | Acceptance mapping, exact verification results, translation review and refreshed relationships.                                                        |

## Acceptance evidence

Browser test names below are in [ledger.spec.ts](/apps/web/e2e/ledger/ledger.spec.ts), except the INP test in [performance.spec.ts](/apps/web/e2e/ledger/performance.spec.ts). The full ledger matrix also runs in the 30% pseudo build.

| #   | Issue acceptance line                                                                            | Evidence                                                                                                                                                                                                                                                                                                                                                                               |
| --- | ------------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | LED-7: 10,000 entries, Moto G Power (2022), 4× CPU, scroll and every filter under 200 ms INP     | **Unresolved: latest full normal run reaches 264 ms.** `LED-7 Moto G Power (2022), 4x CPU: 10000 stub entries scroll and every filter stays below 200ms INP`. Uses Lighthouse's 412×823 screen, 1.75 DPR and mobile UA, CDP throttling and `web-vitals.onINP`. Waits for each phase's Event Timing entry. Bounds rendered rows and checks `aria-rowcount=10001`. Only emulation ran.   |
| 2   | Reloadable filters, “1–50 of n”, filtered CSV, integrity ok or first bad entry                   | `LED-7 filters survive reload, totals and CSV use current filters, integrity identifies the first bad entry`; `LED-7 paginated ledger reads 1–50 then 51–100 and correction links find the original entry`; `LED-7 selected filter chips clear one URL filter by keyboard and preserve the others`.                                                                                    |
| 3   | Exact empty ledger message                                                                       | `LED-7 empty ledger prints n=0 and its next action; unavailable operations show an error`. Also proves a failed operation does not become an empty result.                                                                                                                                                                                                                             |
| 4   | Share-link reviewer waits for approval, then replied time; guest not reviewed                    | `LED-4 request by call sends Idempotency-Key, survives reload and advances from waiting to replied` uses a real `share_link` test principal with reviewer access; `LED-4 guest is not reviewed and JSON download saves the GET response`.                                                                                                                                              |
| 5   | Every value has a reading ID; warnings verbatim with gloss or exact no-warning text              | `LED-5 and LED-6 pack values expose readings, verbatim Malay, gloss, frames and four MYT times`; `LED-5 calls, approvals, grades and ledger values link to readings; long table content wraps`; the guest test exercises no warnings. Reading links open focusable HoverCards and Esc dismisses them.                                                                                  |
| 6   | Pack header shows received, drafted, approved and replied MYT times                              | `LED-5 and LED-6 pack values expose readings, verbatim Malay, gloss, frames and four MYT times`; `expectZonedTimes` checks displayed timestamps.                                                                                                                                                                                                                                       |
| 7   | Only Approver/Admin/Owner human sessions can approve external replies; others download           | `external reply approval is gated for owner`, `admin`, `approver`, `editor`, `viewer`; guest and internal-reply tests; unit test `only a human approver session can approve an external reply awaiting approval`.                                                                                                                                                                      |
| 8   | Pilot archive link appears only with files                                                       | `LED-8 pilot archive appears only with files and downloads stay outside the ledger`. Sheet labels, capture time, download URL, Esc and focus return are asserted.                                                                                                                                                                                                                      |
| 9   | Phone table scrolls in its frame and fixes the date column                                       | `ledger, request, archive and pack are keyboard usable and axe-clean in dark`, `light`, `high-contrast`; `LED-5 calls, approvals, grades and ledger values link to readings; long table content wraps`. Includes 320 px, document-width assertion and fixed-date x-coordinate check after horizontal scrolling.                                                                        |
| 10  | Zero serious/critical axe findings; keyboard actions                                             | The three theme tests scan ledger, request dialog, archive sheet and pack. Other flows use Enter, Tab-compatible links, Escape and focus return. `LED-4 evidence list opens its URL sheet and returns keyboard focus on close` tests URL navigation and trigger focus. `Malay ledger and evidence copy renders with MYT times and no clipped text` adds Malay and language attributes. |
| 11  | Repeat visual/axe checks after #171/#172                                                         | Pending their real shared components. Existing `ModeBadge` and `InputAgeChip` exports and props are used; their owners' `data-unbuilt` placeholders remain untouched. The rich pack test mounts both seams.                                                                                                                                                                            |
| 12  | Repeat against real production routes after #146/#159                                            | Pending #93 route mounting and #146/#159 handlers. This session uses schema-validated `stubApi` responses and operation errors; it does not invent real records or implement those handlers.                                                                                                                                                                                           |
| 13  | Real data only; 10,000 doubles only inside spec                                                  | The 10,000-row generator exists only in `performance.spec.ts`. All other doubles stay under `e2e/ledger`. Production features contain no records, seeds, replay fallback or sample data. Empty states require an actual successful empty response.                                                                                                                                     |
| 14  | Required commands pass; no owned placeholders; graph refreshed; production check quoted on issue | Command outputs and graph result below. No `notBuilt(` or `data-unbuilt` occurs in the owned route or features. No SET-7 fixme belongs to #167. Production check statement distinguishes build verification from pending real-route testing.                                                                                                                                           |

The budget/error requirement also has `budget-exhausted shows the API reset in MYT; window form validates and preserves input after failure`. It verifies invalid-field focus, UTC request bytes, reset time and retained input after HTTP 429.

Visual review found and fixed the tabs wrapper expanding the phone page beyond its viewport. The 320 px keyboard check also proved that the fixed date column hid part of a focused row action; the phone column is now narrower, with a test checking space for the whole action and its focus ring. Scroll padding clears the translated header and fixed date column. Source detection returned no findings. The clipping helper regression proves modal background scroll lock is permitted while clipped text inside the sheet still fails.

Scroll updates run as interruptible transitions, row offsets are reused between scroll events, and unchanged rows avoid repeated date formatting. A changed filter immediately hides the previous response instead of remounting its table before the next read begins.

## Verification

The latest full normal run has one remaining failure: LED-7's state-filter interaction reaches 264 ms. All functional ledger tests, the three theme matrices, the 320 px layout/focus assertions and the landing budget pass. Earlier complete emulation measurements reached 152 ms, but that result is not stable across runs. LED-7 remains unresolved; its 200 ms assertion has not been relaxed. Further performance fixes stopped under AGENTS.md's three-failed-fixes rule pending user direction.

| Command                                                                                                                   | Result       | Final output                                                                                                                                       |
| ------------------------------------------------------------------------------------------------------------------------- | ------------ | -------------------------------------------------------------------------------------------------------------------------------------------------- |
| `bun install --frozen-lockfile`                                                                                           | Pass, exit 0 | `Checked 614 installs across 672 packages (no changes) [1045.00ms]`                                                                                |
| `bun run lint`                                                                                                            | Pass, exit 0 | `All matched files use Prettier code style!` (ESLint and boundary checks also exit 0 silently.)                                                    |
| `bun run typecheck`                                                                                                       | Pass, exit 0 | `$ tsc --noEmit -p pilot && tsc -b`                                                                                                                |
| `bun run test --maxWorkers=2 --testTimeout=15000`                                                                         | Pass, exit 0 | `Test Files 92 passed (92)`; `Tests 485 passed                                                                                                     | 1 skipped (486)`; `Duration 71.62s` |
| `CI=1 E2E_PORT=31269 E2E_WORKERS=1 E2E_TIMEOUT=90000 bun run test:e2e`                                                    | Fail, exit 1 | `1 failed`; `60 skipped`; `128 passed (4.9m)`; `error: script "test:e2e" exited with code 1`. Sole failure: LED-7 state-filter INP, 264 ms.        |
| `CI=1 I18N_PSEUDO=1 E2E_PORT=31270 E2E_WORKERS=1 E2E_TIMEOUT=90000 bunx playwright test --project=pseudo` (in `apps/web`) | Pass, exit 0 | `17 skipped`; `36 passed (2.3m)`. LED-7 maximum INP: 104 ms. Run separately because normal failure stops the package script before pseudo.         |
| `graphify update .`                                                                                                       | Pass, exit 0 | `Rebuilt: 6115 nodes, 9942 edges, 413 communities`; `Code graph updated. For doc/paper/image changes run /graphify --update in your AI assistant.` |

The production-check statement and emulation-only status are quoted in [the verification comment on #167](https://github.com/m1kulabs/Skyclause/issues/167#issuecomment-6686946466). The issue remains open and no production pass is claimed.

The final pseudo run measures scroll 64 ms, pack 64 ms, mode 64 ms, state 104 ms, from 104 ms and to 104 ms. It passes the same unchanged <200 ms assertion. This does not erase the normal full-run failure.

The installed Bun reports 1.4.2; `packageManager` requests 1.4.4. No dependency or lockfile was changed. Unit-test timeouts are 15 seconds, browser-test timeouts are 90 seconds, and the browser suite uses one worker on this shared host. Those settings do not change the INP limit, CPU multiplier or dataset size. The normal landing budget is 148.8 KB compressed against a 150 KB limit.

The graph refresh warns that the pre-existing Terraform/HCL files lack `tree_sitter_hcl`; the TypeScript/TSX graph refresh succeeds. No global tooling dependency was installed.

## Human steps and remaining dependencies

LED-7 blocks full completion: the normal full suite reaches 264 ms on the state-filter interaction. Further diagnosis awaits user direction under the three-failed-fixes rule. All remaining normal tests and the full pseudo project pass.

If the team has a Moto G Power (2022), a person opens the LED-7 spec's test build through Chrome remote debugging and records physical-device INP on #167 (30 minutes). This step was not performed. Only Chromium emulation ran.

After #171 and #172 merge, repeat the visual and axe matrix with real badges and input-age chips. After #93, #146 and #159 supply production routes, run the same flows against real data, with n=0 until the first platform run. Backend chain/export/verify/archive jobs, evidence assembly/approval rows, public ledger, call pages, MCP and CLI remain with their existing issues.

## Malay copy review

All authored strings are in the two feature catalogues. The table below is the complete Malay review list, generated from the committed catalogue files. Verbatim warning text and server-supplied values are not translated by the UI; warnings retain `lang="ms"` and their API gloss.

| Key                               | Malay text                                                                                                                           |
| --------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------ |
| `ledger.title`                    | Lejar                                                                                                                                |
| `ledger.entries`                  | Entri                                                                                                                                |
| `ledger.evidence`                 | Permintaan bukti                                                                                                                     |
| `ledger.question`                 | Apakah keputusan yang dibuat, diluluskan dan dinilai, dan berapa pantas?                                                             |
| `ledger.empty`                    | Belum ada entri (n=0). Lejar merekodkan setiap keputusan yang diluluskan, disunting atau ditolak, notis, penilaian dan versi klausa. |
| `ledger.next`                     | Minta bukti untuk satu tempoh, atau kembali selepas operasi platform pertama.                                                        |
| `ledger.loading`                  | Memuatkan lejar…                                                                                                                     |
| `ledger.failed`                   | Operasi gagal. Cuba lagi.                                                                                                            |
| `ledger.retry`                    | Cuba lagi                                                                                                                            |
| `ledger.invalid`                  | Semak tarikh dan nilai penapis. Kosongkan penapis untuk mencuba lagi.                                                                |
| `ledger.from`                     | Tarikh mula                                                                                                                          |
| `ledger.to`                       | Tarikh akhir                                                                                                                         |
| `ledger.pack`                     | Pakej                                                                                                                                |
| `ledger.mode`                     | Mod                                                                                                                                  |
| `ledger.state`                    | Status                                                                                                                               |
| `ledger.all`                      | Semua                                                                                                                                |
| `ledger.clear`                    | Kosongkan penapis                                                                                                                    |
| `ledger.filter`                   | {name}: {value}                                                                                                                      |
| `ledger.removeFilter`             | Buang penapis {label}                                                                                                                |
| `ledger.export`                   | Eksport CSV                                                                                                                          |
| `ledger.exportFile`               | lejar.csv                                                                                                                            |
| `ledger.verify`                   | Semak integriti                                                                                                                      |
| `ledger.ok`                       | Integriti: baik ({count} entri disemak)                                                                                              |
| `ledger.bad`                      | Integriti gagal: entri rosak pertama {id}                                                                                            |
| `ledger.total`                    | {from}–{to} daripada {n}                                                                                                             |
| `ledger.date`                     | Tarikh                                                                                                                               |
| `ledger.window`                   | Tempoh                                                                                                                               |
| `ledger.role`                     | Peranan pelulus                                                                                                                      |
| `ledger.delay`                    | Kelewatan: ambang dilintasi → diluluskan → dihantar                                                                                  |
| `ledger.grade`                    | Penilaian                                                                                                                            |
| `ledger.actions`                  | Tindakan                                                                                                                             |
| `ledger.noValue`                  | Tidak direkodkan                                                                                                                     |
| `ledger.minutes`                  | {value} min                                                                                                                          |
| `ledger.delays`                   | Ambang dilintasi hingga diluluskan: {approved}; diluluskan hingga dihantar: {sent}                                                   |
| `ledger.corrects`                 | Membetulkan entri {id}                                                                                                               |
| `ledger.entry`                    | Entri {id}                                                                                                                           |
| `ledger.nextPage`                 | 50 entri seterusnya                                                                                                                  |
| `ledger.firstPage`                | Entri pertama                                                                                                                        |
| `ledger.frame`                    | Entri lejar; tatal untuk lajur dan baris seterusnya                                                                                  |
| `ledger.archive`                  | Arkib rintis                                                                                                                         |
| `ledger.archiveDescription`       | Fail rintis baca sahaja. Rekod ini berasingan daripada lejar platform.                                                               |
| `ledger.download`                 | Muat turun {label}                                                                                                                   |
| `ledger.captured`                 | Dirakam pada {time}                                                                                                                  |
| `ledger.kinds.sheets_ledger`      | Lejar Sheets                                                                                                                         |
| `ledger.kinds.jira_register`      | Daftar Jira                                                                                                                          |
| `ledger.kinds.run_traces`         | Jejak operasi                                                                                                                        |
| `ledger.packs.sky`                | Langit                                                                                                                               |
| `ledger.packs.crowd`              | Orang ramai                                                                                                                          |
| `ledger.modes.normal`             | Normal                                                                                                                               |
| `ledger.modes.outdoor_limited`    | Aktiviti luar terhad                                                                                                                 |
| `ledger.modes.commute_disruption` | Gangguan perjalanan                                                                                                                  |
| `ledger.modes.hybrid_recommended` | Hibrid disyorkan                                                                                                                     |
| `ledger.modes.surge_night`        | Malam lonjakan                                                                                                                       |
| `ledger.roles.owner`              | Pemilik                                                                                                                              |
| `ledger.roles.admin`              | Pentadbir                                                                                                                            |
| `ledger.roles.approver`           | Pelulus                                                                                                                              |
| `ledger.roles.editor`             | Penyunting                                                                                                                           |
| `ledger.roles.viewer`             | Pembaca                                                                                                                              |
| `ledger.roles.guest`              | Tetamu                                                                                                                               |
| `ledger.states.drafted`           | Draf disediakan                                                                                                                      |
| `ledger.states.approved`          | Diluluskan                                                                                                                           |
| `ledger.states.edited`            | Disunting                                                                                                                            |
| `ledger.states.rejected`          | Ditolak                                                                                                                              |
| `ledger.states.expired`           | Tamat tempoh                                                                                                                         |
| `ledger.states.superseded`        | Digantikan                                                                                                                           |
| `ledger.states.sending`           | Sedang dihantar                                                                                                                      |
| `ledger.states.sent`              | Dihantar                                                                                                                             |
| `ledger.states.failed`            | Penghantaran gagal                                                                                                                   |
| `evidence.request`                | Minta bukti                                                                                                                          |
| `evidence.description`            | Pilih tarikh dan tempoh masa, atau masukkan ID keputusan. Masa menggunakan MYT.                                                      |
| `evidence.target`                 | Bukti untuk                                                                                                                          |
| `evidence.span`                   | Tempoh masa                                                                                                                          |
| `evidence.call`                   | Keputusan                                                                                                                            |
| `evidence.callId`                 | ID keputusan                                                                                                                         |
| `evidence.from`                   | Bermula pada (MYT)                                                                                                                   |
| `evidence.to`                     | Berakhir pada (MYT)                                                                                                                  |
| `evidence.submit`                 | Minta bukti                                                                                                                          |
| `evidence.saving`                 | Menghantar permintaan…                                                                                                               |
| `evidence.invalid`                | Masukkan ID keputusan atau tempoh sah dengan masa akhir selepas masa mula.                                                           |
| `evidence.empty`                  | Belum ada permintaan bukti (n=0). Minta bukti untuk satu tempoh atau keputusan.                                                      |
| `evidence.loading`                | Memuatkan bukti…                                                                                                                     |
| `evidence.refresh`                | Segarkan permintaan                                                                                                                  |
| `evidence.more`                   | Permintaan seterusnya                                                                                                                |
| `evidence.status.notReviewed`     | Belum disemak                                                                                                                        |
| `evidence.status.waiting`         | Menunggu kelulusan                                                                                                                   |
| `evidence.status.replied`         | Dibalas {time}                                                                                                                       |
| `evidence.status.assembling`      | Mengumpulkan bukti                                                                                                                   |
| `evidence.pack`                   | Pakej bukti                                                                                                                          |
| `evidence.packFor`                | Pakej bukti {id}                                                                                                                     |
| `evidence.project`                | Projek {id}                                                                                                                          |
| `evidence.window`                 | Tempoh {id}                                                                                                                          |
| `evidence.received`               | Diterima                                                                                                                             |
| `evidence.drafted`                | Draf disediakan                                                                                                                      |
| `evidence.approved`               | Diluluskan                                                                                                                           |
| `evidence.replied`                | Dibalas                                                                                                                              |
| `evidence.approve`                | Luluskan balasan                                                                                                                     |
| `evidence.approving`              | Meluluskan…                                                                                                                          |
| `evidence.download`               | Muat turun pakej                                                                                                                     |
| `evidence.filename`               | bukti-{id}.json                                                                                                                      |
| `evidence.refreshPack`            | Segarkan pakej                                                                                                                       |
| `evidence.pending`                | Belum ada pakej (n=0). Segarkan permintaan selepas bukti dikumpulkan.                                                                |
| `evidence.budget`                 | Had penggunaan bukti telah dicapai. Ditetapkan semula pada {time}. Cuba lagi selepas itu.                                            |
| `evidence.readings`               | Bacaan                                                                                                                               |
| `evidence.reading`                | Bacaan {id} · {time}                                                                                                                 |
| `evidence.source`                 | Stesen {station}; sumber {source}                                                                                                    |
| `evidence.sourceLink`             | Buka sumber                                                                                                                          |
| `evidence.value`                  | {value} {unit}                                                                                                                       |
| `evidence.warnings`               | Amaran                                                                                                                               |
| `evidence.noWarnings`             | Tiada rekod amaran untuk tempoh ini                                                                                                  |
| `evidence.noGloss`                | Tiada terjemahan direkodkan                                                                                                          |
| `evidence.valid`                  | Sah {from} – {to}                                                                                                                    |
| `evidence.calls`                  | Keputusan                                                                                                                            |
| `evidence.approvals`              | Kelulusan                                                                                                                            |
| `evidence.approval`               | {id}: diluluskan oleh {by} pada {time}                                                                                               |
| `evidence.grades`                 | Penilaian                                                                                                                            |
| `evidence.frames`                 | Bingkai tersimpan                                                                                                                    |
| `evidence.frame`                  | Buka bingkai: bacaan {id} · {time}                                                                                                   |
| `evidence.ledger`                 | Entri lejar                                                                                                                          |
| `evidence.none`                   | n=0                                                                                                                                  |
| `evidence.provenanceMissing`      | Tiada rujukan bacaan direkodkan                                                                                                      |
