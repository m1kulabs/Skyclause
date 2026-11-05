# Google Cloud and AI tools beyond Gemini Enterprise

Which Google AI and Cloud tools a team of APU students in Malaysia can realistically use to build a Cloud + IoT + Network prototype between 3 and 10 November 2026, what they cost, and what changed recently. Researched on 3 November 2026 against Google's live docs, pricing pages, and terms; prices are in USD unless marked, and quotas can change without notice. Gemini Enterprise itself, including its editions, prices, trials, and what a team can build with it, is covered in [Gemini Enterprise](/docs/research/gemini-enterprise.md).

Contents:

1.  [What changed in 2026](#what-changed-in-2026)
1.  [Gemini API in Google AI Studio](#gemini-api-in-google-ai-studio)
    1.  [Current Gemini models](#current-gemini-models)
    1.  [Gemini API free and paid tiers](#gemini-api-free-and-paid-tiers)
    1.  [Gemini API terms that matter for students](#gemini-api-terms-that-matter-for-students)
1.  [Building blocks](#building-blocks)
    1.  [Gemini Enterprise Agent Platform, formerly Vertex AI](#gemini-enterprise-agent-platform-formerly-vertex-ai)
    1.  [Agent Development Kit](#agent-development-kit)
    1.  [Firebase](#firebase)
    1.  [Cloud Run](#cloud-run)
    1.  [Pub/Sub and the Cloud IoT Core retirement](#pubsub-and-the-cloud-iot-core-retirement)
    1.  [BigQuery](#bigquery)
    1.  [Data Studio, formerly Looker Studio](#data-studio-formerly-looker-studio)
    1.  [Google Maps Platform](#google-maps-platform)
    1.  [AI coding tools](#ai-coding-tools)
1.  [Money and access](#money-and-access)
    1.  [Paths that need no payment card](#paths-that-need-no-payment-card)
    1.  [Google Cloud Free Trial credit](#google-cloud-free-trial-credit)
    1.  [Education and community programmes](#education-and-community-programmes)
    1.  [Practical blockers for Malaysian students](#practical-blockers-for-malaysian-students)
1.  [Minimal reference stack](#minimal-reference-stack)
1.  [Takeaways for this hackathon](#takeaways-for-this-hackathon)
1.  [See also](#see-also)

## What changed in 2026

Several products a 2025 tutorial would recommend have been renamed, merged, or shut down. Check names before following an older guide.

- **Vertex AI is now Gemini Enterprise Agent Platform.** Google's rename table maps Vertex AI Platform to Gemini Enterprise Agent Platform, Vertex AI Studio to Agent Studio, Vertex AI Agent Engine to Agent Runtime, and Vertex AI in Firebase to Gemini Enterprise Agent Platform in Firebase ([name changes]). The Firebase SDK formerly called "Vertex AI in Firebase" is now Firebase AI Logic ([Firebase AI Logic pricing]).
- **Gemini API docs moved into Google AI Studio.** `ai.google.dev/gemini-api/docs/...` now redirects to `aistudio.google.com/docs/...` ([AI Studio models]).
- **Gemini 2.5 is legacy.** New projects can't select 2.5 models in AI Studio. From 1 December 2026, `gemini-2.5-flash` requests route to `gemini-3.5-flash-lite` and `gemini-2.5-pro` requests route to `gemini-3.8-flash` ([AI Studio models]).
- **Gemini CLI and Gemini Code Assist for individuals stopped serving free and Google AI Pro/Ultra users on 18 June 2026**, and Google moved them to Antigravity CLI ([CLI transition], [Code Assist consumer]). Since 9 October 2026, nobody can buy new Gemini Code Assist Standard or Enterprise subscriptions ([Code Assist sunset]).
- **Firebase Studio is sunsetting.** New workspaces and sign-ups were disabled on 22 June 2026, and it shuts down on 22 March 2027; Google points users to Google AI Studio and Antigravity instead ([Firebase Studio sunset]).
- **Looker Studio is now Data Studio:** `cloud.google.com/looker-studio` redirects to the Data Studio page ([Data Studio]).
- **Cloud Skills Boost is now Google Skills** at `skills.google` ([Google Skills]).
- **A no-card deploy path exists:** Google AI Studio Build mode can publish up to 2 full-stack apps on the Google Cloud Starter Tier without a billing account ([AI Studio deploy]).
- **Google Agentspace became Gemini Enterprise** on 9 October 2025 ([Gemini Enterprise release notes]).

## Gemini API in Google AI Studio

### Current Gemini models

The main text models on the AI Studio models and pricing pages as of 3 November 2026 ([AI Studio models], [AI Studio pricing]):

| Model                 | Endpoint                 | Free tier | Paid price per 1M tokens, input / output            |
| --------------------- | ------------------------ | --------- | --------------------------------------------------- |
| Gemini 4 Argon        | `gemini-4-argon`         | No        | $2 / $10 until 30 Nov 2026, then $4 / $20           |
| Gemini 3.1 Pro        | `gemini-3.1-pro-preview` | No        | $2 / $12 for prompts up to 200k tokens              |
| Gemini 3.8 Flash      | `gemini-3.8-flash`       | Yes       | $0.75 / $3.75 until 31 Dec 2026, then $1.50 / $7.50 |
| Gemini 3.6 Flash      | `gemini-3.6-flash`       | Yes       | $0.75 / $3.75 until 31 Dec 2026, then $1.50 / $7.50 |
| Gemini 3.5 Flash-Lite | `gemini-3.5-flash-lite`  | Yes       | $0.30 / $2.50                                       |
| Gemini 3.1 Flash-Lite | `gemini-3.1-flash-lite`  | Yes       | $0.25 / $1.50 (text)                                |
| Gemini Embedding 2    | `gemini-embedding-2`     | Yes       | $0.20 text input                                    |

The same pages also list Live API voice models (`gemini-3.8-live`, on the free tier), Gemini 3.5 Transcribe for speech-to-text, and Nano Banana image models.

### Gemini API free and paid tiers

- **Free tier:** any active project with no billing account gets "limited access to certain models" with free input and output tokens, and Google uses the content to improve its products ([AI Studio pricing], [AI Studio billing]).
- **Rate limits are per project, not per API key,** and requests-per-day quotas reset at midnight Pacific time ([rate limits]). That is 4:00 PM MYT now that US daylight saving ended on 1 November 2026 (my conversion).
- **Free-tier numbers aren't published in the docs.** The rate-limits page sends you to the signed-in AI Studio rate-limit view instead ([rate limits]). A secondary source dated 19 October 2026 reports 5 RPM and 20 RPD for Gemini 3.8 and 3.6 Flash, and 10 RPM and 500 RPD for 3.5 and 3.1 Flash-Lite ([scriptbyai] (secondary)); other trackers give higher figures, so check your own project's limits.
- **Grounding with Google Search or Maps** isn't available on the API free tier for the 3.x Flash models, though you can test it in the AI Studio UI. On the paid tier, the first 5,000 grounded requests per month are free across Gemini 3 and newer models, then $14 per 1,000 ([AI Studio pricing]).
- **Paid Tier 1** needs a linked Cloud Billing account. New users default to Prepay with a $5 minimum top-up. Prepaid credits expire after 12 months and are non-refundable, and when the balance hits $0 every API key on that billing account stops with HTTP 402 ([AI Studio billing]). Tier 1 has a $250 billing-tier cap and a spend limit of $10 per 10 minutes ([rate limits]).
- **The $300 Cloud Free Trial credit can't pay for the Gemini API in AI Studio** ([Cloud free features]). It can pay for Gemini through Agent Platform, formerly Vertex AI ([Firebase AI Logic pricing]).

[rate limits]: https://aistudio.google.com/docs/rate-limits
[scriptbyai]: https://www.scriptbyai.com/gemini-api-free-tier-limits/

### Gemini API terms that matter for students

The Gemini API Additional Terms, effective 23 March 2026, say ([Gemini API terms]):

- **Age:** you must be 18 or older, and you may not build an app "directed towards or likely to be accessed by" under-18s. AI Studio may ask you to verify your age, and Google Workspace for Education accounts need their administrator to mark them as 18+ ([AI Studio troubleshooting]).
- **Region:** Malaysia is on the list of available regions ([available regions]).
- **Free-tier data use:** on unpaid services, Google uses prompts and responses to improve its products, and human reviewers may read them. The terms say: "Do not submit sensitive, confidential, or personal information to the Unpaid Services."
- **Paid data use:** paid-tier prompts aren't used to improve products; Google logs them for a limited period only to detect abuse.

[Gemini API terms]: https://aistudio.google.com/docs/terms
[AI Studio troubleshooting]: https://aistudio.google.com/docs/troubleshoot-ai-studio
[available regions]: https://aistudio.google.com/docs/available-regions

## Building blocks

### Gemini Enterprise Agent Platform, formerly Vertex AI

- **What it's for here:** calling Gemini under Google Cloud terms and billing, so the $300 credit applies, and hosting agents with managed sessions and memory.
- Agent Platform bundles ADK, Agent Garden (prebuilt agents), Agent Studio (a low-code canvas), RAG Engine, Vector Search, and a Managed Agents API, and deploys agents to Agent Runtime ([Agent Platform docs]). The rename table has no entry for "Agent Builder"; these build tools now sit under Agent Platform ([name changes]).
- **Express mode:** new Google Cloud users can use express mode free for up to 90 days within quotas, without billing information. It is separate from the Cloud Free Program ([express mode]).
- **Agent Runtime pricing:** $0.085 per vCPU-hour and $0.009 per GiB-hour, with idle time between turns not billed. The pricing page lists no free allowance for it ([Agent Platform pricing]).

[Agent Platform docs]: https://docs.cloud.google.com/gemini-enterprise-agent-platform
[Agent Platform pricing]: https://cloud.google.com/products/gemini-enterprise-agent-platform/pricing

### Agent Development Kit

- **What it's for here:** writing the agent that reads sensor data, calls tools such as a Maps lookup or a Firestore write, and decides on actions. It runs locally, on Cloud Run, or on Agent Runtime, and can be published to Gemini Enterprise Standard or Plus ([full-code agents](/docs/research/gemini-enterprise.md#full-code-agents)).
- ADK is an open-source, model-agnostic agent framework in Python, TypeScript, Go, Java, and Kotlin (`pip install google-adk`). ADK 2.0 adds graph-based workflows. Its docs moved to [adk.dev](https://adk.dev/) ([ADK]).

[ADK]: https://adk.dev/

### Firebase

- **What it's for here:** sign-in, a real-time database for live sensor readings, and static hosting, all on the no-cost Spark plan with no payment method ([Firebase pricing]).
- **Spark plan allowances:** Hosting gives 10 GB storage and 360 MB/day transfer. Firestore gives 1 GiB stored plus 50K reads, 20K writes, and 20K deletes per day. Authentication covers 50K monthly active users. Cloud Functions and App Hosting need the pay-as-you-go Blaze plan ([Firebase pricing]).
- **Genkit:** Google's open-source SDK for AI apps and agents, in TypeScript, Go, Dart, and Python ([Genkit]).
- **Firebase AI Logic:** client SDKs that call Gemini from a web or mobile app. The SDK is free, and the Gemini Developer API free tier works on Spark without billing ([Firebase AI Logic pricing]).
- **AI Studio integration:** the AI Studio agent can provision Firestore and Firebase Authentication with Google Sign-In for an app. Those databases share one quota group with the same Spark-sized limits ([Firebase in AI Studio]).
- **Firebase Studio:** closed to new users; see [What changed in 2026](#what-changed-in-2026).

[Genkit]: https://genkit.dev/
[Firebase in AI Studio]: https://firebase.google.com/docs/ai-assistance/ai-studio-integration

### Cloud Run

- **What it's for here:** an HTTPS ingest endpoint that devices or gateways post readings to, the API backend, and a host for ADK or Genkit agents.
- **Free tier (request-based billing):** 2 million requests, 180,000 vCPU-seconds, and 360,000 GiB-seconds per month, counted per billing account ([Cloud Run pricing]). Using it needs a billing account, unless you deploy through the AI Studio Starter Tier.
- **Region:** the pricing page's region list includes "Kuala Lumpur (asia-southeast4)" ([Cloud Run pricing]), but Google's [Compute Engine regions] and [Cloud Run locations] pages list no Malaysia region (checked 5 November 2026). So the region isn't listed as launched; the nearest live region is `asia-southeast1` (Singapore).

[Cloud Run pricing]: https://cloud.google.com/run/pricing
[Compute Engine regions]: https://docs.cloud.google.com/compute/docs/regions-zones
[Cloud Run locations]: https://docs.cloud.google.com/run/docs/locations

### Pub/Sub and the Cloud IoT Core retirement

- **What Pub/Sub is for here:** a buffer between device ingest and processing or BigQuery. The first 10 GiB of message delivery each month is free, then $40 per TiB; BigQuery subscriptions cost $50 per TiB with no free allowance ([Pub/Sub pricing]).
- **Cloud IoT Core** shut down on 16 August 2023 ([Eventarc deprecations]). Google's architecture guidance now uses an MQTT broker or a partner IoT platform that feeds Pub/Sub ([IoT platform architecture]). Device and protocol choices are in [iot-and-network.md](/docs/research/iot-and-network.md).

[Pub/Sub pricing]: https://cloud.google.com/pubsub/pricing
[Eventarc deprecations]: https://docs.cloud.google.com/eventarc/docs/deprecations
[IoT platform architecture]: https://docs.cloud.google.com/architecture/connected-devices/iot-platform-product-architecture

### BigQuery

- **What it's for here:** the Data-Driven track's analytics layer, joining logged readings with public datasets.
- **Sandbox, no card:** 10 GiB of storage for the account's lifetime and 1 TiB of queries a month. Tables expire after 60 days, and the sandbox doesn't support streaming, DML statements, or the Data Transfer Service ([BigQuery sandbox]). So sensor data has to be batch-loaded rather than streamed in (inference from those limits).
- **With billing:** the same 1 TiB of queries plus 10 GiB of storage per month free ([Cloud free features]).
- Public datasets are in the `bigquery-public-data` project ([BigQuery sandbox]); [data sources](/docs/research/data-sources.md) catalogues the relevant ones.

### Data Studio, formerly Looker Studio

- **What it's for here:** a drag-and-drop dashboard over BigQuery, Sheets, or other connectors, embeddable in a web page. The self-service tier costs nothing for creators and viewers ([Data Studio]).

### Google Maps Platform

- **What it's for here:** campus maps, device locations, routes, and environment data such as air quality and weather.
- **Free usage per SKU per month:** 10,000 calls for Essentials SKUs, 5,000 for Pro, and 1,000 for Enterprise. Standard keys need a billing account ([Maps pricing overview]).
- **Maps Demo Key in AI Studio:** works without a card for prototyping, and covers all Maps Platform APIs except Route Optimization, Solar, and Nav Connect ([Maps in AI Studio]).

[Maps pricing overview]: https://developers.google.com/maps/billing-and-pricing/overview

### AI coding tools

- **Google AI Studio Build mode:** generates a full-stack app from prompts and publishes it to Cloud Run through the Starter Tier ([AI Studio deploy]).
- **Google Antigravity:** an agent-first app, IDE, CLI (`agy`), and SDK. The $0 Individuals plan has "basic weekly rate limits"; Google AI Pro and Ultra subscribers get higher limits and an AI credit pool ([Antigravity pricing]). Google AI Plus isn't listed as a plan. Antigravity through a Gemini Enterprise seat is covered in [Gemini Enterprise](/docs/research/gemini-enterprise.md#surfaces-and-licensing).
- **Gemini CLI and Gemini Code Assist:** no longer an option for students. Both stopped serving individuals on 18 June 2026, and Gemini CLI now serves only Code Assist Standard/Enterprise organisations and paid API keys ([Gemini CLI repo], [Code Assist consumer]). The geminicli.com quota page still lists free Google-login tiers, which is stale.
- **Jules:** an asynchronous coding agent that works on GitHub repos in a cloud VM. The free plan gives 15 tasks per day and 3 concurrent tasks ([Jules]).
- **Gemini API CLI (`gemini-api`):** a stateless command-line tool that lets scripts and coding agents call Gemini models ([Gemini CLI repo]).

[Gemini CLI repo]: https://github.com/google-gemini/gemini-cli
[Jules]: https://jules.google/

## Money and access

### Paths that need no payment card

As of 3 November 2026:

| Path                         | What you get                                                                      | Main limit                                                |
| ---------------------------- | --------------------------------------------------------------------------------- | --------------------------------------------------------- |
| Gemini API free tier         | API key, Flash and Flash-Lite models ([AI Studio pricing])                        | Low daily quotas; prompts used to improve Google products |
| AI Studio Starter Tier       | Publish 2 apps on Cloud Run, with Firestore, Auth, and Cloud SQL ([Starter Tier]) | No other Cloud APIs in that project; eligibility varies   |
| Maps Demo Key                | Nearly all Maps Platform APIs inside AI Studio apps ([Maps in AI Studio])         | Prototyping use                                           |
| Firebase Spark               | Hosting, Firestore, Auth ([Firebase pricing])                                     | No Cloud Functions                                        |
| BigQuery sandbox             | SQL over public datasets ([BigQuery sandbox])                                     | 60-day table expiry; no streaming                         |
| Agent Platform express mode  | Gemini under Cloud terms ([express mode])                                         | New Google Cloud users only; 90 days                      |
| Data Studio                  | Dashboards ([Data Studio])                                                        | None relevant                                             |
| Antigravity Individuals plan | Coding agent ([Antigravity pricing])                                              | Basic weekly rate limits                                  |

[Starter Tier]: https://docs.cloud.google.com/docs/starter-tier

### Google Cloud Free Trial credit

- **Offer:** $300 of credit valid for 90 days, plus the always-free tier. You're eligible if you have never been a paying user of Google Cloud, Google Maps Platform, or Firebase, and have never signed up for the Free Trial before ([Cloud free features]).
- **Sign-up:** you must provide "a credit card or other payment method", and in some countries verify a bank account. Google places a temporary authorisation hold on the card ([Cloud free features]).
- **Exclusions:** the credit doesn't cover the Gemini API in AI Studio or partner models offered as managed APIs. While on a Free Trial account you can't add GPUs, use Cloud Marketplace, or request quota increases ([Cloud free features]).
- **End of trial:** when the 90 days pass or the $300 runs out, resources stop and there is a 30-day grace period before deletion, unless you upgrade to a paid account ([Cloud free features]).
- **Cards Cloud Billing rejects:** prepaid cards, and "debit cards that require two-factor authentication" ([payment methods]).

### Education and community programmes

- **Google Skills, formerly Cloud Skills Boost:** students can request 200 free credits for labs and courses, which expire one year after issue ([Cloud for students]). The GEAR programme adds 35 credits a month at no cost ([Google Skills]). These credits pay for training labs, not your own project (inference).
- **Teaching credits:** only faculty can apply. Credits attach to students' school email domains and are available only in the listed countries ([teaching credits]). Faculty can also apply for research credits of up to $5,000 ([Cloud for education]). Approval time isn't stated.
- **Student Google AI Plus plan in Malaysia:** one year at no cost for verified college students aged 18+. You must redeem it by 31 December 2026 with a valid payment method, and it then renews at MYR 23.99 a month ([Gemini for students MY]). It raises consumer Gemini app limits, not API quotas.
- **GDGoC:** no standing GDGoC credit programme was found (searched developers.google.com/community and gdg.community.dev). Individual chapters do hand out credits: GDGoC UTM's Build with AI 2026 hackathon gave each participant $25 of Google Cloud credits, plus $25 more for finalists ([GDGoC UTM hackathon]). As of 3 November, this hackathon's organisers hadn't answered whether credits will be given ([brief](/docs/BRIEF.md)).

[Cloud for students]: https://cloud.google.com/edu/students
[teaching credits]: https://edu.google.com/programs/credits/teaching/
[Cloud for education]: https://cloud.google.com/edu
[Gemini for students MY]: https://gemini.google/my/students/?hl=en
[GDGoC UTM hackathon]: https://gdg.community.dev/events/details/google-gdg-on-campus-universiti-teknologi-malaysia-johor-bahru-malaysia-presents-build-with-ai-2026-hackathon-project-2030-myai-future-hackathon/

### Practical blockers for Malaysian students

- **Age:** AI Studio and the Gemini API require users to be 18 or older ([Gemini API terms]).
- **School accounts:** a Google Workspace for Education account needs its administrator to mark it as 18+ before it can use AI Studio, and Workspace accounts can't use the Starter Tier ([AI Studio troubleshooting], [AI Studio deploy]). Personal Google accounts avoid both problems (inference).
- **Starter Tier eligibility:** access can be refused for lack of account history, and AI Studio support can't override that ([AI Studio deploy]).
- **Payment cards:** a card is needed for the Cloud Free Trial, Gemini API paid tiers, Firebase Blaze, standard Maps keys, and both Gemini Enterprise trials (inferred for the Standard and Plus trial; see [Gemini Enterprise trials and access](/docs/research/gemini-enterprise.md#gemini-enterprise-trials-and-access)). Cloud Billing rejects prepaid cards and debit cards that require two-factor authentication ([payment methods]).
- **One trial per person:** the Free Trial is once per person and excludes anyone who has paid for Google Cloud, Maps, or Firebase before ([Cloud free features]). A team would typically use one member's trial billing account and grant teammates access to the project (inference).
- **Personal data:** on free tiers, keep personal data such as student IDs, names, or location traces out of prompts ([Gemini API terms]).

## Minimal reference stack

Allowances as of 3 November 2026, taken from the sections above. The setup-effort column is my estimate for a student team.

| Need              | Google option                                          | Free allowance                              | Card needed                           | Setup effort |
| ----------------- | ------------------------------------------------------ | ------------------------------------------- | ------------------------------------- | ------------ |
| Ingest            | Cloud Run HTTPS endpoint                               | 2M requests a month                         | Yes, unless deployed via Starter Tier | Low          |
| Ingest queue      | Pub/Sub                                                | 10 GiB a month                              | Yes                                   | Medium       |
| Store, live       | Firestore                                              | 1 GiB; 50K reads and 20K writes a day       | No                                    | Low          |
| Store, analytics  | BigQuery sandbox                                       | 10 GiB lifetime; 1 TiB of queries a month   | No                                    | Low          |
| Compute           | Cloud Run                                              | 180K vCPU-seconds, 360K GiB-seconds a month | Yes, unless deployed via Starter Tier | Low          |
| AI                | Gemini API, 3.5 Flash-Lite or 3.8 Flash                | Free tokens within rate limits              | No                                    | Low          |
| Agent logic       | ADK or Genkit                                          | Open source                                 | No                                    | Medium       |
| Frontend, hosting | AI Studio Build plus Starter Tier, or Firebase Hosting | 2 apps; or 10 GB and 360 MB a day           | No                                    | Low          |
| Dashboard         | Data Studio                                            | No charge                                   | No                                    | Low          |
| Maps              | Maps Demo Key in AI Studio                             | Prototyping use                             | No                                    | Low          |

## Takeaways for this hackathon

What the evidence shows:

- A team can build and host a working Gemini-powered web app with a database, sign-in, and maps without any payment card, using AI Studio Build, the Starter Tier, Firebase Spark, and the Maps Demo Key. This doesn't extend to Pub/Sub, Cloud Functions, or BigQuery streaming.
- Gemini Enterprise, the subject of the NTT DATA training, is a seat-licensed workspace for staff. The Business trial gives 5 free seats for 30 days but needs a card and converts to $21 per seat per month. It can't host your own ADK agents; Standard or Plus can ([Gemini Enterprise](/docs/research/gemini-enterprise.md#what-a-team-can-and-cannot-build-with-gemini-enterprise)).
- Free-tier Gemini prompts may be read by human reviewers, and users must be 18 or older. Campus or student data must stay out of free-tier prompts.
- Many guides are out of date. Vertex AI, Agent Engine, Gemini CLI's free tier, Gemini Code Assist for individuals, Firebase Studio, Looker Studio, and the Gemini 2.5 models have all been renamed or retired in 2026.

What I infer:

- Build the product on the Gemini API or Agent Platform. If the team wants to nod to the sponsor, add Gemini Enterprise as the staff-side surface, for example a no-code agent over the project's documents, shown in the deck. Superseded after the briefing: Gemini Enterprise became mandatory, and workflows now carry scheduled and event-driven logic inside the app; see [Gemini Enterprise](/docs/research/gemini-enterprise.md#what-gemini-enterprise-is).
- Free daily request limits look tight, so aggregate sensor readings on the server and call Gemini on summaries or events, not on every reading. Use Flash-Lite for frequent calls and Flash for occasional heavy reasoning.
- If one teammate has an accepted credit or debit card, the $300 Free Trial unlocks Pub/Sub, Agent Platform, and BigQuery streaming for the week. It doesn't cover AI Studio API usage.
- Use current product names in the README and deck, since judges from Google Cloud or NTT DATA will notice outdated names.
- Ask the organisers about credits soon. A Malaysian GDGoC chapter has precedent at $25 per participant.

## See also

- [Hackathon brief](/docs/BRIEF.md): dates, tracks, the briefing's Gemini Enterprise stance, and the open questions on licences and credits.
- [Gemini Enterprise](/docs/research/gemini-enterprise.md): editions, prices, trials, workflows, connectors, live-data paths, and reviewer access.
- [IoT and network](/docs/research/iot-and-network.md): devices, protocols, and the IoT side of the architecture.
- [Data sources](/docs/research/data-sources.md): live public datasets per track.
- [Judging](/docs/research/judging.md): rubrics, responsible AI, and packaging.
- [Winners](/docs/research/winners.md): what has won before.
- [Google AI Studio docs](https://aistudio.google.com/docs) and [Google Cloud free program](https://cloud.google.com/free).

[AI Studio models]: https://aistudio.google.com/docs/models
[AI Studio pricing]: https://aistudio.google.com/docs/pricing
[AI Studio billing]: https://aistudio.google.com/docs/billing
[AI Studio deploy]: https://aistudio.google.com/docs/aistudio-deploying
[name changes]: https://docs.cloud.google.com/gemini-enterprise-agent-platform/vertex-ai-name-changes
[express mode]: https://docs.cloud.google.com/gemini-enterprise-agent-platform/models/start/express-mode/overview
[Firebase AI Logic pricing]: https://firebase.google.com/docs/ai-logic/pricing
[Firebase pricing]: https://firebase.google.com/pricing
[Firebase Studio sunset]: https://firebase.google.com/docs/studio/migrating-project
[CLI transition]: https://developers.googleblog.com/an-important-update-transitioning-gemini-cli-to-antigravity-cli/
[Code Assist consumer]: https://developers.google.com/gemini-code-assist/docs/deprecations/code-assist-individuals
[Code Assist sunset]: https://docs.cloud.google.com/gemini/docs/codeassist/sunset
[Antigravity pricing]: https://antigravity.google/pricing
[Data Studio]: https://cloud.google.com/data-studio
[Google Skills]: https://www.skills.google/
[Gemini Enterprise release notes]: https://docs.cloud.google.com/gemini/enterprise/docs/release-notes
[Cloud free features]: https://docs.cloud.google.com/free/docs/free-cloud-features
[payment methods]: https://docs.cloud.google.com/billing/docs/how-to/payment-methods
[BigQuery sandbox]: https://docs.cloud.google.com/bigquery/docs/sandbox
[Maps in AI Studio]: https://developers.google.com/maps/ai/ai-studio
