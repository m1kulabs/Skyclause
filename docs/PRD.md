# Skyclause product requirements

What Skyclause must do, stated testably: routes, roles and permissions, the mode and clause tables, numbered requirements with acceptance criteria, non-functional targets, and the phase each requirement ships in. Why it exists is in [IDEA](/docs/IDEA.md), what it is and the [glossary](/docs/PRODUCT.md#glossary) are in PRODUCT, how it is built is in [TRD](/docs/TRD.md) and how it looks is in [DESIGN](/docs/DESIGN.md); the two merged sources are [Skyclause](/docs/ideas/02-skyclause.md) and [Fanfall](/docs/ideas/04-fanfall.md). Nothing is built yet, so every requirement is a target, not a claim.

Contents:

1.  [Scope and release phases](#scope-and-release-phases)
1.  [Information architecture](#information-architecture)
1.  [Roles and permissions](#roles-and-permissions)
1.  [Requirements](#requirements)
    1.  [Landing page (LND)](#landing-page-lnd)
    1.  [Accounts and sign-in (ACC)](#accounts-and-sign-in-acc)
    1.  [Guest access and the Commons (GST)](#guest-access-and-the-commons-gst)
    1.  [Organisations (ORG)](#organisations-org)
    1.  [Projects (PRJ)](#projects-prj)
    1.  [Dashboard (DSH)](#dashboard-dsh)
    1.  [Windows (WIN)](#windows-win)
    1.  [Signals (SIG)](#signals-sig)
    1.  [Clauses (CLS)](#clauses-cls)
    1.  [Calls and approvals (CAL)](#calls-and-approvals-cal)
    1.  [Notices and channels (NTC)](#notices-and-channels-ntc)
    1.  [Ledger and evidence (LED)](#ledger-and-evidence-led)
    1.  [Grades and analysis (ANL)](#grades-and-analysis-anl)
    1.  [Developer playground (DEV)](#developer-playground-dev)
    1.  [Connect your AI (CAI)](#connect-your-ai-cai)
    1.  [Settings (SET)](#settings-set)
    1.  [Billing (BIL)](#billing-bil)
    1.  [Localisation (LOC)](#localisation-loc)
    1.  [SDK (SDK)](#sdk-sdk)
    1.  [CLI (CLI)](#cli-cli)
    1.  [Agent layer (AGT)](#agent-layer-agt)
    1.  [Web components (WEB)](#web-components-web)
    1.  [Public pages (PUB)](#public-pages-pub)
    1.  [Audit and data rights (AUD)](#audit-and-data-rights-aud)
1.  [Non-functional requirements](#non-functional-requirements)
1.  [Analytics events](#analytics-events)
1.  [Out of scope](#out-of-scope)
1.  [Open questions](#open-questions)
1.  [See also](#see-also)

## Scope and release phases

- A requirement's priority is the phase it must first ship in: **P0** pilot (5–17 November 2026), **P1** beta (by 5 February 2027), **P2** GA (by 5 May 2027), **P3** later. Dates, themes and owners are in the [PRODUCT roadmap](/docs/PRODUCT.md#roadmap).
- **P0 is the hackathon pilot.** It runs on Gemini Enterprise workflows, Workspace connectors, Apps Script feeders, Jira Cloud Free, the phone camera on probation and the Pi 5, and keeps the idea docs' cut lines and kill criteria. P0 requirements state the behaviour the pilot must show, whatever runs it; [TRD's Gemini Enterprise pilot](/docs/TRD.md#gemini-enterprise-pilot) maps each pilot part to its platform replacement.
- **The pilot ships one pack first:** the Sky storm crossing plus evidence by email. The Crowd pack follows as its fallback: the behaviour of SIG-7 (forecast and band), SIG-11 (pending on a late file) and ANL-3 (D+1 grades), plus surge-night entries on the public conditions calendar. The fallback and stretch IDs below keep their P1 tag, and the stretch joins the pilot only if the Sky path works end to end by the end of 7 November 2026; until then, listings are added by hand with their URL and revision.
- **Acceptance** lines are pass or fail checks. Checks that use real data name the dataset, and replays are labelled replay. Test doubles are allowed in tests and nowhere else, per the [real-data convention](/docs/references/project-conventions.md#project-conventions).

| Phase       | By               | Goal                                                                                                                                                                                                                                                      | Requirement IDs                                                                                                                                                                                                                                                                      |
| ----------- | ---------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| P0          | 17 November 2026 | One live Sky crossing from feed to approved notice, evidence by email, an append-only ledger with a Jira decision record, and nightly grades, on the Gemini Enterprise pilot                                                                              | WIN-1; SIG-1–4, 6, 8, 9, 12; CLS-1–4; CAL-1, 3–6, 10, 12; NTC-1–4; LED-1, 3; ANL-1, 2; LOC-3; AUD-5                                                                                                                                                                                  |
| P0 fallback | 17 November 2026 | The Crowd fallback, following the Sky path: forecasts with bands, pending grades on a late file, next-day grading and surge-night entries on the public conditions calendar                                                                               | SIG-7, 11; ANL-3                                                                                                                                                                                                                                                                     |
| P0 stretch  | 17 November 2026 | Stretch, only if the Sky path works end to end by the end of 7 November: the 07:00 Crowd outlook, listings and the bus probe                                                                                                                              | SIG-10, 13; CAL-2, 14                                                                                                                                                                                                                                                                |
| P1          | 5 February 2027  | The platform core (windows, signals, clauses, calls, ledger) for any organisation, with self-service organisation creation open to any signed-in account, the Commons, share links, the P1 channels (email, ICS, webhooks, in-app), API, SDK, CLI and MCP | LND-1–6; ACC-1–9; GST-1–11; ORG-1–6; PRJ-1–8; DSH-1–5; WIN-2–4, 6–8; SIG-5, 7, 10, 11, 13; CLS-5–11; CAL-2, 7–9, 11, 13–19; NTC-5–10, 13, 14; LED-2, 4–8; ANL-3–7; DEV-1–5; CAI-1–4; SET-1–7; BIL-1; LOC-1, 4–7; SDK-1, 3–5; CLI-1–6; AGT-1–4, 6, 7; WEB-1–7; PUB-1–9; AUD-1–4, 6, 7 |
| P2          | 5 May 2027       | General availability: Team billing, Microsoft 365 and the platform Jira integration, the Bahasa Melayu app, A2A if a live test passes                                                                                                                     | LND-7; WIN-5; NTC-11; BIL-2–7; LOC-2; AGT-5; SDK-2                                                                                                                                                                                                                                   |
| P3          | Later            | The Campus tier with SSO, custom public-URL sources, more channels, alert digests and quiet hours, and the status badge                                                                                                                                   | ACC-10; PRJ-9; CAL-20; NTC-12; BIL-8; WEB-8                                                                                                                                                                                                                                          |

## Information architecture

All hosts are proposed subdomains on the `m1ku.tech` Cloudflare zone; nothing is registered. Marketing and public pages live on `skyclause.m1ku.tech`, the app and auth routes on `app.skyclause.m1ku.tech`, the API at `api.skyclause.m1ku.tech/v1`, the remote MCP server at `mcp.skyclause.m1ku.tech/mcp`, docs at `docs.skyclause.m1ku.tech` and embed frames at `embed.skyclause.m1ku.tech`.

| Route                                                                                              | Purpose                                                                 | Who can see it                                      |
| -------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------- | --------------------------------------------------- |
| `/`                                                                                                | Landing with the live call; pricing and FAQ are sections                | Everyone                                            |
| `/ms/`                                                                                             | Malay landing                                                           | Everyone                                            |
| `/docs`                                                                                            | Redirect to `docs.skyclause.m1ku.tech`                                  | Everyone                                            |
| `/status`                                                                                          | Service status, incidents and source status                             | Everyone                                            |
| `/legal/privacy`, `/legal/terms`                                                                   | PDPA notice and terms                                                   | Everyone                                            |
| `/p/{org}/{project}`                                                                               | Public project page                                                     | Everyone, if the project publishes it               |
| `/p/{org}/{project}/ledger`                                                                        | Public ledger                                                           | Everyone, if published                              |
| `/p/{org}/{project}/calendar.ics`                                                                  | Conditions calendar                                                     | Everyone, if published                              |
| `/p/{org}/{project}/favicon.svg`                                                                   | Live favicon coloured by the current real mode                          | Everyone, if published                              |
| `/c/{callId}`, `/c/{callId}/og.png`                                                                | Call permalink and its Open Graph image                                 | Everyone for public projects; members otherwise     |
| `/oembed`, `/openapi.json`, `/skills`                                                              | oEmbed endpoint, OpenAPI document, Agent Skills pack                    | Everyone                                            |
| `/.well-known/oauth-authorization-server`, `/.well-known/oauth-protected-resource`                 | OAuth metadata for MCP clients                                          | Everyone                                            |
| `/.well-known/agent-card.json`                                                                     | A2A agent card, only if AGT-5 ships                                     | Everyone                                            |
| `embed.skyclause.m1ku.tech/{org}/{project}`                                                        | Embed frames                                                            | Any page embedding a public project                 |
| `/sign-in`, `/sign-up`                                                                             | Magic link, Google, passkeys                                            | Everyone                                            |
| `/guest`                                                                                           | Continue as guest into the Commons                                      | Everyone                                            |
| `/device`                                                                                          | CLI device-code login                                                   | Signed-in accounts                                  |
| `/oauth/consent`                                                                                   | Consent for an MCP client                                               | Signed-in accounts, not guests                      |
| `/invite/{token}`, `/share/{token}`, `/subscribe/{token}`                                          | Accept an invite, open a share link, subscribe or manage a subscription | Holders of the token                                |
| `/new`                                                                                             | Create an organisation                                                  | Signed-in accounts, not guests                      |
| `/{org}`                                                                                           | Dashboard                                                               | Members                                             |
| `/{org}/approvals`                                                                                 | Bundles needing review across projects                                  | Members; actions for Approver and above             |
| `/{org}/projects`, `/{org}/analysis`                                                               | Project list; organisation roll-up of grades                            | Members                                             |
| `/{org}/new`                                                                                       | Create a project                                                        | Admin and above                                     |
| `/{org}/{project}`                                                                                 | Project overview                                                        | Members, share-link holders, guests in the Commons  |
| `/{org}/{project}/windows`, `/signals`, `/clauses`                                                 | Windows, sources and readings, clause sheet                             | Same as overview; editing per the matrix            |
| `/{org}/{project}/calls`, `/calls/{id}`, `/bundles/{id}`                                           | Calls, one call, one bundle and its approval                            | Same as overview; approval per the matrix           |
| `/{org}/{project}/ledger`, `/analysis`                                                             | Ledger; grades and analysis                                             | Same as overview                                    |
| `/{org}/{project}/subscribers`                                                                     | Subscribers and their windows                                           | Admin and above; Approvers see counts               |
| `/{org}/{project}/settings` and `/packs`, `/channels`, `/rota`, `/public`, `/share`                | Project settings                                                        | Admin and above                                     |
| `/{org}/settings/{general,members,rota,billing,audit,ai-keys,api-keys,webhooks,integrations,data}` | Organisation settings                                                   | Admin and above; billing changes by Owner           |
| `/account/{profile,security,appearance,notifications,ai-keys,api-keys,data}`                       | Account settings                                                        | The signed-in account; guests get appearance only   |
| `/developers`, `/developers/{api,clauses,webhooks,mcp}`                                            | Developer playground                                                    | Signed-in accounts and guests (Commons guest token) |
| `/connect`                                                                                         | Connect your AI                                                         | Signed-in accounts                                  |
| `/commons/bukit-jalil`                                                                             | The Commons project                                                     | Guests and signed-in accounts                       |

- **Reserved slugs:** no organisation or project may take a top-level segment of any host: `new`, `account`, `developers`, `connect`, `approvals`, `projects`, `analysis`, `settings`, `api`, `commons`, `admin`, `p`, `c`, `embed`, `docs`, `status`, `guest`, `device`, `sign-in`, `sign-up`, `invite`, `share`, `subscribe`, `oauth`, `ms`, `legal`, `skills`, `oembed`, `openapi.json`, `.well-known`, `v1`, `mcp`, `health`, `healthz`, `window` or `elements`. A new top-level route joins this list before it ships.
- **Slug format:** lowercase letters, digits and single hyphens, 2–39 characters, starting and ending with a letter or digit; unique per level.
- **Command palette:** Cmd/Ctrl+K opens it on every app route (DSH-5). It jumps to an organisation, project, window, bundle or call by ID, opens a station by ID (`0232901RF`, `CA16W`, `SP17`), declares a window, searches the ledger and switches theme, and lists only actions the current role may take.

## Roles and permissions

Roles are cumulative (Viewer < Editor < Approver < Admin < Owner), so Admins and Owners can approve, which the escalation path needs. A Guest exists only in the Commons, a share-link reviewer only in the shared project, and a Subscriber has no account and acts by magic link or email. API keys carry the scopes `read`, `draft` or `admin`, capped by the creator's role; MCP tokens carry `read` and `draft` only. "Never" means no scope, token, plan or setting can grant it. TRD's [Auth and tenancy](/docs/TRD.md#auth-and-tenancy) enforces this matrix.

| Action                               | Owner | Admin             | Approver    | Editor      | Viewer      | Guest            | Share-link reviewer   | Subscriber      | API key | MCP token |
| ------------------------------------ | ----- | ----------------- | ----------- | ----------- | ----------- | ---------------- | --------------------- | --------------- | ------- | --------- |
| View project, signals and calls      | Yes   | Yes               | Yes         | Yes         | Yes         | Commons          | Shared project        | No              | `read`  | `read`    |
| View ledger                          | Yes   | Yes               | Yes         | Yes         | Yes         | Commons          | Shared project        | Public ledger   | `read`  | `read`    |
| Declare window                       | Yes   | Yes               | Yes         | Yes         | No          | Guest window     | Reviewer link         | Own, by form    | `draft` | `draft`   |
| Ask for a call (start a run)         | Yes   | Yes               | Yes         | Yes         | No          | Budgeted         | By declaring a window | No              | `draft` | `draft`   |
| Request evidence                     | Yes   | Yes               | Yes         | Yes         | Yes         | Budgeted, in-app | Reviewer link         | By email        | `draft` | `draft`   |
| Edit clause sheet draft              | Yes   | Yes               | Yes         | Yes         | No          | No               | No                    | No              | `admin` | No        |
| Publish clause sheet version         | Yes   | Yes               | Yes         | No          | No          | No               | No                    | No              | No      | No        |
| Approve bundle; edit or reject calls | Yes   | Yes               | Yes         | No          | No          | Never            | No                    | No              | Never   | Never     |
| Approve, change or cancel a listing  | Yes   | Yes               | Yes         | No          | No          | Never            | No                    | No              | Never   | Never     |
| Manage rota                          | Yes   | Yes               | Own shifts  | No          | No          | No               | No                    | No              | No      | No        |
| Manage sources and packs             | Yes   | Yes               | No          | No          | No          | No               | No                    | No              | `admin` | No        |
| Manage channels and subscribers      | Yes   | Yes               | No          | No          | No          | No               | No                    | Own preferences | `admin` | No        |
| Manage webhooks and integrations     | Yes   | Yes               | No          | No          | No          | No               | No                    | No              | `admin` | No        |
| Manage AI keys                       | Yes   | Yes               | No          | No          | No          | No               | No                    | No              | No      | No        |
| Create API key                       | Yes   | Yes               | Own, capped | Own, capped | Own, `read` | No               | No                    | No              | No      | No        |
| Invite members and change roles      | Yes   | Yes, not to Owner | No          | No          | No          | No               | No                    | No              | No      | No        |
| Create share link                    | Yes   | Yes               | No          | No          | No          | No               | No                    | No              | No      | No        |
| Edit public pages                    | Yes   | Yes               | No          | No          | No          | No               | No                    | No              | No      | No        |
| Export organisation data             | Yes   | Yes               | No          | No          | No          | No               | No                    | Own data        | No      | No        |
| View audit log                       | Yes   | Yes               | No          | No          | No          | No               | No                    | No              | No      | No        |
| Manage billing                       | Yes   | View              | No          | No          | No          | No               | No                    | No              | No      | No        |
| Delete organisation                  | Yes   | No                | No          | No          | No          | No               | No                    | No              | Never   | Never     |

## Requirements

Each bullet is one requirement: ID, priority, statement, acceptance. Words follow the [glossary](/docs/PRODUCT.md#glossary).

### Landing page (LND)

The public front door shows the clause engine's verdict for Bukit Jalil from live feeds, or the error; it is not a call, since nothing is reviewed or sent.

- **LND-1** (P1) The hero lets a visitor pick a date (today and the next 7 days, the MET forecast's horizon) and a start and end time in MYT, and shows the clause engine's verdict for the Commons project "Bukit Jalil" right now: the mode per pack, every fired clause, and every input with its source, station ID and age; no model runs per visitor. Acceptance: with the feeds live, the hero lists at least 5 inputs with ages such as "4 min", and each value equals the Commons reading the API returns for that source at the same minute.
- **LND-2** (P1) A stale or erroring input shows as No call for the clauses that need it, naming the input and since when, and never as a cached value, a default or a recording. Acceptance: blocking the JPS fetch in staging makes the hero read "No call for Storm confirmed: gauge `0232901RF` silent since HH:MM MYT" within two poll intervals, and no rain value renders.
- **LND-3** (P1) The hero labels its result "Clause engine verdict: not reviewed, not sent" and links the most recent real approved call on the pilot project's public conditions calendar by permalink; it never swaps to a recording automatically. Acceptance: the link resolves to `/c/{callId}` of an approved call; with none, it reads "No approved call yet (n=0)".
- **LND-4** (P1) The page shows no invented customers, quotes, logos, usage counts or grades; every number links to its source or query, and grades appear only with n and a Wilson 95% interval. Acceptance: a crawler finds no numeral on the landing outside an element with a `data-source` attribute (times use `data-source="clock:Asia/Kuala_Lumpur"`); before any live grade the page reads "No live grades yet (n=0)".
- **LND-5** (P1) Animation is driven by live readings or is decoration that implies no data, and stops under reduced motion. Acceptance: with `prefers-reduced-motion: reduce` no element animates; with the gauge erroring, no rain animation plays.
- **LND-6** (P1) Pricing and FAQ are sections of `/`; every price is in MYR, and each price itself, not only its group heading, carries "proposal, untested", as set in [PRODUCT pricing](/docs/PRODUCT.md#packaging-and-pricing). Acceptance: in the rendered HTML every element holding a price also holds "proposal, untested".
- **LND-7** (P2) `/ms/` carries the same live hero and sections in Bahasa Melayu, with MET text verbatim. Acceptance: every string on `/ms/` comes from the Malay catalogue; no English fallback strings render except brand names and station IDs.

### Accounts and sign-in (ACC)

People sign in without passwords; machines get scoped, revocable credentials.

- **ACC-1** (P1) Sign-up and sign-in by email magic link, valid 15 minutes and single use. Known limit (6 November 2026): while Amazon SES is in its sandbox, the email reaches only addresses verified in SES (see [Notices and channels](#notices-and-channels-ntc)). Acceptance: a second use, or a use after 15 minutes, shows "This link has expired. Request a new one." with a resend button.
- **ACC-2** (P1) Sign-in with Google. Acceptance: a Google account with a verified email signs in and links to an existing account with the same email only after a magic-link confirmation.
- **ACC-3** (P1) Sign-up cannot start with a passkey. Passkeys can be registered, named, used and removed; the last remaining sign-in method cannot be removed. Magic link can be turned off only while a passkey or Google remains; adding a passkey, unlinking Google or turning off magic link needs recent authentication. Acceptance: passkey-first sign-up is unavailable; turning off magic link without another sign-in method is refused; adding a passkey, unlinking Google or turning off magic link requires recent authentication; removing the last remaining sign-in method is refused with the reason.
- **ACC-4** (P1) Passwords are not offered, and no sign-in step is a cognitive test (WCAG 2.2 success criterion 3.3.8). Acceptance: no password field exists on any auth route; the guest bot check needs no puzzle.
- **ACC-5** (P1) The CLI signs in by device code ([RFC 8628](https://www.rfc-editor.org/rfc/rfc8628)) at `/device`: the code is valid 10 minutes, paste is accepted, and the page names the device and the scopes before confirming. Acceptance: an expired code is refused; a confirmed code issues a token the CLI stores in the OS keychain.
- **ACC-6** (P1) MCP clients get OAuth consent at `/oauth/consent`, which needs a signed-in account (guests are sent to sign-up), showing the client name, redirect host, organisation, projects, scopes (`read`, `draft`) and the line "No AI can approve a bundle or send to people"; Deny is as prominent as Allow. Acceptance: a token from consent cannot call any approval endpoint (403); a guest session on `/oauth/consent` lands on `/sign-up`.
- **ACC-7** (P1) Sessions list device, browser, created and last active; any session can be revoked, and "Sign out everywhere" revokes all others. Acceptance: a revoked session's next request returns 401.
- **ACC-8** (P1) Approving a bundle, publishing a clause version or creating a key needs a session authenticated in the last 12 hours, otherwise a fresh passkey or magic-link check. Acceptance: with a 13-hour-old session the Approve button opens re-authentication first.
- **ACC-9** (P1) One account can belong to many organisations; the switcher lists each membership with its role. Acceptance: switching changes the URL to `/{org}` and the visible actions to that role's.
- **ACC-10** (P3) Organisation SSO for the Campus tier, only once a provider is verified. Acceptance: a Campus organisation can require SSO for all members; others are unaffected.

### Guest access and the Commons (GST)

Anyone can try the real thing without an account, and cannot reach anyone through it.

- **GST-1** (P1) "Continue as guest" at `/guest` creates an anonymous account after a bot check that is invisible or one click, then opens `/commons/bukit-jalil`. Acceptance: no email or name is asked; the PDPA notice on `/guest` lists what is stored (a device budget token and a hashed IP).
- **GST-2** (P1) The Commons is one shared workspace, organisation slug `commons`, with one project "Bukit Jalil" bound to live feeds: JPS gauge `0232901RF`, MET warnings and the Kuala Lumpur forecast, APIMS at Cheras (`CA16W`), Petaling Jaya and Putrajaya, Rapid Rail at `SP17`, and the GoLive and Wikipedia venue listings. Acceptance: on a fresh deployment the Commons holds no windows, readings or calls until real ones arrive, and shows "0 guest windows" with "Declare a window".
- **GST-3** (P1) Guests see live signals with ages, site-level verdicts (haze and surge nights need no window), the venue listings, run traces (an all-Normal 06:45 run reads "Normal; 5 inputs fresh" with their ages), the clause sheet read-only, and the pilot project's public conditions calendar of real approved calls. Acceptance: every value on a Commons page carries an age or a source time.
- **GST-4** (P1) Guests declare guest windows (title up to 60 characters, date up to 14 days ahead, start and end), shown to all guests and labelled guest windows; each expires 14 days after creation. Acceptance: a guest window created on 5 November 2026 is gone on 19 November 2026.
- **GST-5** (P1) Calls on guest windows are drafts labelled "Draft: not reviewed, not sent"; they never send, never reach a conditions calendar or public ledger, and are not counted in published grades. Acceptance: no outbound email, ICS entry or webhook delivery exists for any guest-window call.
- **GST-6** (P1) Guests request evidence in-app and read the answer in-app only, labelled "Not reviewed". Acceptance: an evidence request from a guest creates no email.
- **GST-7** (P1) Guests cannot approve, send, invite, create keys or edit the clause sheet; no approve control renders for them. Acceptance: an approval request with a guest session returns 403 and is logged.
- **GST-8** (P1) Budgets per device and per IP cap runs, model use and evidence requests; proposed defaults are 20 runs, 10 evidence requests and 5 active guest windows per device a day, with a Commons-wide daily model budget. Acceptance: the 21st run in a day returns 429 with the reset time in MYT; when the model budget is spent, the Commons says so and shows only clause engine verdicts.
- **GST-9** (P1) Abuse controls: titles containing a URL, email address or phone number are refused; titles are checked against an English and Malay word list; every guest window has "Report", and three reports hide it until the team reviews it; the team can remove windows and block a device or IP, and each removal is audited. Acceptance: a title with "@" and a domain, or with a listed word in either language, is refused inline with the reason.
- **GST-10** (P1) Signing up from a guest session moves the guest's active windows and evidence requests into a new organisation with a project bound to the same sources; drafts stay drafts until a member with the Approver role or above approves a new run. Acceptance: after upgrade the windows appear in the new project and are gone from the Commons.
- **GST-11** (P1) Guest accounts with no activity for 30 days are deleted with their data. Acceptance: a nightly job's log lists deletions by count.

### Organisations (ORG)

An organisation holds members, roles, the approver rota and projects.

- **ORG-1** (P1) Create an organisation at `/new` with a name and slug; the creator becomes Owner. Acceptance: reserved or taken slugs are refused inline with the reason; nothing else is created (no sample project).
- **ORG-2** (P1) Invite by email with a role; `/invite/{token}` is single use, valid 7 days, and can be resent or revoked; the invitee needs no account beforehand. Known limit (6 November 2026): while Amazon SES is in its sandbox, the email reaches only addresses verified in SES (see [Notices and channels](#notices-and-channels-ntc)). Acceptance: a revoked invite shows "This invite was withdrawn".
- **ORG-3** (P1) Change roles and remove members; an organisation always keeps at least one Owner; ownership transfer completes only when the new Owner accepts. Acceptance: removing the last Owner is refused.
- **ORG-4** (P1) The organisation rota lists approvers, their shifts and shift templates; defaults cover 14:00–19:15 MYT on forecast storm afternoons and 08:00–22:00 MYT on surge nights; projects inherit it and may override (PRJ-7). Acceptance: a new organisation's rota page shows both templates with no one assigned and the action "Add an approver".
- **ORG-5** (P1) `/{org}/projects` lists projects with packs, current mode per pack, bundles needing review and signal health. Acceptance: with zero projects the page shows n=0 and "Create a project".
- **ORG-6** (P1) First run: an account with no membership is guided through create organisation → create project → bind sources from the catalogue → declare the first window → set the rota → connect a channel, with progress shown, each step skippable and resumable, and no sample data at any step. Acceptance: the events `org_created`, `project_created`, `source_bound`, `window_declared`, `rota_set`, `channel_connected` and `call_graded` compute PRODUCT's [activation metric](/docs/PRODUCT.md#success-metrics) for each new organisation: its first project has a declared window graded within 7 days of creation.

### Projects (PRJ)

A project is a site with its windows, sources, packs, clause sheet, channels, rota, subscribers and share links.

- **PRJ-1** (P1) Create a project at `/{org}/new` with a name, slug, site (name and coordinates), time zone (default Asia/Kuala_Lumpur, MYT, UTC+8) and packs (Sky, Crowd or both). Acceptance: the new project has no windows or sources and shows n=0 with "Bind a source".
- **PRJ-2** (P1) Bind sources from the adapter catalogue: JPS rain gauges, MET warnings and forecasts, DOE APIMS stations, Rapid Rail ridership by station, data.gov.my GTFS, GoLive and Wikipedia venue listings, and the project's own camera or Pi; any catalogued station in Malaysia can be bound, and the picker shows each station's distance from the site, licence or "no published terms", cadence and latest reading age. Acceptance: for a site at APU, `CA16W` shows 5.9 km ± 0.3 km ([evidence][sky evidence]) and a reading with its age within one poll.
- **PRJ-3** (P1) Enabling the Crowd pack needs a venue with listings and a rail station with gate taps; the toggle names what is missing. Acceptance: a project with no rail station cannot enable Crowd.
- **PRJ-4** (P1) The overview at `/{org}/{project}` shows the current mode per pack, today's windows at risk, signal health, the latest bundle and the next surge night or forecast storm afternoon. Acceptance: each block with no data shows n=0 and its next action.
- **PRJ-5** (P1) Share links: an Admin creates an expiring, revocable link to one project with access "view" or "reviewer" (declare windows, request evidence), expiry 1–30 days (default 7); holders open `/share/{token}` after a bot check without an account. Acceptance: a revoked or expired link returns "This link is no longer active" and the attempt is audited.
- **PRJ-6** (P1) A reviewer link starts a run only by declaring a window; the run's calls show as "Draft: not reviewed, not sent" until a member of the organisation with the Approver role or above approves the bundle, and each link is capped at 20 windows and 10 evidence requests a day. Acceptance: the 21st window on a link that day returns 429, and no reviewer action approves or sends.
- **PRJ-7** (P1) Project settings set the rota override and SLAs (defaults: 10 minutes for a Sky crossing, 2 hours for a Crowd outlook). Acceptance: changing an SLA applies to bundles drafted after the change and is audited.
- **PRJ-8** (P1) Archive a project: runs and notices stop, the ledger stays readable, and the project can be restored. Acceptance: an archived project starts no runs on a crossing.
- **PRJ-9** (P3) Custom public-URL sources behind an allow-list, an SSRF guard and a recorded licence check. Acceptance: a URL resolving to a private address is refused; a source without a recorded licence cannot be bound.

### Dashboard (DSH)

The organisation's first screen puts what needs a person first.

- **DSH-1** (P1) `/{org}` shows, in order: bundles needing review with SLA time left, today's windows at risk across projects, signal health (fresh, stale, error, with ages), the next surge nights and forecast storm afternoons, and yesterday's grades. Acceptance: a bundle needing review always renders above every other block.
- **DSH-2** (P1) Empty blocks print n=0 and the next action, never placeholder charts. Acceptance: a new organisation's dashboard renders no chart.
- **DSH-3** (P1) New bundles, escalations and source errors appear without reload within 10 seconds and are announced once to assistive technology, not per reading. Acceptance: a screen reader announces a new bundle once.
- **DSH-4** (P1) `/{org}/approvals` lists every bundle needing review across projects, sorted by SLA time left, with project and pack filters in the URL. Acceptance: reloading a filtered URL keeps the filter.
- **DSH-5** (P1) The command palette (see [Information architecture](#information-architecture)) works on every app route and by keyboard alone. Acceptance: Cmd/Ctrl+K, typing `SP17` and Enter opens that station's signal view.

### Windows (WIN)

A window (a class, an event, a commute wave) is what gets a call; guest windows are specified in GST-4.

- **WIN-1** (P0) A subscriber or member declares a window by form: title, kind (class, event, commute wave), date, start and end in MYT, and, for subscribers, email, role and notice language (English only in P0; Malay from P1, LOC-4), with a PDPA notice and an unticked consent box. Acceptance: the form cannot submit without consent; the stored record holds only those fields.
- **WIN-2** (P1) `/{org}/{project}/windows` lists upcoming and past windows, each with its latest Sky call and Crowd call (from different runs) and their states. Acceptance: a window with calls from two runs shows both, each linking to its bundle.
- **WIN-3** (P1) Recurring windows repeat weekly on chosen days until a date or a count, with skipped dates; each occurrence gets its own call. Acceptance: a Monday and Wednesday window for 6 weeks with one skip creates 11 occurrences.
- **WIN-4** (P1) Import windows from an ICS file or ICS URL; URLs are refreshed hourly behind the SSRF guard, imported windows show their source, and a change starts a run. Acceptance: editing an event's end time at the source changes the window within one refresh and starts a run.
- **WIN-5** (P2) Import windows from chosen Microsoft 365 (Outlook) calendars, read-only. Acceptance: only the calendars the user picks are read.
- **WIN-6** (P1) Declare windows by API, SDK, CLI and MCP with an idempotency key. Acceptance: repeating a request with the same key creates one window.
- **WIN-7** (P1) Editing a window's times starts a run; cancelling a window with a sent call keeps the call and adds a ledger entry. Acceptance: the ledger shows the cancellation with who and when.
- **WIN-8** (P1) Validation: end after start, except a zero-length commute wave is valid; at most 12 hours long; start no more than 90 days ahead; series materialise 90 days ahead; past windows only through evidence requests. Acceptance: each violation shows inline next to its field.

### Signals (SIG)

Readings come from public feeds and project-owned devices, with ages and errors always visible.

- **SIG-1** (P0) Each source is polled often enough to store every new value within NFR-1's limits, and every reading stores source time, receipt time, HTTP status and fetch latency. Acceptance: a reading row without any of the four fields fails validation.
- **SIG-2** (P0) A failed poll writes an error row, never the last value; no fallback, cached copy or default stands in. Acceptance: an APIMS timeout produces an error row with status and latency, and the next call shows No call for every clause needing APIMS.
- **SIG-3** (P0) Each input is fresh, stale (two intervals missed), error or recovered; a recovered input is named on the next call and needs one fresh reading before a clause uses it. Acceptance: after the gauge returns, the first call names it "recovered" and evaluates Storm confirmed only after a second fresh reading.
- **SIG-4** (P0) MET warnings are in force only between `valid_from` and `valid_to`, and their text is stored verbatim as published. Acceptance (replay): in the [21:13 MYT capture of 5 November 2026](/docs/sources/api.data.gov.my/weather-warning.md), the Strong Winds and Rough Seas warning valid from 8 November 00:00 is not in force at 21:13, and the Thunderstorms Warning valid 21:00 to 01:00 is.
- **SIG-5** (P1) `/{org}/{project}/signals` shows each bound source with latest value, unit, source time, age, state, cadence, last error, licence and a link to the source; error rows are listed, not hidden. Acceptance: an error row from the last 24 hours appears in the list with its HTTP status.
- **SIG-6** (P0) Indicators are computed by the clause engine, never by the model: rain in the last 60 minutes and in 2–4 hours, the highest API across bound stations, the last three 06:00 API readings, warnings in force and camera contrast ratios, each with its age. Acceptance (replay): the gauge `0232901RF` series for 2 November 2026 gives a 60-minute total first at or above 31 mm at 15:00 and 63.0 mm over (14:00, 16:00], where a reading stamped T covers (T−5 min, T] ([evidence][sky evidence]).
- **SIG-7** (P1) Crowd indicators come from the forecast module: baseline (median `SP17` exits on the same weekday over the last eight weeks), uplift (median extra exits for the show's class over two years), forecast (baseline plus uplift, summed for shared nights) and band (the backtest's 10th–90th percentile relative error). Acceptance (replay): `A0: All Stations` rows are excluded, 10 January 2026 sums to 38,447 exits, and the Wednesday baseline for 4 November 2026 is 3,928 ([evidence][crowd evidence]).
- **SIG-8** (P0) The camera, a project-owned source on probation, masks the lower third on the device, points at the skyline, posts two contrast ratios and a small JPEG every 10 minutes with device time, receipt time and its distance from the site, buffers offline and uploads with original timestamps, and posts only inside the project's daylight hours (in the pilot `CAMERA_DAY_START` to `CAMERA_DAY_END`, 07:15–19:00 MYT); outside them it is `off_hours`, an absent input, not a stale one. Acceptance: no stored frame shows pixels in the lower third; buffered frames keep their capture times.
- **SIG-9** (P0) Camera probation: two people label daylight frames "landmark visible" or "obscured"; the camera may fire Haze watch only after agreeing on at least 90% of at least 100 frames including at least 10 obscured; until then it supplies evidence frames only, and it never stands in for a silent gauge. Acceptance: the probation verdict, n and agreement are stored and shown on the source.
- **SIG-10** (P1) If a Pi is bound to the project, it posts derived rows only (`SP17` exits, segment times) with feed header age, fetch latency and post time; when posts stop for 60 minutes the source reads "Pi offline since HH:MM", and buffered rows upload on reconnect with original timestamps. On the platform, GTFS Realtime decoding and the ridership reduction run in cloud adapters ([TRD signal pipeline](/docs/TRD.md#signal-pipeline)), so the Pi is optional; wherever segment times are computed, raw bus positions are dropped once they exist. Acceptance: a Crowd project with no Pi still grades its nights; no stored row holds a vehicle position older than its segment computation.
- **SIG-11** (P1) A late Rapid Rail file shows grades as "pending" with the metadata's `next_update`; a schema change writes an error row. Acceptance: on a late day the grade reads "pending until HH:MM" and no older count is shown.
- **SIG-12** (P0) An auditor tells the project's admins within 5 minutes of each condition (on the platform, within 15 minutes, at its next batch; relaxed on 6 November 2026, see [#220](https://github.com/m1kulabs/Skyclause/issues/220)): a source silent for two intervals (gauge 10 minutes, MET warnings 20, APIMS 2 hours, camera 20 minutes in daylight, Pi 60 minutes), or a crossing with no bundle in needs review after 5 minutes on the platform (past NFR-2's 3-minute budget). Apps Script can't see Gemini Enterprise run state, so in the pilot the condition is instead no `ledger` row referencing the crossing ID 20 minutes after its file was written (past NFR-2's 12-minute budget), and the notification says so. Acceptance: stopping the gauge poller produces one notification by 15 minutes after its last reading (25 on the platform) and one more on recovery; holding back a crossing's run produces one notification at 20 minutes (pilot) or by 20 minutes (platform).
- **SIG-13** (P1) Each listing carries its source URL, revision (Wikipedia revision ID), door and show times and show class; a listing from one undocumented source only is flagged. Acceptance: a GoLive-only listing shows "Single source" in its bundle.

### Clauses (CLS)

Each pack has an editable clause sheet that turns indicators into modes, recommendations or No call; the decision agent reads it and the clause engine evaluates it.

**Sky pack modes.** Within the Sky pack the highest fired clause wins and every fired clause is listed. The ranks are **Inference** from "highest mode wins" in the [Skyclause clause sheet](/docs/ideas/02-skyclause.md#the-clause-sheet).

| Rank | Mode               | The call says                                                                        |
| ---: | ------------------ | ------------------------------------------------------------------------------------ |
|    0 | Normal             | Nothing to do; nothing is sent                                                       |
|    1 | Outdoor-limited    | Limit outdoor activity for the window                                                |
|    2 | Commute disruption | Expect disruption getting to or leaving the window                                   |
|    3 | Hybrid recommended | Hybrid is recommended; teaching mode is the lecturer's and the university's decision |

**Sky pack states.** **Watch** is a per-window state, not a mode: Storm watch prints the warning as context and sends nothing alone. **No call** is a state: an input a clause needs is stale or erroring.

**Default Sky clauses**, copied from the [clause sheet](/docs/ideas/02-skyclause.md#the-clause-sheet):

| Clause           | Reads                                           | Fires when (default)                                                                                                                          | Proposes                          |
| ---------------- | ----------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------- |
| Haze watch       | API at Cheras, Petaling Jaya, Putrajaya; camera | API 101 or more at any station, or (after probation) the far-skyline contrast below its threshold on three daylight frames with no gauge rain | Outdoor-limited                   |
| Haze severe      | API, last three 06:00 readings                  | API above 180, or above 150 at 06:00 on three consecutive days at one station (the 8 October school rule)                                     | Hybrid recommended                |
| Storm watch      | MET warnings                                    | A warning, not No Advisory or marine, naming Kuala Lumpur in `text_en` or `text_bm`, with `valid_from` ≤ window end and `valid_to` ≥ start    | Nothing alone; printed as context |
| Storm confirmed  | JPS gauge                                       | At least 31 mm in 60 minutes ("Lebat") from 30 minutes before to 60 minutes after a window ends                                               | Commute disruption                |
| Flash-flood risk | JPS gauge                                       | More than 60 mm in 2–4 hours, Public Infobanjir's flash-flood note                                                                            | Commute disruption, flood note    |
| Silent input     | Every feed                                      | No reading for two intervals, or an error row                                                                                                 | No call for clauses needing it    |

**Crowd pack modes.** Normal or **Surge night**. A surge night carries **recommendations**, unioned across fired clauses: keep with an advisory; shift the start or end out of the arrival or exit period; ask the shuttle desk for a run; leave before doors. The arrival period runs from doors to show time; the exit period from show end to 90 minutes after. Fanfall had no modes; "Surge night" is the new name for its Surge night rule.

**Default Crowd clauses**, from Fanfall's [rules sheet](/docs/ideas/04-fanfall.md#the-rules-sheet), reworded to the glossary; the shuttle times are APU's and other projects replace them:

| Clause                 | Fires when (default)                                                                 | Proposes                                                       |
| ---------------------- | ------------------------------------------------------------------------------------ | -------------------------------------------------------------- |
| Surge night            | Forecast at least 5,000 exits above baseline                                         | Surge night; an entry on the conditions calendar               |
| Arrival clash          | A window ends inside the arrival period                                              | Shift the end out of the arrival period, or leave before doors |
| Exit clash             | A window ends inside the exit period                                                 | Shift the end out of the exit period, or keep with an advisory |
| After the last shuttle | A window ends after 19:15, when the next runs are 20:45 and 21:45 with limited space | Ask the shuttle desk for a run                                 |
| Single-source listing  | A listing comes from one undocumented source only                                    | Flag it in the bundle; the approver confirms                   |
| Silent input           | A Crowd input has no reading for two intervals, or an error row (added for No call)  | No call for clauses needing it                                 |

- **CLS-1** (P0) Each project has one clause sheet per enabled pack, starting from the default table, whose thresholds and wording the project edits. Acceptance: a new Sky project's sheet equals the default Sky table above.
- **CLS-2** (P0) Evaluation: Sky takes the highest fired mode and lists every fired clause; Storm watch alone yields Watch and sends nothing; Crowd yields Surge night with the union of fired recommendations. Acceptance: Haze watch plus Storm confirmed on one window gives Commute disruption listing both clauses.
- **CLS-3** (P0) No call: a clause whose input is stale or erroring yields No call naming the input and since when ("No call: gauge silent 25 min"); clauses not needing it still evaluate. Acceptance: with APIMS erroring and the gauge fresh, Storm confirmed still evaluates and both haze clauses show No call.
- **CLS-4** (P0) The clause engine evaluates the sheet on every new reading; its verdict per window and per site is the shadow verdict, and a change of verdict is a crossing that starts a run. Acceptance (replay): on the 2 November 2026 gauge series the verdict changes on the 15:00 reading, which the live 5-minute poll stores by 15:05: the crossing of the worked example ([evidence][sky evidence]).
- **CLS-5** (P1) The grid editor at `/{org}/{project}/clauses` has one row per clause and columns for name, inputs, condition, proposes, wording and enabled; it works by keyboard (arrows move, Enter edits, Escape cancels), needs no dragging, and warns before leaving with unsaved changes. Acceptance: a keyboard-only user changes the Storm confirmed threshold and saves a draft.
- **CLS-6** (P1) Conditions are [CEL](https://github.com/google/cel-spec) expressions over the pack's typed indicators and window fields (names in TRD's [clause engine](/docs/TRD.md#clause-engine)), type-checked as you type, with no network or clock access beyond the given time fields. Acceptance: a condition naming an unknown indicator shows the error inline at its position and cannot be saved as publishable.
- **CLS-7** (P1) Every save makes a draft; publishing makes an immutable numbered version with author and time; every call records the version it used. Acceptance: a call's page links the exact version, and older versions stay readable.
- **CLS-8** (P1) Publishing shows a diff of thresholds, conditions and wording against the live version, plus a 30-day replay of which calls would change, labelled replay; only the Approver role or above can publish. Acceptance: the publish dialog cannot be confirmed before the diff and replay load.
- **CLS-9** (P1) Replay runs any draft or version over recorded readings or a published dataset for a date range; results are labelled "replay" and never mixed with live grades. Acceptance (replay): the default haze clauses on 06:00 readings at the three stations for the 22 weekdays from 5 October to 3 November 2026 give 9 Hybrid recommended, 5 Outdoor-limited, 7 Normal and 1 day with no data ([evidence][sky evidence]). That replay uses the Malaysia Haze Monitor log, whose licence is unrecorded, so it stays a labelled replay and is never shown as a source (see [Open questions](#open-questions)).
- **CLS-10** (P1) Wording is set per clause and per language with variables for values, stations and ages; a Hybrid recommended wording without the line "Teaching mode is the lecturer's and the university's decision" cannot be published. Acceptance: deleting that line blocks publish with the reason.
- **CLS-11** (P1) Site-level clauses (haze, surge night) evaluate with no windows declared. Acceptance: the Commons shows a haze verdict with zero windows.

### Calls and approvals (CAL)

Runs produce bundles; the decision agent proposes, the engine checks, and a person approves before anything reaches people.

- **CAL-1** (P0) Run triggers: a crossing; a request (email in P0; app, API and MCP from P1); the 06:45 MYT Monday-to-Friday schedule for today's Sky windows (cut first under the 7 November kill criterion). Each run belongs to one project and one pack and produces one bundle. Acceptance: every run's trace names its trigger, project and pack.
- **CAL-2** (P1) More triggers: the 07:00 MYT daily Crowd outlook for the next 14 days and a listing or calendar change. Acceptance: approving a new listing starts an outlook run for its night.
- **CAL-3** (P0) The decision agent reads the clause sheet, raw indicators with ages, warning text verbatim and the declared windows, then proposes each call, its recipients and its wording, quoting each fired clause with its input's age; its proposal is the call of record. The model runs only when a run is due, never per poll, and does no arithmetic. Acceptance: every number in a drafted notice equals an indicator value or a window time in the run's trace.
- **CAL-4** (P0) If the agent's call and the shadow verdict differ for any window, the bundle lists those windows first with both verdicts, and the approver picks one per window. Acceptance: a bundle with one disagreement renders it above all agreeing calls.
- **CAL-5** (P0) A bundle of all-Normal calls writes nothing and needs no approval; its trace is the record. Acceptance: an all-Normal 06:45 run sends nothing and its trace reads "Normal; N inputs fresh" with ages.
- **CAL-6** (P0) One approval per bundle, with per-call edit and reject inside it: the approver can edit the wording or recipients of a call, or reject it, before approving the rest; a rejected call is not sent and is still graded. Acceptance: approving a 3-call bundle with one rejection sends 2 calls, and the rejected call later gets a grade.
- **CAL-7** (P1) Bundle lifecycle: drafted → needs review → approved, edited or rejected per call → sent → graded. A newer run supersedes only the calls whose windows it also covers: a bundle whose every call is superseded links to its successor and cannot be approved, and a partly superseded bundle can still approve its other calls. Acceptance: approving a superseded call is refused with a link to the newer one.
- **CAL-8** (P1) Expiry: a call expires when its window starts, or when it ends if the call was fired by Storm confirmed or Flash-flood risk (they concern the release); pack-level items such as a surge-night entry expire when the night's arrival period starts; an expired call is never sent, and a bundle expires when its last call does. Acceptance (replay): a 2 November bundle drafted at 15:10 for windows ending 15:30 and 15:45, approved at 15:35, sends only the 15:45 call and records the 15:30 one as expired.
- **CAL-9** (P1) Re-check at approval: on Approve, the engine re-evaluates with current inputs; if any input, state or verdict changed since drafting, the approver sees the difference and confirms again. Acceptance: a gauge reading arriving between draft and approval shows a "changed since drafting" panel before sending.
- **CAL-10** (P0) The approver on duty is notified when a bundle needs review; in the pilot a teammate on the rota covers 14:00–19:15 MYT on forecast storm afternoons. Acceptance: each needs-review bundle records who was notified and when.
- **CAL-11** (P1) A bundle not approved within its SLA escalates to the next approver on the rota, then to admins, and each escalation is logged. Acceptance: with a 10-minute SLA and no action, the next approver is notified at 10 minutes and admins at 20.
- **CAL-12** (P0) Every call records its delay: trigger or crossing, drafted, approved and sent times. Acceptance: the call page shows all four times in MYT and the minutes between them.
- **CAL-13** (P1) The bundle page shows the trigger, disagreements first, then per call the window, mode or recommendations, fired clauses with values and ages, recipient count and list, and wording per language; Approve names the count ("Approve 2 calls"). Approval happens only in the app or the interactive CLI; email links open the bundle and never approve on click. Acceptance: a GET on any link in a needs-review email changes no state.
- **CAL-14** (P1) Crowd listings pass a person: `proposed` → `listed` (action `list`), `rejected` or `cancelled`; nights add `unlisted`. A change or cancellation needs approval; only listed listings drive bundles. Acceptance: a proposed listing never appears on the conditions calendar.
- **CAL-15** (P1) Hybrid recommended calls always carry the teaching-mode line, and no call text excuses attendance. Acceptance: an edit that removes the line blocks approval with the reason.
- **CAL-16** (P1) Each call page `/{org}/{project}/calls/{id}` shows inputs, trace, clause version, approver, delay, grade and permalink. Acceptance: the trace lists every input read with its age at drafting.
- **CAL-17** (P1) A Crowd recipient's reply of "keep", "shift to HH:MM" or "shuttle" (by email reply or link) is logged against the window. Acceptance: the ledger shows the reply with its time.
- **CAL-18** (P1) Approver alerts: when a bundle reaches needs review, everyone on duty gets a web push on each device they registered (on iOS from a Home Screen web app, iOS 16.4 or later) and an email, naming the project, pack, mode and SLA time left and opening the bundle. Acceptance: from needs review to web push delivered and email handed to the provider takes 60 seconds or less at p95.
- **CAL-19** (P1) Rota shift reminders: each approver gets a reminder 30 minutes before a shift starts, and another when a conditional shift (forecast storm afternoon, surge night) is switched on by the day's MET forecast or an approved listing. Acceptance: an approver on a 14:00 storm-afternoon shift gets one reminder by 13:30 MYT on a day the forecast names thunderstorms.
- **CAL-20** (P3) Alert digests and quiet hours; until then every alert goes to whoever is on duty, unsuppressed. Acceptance: no P1 or P2 setting delays an approver alert.

### Notices and channels (NTC)

Approved calls reach people through channels they already use; recipients never need an account.

**Known limit (6 November 2026):** Amazon SES stays in its sandbox, because AWS denied production access and the product lead chose not to pursue it. Until production access is granted, email (notices, confirmations, preference and magic links, invites and alerts) reaches only addresses verified in SES, at most 200 messages in 24 hours and 1 a second ([SES sandbox](https://docs.aws.amazon.com/ses/latest/dg/request-production-access.html)). Web push, in-app items, ICS and webhooks aren't limited.

- **NTC-1** (P0) Email notices go out after approval with SPF, DKIM and DMARC aligned, a plain-text part, a subject naming the mode and window, the fired clauses with values and ages, and the permalink. In the pilot the public calendar event's URL stands in for the permalink `/c/{callId}` (P1, PUB-3), and a reply with "unsubscribe" stands in for one-click unsubscribe (P1, NTC-9). Acceptance: a notice to Gmail and to Outlook passes DMARC alignment in the received headers.
- **NTC-2** (P0) Each project has a subscribable conditions calendar (in the pilot a public Google Calendar; from P1 the ICS feed at `/p/{org}/{project}/calendar.ics`) with one entry per approved non-Normal call and per surge night. Acceptance: in the pilot the entry exists on the public Google Calendar when the bundle is sent; from P1 the feed validates against RFC 5545, carries `REFRESH-INTERVAL` and `X-PUBLISHED-TTL` of 15 minutes, keeps a stable `UID` per entry and raises `SEQUENCE` on each change, is served as `text/calendar` with an `ETag`, and includes an approved call within 60 seconds of sending.
- **NTC-3** (P0) Every notice carries one line: "Skyclause is not a safety or emergency service. In an emergency, call 999." Acceptance: the line is present in every template in every language.
- **NTC-4** (P0) In the pilot, each approved call creates a Jira Cloud issue as the decision record (clauses, readings, windows, approver, times). Acceptance: the issue key is stored on the ledger entry.
- **NTC-5** (P1) Webhooks are signed (HMAC with a timestamp), retried with backoff for up to 24 hours, and idempotent by event ID; event types cover bundle drafted, bundle approved, call sent, call graded, crossing and source error. Acceptance: a receiver returning 500 gets the same event ID again until it returns 2xx or 24 hours pass.
- **NTC-6** (P1) In-app notifications reach members for bundles needing review, escalations and source errors, with per-account preferences. Acceptance: turning off source errors stops them for that account only.
- **NTC-7** (P1) Channel templates per pack, mode and language, previewed with the latest real call or, with none, a preview that says n=0. Acceptance: no preview shows invented values.
- **NTC-8** (P1) Subscribers join at `/subscribe/{token}` with email, role, windows and notice language under a PDPA notice, confirm by email, and manage preferences by magic link. Known limit (6 November 2026): while Amazon SES is in its sandbox, the email reaches only addresses verified in SES (see [Notices and channels](#notices-and-channels-ntc)). Acceptance: no notice goes to an unconfirmed address.
- **NTC-9** (P1) Every notice has one-click unsubscribe ([RFC 8058](https://www.rfc-editor.org/rfc/rfc8058) header and a footer link) that works without signing in and applies before the next notice. Acceptance: after unsubscribing, the next approved call to that window does not include the address.
- **NTC-10** (P1) Delivery status (sent, bounced, complained) is recorded per recipient, and hard bounces and complaints suppress future sends. Acceptance: a hard-bounced address is skipped and the bundle shows it as suppressed.
- **NTC-11** (P2) Microsoft 365: Outlook mail from the organisation's domain and Outlook calendar entries; Jira Cloud as a decision register with the grade added as a comment. Acceptance: an approved call creates one Outlook entry and one Jira issue, and grading comments on it.
- **NTC-12** (P3) Google Calendar API, Slack, Microsoft Teams, Telegram, WhatsApp and web push for notices (approver alerts use web push from P1, CAL-18), each only after its terms are recorded. Acceptance: none is enabled without a recorded terms check.
- **NTC-13** (P1) `/{org}/{project}/subscribers` lists subscribers with counts per window and per channel, suppressions and bounces, and each subscriber's consent record (time, form, notice version and language); an Admin can remove a subscriber. Addresses are never bulk-imported without recorded consent: an import only sends each address a confirmation, and nothing else goes until it is confirmed. Acceptance: an imported address that never confirms receives no notice, and every listed subscriber shows a consent record.
- **NTC-14** (P1) The preference page at `/subscribe/{token}`, reached by magic link from every notice with no account, sets notice language, channels and windows, and unsubscribes. Acceptance: each change applies before the next notice and is logged, and the page asks for nothing beyond email, role, windows, channels and language.

### Ledger and evidence (LED)

The ledger is the written record; evidence answers "what did you know, and when?".

- **LED-1** (P0) The ledger is append-only: one entry per approved, edited or rejected call, sent notice, grade, listing change and clause version; corrections are new entries pointing at the old. Acceptance: no API, role or tool can update or delete an entry.
- **LED-2** (P1) The ledger is tamper-evident. Acceptance: altering any stored entry makes the project's integrity check fail and name the first bad entry.
- **LED-3** (P0) Evidence requests by email ("evidence for 2 Nov 14:00–16:30", "call for tomorrow") are answered from the ledger, readings and camera frames, and the reply is sent only after approval; in the pilot the inbox is staffed 08:00–22:00 MYT on 11–14 November. Acceptance: every reply in the sent folder has an approval record.
- **LED-4** (P1) Evidence requests also come by app, API and MCP; a reply to members stays in-app, and any reply leaving the organisation (an email or a share-link reviewer) waits for approval. Acceptance: an MCP request from a share-link reviewer shows "Waiting for approval" until approved.
- **LED-5** (P1) An evidence pack lists readings with source times and station IDs, warnings in force verbatim, calls, approvals and grades, and frames where held; every value links to its stored reading. Acceptance: each value in a pack resolves to a reading ID.
- **LED-6** (P1) Each request records received, drafted, approved and replied times. Acceptance: ANL shows evidence-assembly minutes from these times.
- **LED-7** (P1) The ledger page filters by date, pack, mode and state in the URL, virtualises long lists and exports CSV. Acceptance: on a Moto G Power (2022) in Chrome, a 10,000-entry ledger scrolls and filters with INP under 200 ms.
- **LED-8** (P1) Pilot records (the Sheets ledger, the Jira register and the Gemini Enterprise run traces) are archived read-only and linked from the pilot project, never imported into the platform ledger. Acceptance: the platform ledger's first entry comes from a platform run, and the project shows a "Pilot archive" link.

### Grades and analysis (ANL)

Calls are graded after the fact and the numbers are published with n and intervals, including the bad ones.

- **ANL-1** (P0) Sky windows are graded nightly as hit, miss, false alarm or correct Normal against the gauge and APIMS; No call windows are counted separately; the next 06:45 call quotes yesterday's grades. Acceptance: every Sky window with a call by 23:59 has a grade by 06:45 next day.
- **ANL-2** (P0) A window where the shadow verdict fired but no approved call exists is listed as "no call" for the approver to explain. Acceptance: the list shows each such window with an explanation field.
- **ANL-3** (P1) Crowd nights are graded on D+1 when the Rapid Rail file lands: in band, out of band or unlisted surge; until then "pending" (SIG-11). Acceptance (replay): 4 November 2026 is graded against the 27,044 forecast (band 19,315–32,100) written before the night ([evidence][crowd evidence]).
- **ANL-4** (P1) A miss, false alarm, out-of-band night or unlisted surge opens a review item for the project's members with the Approver role or above; Jira is optional (NTC-11). Acceptance: each such grade has exactly one review item.
- **ANL-5** (P1) Project analysis and the roll-up at `/{org}/analysis` show precision, recall and false-alarm ratio with n and Wilson 95% intervals per pack and per clause; Crowd forecast error and band coverage; agent–shadow agreement with the kill line (disagreement on more than 1 in 10 graded windows for reasons other than stale inputs); minutes from crossing to approved notice; evidence-assembly minutes. Acceptance: every figure prints its n, and with n=0 it prints "n=0" and no interval.
- **ANL-6** (P1) What-if replays of clause changes over recorded history are labelled replay and never mixed with live grades. Acceptance: no live chart includes a replayed point.
- **ANL-7** (P1) After each graded window, subscribers may get a two-tap "Did the weather change your plan?" email, counted per window. Acceptance: answers are stored as counts only, with no free text.

### Developer playground (DEV)

Developers try the real API, clauses, webhooks and MCP with real data.

- **DEV-1** (P1) The API console at `/developers/api` sends any OpenAPI operation with the visitor's key or a Commons guest token and shows the live response, headers and latency, with snippets in curl, TypeScript, Python and CLI. Acceptance: run within a minute of the console request, each snippet gets the same status and the same response shape (schema), not necessarily the same body.
- **DEV-2** (P1) The clause sandbox at `/developers/clauses` evaluates a CEL condition against live Commons indicators or a labelled replay and shows type errors, the result and the inputs used with ages. Acceptance: no typed-in indicator values are accepted.
- **DEV-3** (P1) The webhook inspector at `/developers/webhooks` delivers real events to a URL the visitor proves they own (the endpoint echoes a challenge token sent on registration) and shows request, signature, response and retries; it redelivers the latest real event instead of sending a test event. Acceptance: no synthetic event type exists.
- **DEV-4** (P1) The MCP inspector at `/developers/mcp` lists tools and calls read and draft tools with a signed-in visitor's token (guests can't connect, ACC-6), showing the JSON-RPC exchange. Acceptance: approve never appears in the tool list.
- **DEV-5** (P1) Every example in docs, SDK readmes and the playground is captured from a real call or reading and carries its capture date and station ID. Acceptance: a docs build fails on an example response without a capture line.

### Connect your AI (CAI)

People connect their own AI to read and draft, never to approve.

- **CAI-1** (P1) `/connect` generates config for Claude (claude.ai connectors, Claude Desktop, Claude Code), ChatGPT, Gemini CLI, Gemini Enterprise, Cursor and VS Code, pointing at the remote MCP server with OAuth, or at `skyclause mcp` for local stdio. Acceptance: no generated config embeds an API key.
- **CAI-2** (P1) Every target carries "Verified on <date>" from a recorded live test, or "Not verified"; a verification older than 90 days reads "Re-verify due". Acceptance: the date shown equals the stored test record.
- **CAI-3** (P1) The page lists the tools exposed and their scopes (AGT-2) and states "No AI can approve a bundle or send to people". Acceptance: the list is generated from the live MCP server's tool list.
- **CAI-4** (P1) The Gemini Enterprise target explains the Custom MCP Server data store: public preview, StreamableHTTP and OAuth 2.0 only, blocked by a default organisation policy until an admin lifts it ([requirements](/docs/research/gemini-enterprise.md#requirements-and-registration)). Acceptance: the steps name the policy and the role needed to lift it.

### Settings (SET)

Account, organisation and project settings, each with its own route.

- **SET-1** (P1) Account settings: profile, security (sign-in methods, passkeys, sessions), appearance, notifications, AI keys, API keys and data. Acceptance: each is a route under `/account/`.
- **SET-2** (P1) Appearance: theme light, dark or system, plus high contrast; density; reduced motion; language; applied without reload and kept across devices. Acceptance: "system" follows `prefers-color-scheme` live; reduced motion on the account overrides an OS that allows motion.
- **SET-3** (P1) Organisation settings: general, members and roles, approver rota, billing, audit log, AI keys, API keys, webhooks, integrations and data retention. Acceptance: each is a route under `/{org}/settings/`.
- **SET-4** (P1) Project settings: site and time zone, packs and sources, clause sheet versions, channels, rota, public pages and share links. Acceptance: each is reachable from `/{org}/{project}/settings`.
- **SET-5** (P1) AI keys (BYOK) per organisation or account for Google AI Studio, Vertex AI, Anthropic, OpenAI and OpenRouter: write-only after save (last 4 characters shown), a Test button making one real minimal call, monthly usage, and delete; the default is Gemini through Vertex AI, pinned per release and named on the page. Acceptance: no API or page returns a saved key.
- **SET-6** (P1) API keys: name, scopes (`read`, `draft`, `admin`), expiry up to 365 days, shown once, last-used time, immediate revoke. Acceptance: a revoked key's next request returns 401.
- **SET-7** (P1) Destructive actions never act at once. Typed name: delete organisation, delete account. Confirm dialog naming the object: revoke an API or AI key, revoke a share link, remove a member, lower a role. Undo for 10 seconds: archive a project, cancel a window, remove a subscriber, delete a clause sheet draft. Forms with unsaved changes warn before leaving. Acceptance: each listed action behaves as listed, and closing the tab with an unsaved rota prompts.

### Billing (BIL)

Paid plans in MYR from GA; the beta is free.

- **BIL-1** (P1) The beta collects no payment. Acceptance: no payment form exists in P1 builds.
- **BIL-2** (P2) Stripe in MYR bills the Team tier only; the Campus tier stays a priced proposal and is billed later (BIL-8), per [PRODUCT pricing](/docs/PRODUCT.md#packaging-and-pricing) and the [roadmap](/docs/PRODUCT.md#roadmap); every price stays labelled "proposal, untested". Acceptance: checkout offers only Team, with totals in MYR.
- **BIL-3** (P2) Invoices handle Malaysian service tax once the rate and registration threshold are verified; before registration no tax line appears. Acceptance: an invoice's tax line matches the recorded registration state.
- **BIL-4** (P2) Cards, and FPX if Stripe supports it in Malaysia (verify). Acceptance: the payment methods shown match those verified in TRD's [Billing](/docs/TRD.md#billing).
- **BIL-5** (P2) Plan limits (Community: one project) block new over-limit actions with an upgrade prompt; downgrades never delete data, they make extra projects read-only. Acceptance: a second project on Community cannot be created; an existing one stays readable.
- **BIL-6** (P2) A failed payment gives 14 days' grace with emails; then notices stop and public pages read "Paused", while the ledger stays readable and exportable. Acceptance: no notice sends on day 15 without payment.
- **BIL-7** (P2) The billing page shows plan, usage (runs, model tokens on the default model, notices sent) and the next invoice; BYOK usage is not billed. Acceptance: BYOK runs add zero to billed tokens.
- **BIL-8** (P3) Campus tier billing, invoiced yearly, with SSO and data residency sold only once verified (ACC-10). Acceptance: no Campus checkout exists before ACC-10's provider is verified.

### Localisation (LOC)

English first, Bahasa Melayu second.

- **LOC-1** (P1) The app is complete in English; app language is an account preference, not a path; marketing pages use `/ms/...`. Acceptance: no app route contains a language segment.
- **LOC-2** (P2) The app is complete in Bahasa Melayu, using a Malay glossary of the canonical terms approved by a Malay reader. Acceptance: no untranslated app string ships in a Malay release.
- **LOC-3** (P0) MET text is quoted verbatim as published (Malay, and English where MET publishes it), and Malay-only forecast text carries an English gloss marked as a gloss. Acceptance: the quoted text equals the source field byte for byte.
- **LOC-4** (P1) Each subscriber picks English or Malay notices. Acceptance: a bundle shows each call's recipients by language.
- **LOC-5** (P1) A model-written Malay notice needs an approver flagged as a Malay reader; otherwise that call is sent in English, and the bundle says which. Acceptance: an approver without the flag cannot approve a Malay model-written notice.
- **LOC-6** (P1) Times print in MYT (UTC+8) with a 24-hour clock and dates like "5 November 2026", formatted with `Intl` for `en-MY` and `ms-MY`; numbers use tabular figures. Acceptance: no surface shows a time without its zone on public pages.
- **LOC-7** (P1) The marketing site suggests only `/ms/legal/privacy` from `Accept-Language`, never from IP, and never redirects automatically. Acceptance: a Malay browser on `/legal/privacy` sees a suggestion to `/ms/legal/privacy`, not a redirect; no other route shows the suggestion.

### SDK (SDK)

Typed clients generated from the OpenAPI document.

- **SDK-1** (P1) `@skyclause/sdk` for TypeScript: ESM, runs in Node, Bun, Deno, browsers and edge runtimes, generated from `/openapi.json`, with hand-written pagination iterators, SSE streams and webhook signature verification. It is used from the repo workspace as a `workspace:*` dependency and isn't published to npm; public releases were dropped on 6 November 2026. Acceptance: one test suite passes on all five runtimes.
- **SDK-2** (P2) `skyclause` for Python with the same three helpers. Acceptance: the same contract tests pass.
- **SDK-3** (P1) Auth by API key or OAuth token; no SDK method can approve. Acceptance: the generated client has no approval operation.
- **SDK-4** (P1) Source failures surface as typed errors naming the source and since when, never as empty values. Acceptance: a No call reading returns its state, not `null`.
- **SDK-5** (P1) Semantic versioning tied to the API; deprecations announced at least 6 months ahead in headers and the changelog. Acceptance: a deprecated operation returns a `Deprecation` header.

### CLI (CLI)

`skyclause` for terminals and scripts.

- **CLI-1** (P1) Runs from a clone of the repository with Bun on macOS, Linux and Windows: `bun install`, then `bun run skyclause <command>`. Nothing is published to npm, Homebrew or GitHub releases; public releases were dropped on 6 November 2026. Acceptance: in a fresh clone, `bun install` then `bun run skyclause --version` runs on all three.
- **CLI-2** (P1) `skyclause login` uses device code (ACC-5). Acceptance: no token is written to a plain file.
- **CLI-3** (P1) Every command takes `--json` with a stable schema; No call is data, not an error; errors exit non-zero. Acceptance: `skyclause signals --json` on an erroring source exits 0 and includes the error row.
- **CLI-4** (P1) Commands: projects; windows; signals (`tail` streams readings with ages); clauses (`test`, `replay`, `diff`); calls and bundles (list, show); evidence; `mcp` (local stdio server); `skills install`. Acceptance: `skyclause clauses replay` labels its output "replay".
- **CLI-5** (P1) `skyclause bundles approve` works only in an interactive terminal for a signed-in human Approver, shows the re-check (CAL-9), and is refused with `--json`, without a TTY or with an API key. Acceptance: piping input to approve exits non-zero with the reason.
- **CLI-6** (P1) `skyclause init` links an existing project and writes config; it never creates a sample project or window. Acceptance: running it in an empty organisation prompts to create a project in the app.

### Agent layer (AGT)

AI agents read and draft through MCP and skills; none can approve.

- **AGT-1** (P1) A remote MCP server at `mcp.skyclause.m1ku.tech/mcp` speaks streamable HTTP with OAuth and publishes the two `/.well-known` metadata documents; it replies `application/json` and accepts both session styles ([MCP revision note](/docs/research/iot-and-network.md#fit-with-gemini-enterprise-custom-mcp)). Acceptance: Claude Code and one other client from CAI-1 list the tools after consent.
- **AGT-2** (P1) Tools and scopes are those in the table below; read tools declare `readOnlyHint`; there is no approve, send or publish tool. Acceptance: the server's tool list equals the table.
- **AGT-3** (P1) `skyclause mcp` serves the same tools over local stdio with the CLI's login. Acceptance: the stdio and remote tool lists match.
- **AGT-4** (P1) An Agent Skills pack (`SKILL.md`) at `/skills` and via `skyclause skills install` teaches an agent to ask for a call, read a ledger and request evidence. Acceptance: in Claude Code with the skill installed and the remote MCP server connected, an agent following the skill declares a window and returns its call with input ages.
- **AGT-5** (P2) An A2A agent card at `/.well-known/agent-card.json` for Gemini Enterprise (Standard and Plus can register external A2A agents; Business cannot, per [full-code agents](/docs/research/gemini-enterprise.md#full-code-agents)), shipped only after a dated live registration test. Acceptance: the card is served only once the test record exists.
- **AGT-6** (P1) Every agent action is audited with client, account, tool and time, and draft tools spend the calling organisation's plan allowance; guests cannot connect an MCP client, since consent needs an account (ACC-6). Acceptance: a run started by MCP `declare_window` counts toward the organisation's hosted-model runs, and a guest session cannot complete consent.
- **AGT-7** (P1) Tool results carry ages and No call states as the API does, never a value for an erroring input. Acceptance: `get_signals` on an erroring source returns the error row.

| Tool               | Scope   | Does                                                                     |
| ------------------ | ------- | ------------------------------------------------------------------------ |
| `list_projects`    | `read`  | Projects the token reaches, with packs and current mode                  |
| `get_signals`      | `read`  | Latest readings per source with source time, age and state               |
| `list_bundles`     | `read`  | Bundles by state, including needs review                                 |
| `get_call`         | `read`  | One call with fired clauses, inputs, ages, approval, delay and grade     |
| `explain_call`     | `read`  | Clause-by-clause explanation from the run trace                          |
| `get_clause_sheet` | `read`  | The published clause sheet version                                       |
| `replay_clauses`   | `read`  | A published version over recorded history, labelled replay               |
| `get_ledger`       | `read`  | Ledger entries for a date range                                          |
| `get_grades`       | `read`  | Grades with n and Wilson 95% intervals                                   |
| `declare_window`   | `draft` | Declare a window; its call is a draft until a person approves the bundle |
| `ask_for_call`     | `draft` | Start a request run for a window or date                                 |
| `request_evidence` | `draft` | Request evidence; replies leaving the organisation wait for approval     |

### Web components (WEB)

Brand assets, live favicons, previews and embeds.

- **WEB-1** (P1) A static favicon set: SVG with `prefers-color-scheme`, ICO fallback, apple-touch icon and manifest icons including maskable. Acceptance: each file is linked from every page's head.
- **WEB-2** (P1) The app tab's favicon shows the count of bundles needing review in the current organisation, updated within 10 seconds. Acceptance: approving the last bundle clears the badge.
- **WEB-3** (P1) `/p/{org}/{project}/favicon.svg` is coloured by the highest mode of the approved calls in force (until each window's last span end or the night's exit end), or shows the no-call state when none are in force; a failing required input adds No call and shows the error colour. It is cached for at most 60 seconds. Acceptance: the favicon changes within 60 seconds of the public state changing.
- **WEB-4** (P1) Open Graph images per project, call and window (`/c/{callId}/og.png`, 1200×630) with `twitter:card` and alt text. Acceptance: each image shows the mode, window time and capture time of the data.
- **WEB-5** (P1) [oEmbed](https://oembed.com/) at `/oembed`, discovered by `<link rel="alternate" type="application/json+oembed">` on public pages. Acceptance: the endpoint returns a valid rich response for any public project or call URL.
- **WEB-6** (P1) `<skyclause-status>` and `<skyclause-window>` custom elements, with an iframe fallback from `embed.skyclause.m1ku.tech`, show the current mode, inputs with ages, attribution and the non-affiliation line, and render errors as errors. Acceptance: with the gauge erroring, the element shows No call, not a value.
- **WEB-7** (P1) A subscribe-to-calendar button offers `webcal:`, Google Calendar and Outlook links for the conditions calendar. Acceptance: each link adds the same ICS feed.
- **WEB-8** (P3) An SVG status badge (deferred). Acceptance: none before P3.

### Public pages (PUB)

What a project chooses to show the world, with attribution and no personal data.

- **PUB-1** (P1) The public project page `/p/{org}/{project}`, off by default, shows the approved call in force per pack (until its window's last span end or the night's exit end; highest mode wins), or "No approved call yet"; a failing required input adds No call. It also shows fired clauses, inputs with ages, upcoming conditions calendar entries, recent approved calls, grades with n and Wilson 95% intervals, and subscribe. Acceptance: no window title, recipient or approver name appears.
- **PUB-2** (P1) The public ledger lists approved and sent calls, grades and clause versions with derived values; JPS, APIMS and GoLive values are shown derived, with a link to the source. Acceptance: no raw bulk export of JPS, APIMS or GoLive readings is offered publicly.
- **PUB-3** (P1) The call permalink `/c/{callId}` shows the mode, window time range, fired clauses with inputs and ages at the time, the approver's role, delay, clause version and grade once graded; for non-public projects non-members get 404 with an "open in the app" link to `GET /api/calls/{id}/open`. Acceptance: a non-member cannot tell whether a private call ID exists.
- **PUB-4** (P1) Every public page and embed carries the non-affiliation line (APU, KPT, JPS, MET, DOE, Prasarana/Rapid KL, the stadium) and the not-a-safety-service line. Acceptance: both lines render on every public route.
- **PUB-5** (P1) Attribution per source: MET (CC BY 4.0), Rapid Rail and data.gov.my (CC BY 4.0), Wikipedia (CC BY-SA 4.0, share-alike on derived listings). Acceptance: each value's source and licence is one click away.
- **PUB-6** (P1) `/status` shows our components (app, API, MCP, each poller, notice delivery) apart from source status, with incident history. Acceptance: an APIMS outage shows as a source incident, not ours.
- **PUB-7** (P1) `/legal/privacy` and `/legal/terms`, with the PDPA notice in English and Bahasa Melayu. Acceptance: both languages are published before the first subscriber form goes live.
- **PUB-8** (P1) `docs.skyclause.m1ku.tech` holds guides (a quickstart following ORG-6, packs and clause sheets, approvals and the rota, evidence, connect your AI, privacy) whose examples are captured from real calls and readings with capture dates and station IDs (DEV-5). Acceptance: the quickstart, followed in a fresh account, ends with a declared window and its call, and no example lacks a capture line.
- **PUB-9** (P1) The docs' references are generated: the API reference from `/openapi.json`, the CLI reference from the CLI's command definitions and the MCP reference from the live tool list. Acceptance: the docs build fails when a reference differs from its source.

### Audit and data rights (AUD)

Every consequential change is logged; people can see, take and delete their data.

- **AUD-1** (P1) The audit log records every approval, edit and rejection, key created or revoked (API and AI), role change, invite, clause publish, share link, source binding, SLA change, export, deletion and MCP consent, with who, when, client and before and after. Acceptance: each listed action creates exactly one entry.
- **AUD-2** (P1) The audit log is append-only, filterable at `/{org}/settings/audit` and exportable, and kept for the life of the organisation. Acceptance: no role can delete an entry.
- **AUD-3** (P1) Accounts export their data and Owners or Admins export the organisation's (projects, windows, clause versions, calls, bundles, ledger, grades, subscribers, audit) as JSON and CSV within 24 hours; download links expire after 7 days. Acceptance: an export of a project re-counts to the same number of calls as the app.
- **AUD-4** (P1) Deletion: an account deletes itself unless it is the sole Owner of an organisation (ledger and audit keep a pseudonymous ID); an Owner deletes an organisation by typing its slug, with a 30-day grace during which the organisation is suspended and export offered first, then a purge. Acceptance: a sole Owner cannot delete their account; the organisation is suspended during the grace period; after the purge no row with the organisation's ID remains outside the database's restore window, which ages it out per NFR-14.
- **AUD-5** (P0) Retention follows the NFR-14 table, including camera frames, bus positions and guest data, and the APU timetable is not read without written permission; if permission comes, `NAME`, `SAMACCOUNTNAME` and `LECTID` are dropped at ingest and only counts per window reach a model ([APU personal data](/docs/research/apu.md#personal-data-in-the-timetable-feed)). Acceptance: a scheduled job's log shows frames past retention deleted by count.
- **AUD-6** (P1) Subscribers see, correct and delete their data by magic link without an account. Acceptance: a deleted subscriber's address no longer appears anywhere except a hashed suppression entry.
- **AUD-7** (P1) A personal-data breach is reported to the Commissioner within 72 hours and to affected people within 7 days after that ([PDPA amendment](/docs/research/judging.md#malaysias-pdpa-and-the-2024-amendment)). Acceptance: the incident runbook names both clocks and an owner.

## Non-functional requirements

Targets, not measurements; TRD's [observability and SLOs](/docs/TRD.md#observability-and-slos) says how each is measured, and DESIGN's [accessibility](/docs/DESIGN.md#accessibility) states the visual rules.

- **NFR-1** Freshness. Data cadence is how often a source publishes: JPS gauge every 5 minutes, MET warnings when required, MET forecast daily, APIMS hourly, Rapid Rail daily (night D on D+1), GoLive and Wikipedia when edited, GTFS Realtime every 30 seconds. Poll cadence is how often we ask: each new value is fetched within one poll of publication (gauge 5 minutes, MET warnings 10, APIMS 15), inside data.gov.my's 4 requests a minute per API ([data.gov.my notes](/docs/research/data-sources.md#shared-notes-on-the-datagovmy-api)), and stored within 15 minutes of that poll, when the database batch runs (relaxed on 6 November 2026 from "stored within one poll of publication"; see [#220](https://github.com/m1kulabs/Skyclause/issues/220)); TRD's [adapters by source](/docs/TRD.md#adapters-by-source) table lists every poll interval. At least 99% of scheduled polls start within 60 seconds of schedule. Every surface showing a reading shows its age, refreshed at least once a minute.
- **NFR-2** Latency, **Inference** from the [Skyclause worked example](/docs/ideas/02-skyclause.md#day-to-day-loop): the gauge's 15:00 reading reaches Lebat; the engine's verdict changes when the 15:05 poll stores it, which is the crossing; the trigger fires by 15:10–15:15; an approved notice could go out about 15:20, about 15 minutes from the crossing and 20 from the reading ([evidence][sky evidence]). Pilot budget: crossing to needs review within 12 minutes (the Drive trigger's 5–10 plus the run). Platform budget: reading fetched to shadow verdict within 16 minutes (the 15-minute batch, then 60 seconds); crossing to needs review within 3 minutes (p95); approver alerts delivered within 60 seconds of needs review (p95, CAL-18); approval to notices handed to the mail provider within 60 seconds (p95). With a 5-minute poll, the batch and the 10-minute SLA, reading to notice stays within about 35 minutes (our arithmetic). Both were relaxed on 6 November 2026 from 60 seconds and 20 minutes; see [#220](https://github.com/m1kulabs/Skyclause/issues/220).
- **NFR-3** Availability: app, API and MCP 99.5% a month in P1 and 99.9% from P2; public pages, ICS and embeds 99.9% from P2; 99.9% of approved notices handed to the provider within 60 seconds. Source outages are shown on `/status` but are not our downtime.
- **NFR-4** Accessibility: [WCAG 2.2][wcag] AA on the app, public pages, embeds and emails: text contrast at least 4.5:1 and UI parts 3:1 in every theme; targets at least 24×24 CSS pixels; focus never hidden by sticky bars; no drag-only action (the clause grid and rota have keyboard and click paths); accessible authentication (ACC-4); reflow at 320 CSS pixels and 200% zoom; zoom never disabled. Release gate: zero serious or critical axe-core findings on every route, and a manual VoiceOver and NVDA pass on sign-in, window form, bundle approval and clause grid.
- **NFR-5** Keyboard and focus, from the [Web Interface Guidelines][wig]: every action works by keyboard; a visible `:focus-visible` ring everywhere, never removed without a replacement; a skip link; ordered headings; `scroll-margin-top` on anchors; buttons for actions and links for navigation, so Cmd/Ctrl+click opens links in new tabs.
- **NFR-6** Forms: every control has a label, a meaningful `name`, `autocomplete` and the right `type` and `inputmode`; paste is never blocked (keys, codes); spellcheck is off for emails, codes, slugs and station IDs; submit stays enabled until the request starts, then reads "Saving…"; errors appear next to the field, focus moves to the first error, and status changes are announced politely; placeholders end with "…" and show a real pattern.
- **NFR-7** Motion: honour `prefers-reduced-motion` and the account setting; animate only `transform` and `opacity`, never `transition: all`; motion longer than 5 seconds beside content has a pause; decorative loops stop under reduced motion; animation never implies data it doesn't have.
- **NFR-8** Content and state: the URL holds filters, tabs, pagination and open panels; long titles and names wrap or truncate without breaking layout; empty states print n=0 and the next action; loading text ends with "…"; tables of numbers use tabular figures; brand names, station IDs and commands carry `translate="no"`; copy is active, second person, with numerals and specific button labels ("Approve 2 calls"), and every error says how to fix it. Labels use sentence case per DESIGN's [voice and content](/docs/DESIGN.md#voice-and-content), not the guidelines' Title Case.
- **NFR-9** Performance: Core Web Vitals at the 75th percentile on mobile, per [web.dev](https://web.dev/articles/vitals): LCP at most 2.5 s, INP at most 200 ms, CLS at most 0.1, on the landing page, public pages, dashboard and bundle page. The landing page ships at most 150 KB of compressed JavaScript before first interaction (raised on 6 November 2026 from 100 KB, because the App Router runtime alone is about 135 KB; see [#231](https://github.com/m1kulabs/Skyclause/issues/231)) and an embed at most 30 KB; images carry width and height and load lazily below the fold; lists over 50 rows are virtualised; API reads answer in 300 ms and writes in 800 ms at p95, server side, not counting the database's wake-up of a few hundred milliseconds after it has scaled to zero (relaxed on 6 November 2026; see [#220](https://github.com/m1kulabs/Skyclause/issues/220)).
- **NFR-10** Security: [OWASP ASVS][asvs] 5.0 Level 2; every API route has a cross-organisation test that must return 404; approvals need a human session (ACC-8); API keys are stored hashed and shown once; AI keys are envelope-encrypted with Cloud KMS and write-only; webhooks are signed; ICS, webhook and future source URLs pass an SSRF guard; the app sends CSP and HSTS and can't be framed, while embeds can; every key and token is rate limited; dependency and secret scanning run in CI; an external penetration test passes before GA. Details: TRD's [Security](/docs/TRD.md#security).
- **NFR-11** Privacy (PDPA): a notice and consent on every form; subscribers give only email, role, windows and language; prompts carry recipient and window IDs, never emails, names or window titles, which are filled in after drafting; no personal data reaches any free-tier model; camera frames mask the lower third; bus positions are vehicles and are dropped after segment times; data lives in Singapore, with compute and files in GCP `asia-southeast1` and the database in AWS `ap-southeast-1` (Neon); email goes through Amazon SES in Sydney, Australia (AWS `ap-southeast-2`), where inbound mail sits for up to a day before it is read and deleted (decided 6 November 2026, because the AWS account allows only that region); the privacy notice carries the cross-border note, and no residency is promised. Analytics carry no personal data (see [Analytics events](#analytics-events)).
- **NFR-12** Localisation: every string sits in a catalogue, none is built by concatenation, and layouts hold Malay strings 30% longer than English without clipping (**Inference**); dates, times and numbers use `Intl`.
- **NFR-13** Clients: the last two major versions of Chrome, Edge, Firefox, Safari (macOS and iOS) and Samsung Internet; the camera page on Chrome for Android with a wake lock and on iOS Safari 16.4 or later; public pages and notices readable without JavaScript; web push for approver alerts works in Chrome, Edge, Firefox and Safari 16.4 or later (on iOS from a Home Screen web app); emails render in Outlook (desktop and web) and Gmail; the ICS feed works in Outlook, Google Calendar and Apple Calendar.
- **NFR-14** Data retention follows this table. There are no backups: the database keeps a 6-hour restore window, so deleted data leaves it within 6 hours (relaxed on 6 November 2026 from 35 days of daily backups; see [#220](https://github.com/m1kulabs/Skyclause/issues/220)).
- **NFR-15** Real data: production builds and migrations contain no seeded organisations, projects, windows, readings or calls; CI fails if a production seed inserts any. Docs, SDK and playground examples carry a capture date and station ID.

| Data                                             | Kept                                                          | Then                                                            |
| ------------------------------------------------ | ------------------------------------------------------------- | --------------------------------------------------------------- |
| Readings and error rows from public sources      | Life of the project                                           | Deleted with the project                                        |
| Camera frames                                    | One semester: to the project's semester end, at most 183 days | Deleted; contrast rows kept                                     |
| Raw bus positions                                | Until segment times are computed, at most 24 hours            | Deleted; segment times kept                                     |
| Guest windows                                    | 14 days from creation                                         | Deleted                                                         |
| Guest accounts                                   | 30 days without activity                                      | Deleted with their data                                         |
| Subscriber records                               | Until unsubscribe plus 30 days                                | Deleted; a hashed suppression entry stays                       |
| Ledger and audit log                             | Life of the organisation                                      | Personal fields pseudonymised on account or subscriber deletion |
| Deleted organisation                             | 30-day grace                                                  | Purged                                                          |
| Export files                                     | 7 days                                                        | Deleted                                                         |
| APU timetable `NAME`, `SAMACCOUNTNAME`, `LECTID` | Never stored                                                  | Dropped at ingest                                               |

[wcag]: https://www.w3.org/TR/WCAG22/
[wig]: https://github.com/vercel-labs/web-interface-guidelines
[asvs]: https://owasp.org/www-project-application-security-verification-standard/

## Analytics events

Events carry random IDs for organisation and project, counts and enums only: no emails, names, IPs, window titles or free text. PRODUCT's [success metrics](/docs/PRODUCT.md#success-metrics) are computed from these and from the ledger.

| Event                | When                                     | Properties                                                                       |
| -------------------- | ---------------------------------------- | -------------------------------------------------------------------------------- |
| `landing_window_set` | A visitor sets a window in the hero      | `modes`, `inputs_fresh`, `inputs_error`                                          |
| `guest_started`      | A guest account is created               | `bot_check` (passed, failed)                                                     |
| `signed_up`          | An account is created                    | `method` (magic_link, google, passkey), `from_guest`                             |
| `org_created`        | An organisation is created               | `plan`                                                                           |
| `project_created`    | A project is created                     | `packs`                                                                          |
| `source_bound`       | A source is bound                        | `adapter`, `cadence_min`                                                         |
| `rota_set`           | An approver shift is saved               | `shifts`, `conditional`                                                          |
| `channel_connected`  | A channel is connected to a project      | `channel`                                                                        |
| `onboarding_step`    | A first-run step is completed or skipped | `step`, `skipped`                                                                |
| `window_declared`    | A window is declared                     | `via` (form, ics, m365, api, cli, mcp, guest, share), `recurring`                |
| `run_started`        | A run starts                             | `pack`, `trigger` (schedule, crossing, listing, calendar, request)               |
| `bundle_drafted`     | A bundle reaches drafted                 | `pack`, `calls`, `non_normal`, `disagreements`, `no_call`                        |
| `bundle_approved`    | A bundle is approved                     | `pack`, `minutes_to_approve`, `edited`, `rejected`, `recheck_changed`            |
| `bundle_escalated`   | An SLA escalation fires                  | `pack`, `level` (next_approver, admins)                                          |
| `approver_alerted`   | An approver alert is delivered           | `channel` (web_push, email), `seconds`                                           |
| `bundle_closed`      | A bundle is superseded or expires        | `pack`, `reason` (superseded, expired)                                           |
| `notice_sent`        | A notice is handed to a channel          | `channel`, `language`, `pack`                                                    |
| `unsubscribed`       | A recipient unsubscribes                 | `channel`                                                                        |
| `evidence_requested` | An evidence request arrives              | `via` (email, app, api, mcp)                                                     |
| `evidence_replied`   | An evidence reply is sent                | `minutes`, `approval_needed`                                                     |
| `call_graded`        | A call gets a grade                      | `pack`, `grade`                                                                  |
| `clause_published`   | A clause sheet version is published      | `pack`, `clauses_changed`, `replay_calls_changed`                                |
| `replay_run`         | A replay finishes                        | `pack`, `days`                                                                   |
| `share_link_created` | A share link is created                  | `access` (view, reviewer), `expiry_days`                                         |
| `mcp_connected`      | An MCP client completes consent          | `client` (claude, chatgpt, gemini_cli, gemini_enterprise, cursor, vscode, other) |
| `mcp_tool_called`    | An MCP tool returns                      | `tool`, `scope`, `ok`                                                            |
| `api_key_created`    | An API key is created                    | `scopes`, `expiry_days`                                                          |
| `cli_login`          | A device-code login completes            | `os`                                                                             |
| `embed_loaded`       | An embed renders                         | `component`, `mode`                                                              |
| `export_requested`   | An export is requested                   | `scope` (account, organisation)                                                  |

## Out of scope

- **Deciding teaching mode or closures.** Hybrid recommended says the decision is the lecturer's and the university's.
- **Excusing attendance**, or reading or writing attendance records.
- **Acting as a safety or emergency service:** no instant dispatch, no life-safety warnings of our own; MET's warnings are quoted, not replaced.
- **Tracking people:** no positions of people, faces, biometrics, attendee data or device counting; bus positions are vehicles only.
- **Reading APU's timetable or shuttle feeds** without APU's written permission ([APU terms](/docs/research/apu.md#terms-of-use-and-robotstxt)).
- **Sending anything to people without a human approval**, or letting any AI, API key or MCP token approve.
- **Sample, seeded, demo or typed-in data**, and any cached value or recording shown when a live source fails.
- **Weather forecasting of our own:** the only forecast is the Crowd pack's exit-count estimate.
- **Bulk redistribution** of JPS, APIMS or GoLive readings, which have no published terms.
- **Sources whose terms forbid this use:** Live Nation, Songkick, Ticketmaster, Bandsintown, WAQI and Open-Meteo's free tier.
- **Traffic routing, parking or ticketing.**
- **Coverage outside Malaysia** before P3.
- **Phone-timed APU-to-faregate legs** until someone is on campus; advisories say "minutes unmeasured".

## Open questions

Product decisions only; technical unknowns are in TRD's [Not verified](/docs/TRD.md#not-verified) and market ones in IDEA's [Not verified](/docs/IDEA.md#not-verified).

1.  Which teammate holds the pilot approver seat on each forecast storm afternoon of 11–14 November? Decides: the team. By 9 November 2026.
1.  Guest and reviewer-link budgets (GST-8, PRJ-6): are 20 runs, 10 evidence requests and 5 windows a device a day right, and what is the Commons' daily model budget in MYR? Decides: product lead with the cost model. By 15 December 2026.
1.  Who may publish clause versions: the Approver role or above (proposed) or Editor and above? Decides: product lead after pilot interviews. By 15 December 2026.
1.  Can the haze replay keep using the Malaysia Haze Monitor log, whose licence is unrecorded, or must it move to a dataset with a recorded licence? Decides: product lead after asking the maintainer. By 15 December 2026.
1.  When a listing gives no show end, what end time anchors the exit period? Decides: the Crowd pack owner (a club events lead). By 15 December 2026.
1.  Should Hybrid recommended send to anyone outside the team before an institutional owner (FSSW or a successor) agrees? Decides: product lead. By 5 February 2027.
1.  Can public ledgers show derived JPS, APIMS and GoLive values while their redistribution terms are unknown, or only links? Decides: product lead with legal advice. By 5 May 2027.
1.  Should API keys ever publish clause versions (clauses as code from CI), with an audit entry? Decides: product lead. By 5 February 2027.
1.  Do drafts on guest windows get draft grades shown in the Commons, or no grades at all? Decides: product lead. By 15 December 2026.
1.  Register for Malaysian service tax before GA, or only on crossing the threshold? Decides: the Owner of the operating company. By 5 April 2027.
1.  Does the Campus tier offer a customer-facing SLA with service credits, and at what availability and support hours ([PRODUCT pricing](/docs/PRODUCT.md#packaging-and-pricing))? Decides: the Owner of the operating company, after the first Campus conversation. By 5 May 2027.

## See also

- [Skyclause idea](/docs/IDEA.md): why it exists, the evidence and the kill criteria.
- [Skyclause product](/docs/PRODUCT.md): users, the [core loop](/docs/PRODUCT.md#the-core-loop), surfaces, pricing and the roadmap.
- [Skyclause technical requirements](/docs/TRD.md): architecture, [approval and delivery](/docs/TRD.md#approval-and-delivery), [grading](/docs/TRD.md#grading) and [privacy and data retention](/docs/TRD.md#privacy-and-data-retention).
- [Skyclause design](/docs/DESIGN.md): [screens](/docs/DESIGN.md#screens), [components](/docs/DESIGN.md#components) and [CLI output](/docs/DESIGN.md#cli-output).
- Source ideas: [Skyclause states and failure handling](/docs/ideas/02-skyclause.md#states-and-failure-handling) and [Fanfall states and failure handling](/docs/ideas/04-fanfall.md#states-and-failure-handling).
- Research: [data sources](/docs/research/data-sources.md), [Gemini Enterprise](/docs/research/gemini-enterprise.md), [accuracy method](/docs/research/judging.md#measuring-an-agents-accuracy-honestly).

[sky evidence]: /docs/IDEA.md#haze-and-storms-at-the-exit-wave
[crowd evidence]: /docs/IDEA.md#stadium-nights-at-bukit-jalil
