<a id="readme-top"></a>

<!-- PROJECT LOGO -->

<br />
<div align="center">
  <a href="https://github.com/m1kulabs/Skyclause">
    <picture>
      <source media="(prefers-color-scheme: dark)" srcset="/docs/readme/banner-dark.png">
      <source media="(prefers-color-scheme: light)" srcset="/docs/readme/banner-light.png">
      <img src="/docs/readme/banner-light.png" alt="Skyclause: the call for every window. A replay of 2 November 2026, when the 60-minute rain total at JPS gauge 0232901RF crossed the Lebat line at 15:00 MYT, ahead of the 15:30 release wave.">
    </picture>
  </a>

  <h3>Skyclause</h3>

  <p>
    The call for every window: one approved, graded call for each class, event or commute window, from live public readings.
    <br />
    <a href="https://skyclause.m1ku.tech"><strong>Live Demo &rarr;</strong></a>
    &middot;
    <a href="https://youtu.be/s_09LAGOaG0">Demo Video</a>
    &middot;
    <a href="https://github.com/m1kulabs/Skyclause/issues/new?labels=bug">Report a Bug</a>
    <br />
  </p>

[![Next.js][nextjs-badge]][nextjs-url]
[![React][react-badge]][react-url]
[![TypeScript][typescript-badge]][typescript-url]
[![Tailwind CSS][tailwind-badge]][tailwind-url]
[![Hono][hono-badge]][hono-url]
[![Bun][bun-badge]][bun-url]
[![PostgreSQL][postgres-badge]][postgres-url]
[![Google Cloud][gcp-badge]][gcp-url]
[![Gemini][gemini-badge]][gemini-url]
[![Terraform][terraform-badge]][terraform-url]

</div>

<!-- TABLE OF CONTENTS -->

## Table of Contents

<details>
  <summary>Expand</summary>
  <ol>
    <li>
      <a href="#about-the-project">About The Project</a>
      <ul>
        <li><a href="#screenshots">Screenshots</a></li>
        <li><a href="#how-it-works">How It Works</a></li>
        <li><a href="#features">Features</a></li>
        <li><a href="#architecture">Architecture</a></li>
        <li><a href="#tech-stack">Tech Stack</a></li>
      </ul>
    </li>
    <li>
      <a href="#hackathon-submission">Hackathon Submission</a>
      <ul>
        <li><a href="#the-existing-problem">The Existing Problem</a></li>
        <li><a href="#how-we-solve-it">How We Solve It</a></li>
        <li><a href="#the-research-we-did">The Research We Did</a></li>
        <li><a href="#how-the-team-worked">How The Team Worked</a></li>
        <li><a href="#impact-and-outcome">Impact And Outcome</a></li>
        <li><a href="#cloud-iot-and-network">Cloud, IoT And Network</a></li>
        <li><a href="#built-and-not-built">Built And Not Built</a></li>
      </ul>
    </li>
    <li>
      <a href="#getting-started">Getting Started</a>
      <ul>
        <li><a href="#prerequisites">Prerequisites</a></li>
        <li><a href="#installation">Installation</a></li>
      </ul>
    </li>
    <li><a href="#roadmap">Roadmap</a></li>
    <li><a href="#team">Team</a></li>
    <li><a href="#license">License</a></li>
    <li><a href="#acknowledgments">Acknowledgments</a></li>
  </ol>
</details>

<!-- ABOUT THE PROJECT -->

## About The Project

A weather app says what the sky is doing. It does not say what to do about the class that lets out at 15:30, who decided, or whether they were right.

Skyclause does. Someone declares a **window**: a class, an event or a commute wave, with a day, a start and an end. Skyclause watches the public readings around it, checks them against a **clause** such as "at least 31 mm of rain in 60 minutes", has Gemini draft the **call**, and waits for one person to approve it. Everyone who opted in then gets the same notice, the call goes on an append-only record, and the next morning it is graded against what actually fell.

The first project is Bukit Jalil, Kuala Lumpur, where Asia Pacific University sits about 880 m from LRT Bukit Jalil, the station for the national stadium and the one the JPS rain gauge is named for. Skyclause was built for the APU Cloud Innovation Hackathon 2026, in the Intelligent Automation & Digital Transformation track.

> Skyclause is not a safety or emergency service. In an emergency, call 999. It is not affiliated with or endorsed by APU, KPT, JPS, MET Malaysia, DOE, Prasarana or Rapid KL, or the stadium.

<p align="right"><a href="#readme-top">&uarr;</a></p>

### Screenshots

Every picture is the production site on 13 November 2026. A value marked "Replay" is a labelled replay of 2 November 2026 from the stored JPS readings; no call was made that day.

| The landing page: pick a window, read the verdict                                                                          | Sign in by emailed link, Google or a passkey                                                                                   |
| -------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------ |
| ![The landing page: the headline beside the verdict for a chosen window](/docs/readme/screenshots/landing-hero.png)        | ![The sign-in page: an email field, Google and a passkey](/docs/readme/screenshots/sign-in.png)                                |
| **The record: the ledger entry, the notice, the calendar, the grade**                                                      | **The public sources, each with its cadence and licence**                                                                      |
| ![The record section: a replayed ledger with a crossing and a shadow verdict](/docs/readme/screenshots/landing-record.png) | ![Six source tiles: JPS, DOE APIMS, MET Malaysia, Rapid Rail, GoLive, Wikipedia](/docs/readme/screenshots/landing-sources.png) |

<p align="right"><a href="#readme-top">&uarr;</a></p>

### How It Works

One loop, six steps. The pictures replay the afternoon of Monday 2 November 2026, when 89 sessions ended at 15:30 as 63.0 mm of rain fell in two hours.

1. **Declare.** An organiser or a commuter declares a window in the web app: a title, a day, a start and an end. Recipients opt in by email and need no account.
1. **Watch.** Adapter jobs poll each public source on its own cadence: the JPS rain gauge every 5 minutes, MET warnings every 10, the DOE haze index every 15. Every reading keeps its age.
1. **Decide.** The clause engine evaluates the project's clause sheet for each open window. A changed verdict is a **crossing**. One above Normal, or a No call inside an open span, starts a run: Gemini on Vertex AI drafts the call, and the bundle shows the draft beside the engine's own verdict.
1. **Approve.** One person on the approver rota approves, edits or rejects each call. Nothing is sent before that.
1. **Notify.** The notice goes out by email, and the project's conditions calendar updates for anyone subscribed to its ICS feed.
1. **Record.** Every run, call, approval and send is appended to a hash-chained ledger. The next morning the call is graded against the gauge.

When a source goes quiet, the answer is "No call", never an old number. No call does not mean clear skies. It means there is no fresh evidence, and Skyclause says so.

| Watch: the gauge reads 39.0 mm in 60 minutes                                                                     | Decide: the Storm confirmed clause fires                                                                               |
| ---------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------- |
| ![The readings stage: 60-minute totals rising past the Lebat line](/docs/readme/screenshots/how-1-readings.png)  | ![The clause stage: what Storm confirmed reads and when it fires](/docs/readme/screenshots/how-2-clause.png)           |
| **Decide: the window gets its verdict**                                                                          | **Approve and notify: a person approves the bundle**                                                                   |
| ![The verdict stage: Commute disruption for the 15:30 release wave](/docs/readme/screenshots/how-3-verdict.png)  | ![The approval stage: a bundle for the Sky pack waiting for one approval](/docs/readme/screenshots/how-4-approval.png) |
| **Record: the next morning, it is graded**                                                                       |                                                                                                                        |
| ![The grade stage: the span's peak of 59.5 mm, and no live grades yet](/docs/readme/screenshots/how-5-grade.png) |                                                                                                                        |

<p align="right"><a href="#readme-top">&uarr;</a></p>

### Features

- **Windows, not forecasts.** A call answers one declared window, such as the weekday 15:30 release by LRT Bukit Jalil, not "rain in Kuala Lumpur today".
- **Public readings with their age.** JPS Infobanjir rain, MET Malaysia warnings and forecasts, and the DOE APIMS haze index, each polled once for every organisation and stored with when it was read.
- **Clauses anyone can read.** A clause sheet in CEL, with a tested engine that checks, evaluates and explains each clause.
- **A draft, checked.** Gemini on Vertex AI drafts the call into a fixed schema. The clause engine's verdict sits beside it, and a disagreement shows first.
- **A person in charge.** One approval for each bundle, by a signed-in person on the rota, with alerts in the app, by web push and by email.
- **The same notice for everyone.** Email through Resend and a subscribable ICS conditions calendar. Recipients opt in by email, need no account, and can unsubscribe from any notice.
- **Honest when blind.** A stale or failed input blocks only the clauses that need it and prints "No call" with the reason.
- **A record that holds.** An append-only ledger where each entry carries the hash of the one before it, with export and verification.
- **Graded in the open.** Sky calls are compared with the gauge the next morning. Live grades so far: n=0.
- **Built to last.** Organisations and projects with row-level security, passkeys, an OpenAPI 3.1 document, English and Bahasa Melayu catalogues, and four themes that meet WCAG contrast.

<p align="right"><a href="#readme-top">&uarr;</a></p>

### Architecture

<picture>
  <source media="(prefers-color-scheme: dark)" srcset="/docs/readme/architecture-dark.svg">
  <source media="(prefers-color-scheme: light)" srcset="/docs/readme/architecture-light.svg">
  <img src="/docs/readme/architecture-light.svg" alt="Skyclause architecture in six stages: watch public sources, ingest on Google Cloud, decide with the clause engine and Gemini, approve by a person, notify by email and calendar, and record in a hash-chained ledger; beside them, the Gemini Enterprise pilot.">
</picture>

- **One monorepo, a few Cloud Run units.** `web` serves the app, the `/v1` API and the public pages. `worker` evaluates, orchestrates runs and sends. Adapter and batch jobs are Cloud Run jobs that Cloud Scheduler starts. All of it is in `asia-southeast1` (Singapore); Gemini is called at Vertex AI's global endpoint.
- **One poll for everyone.** A source is polled once however many organisations use it. Adapters write each poll to Cloud Storage, publish a reference to Pub/Sub and never touch the database; every 15 minutes the worker pulls the references and writes each request in its own transaction.
- **Runs are a Postgres state machine.** Each step of a run commits on its own, so a redelivered message resumes at the first unfinished step and the model is never called twice for one run.
- **One store.** Postgres 18 on Neon holds readings, verdicts, bundles, approvals and the ledger, with row-level security for each organisation.

[TRD](/docs/TRD.md#architecture) has the full design, and [Built And Not Built](#built-and-not-built) says what each dashed node is waiting for.

<p align="right"><a href="#readme-top">&uarr;</a></p>

### Tech Stack

- **Language and tooling:** TypeScript 6 on Node.js 22, with Bun 1.4.4 for installs, scripts and builds
- **Web:** Next.js 16.4 (App Router), React 19.3, Tailwind CSS 4.3, shadcn on Base UI, Recharts, GSAP and Lenis on the landing page
- **API:** Hono 4 with zod schemas that generate the OpenAPI 3.1 document and a typed SDK
- **Auth:** Better Auth 1.7 with organisations, emailed links, Google sign-in and passkeys
- **Data:** Postgres 18 on Neon with `pg_partman`, Drizzle ORM and SQL migrations
- **Clauses:** CEL through `@bufbuild/cel`
- **AI:** AI SDK 7 with Gemini on Vertex AI, and Google AI Studio, Anthropic, OpenAI or OpenRouter with your own key
- **Google Cloud:** Cloud Run services and jobs, Cloud Scheduler, Pub/Sub, Cloud Tasks, Cloud Storage, Secret Manager, Cloud KMS, Cloud Trace and Monitoring
- **Email:** Resend, for sending and receiving
- **Pilot:** Google Apps Script, Sheets and Drive, a phone camera page and a Raspberry Pi 5 agent
- **Operations:** Terraform, GitHub Actions with workload identity federation, OpenTelemetry
- **Tests:** Vitest, fast-check and Playwright with axe

<p align="right"><a href="#readme-top">&uarr;</a></p>

<!-- HACKATHON SUBMISSION -->

## Hackathon Submission

| Field       | Entry                                                                                                                          |
| ----------- | ------------------------------------------------------------------------------------------------------------------------------ |
| Event       | APU Cloud Innovation Hackathon 2026, 26 October to 17 November 2026                                                            |
| Organisers  | APU School of Technology with GDGoC APU; partners NexConnect 2026, NTT DATA and Google Cloud                                   |
| Theme       | "When Cloud, IoT, and Network Converge"                                                                                        |
| Track       | Intelligent Automation & Digital Transformation                                                                                |
| Team        | M1KU: [five APU students](#team)                                                                                               |
| Prototype   | [skyclause.m1ku.tech](https://skyclause.m1ku.tech), with the app at [app.skyclause.m1ku.tech](https://app.skyclause.m1ku.tech) |
| Pitch deck  | [skyclause-pitch-deck.pdf](/docs/demo/prelim/deck/skyclause-pitch-deck.pdf)                                                    |
| Diagram     | [Architecture](#architecture)                                                                                                  |
| Source code | This repository                                                                                                                |

The five sections below follow the README the sponsor asked for at the briefing: the existing problem, how we solve it, the research we did, how the team worked, and the impact or outcome.

<p align="right"><a href="#readme-top">&uarr;</a></p>

### The Existing Problem

On Monday 2 November 2026, the JPS gauge by LRT Bukit Jalil logged 63.0 mm of rain in two hours. At 15:30, 89 APU sessions ended, straight into it. Every weather app was working that afternoon. Knowing the weather was never the problem. Deciding what to do about it was.

- **It keeps happening.** Three days earlier the same gauge logged 77.5 mm in two hours. At Cheras, the haze station nearest APU, the Air Pollutant Index passed 100 on 20 of the 31 days with readings from 3 October to 3 November 2026, and peaked at 190.
- **Universities got no number.** In October 2026 the education ministry gave schools closing thresholds for haze. The higher-education ministry told universities to monitor readings in their own locality, with no threshold.
- **Nobody writes the call down.** APU's public knowledge base, searched on 5 November 2026, has no page for haze, thunderstorms or lightning. Each lecturer, organiser and office decides alone, from different sources, and nothing records who decided or whether it was right.
- **It has stakes.** An international student needs at least 80% attendance each semester to renew a student pass, and whether a student caught in a storm is late or absent is one lecturer's decision.

Sources and counterevidence are in [IDEA](/docs/IDEA.md#problem-and-evidence). The counterevidence matters: from 29 October to 4 November heavy rain hit 4 of 74 weekday release waves, so most calls are Normal, and the product earns trust only if the rare call is right.

<p align="right"><a href="#readme-top">&uarr;</a></p>

### How We Solve It

Public signals in, one approved call out, and every call on the record. A weather app answers "what is the weather?". A campus needs three more answers: will it hit when my class lets out, what do we do about it, and who decided?

| A campus needs                     | A readings app                  | Skyclause                                                             |
| ---------------------------------- | ------------------------------- | --------------------------------------------------------------------- |
| An answer for one window           | A reading for a city or a state | A verdict for the window someone declared                             |
| Someone in charge                  | Nobody                          | One approval by a named role on the rota, before anything is sent     |
| Honesty when a feed fails          | The last number it had          | "No call", with the input that went quiet                             |
| A written record                   | None                            | An append-only, hash-chained ledger that can be exported and verified |
| To know afterwards if it was right | Nothing                         | A grade the next morning, against the gauge                           |

[How It Works](#how-it-works) walks the loop and [Architecture](#architecture) is the high-level diagram. The model drafts and never decides alone: tested code gives the verdict, the draft sits beside it, and a person approves.

<p align="right"><a href="#readme-top">&uarr;</a></p>

### The Research We Did

- **The brief first.** We captured the hackathon website, the Discord channels and the briefing recording into [docs/sources](/docs/sources/) and condensed them into a [brief](/docs/BRIEF.md) that keeps both readings wherever the sources disagree.
- **Eleven research files.** [docs/research](/docs/research/) covers APU, everyday student problems, what students say on social platforms, rules and guarantees, past winners, competing work, judging, public data sources, Gemini Enterprise, Google Cloud, and the IoT and network options, each citing its sources.
- **Thirty-two ideas, ranked.** Seven independent idea sets, 32 ideas in all, were merged and scored in [docs/ideas](/docs/ideas/00-ranking.md), and the 18 strongest products were written up and ranked. Skyclause merges the ones ranked second and fourth.
- **Real captures, stored.** The JPS 5-minute series, the APIMS readings and the MET warnings were captured and stored with their capture times, so the rain figures on the site, in the deck and in this README can be recomputed. The banner above is drawn from that capture, and its build fails if the totals drift. The haze counts and the timetable session counts come from research fetches that are not stored here.
- **Replays, labelled.** We ran a month of haze readings, 5 October to 3 November 2026, through the haze clauses: on 9 of 22 weekdays they give Hybrid recommended. That log has no stored copy, so the replay cannot be re-run from this repository, and we say so.
- **What we do not know.** Whether anyone wants a call instead of a reading, and which office would own it, are still open. [IDEA](/docs/IDEA.md#not-verified) lists every unknown.

<p align="right"><a href="#readme-top">&uarr;</a></p>

### How The Team Worked

- **Documents before code.** The [idea](/docs/IDEA.md), the [product](/docs/PRODUCT.md), the requirements in the [PRD](/docs/PRD.md), the design in the [TRD](/docs/TRD.md) and the look in [DESIGN](/docs/DESIGN.md) were written first. Where a document and the code disagree, the code is right.
- **One issue, one branch, one pull request.** About 400 merged pull requests in eleven days, each titled as a conventional commit and each run through the same checks before merge.
- **Checks that run themselves.** Formatting, lint, types, unit and property tests, Playwright with axe, an OpenAPI drift check, a secret scan over the full history, and a region check that fails unless every resource is in Singapore.
- **Deployed from `main`.** Terraform sets up the infrastructure and GitHub Actions deploys by workload identity federation, with no cloud keys in CI.
- **AI coding agents, under written rules.** The team used AI coding agents throughout, working to the rules in [AGENTS.md](/AGENTS.md). Every change still goes through an issue, a pull request and its checks.
- **Real data only.** No mock, sample or seed data anywhere in the product, and no fallback when a source fails. A replay is always labelled as one.

<p align="right"><a href="#readme-top">&uarr;</a></p>

### Impact And Outcome

What exists on 13 November 2026:

- **A running prototype.** The landing page and the app are live on Google Cloud, with the Sky pack's sources, clause engine, decision agent, approval, email notice, calendar and ledger built. A rehearsal run on production drafted a bundle end to end on Gemini.
- **Tested.** On `main` at `c250a78`, 4,406 automated tests passed, 19 failed and 46 were marked to do; many of them run on stored captures of the public feeds.
- **No live grades yet.** No call has been approved and graded, so the grade count is n=0. We do not claim an accuracy we have not measured.

What it would change, from replays of real readings:

- **Time.** On 2 November 2026 the verdict flips at the 15:05 poll, 25 minutes before the 15:30 wave. On the documented delays, an approved notice could have gone out at about 15:20.
- **Reach.** Each weekday, 139 to 174 sessions end between 16:30 and 19:15 by one station. One call covers them all.
- **A record.** A campus could show what it decided for each window, on which readings, and whether the call was right.

Time to impact:

- **In three months:** one APU office owns a pilot window, the weekday 15:30 release by LRT Bukit Jalil. We measure the staff time saved and how fast the notice lands.
- **In six months:** we test whether that office renews and pays.
- **Cost.** Students and clubs never pay. The proposed prices are RM 99 a month for an office and RM 990 for a campus, both untested, against an estimated running cost of about RM 45 a month for an office at list prices.

<p align="right"><a href="#readme-top">&uarr;</a></p>

### Cloud, IoT And Network

- **IoT.** The JPS telemetry gauge on the Sg. Kuyoh by LRT Bukit Jalil and the DOE air-quality stations are the sensors. The pilot adds two devices of its own: a phone camera page and a Raspberry Pi 5 agent that buffers readings offline and uploads them when the link returns.
- **Network.** Each reading travels from its source over HTTPS to an adapter, through Cloud Storage and Pub/Sub to the worker's 15-minute batch, and out again as an email, a calendar entry or a push message. Every hop keeps the reading's age, so a late or silent link shows up as a stale input instead of a wrong call.
- **Cloud.** Cloud Scheduler, Cloud Run, Pub/Sub and Cloud Tasks carry the loop, and Secret Manager and Cloud KMS hold the secrets, all in Singapore. Gemini drafts through Vertex AI's global endpoint.

<p align="right"><a href="#readme-top">&uarr;</a></p>

### Built And Not Built

The organisers ruled on 8 November 2026 that the prototype does not need Gemini Enterprise and that a finalist's product on 17 November must use it. This table says where each part stands in this repository.

| Part                                                    | Status    | Notes                                                                                                              |
| ------------------------------------------------------- | --------- | ------------------------------------------------------------------------------------------------------------------ |
| JPS rain, MET warnings and forecasts, DOE APIMS         | Built     | Adapter jobs in `packages/sources`, scheduled in `infra/`                                                          |
| Clause engine, run orchestration, decision agent        | Built     | `packages/clauses`, `apps/worker`, `packages/agent`                                                                |
| Bundle review and approval, approver alerts             | Built     | In the web app; alerts in the app, by web push and by email                                                        |
| Email notices and the ICS conditions calendar           | Built     | `packages/delivery`; mail is off until the Resend variables are set                                                |
| Hash-chained ledger, export and verification            | Built     | `packages/db/src/ledger`                                                                                           |
| Grading                                                 | Built     | The jobs exist; their production schedules are paused until there are approved calls to grade                      |
| Live verdict for any window on the landing page         | Not built | The landing page shows the labelled replay of 2 November until the public read ships                               |
| Crowd pack: Rapid Rail gate taps, listings, forecasts   | Not built | A ridership reduction is built for the Pi in the pilot; the platform's adapters and forecast are not               |
| Signed webhooks, the MCP server, the CLI, the docs site | Not built | Contracts and hosts exist; the packages are empty                                                                  |
| Public project pages, share images, embeddable elements | Not built | The calendar feed is built; share images and project favicons are drawn but answer 501 until the public reads ship |
| Device readings on the platform                         | Not built | The camera page and the Pi agent post to the pilot's Apps Script; `/v1/ingest/{sourceId}` has no handler yet       |
| Gemini Enterprise workflows                             | Not built | Build sheets are in `pilot/workflows`; they wait on the licence and its connectors ([#49][issue-49])               |
| Billing                                                 | Not built | Prices are proposals; no payment is collected                                                                      |

[issue-49]: https://github.com/m1kulabs/Skyclause/issues/49

<p align="right"><a href="#readme-top">&uarr;</a></p>

<!-- GETTING STARTED -->

## Getting Started

To look around, open the [live prototype](https://skyclause.m1ku.tech). To run the web app on your own machine, follow the steps below. The worker's source jobs need Google Cloud buckets and Pub/Sub, so they run only in the cloud project; [infra/README.md](/infra/README.md) covers that.

<p align="right"><a href="#readme-top">&uarr;</a></p>

### Prerequisites

- [Bun](https://bun.sh/) 1.4.4
- [Node.js](https://nodejs.org/) 22.15 or later
- [Docker](https://www.docker.com/) with Compose, for the local Postgres 18

<p align="right"><a href="#readme-top">&uarr;</a></p>

### Installation

1. Clone the repository and install its dependencies.

   ```sh
   git clone https://github.com/m1kulabs/Skyclause.git
   cd Skyclause
   bun install
   ```

1. Start the local database and apply the migrations.

   ```sh
   bun run db:up
   bun run db:migrate
   ```

1. Create `apps/web/.env.local`. Each local database login uses its own name as its password, and the three keys can be any strings of 32 characters or more.

   ```sh
   APP_ENV=dev
   APP_ORIGIN=http://localhost:3000
   API_ORIGIN=http://localhost:3000
   IP_HASH_KEY=<32 characters or more>
   EMAIL_HASH_KEY=<32 characters or more>
   BETTER_AUTH_SECRET=<32 characters or more>
   DATABASE_URL_APP=postgres://app:app@localhost:5432/skyclause
   DATABASE_URL_AUTH=postgres://auth_app:auth_app@localhost:5432/skyclause
   DATABASE_URL_SYSTEM=postgres://system:system@localhost:5432/skyclause
   DATABASE_URL_RETENTION=postgres://retention:retention@localhost:5432/skyclause
   ```

1. Start the web app and open <http://localhost:3000>.

   ```sh
   bun run --cwd apps/web dev
   ```

1. Before a pull request, run the checks. The tests need the local database and Playwright's Chromium (`bunx playwright install chromium` in `apps/web`).

   ```sh
   bun run lint
   bun run typecheck
   bun run test
   ```

Signing in sends a link by email, so it needs `RESEND_SENDING_API_KEY`, `EMAIL_FROM_AUTH` and `EMAIL_FROM_NOTICES`; without them the public pages still run. Every other variable is described in [packages/config/src/env.ts](/packages/config/src/env.ts), and the database logins are read in [packages/db/src/client.ts](/packages/db/src/client.ts). The Gemini Enterprise pilot has its own setup in [pilot/README.md](/pilot/README.md).

<p align="right"><a href="#readme-top">&uarr;</a></p>

<!-- ROADMAP -->

## Roadmap

- **Pilot, to 17 November 2026:** the Sky pack's storm crossing end to end, and the Gemini Enterprise workflows for the final.
- **Beta, by 5 February 2027:** the Crowd pack, the public pages, webhooks, the CLI and the MCP server, with one office owning a pilot window.
- **General availability, by 5 May 2027:** billing in MYR, Microsoft 365 and Jira as channels, and the Bahasa Melayu app.
- **Later, to November 2027:** the haze clauses' first live season, and other Malaysian campuses.

See [open issues](https://github.com/m1kulabs/Skyclause/issues) for a full list of proposed features (and known issues), and [PRODUCT](/docs/PRODUCT.md#roadmap) for what each phase assumes.

<p align="right"><a href="#readme-top">&uarr;</a></p>

<!-- CONTRIBUTING -->

## Team

Team M1KU, five students of Asia Pacific University:

| Name           | GitHub                                           | Role        |
| -------------- | ------------------------------------------------ | ----------- |
| Lim Yuh Kang   | [@kymil4](https://github.com/kymil4)             | Team leader |
| Hee Zi Jie     | [@AlaskanTuna](https://github.com/AlaskanTuna)   | Member      |
| Jeremy Woon    | [@WhiteAvocad0](https://github.com/WhiteAvocad0) | Member      |
| Yow Li Hao     | [@chaosiris](https://github.com/chaosiris)       | Member      |
| Liau Jin Siang | [@DrxgClanPC](https://github.com/DrxgClanPC)     | Member      |

<a href="https://github.com/m1kulabs/Skyclause/graphs/contributors">
  <img src="https://contrib.rocks/image?repo=m1kulabs/Skyclause" alt="Skyclause team" />
</a>

Made with [contrib.rocks](https://contrib.rocks).

<p align="right"><a href="#readme-top">&uarr;</a></p>

<!-- LICENSE -->

## License

See [LICENSE](/LICENSE) for more information. The Roundo typeface and the photographs keep their own licences, listed below.

<p align="right"><a href="#readme-top">&uarr;</a></p>

<!-- ACKNOWLEDGMENTS -->

## Acknowledgments

- APU School of Technology, GDGoC APU, NTT DATA and Google Cloud, for the APU Cloud Innovation Hackathon 2026
- [JPS Infobanjir](https://infobanjirjpskl.water.gov.my/), [MET Malaysia through data.gov.my](https://developer.data.gov.my/) (CC BY 4.0) and [DOE APIMS](https://eqms.doe.gov.my/APIMS/main), for the public readings
- "[Bukit Jalil National Stadium at night](https://commons.wikimedia.org/wiki/File:Bukit_Jalil_National_Stadium_at_night.jpg)" by Pak Misai and "[Bukit Jalil LRT Station outview (230527) 01](<https://commons.wikimedia.org/wiki/File:Bukit_Jalil_LRT_Station_outview_(230527)_01.jpg>)" by \*angys\*, both [CC BY-SA 4.0](https://creativecommons.org/licenses/by-sa/4.0), cropped in the banners, which are shared under the same licence. The site's other pictures are credited in [provenance.json](/apps/web/public/landing/provenance.json)
- [Roundo](https://www.fontshare.com/fonts/roundo) by Shiva Nallaperumal, Indian Type Foundry, under the SIL Open Font License 1.1
- [contrib.rocks](https://contrib.rocks)
- [Shields.io](https://shields.io)

<p align="right"><a href="#readme-top">&uarr;</a></p>

<!-- MARKDOWN LINKS & IMAGES -->

[nextjs-badge]: https://img.shields.io/badge/Next.js-000000?style=for-the-badge&logo=nextdotjs&logoColor=white
[nextjs-url]: https://nextjs.org/
[react-badge]: https://img.shields.io/badge/React-61DAFB?style=for-the-badge&logo=react&logoColor=black
[react-url]: https://react.dev/
[typescript-badge]: https://img.shields.io/badge/TypeScript-3178C6?style=for-the-badge&logo=typescript&logoColor=white
[typescript-url]: https://www.typescriptlang.org/
[tailwind-badge]: https://img.shields.io/badge/Tailwind_CSS-06B6D4?style=for-the-badge&logo=tailwindcss&logoColor=white
[tailwind-url]: https://tailwindcss.com/
[hono-badge]: https://img.shields.io/badge/Hono-E36002?style=for-the-badge&logo=hono&logoColor=white
[hono-url]: https://hono.dev/
[bun-badge]: https://img.shields.io/badge/Bun-000000?style=for-the-badge&logo=bun&logoColor=white
[bun-url]: https://bun.sh/
[postgres-badge]: https://img.shields.io/badge/PostgreSQL-4169E1?style=for-the-badge&logo=postgresql&logoColor=white
[postgres-url]: https://www.postgresql.org/
[gcp-badge]: https://img.shields.io/badge/Google_Cloud-4285F4?style=for-the-badge&logo=googlecloud&logoColor=white
[gcp-url]: https://cloud.google.com/
[gemini-badge]: https://img.shields.io/badge/Gemini-8E75B2?style=for-the-badge&logo=googlegemini&logoColor=white
[gemini-url]: https://cloud.google.com/vertex-ai
[terraform-badge]: https://img.shields.io/badge/Terraform-844FBA?style=for-the-badge&logo=terraform&logoColor=white
[terraform-url]: https://developer.hashicorp.com/terraform
