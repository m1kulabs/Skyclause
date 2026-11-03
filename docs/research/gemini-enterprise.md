# Gemini Enterprise

What a student team can build inside Gemini Enterprise, with Antigravity, for the APU Cloud Innovation Hackathon, and how NTT DATA reviewers get in to see and use it. Researched on 3 November 2026 against Google's docs, release notes, pricing, and help pages, after the [briefing]; editions, prices, and the Business trial from before the briefing are in [google-tools.md](/docs/research/google-tools.md#gemini-enterprise).

Contents:

1.  [Key findings](#key-findings)
1.  [Corrections to google-tools.md and the briefing](#corrections-to-google-toolsmd-and-the-briefing)
1.  [App surfaces](#app-surfaces)
    1.  [Workflow Builder, formerly Agent Designer](#workflow-builder-formerly-agent-designer)
    1.  [Chat agents](#chat-agents)
    1.  [Workflows](#workflows)
    1.  [Made by Google agents](#made-by-google-agents)
    1.  [Skills](#skills)
    1.  [Agent Gallery and sharing](#agent-gallery-and-sharing)
1.  [Unattended automation](#unattended-automation)
    1.  [Triggers and schedules](#triggers-and-schedules)
    1.  [What runs without anyone signed in](#what-runs-without-anyone-signed-in)
    1.  [Run history as evidence](#run-history-as-evidence)
1.  [Full-code agents](#full-code-agents)
1.  [Models](#models)
1.  [Editions and trials](#editions-and-trials)
1.  [Reviewer access](#reviewer-access)
    1.  [What each reviewer needs](#what-each-reviewer-needs)
    1.  [The app URL](#the-app-url)
    1.  [What to ask reviewers for](#what-to-ask-reviewers-for)
1.  [Antigravity](#antigravity)
    1.  [Surfaces and licensing](#surfaces-and-licensing)
    1.  [MCP configuration](#mcp-configuration)
1.  [Limits that bite in a one-week build](#limits-that-bite-in-a-one-week-build)
1.  [Not verified](#not-verified)
1.  [See also](#see-also)

## Key findings

- **The "maximizing" agent the presenter described is a workflow.** Workflow Builder, the GA successor to Agent Designer since 3 September 2026, builds workflows that start on a schedule, on a connector event such as a new email or file, or by hand, and keeps a Runs tab with step-by-step traces ([GE release notes], [workflows]).
- **Unattended runs have three catches.** Schedules run on the author's delegated credentials, which expire every 14 days and must be refreshed by hand. Scheduled runs that affect other people, such as sending email, pause for approval. The workflow docs say adding or updating data through connectors "requires human review" ([Workflow Builder limits], [workflows]).
- **A free-trial subscription excludes Antigravity.** Free-trial seats get their edition's base quotas but no AI developer tools and no pay-as-you-go above quota ([licence FAQ], [quotas]). On a trial, a team uses Antigravity's free Individuals plan with a personal account instead.
- **Every reviewer needs a licence and an IAM role in the team's project,** plus the agent shared with them. Sharing is documented as "within your organization" ([licences], [access control], [share workflow]).
- **Daily creation quota is small on Standard:** 1 agent per licensed user per day, pooled; Plus gives 10 ([Workflow Builder limits]).

## Corrections to google-tools.md and the briefing

- **No-code agents are GA, not preview.** [google-tools.md](/docs/research/google-tools.md#what-a-team-can-and-cannot-build-with-gemini-enterprise) follows the editions table, which still says "(preview)"; the release notes made Workflow Builder GA on 3 September 2026 ([GE editions], [GE release notes]). Google's own pages disagree here.
- **Gemini Enterprise is no longer only a chat front end.** google-tools.md infers that "the sensor ingest, the logic, and any public UI still need the Gemini API or Agent Platform". Workflows now carry scheduled and event-driven logic inside the app ([workflows]), and the briefing made Gemini Enterprise mandatory. Ingest still needs a connector or MCP server; see [gemini-enterprise-data.md](/docs/research/gemini-enterprise-data.md).
- **Trial and Antigravity:** the presenter said Antigravity "comes with the enterprise license" and has no token limits ([briefing]). The docs say free-trial subscriptions exclude AI developer tools, and paid seats get $10 (Standard) or $15 (Plus) of Antigravity credit per user per month, enforced weekly ([licence FAQ], [quotas]).
- **Gemini Code Assist:** the [GE FAQ] still advertises it with the Standard and Plus trial, but it was removed from new Standard and Plus subscriptions on 17 September 2026, and Antigravity for IDEs replaces it ([GE release notes]).
- **Data Insights** is "GA with allowlist" through sales, not the "preview" on slide 9, and Business lacks it ([GE release notes], [GE editions]).
- **Personal Gmail accounts:** the presenter said personal Gmail IDs "work perfectly". The Gmail, Drive, and Calendar connector pages say consumer `@gmail.com` accounts have no customer ID and aren't supported for Google Workspace data stores ([Gmail data store]).

## App surfaces

### Workflow Builder, formerly Agent Designer

- Workflow Builder is the no-code, low-code tool in the Gemini Enterprise web app for building **chat agents** and **workflows**, either from a natural-language prompt or in a visual editor ([Workflow Builder]).
- An admin turns it on in the Google Cloud console under the app's **Configurations** → **Feature Management** tab, with separate toggles **Enable chat agents** and **Enable workflows**, matching the briefing. The same tab has **Enable Agent Gallery**, **Enable model selector**, **Enable Gemini Notebook**, and three agent-sharing toggles ([web app features]).
- Users start from **Agents** → **+ New agent** in the web app ([agent gallery]). An agent can only use the connectors, tools, and permissions the admin has provisioned ([Workflow Builder]).

[Workflow Builder]: https://docs.cloud.google.com/gemini/enterprise/docs/workflow-builder
[agent gallery]: https://docs.cloud.google.com/gemini/enterprise/docs/agent-gallery

### Chat agents

- Conversational, mainly non-deterministic agents for Q&A, lookups, and user-driven tasks. They can be one node or a main agent routing to sub-agents ([chat agents]).
- The canvas has a chat mode and a designer mode with **Flow**, **Schedule**, and **Preview** tabs ([chat agents]).
- To the end user, a chat agent is an entry in the Agent Gallery, or an `@`-mention in a chat ([GE release notes]).

[chat agents]: https://docs.cloud.google.com/gemini/enterprise/docs/workflow-builder/chat-agents

### Workflows

- A workflow is a trigger plus a sequence of steps, mixing AI steps and human steps, with deterministic or non-deterministic logic ([workflows]).
- **Steps:** Gemini Agent nodes with instructions, knowledge files, connected apps, and a model choice (Gemini 3.0 or later only); conditions; data filtering and loops; human-in-the-loop **Request info** and **Approval** steps; MCP steps; and handing off to existing ADK or A2A agents ([workflows], [HITL steps], [MCP steps]).
- **Connector actions:** each connector on an agent node has **Search For Data** actions, toggled one by one, and **Add Or Update Data** actions, toggled all-or-nothing per connector ([workflows]).
- **Workflow connectors:** Gmail, Google Calendar, Google Chat, Google Drive, Confluence, Jira (Cloud and Data Center), Microsoft Teams, Notion, OneDrive, Outlook, Salesforce, SharePoint, ServiceNow, and Slack ([workflows]). The full catalogue is in [gemini-enterprise-data.md](/docs/research/gemini-enterprise-data.md).
- **Lifecycle:** save as draft, test in the **Preview**/**Test** tab with sample events, then **Turn on**. Versions can be saved, compared, and restored, and turning a version off removes its schedules and triggers ([turn on workflow]).

[HITL steps]: https://docs.cloud.google.com/gemini/enterprise/docs/workflow-builder/use-hitl-steps
[MCP steps]: https://docs.cloud.google.com/gemini/enterprise/docs/workflow-builder/connect-mcp-servers
[turn on workflow]: https://docs.cloud.google.com/gemini/enterprise/docs/workflow-builder/publish-workflows

### Made by Google agents

- **Deep Research:** plans a research task, streams progress, and returns a cited report with an audio summary, using the app's indexed data and, if enabled, the web ([Deep Research]). Quota: 3 a day per Standard user, 10 per Plus user, pooled ([quotas]).
- **Gemini Notebook Enterprise,** renamed from NotebookLM Enterprise on 16 July 2026: opened from **Agents** → **Made by Google** → **Gemini Notebook** ([Gemini Notebook in GE], [GE release notes]). Notebooks can be shared only with users in the same project or workforce pool who hold a licence ([notebook sharing]).
- **Data Insights:** answers questions over BigQuery data; GA with allowlist, so a team would need sales to enable it ([GE release notes]).
- **Co-Scientist** also appears under Made by Google; the Idea Generation agent was removed on 14 July 2026 ([agent gallery], [GE release notes]).

[Deep Research]: https://docs.cloud.google.com/gemini/enterprise/docs/research-assistant
[Gemini Notebook in GE]: https://docs.cloud.google.com/gemini/enterprise/docs/access-notebooklm
[notebook sharing]: https://docs.cloud.google.com/gemini/enterprise/notebooklm-enterprise/docs/share-notebooks

### Skills

- A skill is a package with a `SKILL.md` prompt file, plus optional scripts and context files, that the assistant loads when relevant. Standard, Plus, and Pay-as-you-go users can create and upload skills; an admin must turn skills on, and sharing can require admin review ([skills]).
- Users could create, upload, and share custom skills from 13 August 2026 ([GE release notes]).

[skills]: https://docs.cloud.google.com/gemini/enterprise/docs/skills

### Agent Gallery and sharing

- The gallery, under **Agents** in the web app, filters by **Pinned**, **Made by Google**, **From your organization**, **Your agents**, and **Marketplace** ([agent gallery]).
- An owner shares a workflow by email from the canvas **Share** button. Sharing with Google Groups is off for end users until an admin enables it, and admins can require approval for the first share ([share workflow], [web app features]).
- People a workflow is shared with see a read-only graph. They can run a preview, set **their own** schedule or event triggers, view **their own** runs, or make a copy ([share workflow]).
- Admins can also share any agent from the console, with users, groups, workforce pools, or "All users", and transfer ownership. A transfer disables the agent's schedules and triggers until the new owner re-enables them ([share agents console]).

## Unattended automation

### Triggers and schedules

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

[schedule chat agent]: https://docs.cloud.google.com/gemini/enterprise/docs/workflow-builder/schedule-chat-agent
[agents overview]: https://docs.cloud.google.com/gemini/enterprise/docs/agents-overview

### What runs without anyone signed in

- **Status:** Workflow Builder, workflows, and chat agents are GA in Standard, Plus, and Pay-as-you-go. Frontline users can only run agents shared with them ([GE release notes], [Workflow Builder limits]). The editions table still labels no-code agents "(preview)" ([GE editions]).
- **Credentials:** "Scheduled agents execute using the author's delegated user credentials. Credentials expire every 14 days and must be manually refreshed" via **Refresh schedules** in the gallery or the agent's **Schedule** tab ([Workflow Builder limits], [schedule chat agent]).
- **Approval:** "Scheduled runs that perform actions affecting other individuals (such as sending emails or scheduling meetings) automatically pause for review and require user approval in chat history" ([Workflow Builder limits]). For chat agents, scheduling actions that involve other people "is not supported"; scheduled runs suit personal tasks such as emailing yourself ([schedule chat agent]).
- **Write-back:** for workflow agent nodes, "Adding or updating data through connectors requires human review" ([workflows]).
- **Failures:** event-triggered runs that fail with `RESOURCE_EXHAUSTED`, for example after a daily quota runs out, aren't retried, and failed sessions can't be retried by hand ([Workflow Builder known issues], [event triggers]).

**Inference:** a workflow can run on a timer or event for months, read connectors, reason, and write a summary or a draft without anyone signed in, as long as someone refreshes the credentials every 14 days. Actions that reach other people stop at **Needs Review**. The demo flow "send email automatically to the student who didn't submit" therefore pauses for a human click, so design the pitch around human approval rather than claim zero-touch. Whether an MCP step that writes to the team's own server also pauses is not documented.

### Run history as evidence

- Each workflow's **Runs** tab lists simulations and triggered runs, with the trigger, status (**Running**, **Needs Review**, **Completed**, **Error**), start time, version, and a step-by-step trace. **Agents** → **Runs** lists runs for all workflows in the app ([workflow runs]).
- The Runs tab sometimes fails to load; refreshing is the documented workaround ([Workflow Builder known issues]).
- **Inference:** a reviewer a workflow is shared with sees their own runs, not the owner's ([share workflow]). To show "how it works day to day", capture the owner's Runs tab over several days in the video and README, or give reviewers a trigger they can fire themselves.

[workflow runs]: https://docs.cloud.google.com/gemini/enterprise/docs/workflow-builder/workflow-runs

## Full-code agents

- **Editions:** Standard, Plus, Pay-as-you-go, and Frontline (provisioned only) can use full-code agents built outside Gemini Enterprise; Business can't ([GE editions]).
- **ADK:** the agent must be hosted on Agent Runtime, formerly Vertex AI Agent Engine, and an admin with the Gemini Enterprise Admin role registers it with the app using a single Agents CLI command. Agent Runtime handles the queries and receives the user's email ([ADK registration]).
- **A2A:** agents hosted anywhere that speak A2A v0.3 streaming can be registered. The page is still labelled Preview, while the release notes declared A2A registration GA on 17 August 2026 ([A2A registration], [GE release notes]).
- **Cost:** Agent Runtime bills $0.085 per vCPU-hour and $0.009 per GiB-hour, with idle time between turns free, on a project with Cloud Billing ([Agent Platform pricing]). Registering an agent uses the same daily creation quota as building one ([Workflow Builder limits]).
- **Inference:** the presenter called ADK "very limited" for this hackathon ([briefing]). Treat a full-code agent as an add-on step inside a workflow, not the core.

[ADK registration]: https://docs.cloud.google.com/gemini/enterprise/docs/register-and-manage-an-adk-agent
[A2A registration]: https://docs.cloud.google.com/gemini/enterprise/docs/register-and-manage-an-a2a-agent
[Agent Platform pricing]: https://cloud.google.com/products/gemini-enterprise-agent-platform/pricing

## Models

- **The presenter's names:** "Gemini 3.8" is **Gemini 3.8 Flash**, and "Gemini Four Argon" is **Gemini 4 Argon** (`gemini-4-argon`) ([web app features], [Antigravity models]).
- **In the web app:** Gemini 4 Argon, 3.8 Flash, 3.7 Flash, 3.6 Flash, 3.5 Flash, 3.1 Pro, and 2.5 Pro, chosen through **Enable model selector**. Gemini 4 Argon's toggle defaults to on from 27 October 2026, and 3.8 Flash has been on by default since 23 September 2026 ([web app features], [GE release notes]).
- **In workflows:** Gemini 4 Argon arrived on 14 October 2026; agent nodes accept Gemini 3.0 and later, and the known-issues page recommends 3.1 Pro ([GE release notes], [workflows], [Workflow Builder known issues]).
- **Claude Opus 5.5 and Sonnet 5.5** can be enabled, but only as pay-as-you-go above quota ([web app features]). **Inference:** they are unavailable on a free trial, which can't use pay-as-you-go ([quotas]).

## Editions and trials

- **A console-created app is not Business.** Business lives at `business.gemini.google` with no console or project IAM ([GE editions]). An app created in the Cloud console, as in the briefing, runs on Standard, Plus, Pay-as-you-go, or Frontline licences; the console's subscription details page shows which ([GE editions]).
- **Free trial:** the [GE FAQ] offers Standard or Plus "free for 30 days" from the console's free-trial page. Free-trial seats draw the edition's base pooled quotas but get no AI developer tools and no pay-as-you-go above quota ([licence FAQ], [quotas]).
- **"Start a free trial or buy credits":** **Inference:** this is the screen for a project with no licence distributed to it. "Buy credits" refers to prepaid credits, which a self-serve billing account must buy to subscribe to Pay-as-you-go, with a $5 minimum and one-year expiry; free-trial billing accounts can't buy them ([GE editions], [prepaid credits]). Neither is needed if the sponsored licence reaches the project, so don't buy credits; ask the organisers.
- **Licences are per project and location:** a licence works only in the project and location it was distributed to ([licences]). **Inference:** if Google allocates the licences to a project the organisers or NTT DATA own, the team builds in that project rather than its own.
- **Per person or per team:** an organiser question ([BRIEF.md](/docs/BRIEF.md#open-questions)).

[prepaid credits]: https://docs.cloud.google.com/gemini/enterprise/docs/manage-prepaid-credits

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

## Antigravity

### Surfaces and licensing

- **Surfaces:** a desktop app, the CLI (`agy`), extensions for VS Code, Visual Studio, JetBrains, Zed, Xcode, and Eclipse, a standalone IDE, and a Python SDK. It runs on macOS 12+, Windows 10/11, and Linux ([Antigravity getting started]).
- **Sign-in:** a personal Google Account (Free, Pro, Ultra plans) or Gemini Enterprise credentials, by choosing **Business account** → **Continue with Google Cloud** and then a project and location ([Antigravity getting started], [Antigravity enterprise]).
- **Free Individuals plan:** $0 with "basic weekly rate limits", Gemini 3.8 Flash, and all product features, including scheduled tasks and the CLI. Only Pro and Ultra can buy extra credits ([Antigravity pricing], [Antigravity plans]).
- **Through Gemini Enterprise:** included with a paid Standard or Plus seat, with no separate Antigravity licence, but it needs an invoiced Cloud Billing account and the Gemini Enterprise User role ([Antigravity enterprise], [AI developer tools]). Seat credits are $10 (Standard) or $15 (Plus) per user per month, enforced as a weekly pool ([quotas]). Free trials exclude it ([licence FAQ]).
- **Models:** Gemini 4 Argon needs AI Pro, AI Ultra, or Enterprise. Gemini 3.8 Flash is on every plan. Gemini 3.7 Flash, 3.6 Flash, and 3.1 Pro are Enterprise-only ([Antigravity models]). Slide 11's "powered by Gemini 3.5 Flash" is out of date.
- **Schedules:** `/schedule` runs a one-off or cron task, but schedules belong to the conversation that created them; standing jobs need sidecars or Automations ([Antigravity schedule]). **Inference:** keep the 24/7 part in a Gemini Enterprise workflow and use Antigravity to build and debug.

[Antigravity getting started]: https://antigravity.google/docs/getting-started
[Antigravity enterprise]: https://antigravity.google/docs/enterprise
[Antigravity pricing]: https://antigravity.google/pricing
[Antigravity plans]: https://antigravity.google/docs/plans
[Antigravity schedule]: https://antigravity.google/docs/commands/schedule
[AI developer tools]: https://docs.cloud.google.com/gemini/enterprise/docs/ai-developer-tools-overview

### MCP configuration

- **Where:** `~/.gemini/config/mcp_config.json` globally, `<workspace>/.agents/mcp_config.json` per workspace, or **Settings** → **Customizations** → **Installed MCP Servers** in the app ([Antigravity MCP]).
- **Shape:** a root `mcpServers` object. Each server has either `command` (stdio) or `serverUrl`, and remote servers must use Streamable HTTP. OAuth servers register `https://antigravity.google/oauth-callback` as a redirect URI. The MCP Store lists about 77 servers ([Antigravity MCP]).
- **What this does not do:** Antigravity's MCP config gives Antigravity's own coding agent tools. It doesn't add connectors to the Gemini Enterprise app ([Antigravity MCP]). **Inference:** in this hackathon Antigravity is the helper the presenter demoed: it generates Entra app-registration steps, MCP server code, or Cloud Run deploys, which the team then wires into Gemini Enterprise ([briefing]). Gemini Enterprise's own MCP and connector setup is in [gemini-enterprise-data.md](/docs/research/gemini-enterprise-data.md).

[Antigravity MCP]: https://antigravity.google/docs/mcp

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

## Not verified

- Whether the 14-day credential expiry and the approval pause, both documented for scheduled chat agents, apply the same way to scheduled and event-triggered workflows. The limits page states them for "automated agent schedules" in general ([Workflow Builder limits]).
- Whether MCP steps or a team-owned MCP tool can write without human review.
- Whether a consumer `@gmail.com` account can hold a Gemini Enterprise licence and open the web app. The docs only rule it out for Workspace data stores ([Gmail data store]).
- Whether people outside the project's organisation can be shared an agent, given the "within your organization" wording.
- Whether the sponsored licence is a free-trial subscription, and so lacks Antigravity and pay-as-you-go, or a paid one.
- The Standard and Plus trial length outside the marketing FAQ, and whether it needs a card. No docs page states either.
- Whether a shared user can see the owner's run history.

## See also

- [google-tools.md](/docs/research/google-tools.md): editions, prices, the Business trial, Agent Platform, and no-card paths.
- [gemini-enterprise-data.md](/docs/research/gemini-enterprise-data.md): connectors, MCP servers, data freshness, and getting IoT and public data in.
- [judging-and-pitching.md](/docs/research/judging-and-pitching.md): rubrics and packaging.
- [iot-and-network.md](/docs/research/iot-and-network.md) and [public-data-sources.md](/docs/research/public-data-sources.md): devices and datasets.
- [past-winners.md](/docs/research/past-winners.md): what has won before.
- [Hackathon brief](/docs/BRIEF.md), [briefing transcript][briefing], and [briefing slides](/docs/sources/briefing-session/slides.md).

[briefing]: /docs/sources/briefing-session/transcript.md
[GE release notes]: https://docs.cloud.google.com/gemini/enterprise/docs/release-notes
[GE editions]: https://docs.cloud.google.com/gemini/enterprise/docs/editions
[GE FAQ]: https://cloud.google.com/gemini-enterprise/faq
[Gmail data store]: https://docs.cloud.google.com/gemini/enterprise/docs/connectors/gmail/set-up-data-store
[workflows]: https://docs.cloud.google.com/gemini/enterprise/docs/workflow-builder/workflows
[web app features]: https://docs.cloud.google.com/gemini/enterprise/docs/manage-web-app-features
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
