# Gemini Enterprise

What a student team can build inside Gemini Enterprise for the APU Cloud Innovation Hackathon, how real data, including live IoT and public-feed readings, get into and out of its agents within a week under the repo's real-data rule, where Antigravity fits, and how NTT DATA reviewers get in to see and use the result. This file merges five pieces of research. Four were done on 3 November 2026 against Google's docs, release notes, pricing, and help pages and the vendors' own docs: the platform research done after the [briefing]; the connector and live-data research, checked against Gemini Enterprise pages last updated 28 October – 3 November 2026; the editions, prices, and trials research done before the briefing as part of the Google tools research; and the platform constraints checked for the Astra shortlist. The fifth re-checked the platform constraints against Google's docs on 5 November 2026 for ideas built on the team's phones and Raspberry Pi; its additions carry that date. Prices are in USD. Where the post-briefing research corrected the pre-briefing research, the corrected fact is stated where it appears, with a note of what was said before.

Contents:

1.  [Key findings](#key-findings)
1.  [Corrections to the briefing](#corrections-to-the-briefing)
1.  [The platform](#the-platform)
    1.  [What Gemini Enterprise is](#what-gemini-enterprise-is)
    1.  [Gemini Enterprise editions and prices](#gemini-enterprise-editions-and-prices)
    1.  [Gemini Enterprise trials and access](#gemini-enterprise-trials-and-access)
    1.  [What a team can and cannot build with Gemini Enterprise](#what-a-team-can-and-cannot-build-with-gemini-enterprise)
    1.  [Models](#models)
    1.  [App surfaces](#app-surfaces)
        1.  [Workflow Builder, formerly Agent Designer](#workflow-builder-formerly-agent-designer)
        1.  [Chat agents](#chat-agents)
        1.  [Workflows](#workflows)
        1.  [Made by Google agents](#made-by-google-agents)
        1.  [Skills](#skills)
        1.  [Agent Gallery and sharing](#agent-gallery-and-sharing)
    1.  [Antigravity](#antigravity)
        1.  [Surfaces and licensing](#surfaces-and-licensing)
        1.  [Antigravity MCP configuration](#antigravity-mcp-configuration)
1.  [Building agents and workflows](#building-agents-and-workflows)
    1.  [Unattended automation](#unattended-automation)
        1.  [Triggers and schedules](#triggers-and-schedules)
        1.  [What runs without anyone signed in](#what-runs-without-anyone-signed-in)
        1.  [Run history as evidence](#run-history-as-evidence)
    1.  [Full-code agents](#full-code-agents)
1.  [Data in and out](#data-in-and-out)
    1.  [Connector catalogue](#connector-catalogue)
        1.  [Google data sources](#google-data-sources)
        1.  [Third-party data sources](#third-party-data-sources)
        1.  [Edition and account limits](#edition-and-account-limits)
    1.  [Federated search versus ingestion](#federated-search-versus-ingestion)
    1.  [Actions and write-back](#actions-and-write-back)
    1.  [Custom MCP servers](#custom-mcp-servers)
        1.  [Requirements and registration](#requirements-and-registration)
        1.  [Google-managed remote MCP servers](#google-managed-remote-mcp-servers)
        1.  [Third-party remote MCP servers](#third-party-remote-mcp-servers)
    1.  [Custom connectors through the API](#custom-connectors-through-the-api)
    1.  [Live-data architectures](#live-data-architectures)
        1.  [Free-tier limits that matter](#free-tier-limits-that-matter)
        1.  [Phone or board to Google Sheets](#phone-or-board-to-google-sheets)
        1.  [Public feed polled into Sheets](#public-feed-polled-into-sheets)
        1.  [Device to Supabase](#device-to-supabase)
        1.  [Device to Pub/Sub and BigQuery](#device-to-pubsub-and-bigquery)
        1.  [MCP server that queries public feeds on demand](#mcp-server-that-queries-public-feeds-on-demand)
        1.  [Network measurements through Globalping](#network-measurements-through-globalping)
        1.  [Comparison of live-data paths](#comparison-of-live-data-paths)
    1.  [Free sandboxes](#free-sandboxes)
    1.  [Kaggle and GitHub](#kaggle-and-github)
1.  [Reviewer access](#reviewer-access)
    1.  [What each reviewer needs](#what-each-reviewer-needs)
    1.  [The app URL](#the-app-url)
    1.  [What to ask reviewers for](#what-to-ask-reviewers-for)
1.  [Limits that bite in a one-week build](#limits-that-bite-in-a-one-week-build)
    1.  [Platform constraints and design consequences](#platform-constraints-and-design-consequences)
1.  [Takeaways for this hackathon](#takeaways-for-this-hackathon)
1.  [Not verified](#not-verified)
1.  [See also](#see-also)

## Key findings

- **The "maximizing" agent the presenter described is a workflow.** Workflow Builder, the GA successor to Agent Designer since 3 September 2026, builds workflows that start on a schedule, on a connector event such as a new email or file, or by hand, and keeps a Runs tab with step-by-step traces ([GE release notes], [workflows]).
- **Unattended runs have three catches.** Schedules run on the author's delegated credentials, which expire every 14 days and must be refreshed by hand. Scheduled runs that affect other people, such as sending email, pause for approval. The workflow docs say adding or updating data through connectors "requires human review" ([Workflow Builder limits], [workflows]).
- **A free-trial subscription excludes Antigravity.** Free-trial seats get their edition's base quotas but no AI developer tools and no pay-as-you-go above quota ([licence FAQ], [quotas]). On a trial, a team uses Antigravity's free Individuals plan with a personal account instead.
- **Every reviewer needs a licence and an IAM role in the team's project,** plus the agent shared with them. Sharing is documented as "within your organization" ([licences], [access control], [share workflow]).
- **Daily creation quota is small on Standard:** 1 agent per licensed user per day, pooled; Plus gives 10 ([Workflow Builder limits]).

## Corrections to the briefing

Claims made at the [briefing] that Google's docs contradicted on 3 November 2026. Corrections to the pre-briefing research are made inline where each fact appears.

- **Antigravity licence:** the presenter said Antigravity "comes with the enterprise license" and has no token limits ([briefing]). The docs say free-trial subscriptions exclude AI developer tools, and paid seats get $10 (Standard) or $15 (Plus) of Antigravity credit per user per month, enforced weekly ([licence FAQ], [quotas]). See [Surfaces and licensing](#surfaces-and-licensing).
- **Data Insights** is "GA with allowlist" through sales, not the "preview" on slide 9, and Business lacks it ([GE release notes], [GE editions]).
- **Personal Gmail accounts:** the presenter said personal Gmail IDs "work perfectly", and that they "will work perfectly" for the Drive connector ([briefing]). The Gmail, Drive, and Calendar connector pages say consumer `@gmail.com` accounts have no customer ID and aren't supported for Google Workspace data stores ([Gmail data store], [Google sources], [Drive setup]). See [Edition and account limits](#edition-and-account-limits).
- **Antigravity's model:** slide 11's "powered by Gemini 3.5 Flash" is out of date; the current Antigravity models are in [Surfaces and licensing](#surfaces-and-licensing).

## The platform

### What Gemini Enterprise is

- Google describes it as "an intranet search, AI assistant, and agentic platform" for employees. It connects to company data such as Confluence, Jira, SharePoint, and ServiceNow, and hosts custom agents ([GE overview]). The marketing page now brands it as "Gemini for business" and notes that some features shown, such as background tasks and third-party model choice, are still in early access ([GE product page]).
- It was formerly Google Agentspace, renamed on 9 October 2025 ([GE release notes]).
- The **Gemini Enterprise app** and **Gemini Enterprise Agent Platform** are bought separately. The app is billed per seat per month; Agent Platform, "the evolution of Vertex AI", is a pay-as-you-go developer platform that needs a Google Cloud account ([GE FAQ]). Agent Platform is covered in [Google Cloud](/docs/research/google-cloud.md#gemini-enterprise-agent-platform-formerly-vertex-ai).
- It is distinct from the consumer Gemini app and from Gemini in Google Workspace ([GE choose edition]).
- **NTT DATA link:** on 8 June 2026 NTT DATA announced a dedicated global Gemini Enterprise practice, aiming to certify 5,000 Gemini Enterprise experts and to co-develop up to 500 AI agents with Google Cloud ([NTT DATA release]).
- **No longer only a chat front end.** Before the briefing, the Google tools research inferred that Gemini Enterprise is a seat-licensed, staff-facing workspace, not a backend you embed in a public app: every judge or end user would need a seat in your tenant, and a team could use it to show a staff-side experience, for example a no-code agent that answers questions over uploaded campus documents. It also inferred that "the sensor ingest, the logic, and any public UI still need the Gemini API or Agent Platform". The post-briefing research corrected that: workflows now carry scheduled and event-driven logic inside the app ([workflows]), and the briefing made Gemini Enterprise mandatory. Ingest still needs a connector or MCP server; see [Data in and out](#data-in-and-out). Reviewers still each need a seat; see [Reviewer access](#reviewer-access).

[GE overview]: https://docs.cloud.google.com/gemini/enterprise/docs
[NTT DATA release]: https://www.nttdata.com/global/en/news/press-release/2026/june/060900

### Gemini Enterprise editions and prices

Prices as of 3 November 2026, gathered before the briefing:

| Edition       | Aimed at                                                   | Price                                                                 | Pooled storage per user |
| ------------- | ---------------------------------------------------------- | --------------------------------------------------------------------- | ----------------------- |
| Business      | Small businesses and teams; web app only, no Cloud console | From $21 per seat per month ([GE Business])                           | 25 GiB                  |
| Standard      | Enterprises with stricter security and compliance needs    | From $30 per seat per month, Standard or Plus ([Antigravity pricing]) | 30 GiB                  |
| Plus          | The fullest AI tools and agent building                    | Separate Plus price not found on Google pages                         | 75 GiB                  |
| Pay-as-you-go | Consumption billing, 1-seat minimum                        | $0 seat fee plus usage ([Antigravity pricing])                        | Pay-as-you-go           |
| Frontline     | Add-on for 150 or more Standard or Plus users              | Not published                                                         | 2 GiB                   |

- The edition descriptions and storage figures come from the editions comparison ([GE editions]). The release notes also mention EDU, EDU Pro, and Emerging Market editions ([GE release notes]); educational institutions are told to contact sales, and no public price was found ([GE FAQ]).
- **Doc conflict:** the sources disagree on the Business seat cap. The FAQ says teams of up to 300, while the editions page says 1–500 users.
- **A console-created app is not Business.** Business lives at `business.gemini.google` with no console or project IAM ([GE editions]). An app created in the Cloud console, as in the briefing, runs on Standard, Plus, Pay-as-you-go, or Frontline licences; the console's subscription details page shows which ([GE editions]).
- **Licences are per project and location:** a licence works only in the project and location it was distributed to ([licences]). **Inference:** if Google allocates the licences to a project the organisers or NTT DATA own, the team builds in that project rather than its own.
- **Per person or per team:** an organiser question ([BRIEF.md](/docs/BRIEF.md#open-questions)).

### Gemini Enterprise trials and access

- **Business trial:** 30 days, sign up "with your work email" ([GE Business]). It covers up to 5 seats on a monthly term at no cost. You must add a credit or debit card, which may get a temporary authorisation hold, and the trial converts to a paid subscription unless you cancel. It ends at once if you exceed 5 seats or switch to annual billing ([GE Business billing]).
- **No upgrade path:** a Business edition team can't later move to Standard, Plus, or Frontline, because Google offers no data migration ([GE choose edition]).
- **Standard and Plus trial:** 30 days, started from the Google Cloud console's free-trial page "without sales assistance" ([GE product page], [GE FAQ]); the FAQ words it as "free for 30 days". Free-trial seats draw the edition's base pooled quotas but get no AI developer tools and no pay-as-you-go above quota ([licence FAQ], [quotas]).
- **Card for the Standard and Plus trial:** the pre-briefing research inferred from the link, which goes through the Cloud billing sign-up, that the trial brings the card checks described in [Google Cloud Free Trial credit](/docs/research/google-cloud.md#google-cloud-free-trial-credit). The post-briefing research found no docs page that states either the trial length outside the marketing FAQ or whether a card is needed; see [Not verified](#not-verified).
- **"Start a free trial or buy credits":** **Inference:** this is the screen for a project with no licence distributed to it. "Buy credits" refers to prepaid credits, which a self-serve billing account must buy to subscribe to Pay-as-you-go, with a $5 minimum and one-year expiry; free-trial billing accounts can't buy them ([GE editions], [prepaid credits]). Neither is needed if the sponsored licence reaches the project, so don't buy credits; ask the organisers.

[GE Business billing]: https://support.google.com/g/answer/16551831?hl=en
[prepaid credits]: https://docs.cloud.google.com/gemini/enterprise/docs/manage-prepaid-credits

### What a team can and cannot build with Gemini Enterprise

The editions comparison table, Business edition column ([GE editions]):

- **Can:** chat grounded in Google Search and connected data; generate images and video; use Deep Research; create and share Gemini Notebook Enterprise notebooks; build and publish no-code agents; create custom skills; use select connectors and permission-aware search. The Business help centre also covers connecting a custom MCP server ([GE Business help]).
- **Cannot:** bring your own full-code agents built outside Gemini Enterprise, such as ADK or A2A agents. Business also lacks the Data Insights agent, Agent Marketplace, the full connector ecosystem, Cloud console access, AI developer tools including Antigravity, and the mobile app ([GE editions], [GE choose edition]).
- **Standard and Plus** can publish agents built with Agent Platform or ADK into the Gemini Enterprise app, or connect external agents over the Agent2Agent (A2A) protocol ([GE FAQ]); see [Full-code agents](#full-code-agents).
- **No-code agents are GA, not preview.** The editions table still labels no-code agents "(preview)", and the pre-briefing research followed it; the release notes made Workflow Builder GA on 3 September 2026 ([GE editions], [GE release notes]). Google's own pages disagree here.
- **Gemini Code Assist, a date conflict:** the [GE FAQ] still advertises Gemini Code Assist with the Standard and Plus trial. The release notes say it was removed from new Standard and Plus subscriptions on 17 September 2026, and that Antigravity for IDEs replaces it ([GE release notes]). The pre-briefing research dated the change to 9 October 2026 instead, citing the Code Assist sunset page ([Code Assist sunset]), which is also the date from which nobody can buy new Gemini Code Assist Standard or Enterprise subscriptions ([Google Cloud](/docs/research/google-cloud.md#what-changed-in-2026)). The two sources disagree on the date.

[GE Business help]: https://support.google.com/g
[Code Assist sunset]: https://docs.cloud.google.com/gemini/docs/codeassist/sunset

### Models

- **The presenter's names:** "Gemini 3.8" is **Gemini 3.8 Flash**, and "Gemini Four Argon" is **Gemini 4 Argon** (`gemini-4-argon`) ([web app features], [Antigravity models]).
- **In the web app:** Gemini 4 Argon, 3.8 Flash, 3.7 Flash, 3.6 Flash, 3.5 Flash, 3.1 Pro, and 2.5 Pro, chosen through **Enable model selector**. Gemini 4 Argon's toggle defaults to on from 27 October 2026, and 3.8 Flash has been on by default since 23 September 2026 ([web app features], [GE release notes]).
- **In workflows:** Gemini 4 Argon arrived on 14 October 2026; agent nodes accept Gemini 3.0 and later, and the known-issues page recommends 3.1 Pro ([GE release notes], [workflows], [Workflow Builder known issues]).
- **Claude Opus 5.5 and Sonnet 5.5** can be enabled, but only as pay-as-you-go above quota ([web app features]). **Inference:** they are unavailable on a free trial, which can't use pay-as-you-go ([quotas]).
- Gemini API model prices and endpoints outside Gemini Enterprise are in [Google Cloud](/docs/research/google-cloud.md#current-gemini-models).

### App surfaces

#### Workflow Builder, formerly Agent Designer

- Workflow Builder is the no-code, low-code tool in the Gemini Enterprise web app for building **chat agents** and **workflows**, either from a natural-language prompt or in a visual editor ([Workflow Builder]).
- An admin turns it on in the Google Cloud console under the app's **Configurations** → **Feature Management** tab, with separate toggles **Enable chat agents** and **Enable workflows**, matching the briefing. The same tab has **Enable Agent Gallery**, **Enable model selector**, **Enable Gemini Notebook**, and three agent-sharing toggles ([web app features]).
- Users start from **Agents** → **+ New agent** in the web app ([agent gallery]). An agent can only use the connectors, tools, and permissions the admin has provisioned ([Workflow Builder]).

[Workflow Builder]: https://docs.cloud.google.com/gemini/enterprise/docs/workflow-builder

#### Chat agents

- Conversational, mainly non-deterministic agents for Q&A, lookups, and user-driven tasks. They can be one node or a main agent routing to sub-agents ([chat agents]).
- The canvas has a chat mode and a designer mode with **Flow**, **Schedule**, and **Preview** tabs ([chat agents]).
- To the end user, a chat agent is an entry in the Agent Gallery, or an `@`-mention in a chat ([GE release notes]).

[chat agents]: https://docs.cloud.google.com/gemini/enterprise/docs/workflow-builder/chat-agents

#### Workflows

- A workflow is a trigger plus a sequence of steps, mixing AI steps and human steps, with deterministic or non-deterministic logic ([workflows]).
- **Steps:** Gemini Agent nodes with instructions, knowledge files, connected apps, and a model choice (Gemini 3.0 or later only); conditions; data filtering and loops; human-in-the-loop **Request info** and **Approval** steps; MCP steps; and handing off to existing ADK or A2A agents ([workflows], [HITL steps], [MCP steps]).
- **Connector actions:** each connector on an agent node has **Search For Data** actions, toggled one by one, and **Add Or Update Data** actions, toggled all-or-nothing per connector ([workflows]).
- **Workflow connectors** (checked 5 November 2026): Gmail, Google Calendar, Google Chat, Google Drive, Confluence (Cloud and Data Center), Jira (Cloud and Data Center), Microsoft Teams, Notion, OneDrive, Outlook, Salesforce, SharePoint, ServiceNow, and Slack ([workflows]). The full catalogue is in [Connector catalogue](#connector-catalogue).
- **GitHub isn't on the workflow list** (checked 5 November 2026), although a separate GitHub connector page exists ([workflows], [GitHub connector]). Don't infer GitHub workflow support from its standalone search support.
- **Lifecycle:** save as draft, test in the **Preview**/**Test** tab with sample events, then **Turn on**. Versions can be saved, compared, and restored, and turning a version off removes its schedules and triggers ([turn on workflow]).

[HITL steps]: https://docs.cloud.google.com/gemini/enterprise/docs/workflow-builder/use-hitl-steps
[MCP steps]: https://docs.cloud.google.com/gemini/enterprise/docs/workflow-builder/connect-mcp-servers
[turn on workflow]: https://docs.cloud.google.com/gemini/enterprise/docs/workflow-builder/publish-workflows

#### Made by Google agents

- **Deep Research:** plans a research task, streams progress, and returns a cited report with an audio summary, using the app's indexed data and, if enabled, the web ([Deep Research]). Quota: 3 a day per Standard user, 10 per Plus user, pooled ([quotas]).
- **Gemini Notebook Enterprise,** renamed from NotebookLM Enterprise on 16 July 2026: opened from **Agents** → **Made by Google** → **Gemini Notebook** ([Gemini Notebook in GE], [GE release notes]). Notebooks can be shared only with users in the same project or workforce pool who hold a licence ([notebook sharing]).
- **Data Insights:** answers questions over BigQuery data; GA with allowlist, so a team would need sales to enable it ([GE release notes]).
- **Co-Scientist** also appears under Made by Google; the Idea Generation agent was removed on 14 July 2026 ([agent gallery], [GE release notes]).

[Deep Research]: https://docs.cloud.google.com/gemini/enterprise/docs/research-assistant
[Gemini Notebook in GE]: https://docs.cloud.google.com/gemini/enterprise/docs/access-notebooklm
[notebook sharing]: https://docs.cloud.google.com/gemini/enterprise/notebooklm-enterprise/docs/share-notebooks

#### Skills

- A skill is a package with a `SKILL.md` prompt file, plus optional scripts and context files, that the assistant loads when relevant. Standard, Plus, and Pay-as-you-go users can create and upload skills; an admin must turn skills on, and sharing can require admin review ([skills]).
- Users could create, upload, and share custom skills from 13 August 2026 ([GE release notes]).

[skills]: https://docs.cloud.google.com/gemini/enterprise/docs/skills

#### Agent Gallery and sharing

- The gallery, under **Agents** in the web app, filters by **Pinned**, **Made by Google**, **From your organization**, **Your agents**, and **Marketplace** ([agent gallery]).
- An owner shares a workflow by email from the canvas **Share** button. Sharing with Google Groups is off for end users until an admin enables it, and admins can require approval for the first share ([share workflow], [web app features]).
- People a workflow is shared with see a read-only graph. They can run a preview, set **their own** schedule or event triggers, view **their own** runs, or make a copy ([share workflow]).
- Admins can also share any agent from the console, with users, groups, workforce pools, or "All users", and transfer ownership. A transfer disables the agent's schedules and triggers until the new owner re-enables them ([share agents console]).

### Antigravity

#### Surfaces and licensing

- **Surfaces:** a desktop app, the CLI (`agy`), extensions for VS Code, Visual Studio, JetBrains, Zed, Xcode, and Eclipse, a standalone IDE, and a Python SDK. It runs on macOS 12+, Windows 10/11, and Linux ([Antigravity getting started]).
- **Sign-in:** a personal Google Account (Free, Pro, Ultra plans) or Gemini Enterprise credentials, by choosing **Business account** → **Continue with Google Cloud** and then a project and location ([Antigravity getting started], [Antigravity enterprise]).
- **Free Individuals plan:** $0 with "basic weekly rate limits", Gemini 3.8 Flash, and all product features, including scheduled tasks and the CLI. Only Pro and Ultra can buy extra credits ([Antigravity pricing], [Antigravity plans]).
- **Through Gemini Enterprise:** included with a paid Standard or Plus seat, with no separate Antigravity licence, but it needs an invoiced Cloud Billing account and the Gemini Enterprise User role ([Antigravity enterprise], [AI developer tools]). Seat credits are $10 (Standard) or $15 (Plus) per user per month, enforced as a weekly pool ([quotas]). Free trials exclude it ([licence FAQ]), and Business lacks AI developer tools altogether ([GE editions]).
- **Models:** Gemini 4 Argon needs AI Pro, AI Ultra, or Enterprise. Gemini 3.8 Flash is on every plan. Gemini 3.7 Flash, 3.6 Flash, and 3.1 Pro are Enterprise-only ([Antigravity models]).
- **Schedules:** `/schedule` runs a one-off or cron task, but schedules belong to the conversation that created them; standing jobs need sidecars or Automations ([Antigravity schedule]). **Inference:** keep the 24/7 part in a Gemini Enterprise workflow and use Antigravity to build and debug.

[Antigravity getting started]: https://antigravity.google/docs/getting-started
[Antigravity enterprise]: https://antigravity.google/docs/enterprise
[Antigravity plans]: https://antigravity.google/docs/plans
[Antigravity schedule]: https://antigravity.google/docs/commands/schedule
[AI developer tools]: https://docs.cloud.google.com/gemini/enterprise/docs/ai-developer-tools-overview

#### Antigravity MCP configuration

- **Where:** `~/.gemini/config/mcp_config.json` globally, `<workspace>/.agents/mcp_config.json` per workspace, or **Settings** → **Customizations** → **Installed MCP Servers** in the app ([Antigravity MCP]).
- **Shape:** a root `mcpServers` object. Each server has either `command` (stdio) or `serverUrl`, and remote servers must use Streamable HTTP. OAuth servers register `https://antigravity.google/oauth-callback` as a redirect URI. The MCP Store lists about 77 servers ([Antigravity MCP]).
- **What this does not do:** Antigravity's MCP config gives Antigravity's own coding agent tools. It doesn't add connectors to the Gemini Enterprise app ([Antigravity MCP]). **Inference:** in this hackathon Antigravity is the helper the presenter demoed: it generates Entra app-registration steps, MCP server code, or Cloud Run deploys, which the team then wires into Gemini Enterprise ([briefing]). Gemini Enterprise's own MCP and connector setup is in [Custom MCP servers](#custom-mcp-servers) and [Connector catalogue](#connector-catalogue).

[Antigravity MCP]: https://antigravity.google/docs/mcp

## Building agents and workflows

### Unattended automation

#### Triggers and schedules

| Trigger  | Applies to  | How it works                                                                                                 | Source                |
| -------- | ----------- | ------------------------------------------------------------------------------------------------------------ | --------------------- |
| Manual   | Workflows   | A user types `@` and the workflow name in chat, with optional input fields                                   | [workflows]           |
| Schedule | Workflows   | Minutes, hours, days, weeks, months, or a cron expression, with a time zone                                  | [workflows]           |
| Event    | Workflows   | Polls a connector for changes; 5–10 minutes' delay, ordering not guaranteed                                  | [event triggers]      |
| Schedule | Chat agents | Hourly to annually, with a fixed prompt; up to 5 minutes' delay                                              | [schedule chat agent] |
| API call | Registered  | Custom apps or scripts can call a registered agent through the StreamAssist API or its registry A2A endpoint | [agents overview]     |

- **Event trigger connectors:** Confluence, Gmail, Google Calendar, Google Drive, Jira Cloud, OneDrive, Outlook, ServiceNow, SharePoint, and Teams ([event triggers]). Gmail offers "When an email is sent" and "When an email is received"; to trigger on an email you send yourself, use the first ([event triggers]).
- **No webhook trigger** is documented for workflows. **Inference:** to start a workflow from an IoT pipeline, write into a polled connector, such as a new file in Drive, or call a registered ADK or A2A agent through the API instead.
- **Regions:** schedules work only in multi-region locations (global, `us`, `eu`) ([Workflow Builder limits]). The briefing's choice of global is fine.

[agents overview]: https://docs.cloud.google.com/gemini/enterprise/docs/agents-overview

#### What runs without anyone signed in

- **Status:** Workflow Builder, workflows, and chat agents are GA in Standard, Plus, and Pay-as-you-go. Frontline users can only run agents shared with them ([GE release notes], [Workflow Builder limits]). The editions table still labels no-code agents "(preview)" ([GE editions]); see [What a team can and cannot build](#what-a-team-can-and-cannot-build-with-gemini-enterprise).
- **Credentials:** "Scheduled agents execute using the author's delegated user credentials. Credentials expire every 14 days and must be manually refreshed" via **Refresh schedules** in the gallery or the agent's **Schedule** tab ([Workflow Builder limits], [schedule chat agent]).
- **Approval:** "Scheduled runs that perform actions affecting other individuals (such as sending emails or scheduling meetings) automatically pause for review and require user approval in chat history" ([Workflow Builder limits]). For chat agents, scheduling actions that involve other people "is not supported"; scheduled runs suit personal tasks such as emailing yourself ([schedule chat agent]).
- **Write-back:** for workflow agent nodes, "Adding or updating data through connectors requires human review" ([workflows]).
- **Failures:** event-triggered runs that fail with `RESOURCE_EXHAUSTED`, for example after a daily quota runs out, aren't retried, and failed sessions can't be retried by hand ([Workflow Builder known issues], [event triggers]).

**Inference:** a workflow can run on a timer or event for months, read connectors, reason, and write a summary or a draft without anyone signed in, as long as someone refreshes the credentials every 14 days. Actions that reach other people stop at **Needs Review**. The demo flow "send email automatically to the student who didn't submit" therefore pauses for a human click, so design the pitch around human approval rather than claim zero-touch. Whether an MCP step that writes to the team's own server also pauses is not documented.

#### Run history as evidence

- Each workflow's **Runs** tab lists simulations and triggered runs, with the trigger, status (**Running**, **Needs Review**, **Completed**, **Error**), start time, version, and a step-by-step trace. **Agents** → **Runs** lists runs for all workflows in the app ([workflow runs]).
- The Runs tab sometimes fails to load; refreshing is the documented workaround ([Workflow Builder known issues]).
- **Inference:** a reviewer a workflow is shared with sees their own runs, not the owner's ([share workflow]). To show "how it works day to day", capture the owner's Runs tab over several days in the video and README, or give reviewers a trigger they can fire themselves.

[workflow runs]: https://docs.cloud.google.com/gemini/enterprise/docs/workflow-builder/workflow-runs

### Full-code agents

- **Editions:** Standard, Plus, Pay-as-you-go, and Frontline (provisioned only) can use full-code agents built outside Gemini Enterprise; Business can't ([GE editions], [GE FAQ]).
- **ADK:** the agent must be hosted on Agent Runtime, formerly Vertex AI Agent Engine, and an admin with the Gemini Enterprise Admin role registers it with the app using a single Agents CLI command. Agent Runtime handles the queries and receives the user's email ([ADK registration]). ADK itself is described in [Google Cloud](/docs/research/google-cloud.md#agent-development-kit).
- **A2A:** agents hosted anywhere that speak A2A v0.3 streaming can be registered. The page is still labelled Preview, while the release notes declared A2A registration GA on 17 August 2026 ([A2A registration], [GE release notes]).
- **Cost:** Agent Runtime bills $0.085 per vCPU-hour and $0.009 per GiB-hour, with idle time between turns free, on a project with Cloud Billing ([Agent Platform pricing]). Registering an agent uses the same daily creation quota as building one ([Workflow Builder limits]).
- **Inference:** the presenter called ADK "very limited" for this hackathon ([briefing]). Treat a full-code agent as an add-on step inside a workflow, not the core.

[ADK registration]: https://docs.cloud.google.com/gemini/enterprise/docs/register-and-manage-an-adk-agent
[A2A registration]: https://docs.cloud.google.com/gemini/enterprise/docs/register-and-manage-an-a2a-agent
[Agent Platform pricing]: https://cloud.google.com/products/gemini-enterprise-agent-platform/pricing

## Data in and out

### Connector catalogue

In Gemini Enterprise a connector creates a _data store_, with one entity data store per entity type; for example, Jira Cloud yields separate stores for issues, attachments, comments, and worklogs ([connectors intro]). The briefing's "1P" means Google sources and "3P" means everything else, including MCP servers ([briefing]).

#### Google data sources

From the Google data sources page ([Google sources]):

- **Generally available:** BigQuery (ingestion mode), Cloud Storage import, Google Drive, Gmail, Google Calendar, Google Sites, people data, Cloud SQL, Spanner, and AlloyDB (ingestion mode), Firestore import, Bigtable import, and Terraform-created data stores.
- **Public preview:** federated query for BigQuery, Spanner, Cloud SQL, and AlloyDB; Google Chat; Compute Engine; Google Stitch; Google Groups; custom people data; Gemini Notebook Enterprise as a search source; and Knowledge Catalog with federated query connectors.
- **Website crawl:** not found as a data source in the current Gemini Enterprise lists or navigation. The editions table lists "Use Web Grounding" and "Use Ground with Google Search" as features instead ([GE editions]).
- **Google Sheets:** no separate connector; Sheets are reached through the Drive connector's Sheets actions (see [Actions and write-back](#actions-and-write-back)).

#### Third-party data sources

The third-party overview, updated 3 November 2026, sorts connectors by launch stage ([third-party sources]):

- **Generally available (19):** Box, Confluence Cloud, Confluence Data Center, Dropbox, GitHub, Google Calendar, Google Drive, Google Mail, HubSpot, Jira Cloud, Jira Data Center, Microsoft Entra ID, Microsoft Outlook, Microsoft Teams, Monday, OneDrive, ServiceNow, SharePoint, and Slack.
- **Public preview (about 120):** includes Salesforce, Supabase, Custom MCP Server, Globalping, Grafana, PagerDuty, Linear, Notion, Airtable, Asana, Zendesk, Zapier, Dynamics 365, Oracle NetSuite, GitLab, and Hugging Face.
- **Salesforce is GA, not preview** (checked 5 November 2026): the release notes made federated Salesforce, with its create, update, and delete actions, GA on 3 November 2026, but the overview still lists it under public preview ([GE release notes], [third-party sources]). Google's own pages disagree here.
- **Private preview:** Confluence and Jira Data Center on-premises with data ingestion, by allowlist only.
- **SAP:** no SAP connector appears in any list or in the navigation; SAP would need a custom MCP server or custom connector.

#### Edition and account limits

- The Business edition gets only "select, segment-relevant connectors"; Standard, Plus, Pay-as-you-go, and Frontline get "the full data connector ecosystem" ([GE editions]). The briefing's setup ran in the Google Cloud console ([BRIEF](/docs/BRIEF.md#tools)), which Business doesn't offer. **Inference:** the sponsored licence is Standard, Plus, or Pay-as-you-go, so the full catalogue should be available.
- Drive, Gmail, Calendar, and Chat "require a Google Workspace organization account and a Customer ID. Personal Google Accounts (consumer accounts ending in `@gmail.com`) ... aren't supported for data connectors" ([Google sources]). A consumer account searching gets `403 Consumer accounts aren't supported for Google Workspace data stores` ([Drive setup]). This contradicts the briefing; see [Corrections to the briefing](#corrections-to-the-briefing).
- **Design consequence** (checked 5 November 2026 against [Drive setup]): a team-controlled supported domain and tenant permissions are a build gate. An APU address alone does not establish Google Workspace access, because APU uses Microsoft 365 for mail and files ([context](/docs/CONTEXT.md#apus-own-documents-and-systems)).
- In federated mode the Drive connector "only searches documents that are owned by the domain of the user who performs the search" ([Drive setup]).
- Most third-party connectors support only the `global`, `us`, and `eu` locations ([GitHub connector], [Supabase connector]).

### Federated search versus ingestion

"Data federation directly retrieves information from the specified data source", with nothing copied into the index; "Data ingestion (indexing) copies data into the Gemini Enterprise index", which can improve search quality but costs storage and time ([connectors intro]). With federation, the query string, which may contain conversation history, goes to the third-party system under that system's terms.

| Mode                                               | Where data lives | Freshness                                                                       | Source                                |
| -------------------------------------------------- | ---------------- | ------------------------------------------------------------------------------- | ------------------------------------- |
| Federated search (Drive, Jira, ServiceNow, others) | Source system    | At query time; ServiceNow's page says "in real-time"                            | [connectors intro], [ServiceNow page] |
| Third-party ingestion                              | Index            | Incremental sync every 3 h at best (default 3 h); full sync every 3 h to 7 days | [connectors intro]                    |
| Cloud Storage periodic ingestion (preview)         | Index            | Every 1, 3, or 5 days; first sync about an hour after creation                  | [Cloud Storage import]                |
| BigQuery ingestion                                 | Index            | One-time or periodic; "Data must be refreshed to reflect changes"               | [BigQuery connector]                  |
| BigQuery federated query (preview)                 | BigQuery         | At query time, through the BigQuery MCP server                                  | [BigQuery connector]                  |
| Firestore import                                   | Index            | One-time import, refreshed with `FULL` or `INCREMENTAL` reconciliation          | [Firestore import]                    |
| Actions and custom MCP tools                       | Source system    | At call time                                                                    | [custom MCP]                          |

- Incremental syncs don't capture deletions or identity data, and must run more often than full syncs ([connectors intro]).
- **Inference:** ingestion keeps answering from the last synced copy when the source changes or fails, which is the "cached copy" the repo rule forbids for live readings ([project conventions](/docs/references/project-conventions.md)). Live sensor or feed values should reach the agent only through federated search, actions, or MCP tools, where a failed source fails the query instead of serving old data.
- The admin docs have pages titled "View data store sync activity and set up alerts" and "Access connector error logs" (navigation of [connectors intro]); they weren't read.

[Cloud Storage import]: https://docs.cloud.google.com/gemini/enterprise/docs/connectors/connect-cloud-storage
[Firestore import]: https://docs.cloud.google.com/gemini/enterprise/docs/connectors/connect-firestore

### Actions and write-back

Actions are added during data store creation or later under **Data Stores** → store → **Actions** → **Enable actions**. Federated stores need only the selection; ingestion stores need their own sign-in under **Authentication settings** ([manage actions]). Microsoft stores also take a tenant ID under **View/Edit parameters**. Several connector pages recommend attaching "only one data store with actions belonging to a single connector type" per app ([GitHub connector]).

Write actions that suit an IoT workflow, from the Google and third-party action lists ([Google sources], [third-party sources]):

- **Gmail:** Send message, Reply, Forward, Create draft, labels and filters.
- **Google Calendar:** Create, Update, and Delete event; Suggest time.
- **Google Drive and Sheets:** Create and Update file, Share file; since 12 October 2026, Get cell values, Update cell values, Update formulas, and Insert dimension on Sheets; since 30 October 2026, Update document and Update presentation. The Drive connector page also lists Get spreadsheet (checked 5 November 2026, [Drive connector]).
- **Google Chat (preview):** Send message, Create conversation.
- **Jira Cloud (GA):** Create issue, Update issue, Change issue status, Create comment, Assign issue, Link issues, Create worklog, Upload attachment.
- **ServiceNow (GA):** Create incident and Update incident only. Actions need the OAuth Authorization Code flow; ingestion-only uses username and password (ROPC) ([ServiceNow page]).
- **Slack (GA):** Send, Schedule, and draft Slack messages; Create Slack canvas.
- **Microsoft Outlook (GA):** Send mail, Create and Update event, Create contact, Create Word and PowerPoint documents. **SharePoint (GA):** Create and Update list item, Add page, Upload document. **Teams (GA):** Send channel or chat message.
- **GitHub (GA):** Write issue, Add issue comment, Create or update file, Push files, Trigger Actions workflow, Merge pull request, and 16 more; it needs a GitHub App you create ([GitHub connector]).
- **Salesforce (GA since 3 November 2026, actions launched 26 October 2026):** Create, Update, and Delete Sobject Record, plus related-record variants. It runs on Salesforce's **SObject All** hosted MCP server, set up through an AppExchange package with Google-managed OAuth ([Salesforce connector], [GE release notes]).
- **Supabase (preview):** Execute SQL, Apply migration, Deploy edge function, Pause and Restore project ([Supabase connector]).
- **PagerDuty (preview):** Create, Update, and Add note to incident.

For custom MCP tools, "all calls to any action require confirmation from the user" unless the tool declares `readOnlyHint` ([custom MCP]). For workflow agent nodes, connector writes require human review; see [What runs without anyone signed in](#what-runs-without-anyone-signed-in). Not verified: whether prebuilt write actions also ask for confirmation, and how that behaves in unattended scheduled workflows.

### Custom MCP servers

#### Requirements and registration

The Custom MCP Server data store is in public preview ([third-party sources]). Its setup page ([custom MCP]) says:

- **Transport:** "The older `SSE` transport isn't supported. The connector exclusively supports the newer `StreamableHTTP` transport."
- **Public HTTPS:** the URL "must be an HTTPS URL" with "a TLS certificate signed by a publicly trusted Certificate Authority". Private servers inside a VPC need Agent Gateway, supported in `us-central1` and `europe-west1`.
- **Auth:** either **OAuth 2.0** (MCP server URL, authorization URL, token URL, client ID, client secret, scopes, optional PKCE; redirect URL `https://vertexaisearch.cloud.google.com/oauth-redirect`) or **No authentication**. No API-key or static-header option is listed.
- **Cloud Run:** for a default `.run.app` URL, Gemini Enterprise sends a Google-signed ID token in `X-Serverless-Authorization`; grant `roles/run.invoker` to `service-PROJECT_NUMBER@gcp-sa-discoveryengine.iam.gserviceaccount.com`. Custom domains don't get the token.
- **Limits:** up to 100 enabled actions at a time; the store must be created inside an app under **Connected Data Stores**, not linked later; one egress Agent Gateway per app.
- **Steps:** app → **Connected Data Stores** → **New data store** → **Custom MCP Server** → **Add MCP server** → auth → location and name → **Create**. All tools arrive turned off; enable them under **Actions** → **Reload custom actions**, which calls `tools/list`.
- **Org policy:** "By default, Gemini Enterprise blocks the creation of Model Context Protocol (MCP) data stores using a managed organization policy constraint." Unblocking it needs the Organization Policy Administrator role (`roles/orgpolicy.policyAdmin`) ([MCP org policy]). The server, authorization, and token domains may also need allowlisting as egress FQDNs.
- **Inference:** a team working inside a project that NTT DATA or Google provisioned may lack org-policy rights, so ask the organisers early whether custom MCP is unblocked.

#### Google-managed remote MCP servers

- Google lists remote MCP endpoints for, among others, BigQuery (`https://bigquery.googleapis.com/mcp`), Firestore, Pub/Sub, Cloud Storage, Cloud SQL, Cloud Logging, Cloud Monitoring, and Cloud Run, plus Maps Grounding Lite (`https://mapstools.googleapis.com/mcp`). Gmail, Calendar, Drive, Sheets, Docs, and Chat MCP servers are in Developer Preview ([Google MCP servers]).
- The BigQuery MCP server uses OAuth 2.0 with IAM, needs `roles/mcp.toolUser`, and works without billing: "If you don't want to enable billing or provide a credit card, the steps in this document still work" in the BigQuery sandbox ([BigQuery MCP]).
- Gemini Enterprise's BigQuery connector in federated mode "uses the BigQuery MCP server" ([BigQuery connector]), so that is the documented pairing. The BigQuery MCP and client-configuration pages name Claude, Gemini CLI, and Antigravity as clients but not Gemini Enterprise.
- The custom MCP page's parameter example, "to get a refresh token from a Google MCP server, enter `&access_type=offline&prompt=consent`" ([custom MCP]), implies Google MCP servers can be registered as custom MCP stores. **Inference:** Firestore, Pub/Sub, or Maps Grounding Lite could reach an agent this way, but no page walks through it.

[Google MCP servers]: https://docs.cloud.google.com/mcp/supported-products
[BigQuery MCP]: https://docs.cloud.google.com/bigquery/docs/use-bigquery-mcp

#### Third-party remote MCP servers

- **GitHub:** the remote server is at `https://api.githubcopilot.com/mcp/`, using OAuth or a personal access token in an `Authorization` header. "Each MCP host application needs to configure a GitHub App or OAuth App to support remote access via OAuth." The installation guides cover 14 hosts, including Antigravity and Gemini CLI, but not Gemini Enterprise ([GitHub MCP server]). **Inference:** Gemini Enterprise's own GitHub connector (GA) is the simpler route; a token-only setup can't be entered, because custom MCP offers only OAuth or no auth.
- **Supabase:** the remote server is at `https://mcp.supabase.com/mcp` with browser OAuth sign-in. Supabase warns about prompt injection and advises read-only mode, project scoping, and restricted feature groups before connecting production data ([Supabase MCP]). Gemini Enterprise's native Supabase connector uses Google-managed OAuth ([Supabase setup]), so no custom MCP is needed.
- **Atlassian:** the Rovo MCP server is at `https://mcp.atlassian.com/v2/mcp` with OAuth 2.1 or an API token; its supported-client list includes Gemini CLI but not Gemini Enterprise ([Atlassian MCP]). For Gemini Enterprise, Atlassian recommends the **Atlassian Rovo Agent** on Google Cloud Marketplace over Agent2Agent (A2A), not MCP ([Rovo to Gemini]). Gemini Enterprise also has native Jira Cloud and Confluence Cloud connectors (GA).
- **Salesforce:** Gemini Enterprise's Salesforce connector already wraps Salesforce's hosted SObject All MCP server ([Salesforce connector]).

[GitHub MCP server]: https://github.com/github/github-mcp-server
[Atlassian MCP]: https://support.atlassian.com/atlassian-rovo-mcp-server/docs/getting-started-with-the-atlassian-remote-mcp-server/
[Rovo to Gemini]: https://support.atlassian.com/atlassian-ai-gateway/docs/connect-rovo-to-gemini-via-google-cloud-marketplace/

### Custom connectors through the API

- A custom connector is code you write: fetch from the source API, transform each record into a Discovery Engine `Document` (`json_data` plus `acl_info`), then upload. Prerequisites start with "Check whether billing is enabled on your Google Cloud project" ([custom connector]).
- **Inline upload** uses incremental reconciliation (adds and updates, no deletions) and suits "frequent, small changes"; the other route stages files in Cloud Storage and imports with full reconciliation ([custom connector]).
- Structured stores can also be refreshed from BigQuery or Cloud Storage with `documents:import` ([refresh data]).
- **Inference:** a custom connector is still ingestion, so its freshness depends on how often your own job pushes, and it needs billing plus a scheduler. For live readings a custom MCP server or a federated connector is simpler and avoids stale copies.

[custom connector]: https://docs.cloud.google.com/gemini/enterprise/docs/connectors/create-custom-connector
[refresh data]: https://docs.cloud.google.com/gemini/enterprise/docs/refresh-data

### Live-data architectures

Every path below assumes the Gemini Enterprise licence comes from the sponsor, so "card" refers only to the data side. Device options and protocols are in [IoT and network](/docs/research/iot-and-network.md), feeds in [data sources](/docs/research/data-sources.md), and Google free tiers in [Google Cloud](/docs/research/google-cloud.md#paths-that-need-no-payment-card).

#### Free-tier limits that matter

- **Apps Script, consumer account:** triggers total runtime 90 min a day, 20,000 URL Fetch calls a day, 6 min per execution, 30 simultaneous executions per user, 20 triggers per user per script. Workspace accounts get 6 h of trigger runtime and 100,000 URL fetches. Quotas reset 24 hours after the first request, and exceeding one throws an exception ([Apps Script quotas]).
- **Apps Script time triggers:** `everyMinutes(n)`, where "`n` must be 1, 5, 10, 15 or 30" ([ClockTriggerBuilder]).
- **Apps Script web apps:** a script with `doGet(e)` or `doPost(e)` can be deployed as a web app that runs as the owner or as the visiting user ([Apps Script web apps]).
- **Supabase Free:** 500 MB database, 5 GB egress, 200 concurrent Realtime connections, 500,000 Edge Function invocations, 2 active projects; "Free projects are paused after 1 week of inactivity" ([Supabase pricing]).
- **Cloud Run, Pub/Sub, BigQuery sandbox:** Cloud Run and Pub/Sub need a billing account, and the sandbox doesn't support streaming or DML; see [Google Cloud](/docs/research/google-cloud.md#bigquery).

[ClockTriggerBuilder]: https://developers.google.com/apps-script/reference/script/clock-trigger-builder
[Apps Script web apps]: https://developers.google.com/apps-script/guides/web

#### Phone or board to Google Sheets

- **Path:** a phone page or board POSTs each reading over HTTPS to an Apps Script web app; `doPost` appends a row to a Sheet; the agent reads it through the Drive connector (federated) or the Sheets **Get cell values** action, and can write results back with **Update cell values**.
- **Card:** none.
- **Freshness:** **Inference:** seconds, because the row exists once `doPost` returns and federated search and actions read at query time.
- **Current state** (checked 5 November 2026): the Drive setup page describes direct retrieval rather than indexing ([Drive setup]). **Design consequence:** query the exact session range with **Get cell values** or **Get spreadsheet**; a search result or an uploaded knowledge file is insufficient evidence of current state.
- **Network visible:** **Inference:** store the device timestamp and the server receipt time (`new Date()` in `doPost`) in separate columns, so each row carries its own latency.
- **Failure:** **Inference:** a silent device just stops adding rows, so instruct the agent to compare the newest timestamp with the current time and report "no reading for N minutes" rather than presenting the last value as current.
- **Blocker:** the Sheet must be in Drive owned by the same Workspace domain as the searching user, and consumer `@gmail.com` accounts can't use the Drive connector ([Drive setup]). **Inference:** run the script under the licensed account so the Sheet sits in that domain.

#### Public feed polled into Sheets

- **Path:** an Apps Script time trigger calls a public feed with `UrlFetchApp` every 1–30 minutes and appends a row; the agent reads it as above.
- **Card:** none.
- **Freshness:** the trigger interval plus the feed's own update cycle.
- **Budget:** polling every minute is 1,440 calls a day, inside the 20,000 URL Fetch quota, but the 90 minutes of trigger runtime only allows about 3.75 seconds per run (the researcher's arithmetic) on a consumer account ([Apps Script quotas]).
- **Failure:** **Inference:** on a non-2xx response or exception, write an error row with the time, HTTP status, and message instead of skipping it, so the agent reports the outage and never reuses an earlier value. Recording each call's status and response time also shows the network leg.

#### Device to Supabase

- **Path:** the device or phone inserts rows into a Supabase Postgres table over HTTPS; Gemini Enterprise's Supabase connector (preview) searches it at query time, and the **Execute SQL** action runs live queries or writes events back ([Supabase connector], [Supabase setup]).
- **Card:** none on the Free plan ([Supabase pricing]); whether sign-up asks for a card wasn't checked.
- **Freshness:** at query time.
- **Network visible:** **Inference:** a SQL query over device and server timestamps gives per-reading latency and gaps.
- **Failure:** **Inference:** a paused or unreachable project fails the query, so the agent sees an error, not cached rows. A continuous feed should also prevent the one-week inactivity pause.
- **Risk:** Execute SQL is raw SQL, so heed Supabase's prompt-injection guidance ([Supabase MCP]). This path doesn't depend on Workspace accounts.

#### Device to Pub/Sub and BigQuery

- **Path:** the device publishes to Pub/Sub; a BigQuery subscription writes each message "as they are received"; Gemini Enterprise's BigQuery connector in federated query mode (preview) queries the table live ([BigQuery connector], [IoT and network](/docs/research/iot-and-network.md#from-pubsub-to-storage-and-gemini)).
- **Card:** yes, for Pub/Sub and streaming. Without a card, the BigQuery sandbox allows only batch loads, and its tables expire after 60 days.
- **Freshness:** **Inference:** seconds with federated query. Ingestion mode would serve an index copy and should be avoided for live readings.
- **Network visible:** device timestamp against Pub/Sub `publishTime`.
- **Failure:** no new rows; apply the same staleness check in SQL.
- The connector's federated mode takes an optional **Billing Project ID** for query costs ([BigQuery connector]). Not verified: whether a sandbox project without billing works there.

#### MCP server that queries public feeds on demand

- **Path:** a Cloud Run service exposes StreamableHTTP MCP tools that call public feeds (air quality, river level, GTFS-realtime) when the agent asks, registered as a custom MCP data store ([custom MCP]).
- **Card:** yes, for Cloud Run. **Inference:** any host with a publicly trusted TLS certificate also qualifies, but none was verified for StreamableHTTP.
- **Freshness:** at call time, bounded by the feed's own update cycle.
- **Network visible:** a tool can return the upstream status code and round-trip time with every answer.
- **Failure:** the tool returns the upstream error to the agent. This is the cleanest fit for the "show the error" rule.
- **Blockers:** the custom MCP org-policy constraint, 100 actions, and preview status ([MCP org policy]). Use the `.run.app` URL so Gemini Enterprise attaches its ID token.

#### Network measurements through Globalping

- Globalping (preview) is a federated third-party connector that "lets you search your Globalping measurements". It uses Google-managed OAuth with your Globalping account, its entity is **Measurements**, and only read-only actions are listed ([Globalping connector]).
- **Inference:** real ping, traceroute, or HTTP measurements from public probes would give the "Network" part of the theme a native 3P connector with real data, for example by measuring the path to the team's own ingest endpoint. Globalping's own limits and free plan weren't checked.

[Globalping connector]: https://docs.cloud.google.com/gemini/enterprise/docs/connectors/globalping

#### Comparison of live-data paths

| Path                          | Card | Freshness to agent  | Connector, stage                  | Main blocker                          |
| ----------------------------- | ---- | ------------------- | --------------------------------- | ------------------------------------- |
| Device → Apps Script → Sheets | No   | Seconds (inference) | Drive, GA (Sheets actions)        | Needs a Workspace account and domain  |
| Apps Script poll → Sheets     | No   | 1–30 min trigger    | Drive, GA                         | 90 min/day trigger runtime (consumer) |
| Device → Supabase             | No   | Query time          | Supabase, preview                 | Preview; raw SQL action               |
| Device → Pub/Sub → BigQuery   | Yes  | Seconds (inference) | BigQuery federated query, preview | Billing                               |
| Cloud Run MCP → public feeds  | Yes  | Call time           | Custom MCP, preview               | Org policy constraint                 |
| Globalping measurements       | No   | Query time          | Globalping, preview               | Free limits unverified                |

### Free sandboxes

Only official developer programmes. Under the rule, a sandbox may hold records the system itself creates from real readings or events; any pre-loaded demo records must be deleted first or left unused.

| Programme                                        | Cost and limits                                                                                                                                         | Gemini Enterprise connector                        | Real data it could hold                                        |
| ------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------- | -------------------------------------------------------------- |
| Jira Cloud Free ([Jira pricing])                 | "Free forever for 10 users", 2 GB storage                                                                                                               | Jira Cloud, GA, federated or ingestion, 15 actions | Issues the agent files when a real reading crosses a threshold |
| Salesforce Developer Edition ([Salesforce DE])   | Free and "doesn't expire as long as you log in regularly"; hosted MCP servers included since April 2026                                                 | Salesforce, GA, via SObject All MCP                | Cases or custom-object records created from real events        |
| ServiceNow PDI ([ServiceNow PDI])                | Free; reclaimed "After a 10-day period of inactivity on the Developer Site"; hibernates when idle                                                       | ServiceNow, GA, Create and Update incident         | Incidents raised from real alerts                              |
| SAP BTP trial                                    | Not verified                                                                                                                                            | None listed; custom MCP or ADK only                | Not assessed                                                   |
| Microsoft 365 Developer Program ([M365 dev FAQ]) | E5 sandbox with 25 licences, only for Visual Studio Professional or Enterprise subscribers, eligible partners, and Premier or Unified Support customers | SharePoint, OneDrive, Outlook, Teams, all GA       | Ships with "pre-installed sample data", which the rule bars    |
| GitHub                                           | Free plan not re-checked                                                                                                                                | GitHub, GA, 22 write actions                       | The team's own repo: issues, commits, Actions runs             |

- **Inference:** students without a Visual Studio subscription won't qualify for the Microsoft 365 sandbox, so SharePoint and Outlook would need a tenant that someone already licenses. Connecting one also needs an Entra app registration with tenant ID, client ID, and secret, as the briefing demo showed ([briefing]).
- ServiceNow hibernation means a federated query may fail until someone wakes the instance (**Inference**); keep the PDI awake during judging.

[Jira pricing]: https://www.atlassian.com/software/jira/pricing
[Salesforce DE]: https://developer.salesforce.com/blogs/2026/04/new-developer-edition-agentforce-vibes-claude-mcp
[ServiceNow PDI]: https://developer.servicenow.com/print_page.do?release=australia&category=developer-program&identifier=accessing-your-pdi&module=guide
[M365 dev FAQ]: https://learn.microsoft.com/en-us/office/developer-program/microsoft-365-developer-program-faq

### Kaggle and GitHub

- **GitHub:** see [Third-party remote MCP servers](#third-party-remote-mcp-servers). The presenter's idea of watching new repositories and notifying users ([briefing]) maps to the GA GitHub connector's read-only search actions plus Gmail or Slack send actions.
- **Kaggle MCP:** Kaggle runs an official remote server at `https://www.kaggle.com/mcp`, with OAuth 2.0 or, for clients without OAuth, a token starting `KGAT`; its tools cover datasets, competitions, notebooks, models, and benchmarks ([Kaggle MCP]). Kaggle's docs don't mention Gemini Enterprise. Not verified: whether its OAuth can be registered with the static client ID and secret that Gemini Enterprise's custom MCP form requires.
- **Kaggle licences:** Kaggle's terms say content on the site is "protected by copyright", users "promise to abide by all copyright notices", and competition data is governed by each competition's rules ([Kaggle terms]). **Inference:** check each dataset's own licence and provenance before replaying it, and reject any whose card says the readings are synthetic or generated, since the rule allows only real datasets replayed and labelled as a replay ([IoT and network](/docs/research/iot-and-network.md#real-versus-simulated-data)).
- The presenter's "three months once Kaggle might be updating" ([briefing]) depends on each dataset's uploader; not verified.

[Kaggle MCP]: https://www.kaggle.com/docs/mcp
[Kaggle terms]: https://www.kaggle.com/terms

## Reviewer access

### What each reviewer needs

1.  **A licence:** "To sign in to the Gemini Enterprise app, a user must have a license", assigned by email or automatically on first sign-in ([licences]). So each reviewer uses a seat.
1.  **An IAM role:** Gemini Enterprise User (`roles/discoveryengine.agentspaceUser`) on the project. For one app only, grant Gemini Enterprise Restricted User on the project and Gemini Enterprise User on the app ([access control]).
1.  **An identity:** Google Identity is recommended and is required for Google Workspace data sources. Workforce Identity Federation is for third-party providers such as Entra ID or Okta, and Microsoft 365 data ingestion requires Entra ID with WIF ([identity provider]). **Inference:** with Google Identity, reviewers sign in with an ordinary Google account email.
1.  **The agent shared with them:** the owner shares by email, if the admin turned on **Enable agent sharing**, or an admin shares it from the console ([share workflow], [share agents console]).

- **Outside reviewers:** the docs describe sharing only with users "within your organization" and don't cover guest users ([share workflow]). Organisations created on or after 3 May 2024 enforce `iam.allowedPolicyMemberDomains` by default, which limits IAM grants to the organisation's own domain ([secure by default]). **Inference:** if the project sits under an APU organisation, adding `@nttdata.com` reviewers may need an org-policy exception; a project with no organisation doesn't have this constraint.

[identity provider]: https://docs.cloud.google.com/gemini/enterprise/docs/configure-identity-provider
[secure by default]: https://docs.cloud.google.com/resource-manager/docs/secure-by-default-organizations

### The app URL

- Copy it from the console under the app's **Integration** page, where **Enable the Web App** must be on; the docs say to share that URL with users ([quickstart]).
- It looks like `https://vertexaisearch.cloud.google.com/home/cid/<id>` ([configure Chrome]). Copy it rather than building it from the app ID. The app name customisation shown at the briefing is branding, not a hosting URL ([briefing]).
- **Inference:** the URL is not a public demo link. Anyone without a licence and role is refused, so the submission's demo link should be a video or a page that explains how to request access.

[quickstart]: https://docs.cloud.google.com/gemini/enterprise/docs/quickstart-gemini-enterprise
[configure Chrome]: https://docs.cloud.google.com/gemini/enterprise/docs/configure-chrome

### What to ask reviewers for

**Inference** from the requirements above:

- The exact Google account email each reviewer will sign in with, in lowercase.
- Whether that account belongs to a Google Workspace or Cloud Identity organisation.
- Who assigns their seats: the team, the organisers, or NTT DATA, and from which subscription.
- When they plan to review (11–14 November), so the team can refresh schedule credentials beforehand.
- Whether they want to fire a trigger themselves, for example by emailing a test inbox or dropping a file in a shared folder.

## Limits that bite in a one-week build

From [Workflow Builder limits] and [quotas] unless noted:

| Limit                      | Standard                            | Plus                    |
| -------------------------- | ----------------------------------- | ----------------------- |
| Agent creations and drafts | 1 per user per day, pooled          | 10 per user per day     |
| Assistant queries          | 160 per user per day, pooled        | 200 per user per day    |
| Deep Research              | 3 per user per day                  | 10 per user per day     |
| Images and videos          | 5 images, 2 videos per user per day | 10 images, 3 videos     |
| Storage and indexing       | 30 GiB per user, pooled             | 75 GiB per user, pooled |

- **Quota resets:** daily pools reset at midnight Pacific time, which is 4:00 PM MYT. On a free trial, nothing runs past the pool, because trials can't use pay-as-you-go ([quotas]). **Inference:** on Standard, a five-member team gets five agent creations a day, so draft in natural language once and edit rather than regenerate.
- **Per agent:** 100 nodes per flow; one level of sub-agents, run one at a time; 20 skills per node; 100 knowledge files of up to 20 MB each, 800,000 tokens combined; 100 connectors and 100 MCP servers.
- **Per app and project:** 100 data stores per app, raisable to 500; 500 apps and 500 data stores per project. The project and location are fixed once an app exists ([known limitations]).
- **Sharing:** 1,500 individual accounts per agent.
- **Event triggers:** poll with a 5–10 minute delay ([event triggers]). Connector list actions fetch 20 items per page and may miss items in very large sets ([Workflow Builder known issues]).
- **Open known issues:** natural language can't add approval steps, event triggers, or data filters, so add them in the UI. Generated workflows sometimes can't run. Connectors may not appear until a hard reload. Runs can time out under heavy load ([Workflow Builder known issues]).

[known limitations]: https://docs.cloud.google.com/gemini/enterprise/docs/known-limitations

### Platform constraints and design consequences

Primary-source checks of proposed mechanisms, made on 3 November 2026 for the [Astra shortlist](/docs/ideas/astra/01/00-ranking.md) and re-checked on 5 November 2026 MYT for ideas built on the team's phones and Raspberry Pi. They establish documented capabilities, not successful access to the team's hackathon tenant, tested product demand, or evidence that APU has adopted any of them, and no prototype was built. The event requirements remain those in the [brief](/docs/BRIEF.md) and [context](/docs/CONTEXT.md).

- **F1, workflows and review:** workflows support triggers, branches, connector reads and writes, and human review, and connector mutations require review ([workflows]). **Design consequence:** the unit of value must include an approved action; pending drafts are not completed work. Detect and draft unattended, show the owner's approval and the completed write separately, and don't promise an autonomous message, booking, or ticket (5 November re-check).
- **F2, unattended runs:** credential expiry and trigger latency constrain unattended runs: 14-day delegated credentials and 5–10-minute connector-event polling ([Workflow Builder limits], [Triggers and schedules](#triggers-and-schedules)). **Design consequence:** no instant dispatch or emergency-response promise. Immediate device locks and warnings belong in deterministic device or client code; Gemini performs asynchronous reconciliation, explanation, and next-action preparation (5 November re-check). Refresh credentials before the 11–14 November assessment, inspect actual runs, measure actual latency, and size the cadence to the licensed quota. Documentation is not evidence the licence was granted.
- **F3, quotas:** Standard contributes 160 assistant queries per seat a day and one agent creation a day; workflow usage depends on the underlying actions ([quotas]). **Design consequence:** one run is not necessarily one query. Build one reusable workflow, measure actual consumption, and batch readings.
- **F4, connectors and actions:** account compatibility, action availability, and live versus indexed access are distinct concerns, and Workspace connectors need supported organisation accounts ([Google sources], [manage actions], [Connector catalogue](#connector-catalogue)). **Design consequence:** prove one live Sheet read and one reviewed Jira create before committing to the architecture. Don't assume Jira transitions or comments are exposed just because its API supports them. **Flag:** the third-party action list in [Actions and write-back](#actions-and-write-back) does name Change issue status and Create comment for Jira Cloud; this check still treats them as unproven until they work in the app. The 5 November re-check found the [Jira connector] page describes real-time federated search and issue and comment actions: use a team-owned Jira project only where a corrective task has an owner and lifecycle, with no institutional helpdesk dependency. Because GitHub isn't on the workflow connector list ([Workflows](#workflows)), carry a real revision identifier in the device reading and leave direct GitHub integration out of the critical path.
- **F5, public vehicle positions:** public vehicle positions are available from the [Malaysia GTFS Realtime documentation](https://developer.data.gov.my/realtime-api/gtfs-realtime), and the repository's [local feed inspection](/docs/research/data-sources.md#routes-and-stops-near-apu-gtfs-static) matched T580 near APU. This is a public feeder, not the APU shuttle fleet. **Design consequence:** verify relevant vehicle coverage afresh. Missing positions mean unavailable telemetry, not a cancelled bus. Positions don't establish load or boarding.

## Takeaways for this hackathon

- **Best no-card path:** phones or boards → Apps Script web app → a Sheet in the licensed Workspace domain, read live through the GA Drive connector and Sheets actions, with an Apps Script time trigger polling a public feed into the same Sheet. If the licensed accounts turn out to be consumer Gmail, use Supabase Free with the Supabase connector instead.
- **Best with-card path:** device → Pub/Sub → BigQuery subscription → BigQuery connector in federated query mode (preview), plus a Cloud Run custom MCP server that fetches public feeds on demand and returns their errors. A chat agent or the assistant can query BigQuery through the connector, but a workflow can't, since BigQuery isn't on the workflow connector list (both checked 5 November 2026).
- **Strongest connectors for the technical score (inference from the presenter's emphasis on 1P and 3P):** 1P Drive and Sheets (read and write), Gmail send, and Calendar create event; 3P GA Jira Cloud create issue, ServiceNow create incident, Slack send message, and GitHub write issue or trigger workflow from an agent or the assistant only, since GitHub isn't on Workflow Builder's connector list (checked 5 November 2026). Salesforce (GA since 3 November 2026) and the preview Supabase and Globalping connectors are extras, and a custom MCP server is the add-on.
- **Avoid ingestion for live values:** index copies lag by at least 3 hours for third-party syncs and 1 day for Cloud Storage, and they keep serving old data when a source fails.
- **Ask the organisers now:** which account type the licences use (Workspace or consumer), whether the custom MCP org-policy constraint is off, and whether teams hold Discovery Engine Editor or Admin on their project.

## Not verified

- The sponsored licences' account type, edition, and IAM roles, and whether they are a free-trial subscription, and so lack Antigravity and pay-as-you-go, or a paid one.
- Whether the 14-day credential expiry and the approval pause, both documented for scheduled chat agents, apply the same way to scheduled and event-triggered workflows. The limits page states them for "automated agent schedules" in general ([Workflow Builder limits]).
- Whether MCP steps or a team-owned MCP tool can write without human review.
- Whether prebuilt write actions ask for confirmation, and how that interacts with unattended workflows.
- Whether a consumer `@gmail.com` account can hold a Gemini Enterprise licence and open the web app. The docs only rule it out for Workspace data stores ([Gmail data store]).
- Whether a personal `@gmail.com` address is accepted for the Business trial. The help centre says non-Microsoft identities sign in with a one-time password sent by email ([GE choose edition]).
- Whether people outside the project's organisation can be shared an agent, given the "within your organization" wording.
- The Standard and Plus trial length outside the marketing FAQ, and whether it needs a card. No docs page states either.
- Whether a shared user can see the owner's run history.
- Business edition's exact connector subset.
- Supabase sign-up card requirement, the device-side Supabase write API, and what Supabase counts as "inactivity".
- BigQuery federated query from a project without billing.
- SAP BTP trial terms; GitHub Free plan details; Globalping free limits; whether Salesforce Developer Edition or ServiceNow PDIs ship with demo records.
- The presenter's claim that SharePoint "comes for free" with a Microsoft account.
- Kaggle MCP registration in Gemini Enterprise; any free StreamableHTTP host other than Cloud Run.
- The "Access connector error logs" and sync-alert pages, which weren't read.
- **Untested gates** (as of 5 November 2026): no live Gemini Enterprise tenant, supported Workspace account, connector authorisation, reviewer licence, organisation-policy exception, device or browser compatibility, participant interview, cost measurement, or unattended run had been tested. Treat each as a build gate. No APU operational data or staff access is assumed.
- Remote participation in the 17 November physical final: no confirmation was found in the [brief](/docs/BRIEF.md), which remains a participation risk for every idea.

## See also

- [Google Cloud](/docs/research/google-cloud.md): the Gemini API, Agent Platform, free tiers, billing, and the no-card paths.
- [IoT and network](/docs/research/iot-and-network.md): devices, protocols, and the real-versus-simulated ruling.
- [Data sources](/docs/research/data-sources.md): live public feeds near APU.
- [Judging](/docs/research/judging.md): rubrics and packaging.
- [Winners](/docs/research/winners.md): what has won before.
- [Competition](/docs/research/competition.md): existing substitutes checked alongside the platform constraints.
- [Hackathon brief](/docs/BRIEF.md): tools and judging as stated at the briefing.
- [Briefing transcript][briefing], with the connector and Antigravity demos, and [briefing slides](/docs/sources/briefing-session/slides.md).
- [Project conventions](/docs/references/project-conventions.md): the real-data rule.

[briefing]: /docs/sources/briefing-session/transcript.md
[GE release notes]: https://docs.cloud.google.com/gemini/enterprise/docs/release-notes
[GE editions]: https://docs.cloud.google.com/gemini/enterprise/docs/editions
[GE FAQ]: https://cloud.google.com/gemini-enterprise/faq
[GE product page]: https://cloud.google.com/gemini-enterprise
[GE choose edition]: https://support.google.com/g/answer/16547364?hl=en
[Gmail data store]: https://docs.cloud.google.com/gemini/enterprise/docs/connectors/gmail/set-up-data-store
[workflows]: https://docs.cloud.google.com/gemini/enterprise/docs/workflow-builder/workflows
[web app features]: https://docs.cloud.google.com/gemini/enterprise/docs/manage-web-app-features
[agent gallery]: https://docs.cloud.google.com/gemini/enterprise/docs/agent-gallery
[share workflow]: https://docs.cloud.google.com/gemini/enterprise/docs/workflow-builder/share-workflows
[share agents console]: https://docs.cloud.google.com/gemini/enterprise/docs/share-custom-agents
[event triggers]: https://docs.cloud.google.com/gemini/enterprise/docs/workflow-builder/configure-event-trigger
[Workflow Builder limits]: https://docs.cloud.google.com/gemini/enterprise/docs/workflow-builder/quotas-and-limits
[Workflow Builder known issues]: https://docs.cloud.google.com/gemini/enterprise/docs/workflow-builder/known-issues
[licence FAQ]: https://docs.cloud.google.com/gemini/enterprise/docs/licenses-faqs
[licences]: https://docs.cloud.google.com/gemini/enterprise/docs/licenses
[quotas]: https://docs.cloud.google.com/gemini/enterprise/docs/quotas-and-pay-as-you-go-usage
[access control]: https://docs.cloud.google.com/gemini/enterprise/docs/access-control
[Antigravity models]: https://antigravity.google/docs/models
[Antigravity pricing]: https://antigravity.google/pricing
[connectors intro]: https://docs.cloud.google.com/gemini/enterprise/docs/connectors/introduction-to-connectors-and-data-stores
[Google sources]: https://docs.cloud.google.com/gemini/enterprise/docs/connectors/create-data-store
[third-party sources]: https://docs.cloud.google.com/gemini/enterprise/docs/connectors/connect-third-party-data-source
[Drive setup]: https://docs.cloud.google.com/gemini/enterprise/docs/connectors/gdrive/set-up-data-store
[GitHub connector]: https://docs.cloud.google.com/gemini/enterprise/docs/connectors/github
[Drive connector]: https://docs.cloud.google.com/gemini/enterprise/docs/connectors/gdrive
[Jira connector]: https://docs.cloud.google.com/gemini/enterprise/docs/connectors/jira-cloud
[Supabase connector]: https://docs.cloud.google.com/gemini/enterprise/docs/connectors/supabase
[Supabase setup]: https://docs.cloud.google.com/gemini/enterprise/docs/connectors/supabase/set-up-data-store
[Supabase MCP]: https://supabase.com/docs/guides/ai-tools/mcp
[Salesforce connector]: https://docs.cloud.google.com/gemini/enterprise/docs/connectors/salesforce
[ServiceNow page]: https://docs.cloud.google.com/gemini/enterprise/docs/connectors/servicenow
[BigQuery connector]: https://docs.cloud.google.com/gemini/enterprise/docs/connectors/connect-bigquery
[custom MCP]: https://docs.cloud.google.com/gemini/enterprise/docs/connectors/custom-mcp-server/set-up-custom-mcp-server
[MCP org policy]: https://docs.cloud.google.com/gemini/enterprise/docs/connectors/custom-mcp-server/override-constraint-for-custom-mcp-data-stores
[GE Business]: https://cloud.google.com/gemini-enterprise/business
[Supabase pricing]: https://supabase.com/pricing
[Apps Script quotas]: https://developers.google.com/apps-script/guides/services/quotas
[schedule chat agent]: https://docs.cloud.google.com/gemini/enterprise/docs/workflow-builder/schedule-chat-agent
[manage actions]: https://docs.cloud.google.com/gemini/enterprise/docs/connectors/manage-actions
