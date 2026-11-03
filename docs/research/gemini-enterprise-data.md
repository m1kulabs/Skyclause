# Gemini Enterprise data

How real data get into and out of a Gemini Enterprise agent, and how live IoT and public-feed readings can reach one within a week, with and without a billing card, under the repo's real-data rule. Covers the connector catalogue, federated search versus ingestion, actions, custom MCP servers, custom connectors, live-data architectures, free sandboxes, and Kaggle and GitHub. Researched on 3 November 2026 against Google's Gemini Enterprise docs (pages last updated 28 October – 3 November 2026) and the vendors' own docs.

Contents:

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
    1.  [Comparison](#comparison)
1.  [Free sandboxes](#free-sandboxes)
1.  [Kaggle and GitHub](#kaggle-and-github)
1.  [Takeaways for this hackathon](#takeaways-for-this-hackathon)
1.  [Not verified](#not-verified)
1.  [See also](#see-also)

## Connector catalogue

In Gemini Enterprise a connector creates a _data store_, with one entity data store per entity type; for example, Jira Cloud yields separate stores for issues, attachments, comments, and worklogs ([connectors intro]). The briefing's "1P" means Google sources and "3P" means everything else, including MCP servers ([briefing transcript]).

[connectors intro]: https://docs.cloud.google.com/gemini/enterprise/docs/connectors/introduction-to-connectors-and-data-stores
[briefing transcript]: /docs/sources/briefing-session/transcript.md

### Google data sources

From the Google data sources page ([Google sources]):

- **Generally available:** BigQuery (ingestion mode), Cloud Storage import, Google Drive, Gmail, Google Calendar, Google Sites, people data, Cloud SQL, Spanner, and AlloyDB (ingestion mode), Firestore import, Bigtable import, and Terraform-created data stores.
- **Public preview:** federated query for BigQuery, Spanner, Cloud SQL, and AlloyDB; Google Chat; Compute Engine; Google Stitch; Google Groups; custom people data; Gemini Notebook Enterprise as a search source; and Knowledge Catalog with federated query connectors.
- **Website crawl:** not found as a data source in the current Gemini Enterprise lists or navigation. The editions table lists "Use Web Grounding" and "Use Ground with Google Search" as features instead ([GE editions]).
- **Google Sheets:** no separate connector; Sheets are reached through the Drive connector's Sheets actions (see [Actions and write-back](#actions-and-write-back)).

[Google sources]: https://docs.cloud.google.com/gemini/enterprise/docs/connectors/create-data-store

### Third-party data sources

The third-party overview, updated 3 November 2026, sorts connectors by launch stage ([third-party sources]):

- **Generally available (19):** Box, Confluence Cloud, Confluence Data Center, Dropbox, GitHub, Google Calendar, Google Drive, Google Mail, HubSpot, Jira Cloud, Jira Data Center, Microsoft Entra ID, Microsoft Outlook, Microsoft Teams, Monday, OneDrive, ServiceNow, SharePoint, and Slack.
- **Public preview (about 120):** includes Salesforce, Supabase, Custom MCP Server, Globalping, Grafana, PagerDuty, Linear, Notion, Airtable, Asana, Zendesk, Zapier, Dynamics 365, Oracle NetSuite, GitLab, and Hugging Face.
- **Private preview:** Confluence and Jira Data Center on-premises with data ingestion, by allowlist only.
- **SAP:** no SAP connector appears in any list or in the navigation; SAP would need a custom MCP server or custom connector.

[third-party sources]: https://docs.cloud.google.com/gemini/enterprise/docs/connectors/connect-third-party-data-source

### Edition and account limits

- The Business edition gets only "select, segment-relevant connectors"; Standard, Plus, Pay-as-you-go, and Frontline get "the full data connector ecosystem" ([GE editions]). The briefing's setup ran in the Google Cloud console ([BRIEF](/docs/BRIEF.md#tools)), which Business doesn't offer. **Inference:** the sponsored licence is Standard, Plus, or Pay-as-you-go, so the full catalogue should be available.
- Drive, Gmail, Calendar, and Chat "require a Google Workspace organization account and a Customer ID. Personal Google Accounts (consumer accounts ending in `@gmail.com`) ... aren't supported for data connectors" ([Google sources]). A consumer account searching gets `403 Consumer accounts aren't supported for Google Workspace data stores` ([Drive setup]).
- In federated mode the Drive connector "only searches documents that are owned by the domain of the user who performs the search" ([Drive setup]).
- **Doc conflict:** the presenter said personal Gmail IDs "will work perfectly" for the Drive connector ([briefing transcript]); Google's docs say they don't.
- Most third-party connectors support only the `global`, `us`, and `eu` locations ([GitHub connector], [Supabase connector]).

[Drive setup]: https://docs.cloud.google.com/gemini/enterprise/docs/connectors/gdrive/set-up-data-store

## Federated search versus ingestion

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
- The admin docs have pages titled "View data store sync activity and set up alerts" and "Access connector error logs" (navigation of [connectors intro]); I didn't read them.

[ServiceNow page]: https://docs.cloud.google.com/gemini/enterprise/docs/connectors/servicenow
[Cloud Storage import]: https://docs.cloud.google.com/gemini/enterprise/docs/connectors/connect-cloud-storage
[BigQuery connector]: https://docs.cloud.google.com/gemini/enterprise/docs/connectors/connect-bigquery
[Firestore import]: https://docs.cloud.google.com/gemini/enterprise/docs/connectors/connect-firestore

## Actions and write-back

Actions are added during data store creation or later under **Data Stores** → store → **Actions** → **Enable actions**. Federated stores need only the selection; ingestion stores need their own sign-in under **Authentication settings** ([manage actions]). Microsoft stores also take a tenant ID under **View/Edit parameters**. Several connector pages recommend attaching "only one data store with actions belonging to a single connector type" per app ([GitHub connector]).

Write actions that suit an IoT workflow, from the Google and third-party action lists ([Google sources], [third-party sources]):

- **Gmail:** Send message, Reply, Forward, Create draft, labels and filters.
- **Google Calendar:** Create, Update, and Delete event; Suggest time.
- **Google Drive and Sheets:** Create and Update file, Share file; since 12 October 2026, Get cell values, Update cell values, Update formulas, and Insert dimension on Sheets; since 30 October 2026, Update document and Update presentation.
- **Google Chat (preview):** Send message, Create conversation.
- **Jira Cloud (GA):** Create issue, Update issue, Change issue status, Create comment, Assign issue, Link issues, Create worklog, Upload attachment.
- **ServiceNow (GA):** Create incident and Update incident only. Actions need the OAuth Authorization Code flow; ingestion-only uses username and password (ROPC) ([ServiceNow page]).
- **Slack (GA):** Send, Schedule, and draft Slack messages; Create Slack canvas.
- **Microsoft Outlook (GA):** Send mail, Create and Update event, Create contact, Create Word and PowerPoint documents. **SharePoint (GA):** Create and Update list item, Add page, Upload document. **Teams (GA):** Send channel or chat message.
- **GitHub (GA):** Write issue, Add issue comment, Create or update file, Push files, Trigger Actions workflow, Merge pull request, and 16 more; it needs a GitHub App you create ([GitHub connector]).
- **Salesforce (preview, launched 26 October 2026):** Create, Update, and Delete Sobject Record, plus related-record variants. It runs on Salesforce's **SObject All** hosted MCP server, set up through an AppExchange package with Google-managed OAuth ([Salesforce connector]).
- **Supabase (preview):** Execute SQL, Apply migration, Deploy edge function, Pause and Restore project ([Supabase connector]).
- **PagerDuty (preview):** Create, Update, and Add note to incident.

For custom MCP tools, "all calls to any action require confirmation from the user" unless the tool declares `readOnlyHint` ([custom MCP]). Not verified: whether prebuilt write actions also ask for confirmation, and how that behaves in unattended scheduled workflows; scheduling is covered in [Gemini Enterprise](/docs/research/gemini-enterprise.md).

[manage actions]: https://docs.cloud.google.com/gemini/enterprise/docs/connectors/manage-actions
[GitHub connector]: https://docs.cloud.google.com/gemini/enterprise/docs/connectors/github
[Salesforce connector]: https://docs.cloud.google.com/gemini/enterprise/docs/connectors/salesforce
[Supabase connector]: https://docs.cloud.google.com/gemini/enterprise/docs/connectors/supabase

## Custom MCP servers

### Requirements and registration

The Custom MCP Server data store is in public preview ([third-party sources]). Its setup page ([custom MCP]) says:

- **Transport:** "The older `SSE` transport isn't supported. The connector exclusively supports the newer `StreamableHTTP` transport."
- **Public HTTPS:** the URL "must be an HTTPS URL" with "a TLS certificate signed by a publicly trusted Certificate Authority". Private servers inside a VPC need Agent Gateway, supported in `us-central1` and `europe-west1`.
- **Auth:** either **OAuth 2.0** (MCP server URL, authorization URL, token URL, client ID, client secret, scopes, optional PKCE; redirect URL `https://vertexaisearch.cloud.google.com/oauth-redirect`) or **No authentication**. No API-key or static-header option is listed.
- **Cloud Run:** for a default `.run.app` URL, Gemini Enterprise sends a Google-signed ID token in `X-Serverless-Authorization`; grant `roles/run.invoker` to `service-PROJECT_NUMBER@gcp-sa-discoveryengine.iam.gserviceaccount.com`. Custom domains don't get the token.
- **Limits:** up to 100 enabled actions at a time; the store must be created inside an app under **Connected Data Stores**, not linked later; one egress Agent Gateway per app.
- **Steps:** app → **Connected Data Stores** → **New data store** → **Custom MCP Server** → **Add MCP server** → auth → location and name → **Create**. All tools arrive turned off; enable them under **Actions** → **Reload custom actions**, which calls `tools/list`.
- **Org policy:** "By default, Gemini Enterprise blocks the creation of Model Context Protocol (MCP) data stores using a managed organization policy constraint." Unblocking it needs the Organization Policy Administrator role (`roles/orgpolicy.policyAdmin`) ([MCP org policy]). The server, authorization, and token domains may also need allowlisting as egress FQDNs.
- **Inference:** a team working inside a project that NTT DATA or Google provisioned may lack org-policy rights, so ask the organisers early whether custom MCP is unblocked.

[custom MCP]: https://docs.cloud.google.com/gemini/enterprise/docs/connectors/custom-mcp-server/set-up-custom-mcp-server
[MCP org policy]: https://docs.cloud.google.com/gemini/enterprise/docs/connectors/custom-mcp-server/override-constraint-for-custom-mcp-data-stores

### Google-managed remote MCP servers

- Google lists remote MCP endpoints for, among others, BigQuery (`https://bigquery.googleapis.com/mcp`), Firestore, Pub/Sub, Cloud Storage, Cloud SQL, Cloud Logging, Cloud Monitoring, and Cloud Run, plus Maps Grounding Lite (`https://mapstools.googleapis.com/mcp`). Gmail, Calendar, Drive, Sheets, Docs, and Chat MCP servers are in Developer Preview ([Google MCP servers]).
- The BigQuery MCP server uses OAuth 2.0 with IAM, needs `roles/mcp.toolUser`, and works without billing: "If you don't want to enable billing or provide a credit card, the steps in this document still work" in the BigQuery sandbox ([BigQuery MCP]).
- Gemini Enterprise's BigQuery connector in federated mode "uses the BigQuery MCP server" ([BigQuery connector]), so that is the documented pairing. The BigQuery MCP and client-configuration pages name Claude, Gemini CLI, and Antigravity as clients but not Gemini Enterprise.
- The custom MCP page's parameter example, "to get a refresh token from a Google MCP server, enter `&access_type=offline&prompt=consent`" ([custom MCP]), implies Google MCP servers can be registered as custom MCP stores. **Inference:** Firestore, Pub/Sub, or Maps Grounding Lite could reach an agent this way, but no page walks through it.

[Google MCP servers]: https://docs.cloud.google.com/mcp/supported-products
[BigQuery MCP]: https://docs.cloud.google.com/bigquery/docs/use-bigquery-mcp

### Third-party remote MCP servers

- **GitHub:** the remote server is at `https://api.githubcopilot.com/mcp/`, using OAuth or a personal access token in an `Authorization` header. "Each MCP host application needs to configure a GitHub App or OAuth App to support remote access via OAuth." The installation guides cover 14 hosts, including Antigravity and Gemini CLI, but not Gemini Enterprise ([GitHub MCP server]). **Inference:** Gemini Enterprise's own GitHub connector (GA) is the simpler route; a token-only setup can't be entered, because custom MCP offers only OAuth or no auth.
- **Supabase:** the remote server is at `https://mcp.supabase.com/mcp` with browser OAuth sign-in. Supabase warns about prompt injection and advises read-only mode, project scoping, and restricted feature groups before connecting production data ([Supabase MCP]). Gemini Enterprise's native Supabase connector uses Google-managed OAuth ([Supabase setup]), so no custom MCP is needed.
- **Atlassian:** the Rovo MCP server is at `https://mcp.atlassian.com/v2/mcp` with OAuth 2.1 or an API token; its supported-client list includes Gemini CLI but not Gemini Enterprise ([Atlassian MCP]). For Gemini Enterprise, Atlassian recommends the **Atlassian Rovo Agent** on Google Cloud Marketplace over Agent2Agent (A2A), not MCP ([Rovo to Gemini]). Gemini Enterprise also has native Jira Cloud and Confluence Cloud connectors (GA).
- **Salesforce:** Gemini Enterprise's Salesforce connector already wraps Salesforce's hosted SObject All MCP server ([Salesforce connector]).

[GitHub MCP server]: https://github.com/github/github-mcp-server
[Supabase MCP]: https://supabase.com/docs/guides/ai-tools/mcp
[Supabase setup]: https://docs.cloud.google.com/gemini/enterprise/docs/connectors/supabase/set-up-data-store
[Atlassian MCP]: https://support.atlassian.com/atlassian-rovo-mcp-server/docs/getting-started-with-the-atlassian-remote-mcp-server/
[Rovo to Gemini]: https://support.atlassian.com/atlassian-ai-gateway/docs/connect-rovo-to-gemini-via-google-cloud-marketplace/

## Custom connectors through the API

- A custom connector is code you write: fetch from the source API, transform each record into a Discovery Engine `Document` (`json_data` plus `acl_info`), then upload. Prerequisites start with "Check whether billing is enabled on your Google Cloud project" ([custom connector]).
- **Inline upload** uses incremental reconciliation (adds and updates, no deletions) and suits "frequent, small changes"; the other route stages files in Cloud Storage and imports with full reconciliation ([custom connector]).
- Structured stores can also be refreshed from BigQuery or Cloud Storage with `documents:import` ([refresh data]).
- **Inference:** a custom connector is still ingestion, so its freshness depends on how often your own job pushes, and it needs billing plus a scheduler. For live readings a custom MCP server or a federated connector is simpler and avoids stale copies.

[custom connector]: https://docs.cloud.google.com/gemini/enterprise/docs/connectors/create-custom-connector
[refresh data]: https://docs.cloud.google.com/gemini/enterprise/docs/refresh-data

## Live-data architectures

Every path below assumes the Gemini Enterprise licence comes from the sponsor, so "card" refers only to the data side. Device options and protocols are in [IoT and network](/docs/research/iot-and-network.md), feeds in [public data sources](/docs/research/public-data-sources.md), and Google free tiers in [Google tools](/docs/research/google-tools.md#paths-that-need-no-payment-card).

### Free-tier limits that matter

- **Apps Script, consumer account:** triggers total runtime 90 min a day, 20,000 URL Fetch calls a day, 6 min per execution, 30 simultaneous executions per user, 20 triggers per user per script. Workspace accounts get 6 h of trigger runtime and 100,000 URL fetches. Quotas reset 24 hours after the first request, and exceeding one throws an exception ([Apps Script quotas]).
- **Apps Script time triggers:** `everyMinutes(n)`, where "`n` must be 1, 5, 10, 15 or 30" ([ClockTriggerBuilder]).
- **Apps Script web apps:** a script with `doGet(e)` or `doPost(e)` can be deployed as a web app that runs as the owner or as the visiting user ([Apps Script web apps]).
- **Supabase Free:** 500 MB database, 5 GB egress, 200 concurrent Realtime connections, 500,000 Edge Function invocations, 2 active projects; "Free projects are paused after 1 week of inactivity" ([Supabase pricing]).
- **Cloud Run, Pub/Sub, BigQuery sandbox:** Cloud Run and Pub/Sub need a billing account, and the sandbox doesn't support streaming or DML; see [Google tools](/docs/research/google-tools.md#bigquery).

[Apps Script quotas]: https://developers.google.com/apps-script/guides/services/quotas
[ClockTriggerBuilder]: https://developers.google.com/apps-script/reference/script/clock-trigger-builder
[Apps Script web apps]: https://developers.google.com/apps-script/guides/web
[Supabase pricing]: https://supabase.com/pricing

### Phone or board to Google Sheets

- **Path:** a phone page or board POSTs each reading over HTTPS to an Apps Script web app; `doPost` appends a row to a Sheet; the agent reads it through the Drive connector (federated) or the Sheets **Get cell values** action, and can write results back with **Update cell values**.
- **Card:** none.
- **Freshness:** **Inference:** seconds, because the row exists once `doPost` returns and federated search and actions read at query time.
- **Network visible:** **Inference:** store the device timestamp and the server receipt time (`new Date()` in `doPost`) in separate columns, so each row carries its own latency.
- **Failure:** **Inference:** a silent device just stops adding rows, so instruct the agent to compare the newest timestamp with the current time and report "no reading for N minutes" rather than presenting the last value as current.
- **Blocker:** the Sheet must be in Drive owned by the same Workspace domain as the searching user, and consumer `@gmail.com` accounts can't use the Drive connector ([Drive setup]). **Inference:** run the script under the licensed account so the Sheet sits in that domain.

### Public feed polled into Sheets

- **Path:** an Apps Script time trigger calls a public feed with `UrlFetchApp` every 1–30 minutes and appends a row; the agent reads it as above.
- **Card:** none.
- **Freshness:** the trigger interval plus the feed's own update cycle.
- **Budget:** polling every minute is 1,440 calls a day, inside the 20,000 URL Fetch quota, but the 90 minutes of trigger runtime only allows about 3.75 seconds per run (my arithmetic) on a consumer account ([Apps Script quotas]).
- **Failure:** **Inference:** on a non-2xx response or exception, write an error row with the time, HTTP status, and message instead of skipping it, so the agent reports the outage and never reuses an earlier value. Recording each call's status and response time also shows the network leg.

### Device to Supabase

- **Path:** the device or phone inserts rows into a Supabase Postgres table over HTTPS; Gemini Enterprise's Supabase connector (preview) searches it at query time, and the **Execute SQL** action runs live queries or writes events back ([Supabase connector], [Supabase setup]).
- **Card:** none on the Free plan ([Supabase pricing]); whether sign-up asks for a card wasn't checked.
- **Freshness:** at query time.
- **Network visible:** **Inference:** a SQL query over device and server timestamps gives per-reading latency and gaps.
- **Failure:** **Inference:** a paused or unreachable project fails the query, so the agent sees an error, not cached rows. A continuous feed should also prevent the one-week inactivity pause.
- **Risk:** Execute SQL is raw SQL, so heed Supabase's prompt-injection guidance ([Supabase MCP]). This path doesn't depend on Workspace accounts.

### Device to Pub/Sub and BigQuery

- **Path:** the device publishes to Pub/Sub; a BigQuery subscription writes each message "as they are received"; Gemini Enterprise's BigQuery connector in federated query mode (preview) queries the table live ([BigQuery connector], [IoT and network](/docs/research/iot-and-network.md#from-pubsub-to-storage-and-gemini)).
- **Card:** yes, for Pub/Sub and streaming. Without a card, the BigQuery sandbox allows only batch loads, and its tables expire after 60 days.
- **Freshness:** **Inference:** seconds with federated query. Ingestion mode would serve an index copy and should be avoided for live readings.
- **Network visible:** device timestamp against Pub/Sub `publishTime`.
- **Failure:** no new rows; apply the same staleness check in SQL.
- The connector's federated mode takes an optional **Billing Project ID** for query costs ([BigQuery connector]). Not verified: whether a sandbox project without billing works there.

### MCP server that queries public feeds on demand

- **Path:** a Cloud Run service exposes StreamableHTTP MCP tools that call public feeds (air quality, river level, GTFS-realtime) when the agent asks, registered as a custom MCP data store ([custom MCP]).
- **Card:** yes, for Cloud Run. **Inference:** any host with a publicly trusted TLS certificate also qualifies, but none was verified for StreamableHTTP.
- **Freshness:** at call time, bounded by the feed's own update cycle.
- **Network visible:** a tool can return the upstream status code and round-trip time with every answer.
- **Failure:** the tool returns the upstream error to the agent. This is the cleanest fit for the "show the error" rule.
- **Blockers:** the custom MCP org-policy constraint, 100 actions, and preview status ([MCP org policy]). Use the `.run.app` URL so Gemini Enterprise attaches its ID token.

### Network measurements through Globalping

- Globalping (preview) is a federated third-party connector that "lets you search your Globalping measurements". It uses Google-managed OAuth with your Globalping account, its entity is **Measurements**, and only read-only actions are listed ([Globalping connector]).
- **Inference:** real ping, traceroute, or HTTP measurements from public probes would give the "Network" part of the theme a native 3P connector with real data, for example by measuring the path to the team's own ingest endpoint. Globalping's own limits and free plan weren't checked.

[Globalping connector]: https://docs.cloud.google.com/gemini/enterprise/docs/connectors/globalping

### Comparison

| Path                          | Card | Freshness to agent  | Connector, stage                  | Main blocker                          |
| ----------------------------- | ---- | ------------------- | --------------------------------- | ------------------------------------- |
| Device → Apps Script → Sheets | No   | Seconds (inference) | Drive, GA (Sheets actions)        | Needs a Workspace account and domain  |
| Apps Script poll → Sheets     | No   | 1–30 min trigger    | Drive, GA                         | 90 min/day trigger runtime (consumer) |
| Device → Supabase             | No   | Query time          | Supabase, preview                 | Preview; raw SQL action               |
| Device → Pub/Sub → BigQuery   | Yes  | Seconds (inference) | BigQuery federated query, preview | Billing                               |
| Cloud Run MCP → public feeds  | Yes  | Call time           | Custom MCP, preview               | Org policy constraint                 |
| Globalping measurements       | No   | Query time          | Globalping, preview               | Free limits unverified                |

## Free sandboxes

Only official developer programmes. Under the rule, a sandbox may hold records the system itself creates from real readings or events; any pre-loaded demo records must be deleted first or left unused.

| Programme                                        | Cost and limits                                                                                                                                         | Gemini Enterprise connector                        | Real data it could hold                                        |
| ------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------- | -------------------------------------------------------------- |
| Jira Cloud Free ([Jira pricing])                 | "Free forever for 10 users", 2 GB storage                                                                                                               | Jira Cloud, GA, federated or ingestion, 15 actions | Issues the agent files when a real reading crosses a threshold |
| Salesforce Developer Edition ([Salesforce DE])   | Free and "doesn't expire as long as you log in regularly"; hosted MCP servers included since April 2026                                                 | Salesforce, preview, via SObject All MCP           | Cases or custom-object records created from real events        |
| ServiceNow PDI ([ServiceNow PDI])                | Free; reclaimed "After a 10-day period of inactivity on the Developer Site"; hibernates when idle                                                       | ServiceNow, GA, Create and Update incident         | Incidents raised from real alerts                              |
| SAP BTP trial                                    | Not verified                                                                                                                                            | None listed; custom MCP or ADK only                | Not assessed                                                   |
| Microsoft 365 Developer Program ([M365 dev FAQ]) | E5 sandbox with 25 licences, only for Visual Studio Professional or Enterprise subscribers, eligible partners, and Premier or Unified Support customers | SharePoint, OneDrive, Outlook, Teams, all GA       | Ships with "pre-installed sample data", which the rule bars    |
| GitHub                                           | Free plan not re-checked                                                                                                                                | GitHub, GA, 22 write actions                       | The team's own repo: issues, commits, Actions runs             |

- **Inference:** students without a Visual Studio subscription won't qualify for the Microsoft 365 sandbox, so SharePoint and Outlook would need a tenant that someone already licenses. Connecting one also needs an Entra app registration with tenant ID, client ID, and secret, as the briefing demo showed ([briefing transcript]).
- ServiceNow hibernation means a federated query may fail until someone wakes the instance (**Inference**); keep the PDI awake during judging.

[Jira pricing]: https://www.atlassian.com/software/jira/pricing
[Salesforce DE]: https://developer.salesforce.com/blogs/2026/04/new-developer-edition-agentforce-vibes-claude-mcp
[ServiceNow PDI]: https://developer.servicenow.com/print_page.do?release=australia&category=developer-program&identifier=accessing-your-pdi&module=guide
[M365 dev FAQ]: https://learn.microsoft.com/en-us/office/developer-program/microsoft-365-developer-program-faq

## Kaggle and GitHub

- **GitHub:** see [Third-party remote MCP servers](#third-party-remote-mcp-servers). The presenter's idea of watching new repositories and notifying users ([briefing transcript]) maps to the GA GitHub connector's read-only search actions plus Gmail or Slack send actions.
- **Kaggle MCP:** Kaggle runs an official remote server at `https://www.kaggle.com/mcp`, with OAuth 2.0 or, for clients without OAuth, a token starting `KGAT`; its tools cover datasets, competitions, notebooks, models, and benchmarks ([Kaggle MCP]). Kaggle's docs don't mention Gemini Enterprise. Not verified: whether its OAuth can be registered with the static client ID and secret that Gemini Enterprise's custom MCP form requires.
- **Kaggle licences:** Kaggle's terms say content on the site is "protected by copyright", users "promise to abide by all copyright notices", and competition data is governed by each competition's rules ([Kaggle terms]). **Inference:** check each dataset's own licence and provenance before replaying it, and reject any whose card says the readings are synthetic or generated, since the rule allows only real datasets replayed and labelled as a replay ([IoT and network](/docs/research/iot-and-network.md#real-versus-simulated-data)).
- The presenter's "three months once Kaggle might be updating" ([briefing transcript]) depends on each dataset's uploader; not verified.

[Kaggle MCP]: https://www.kaggle.com/docs/mcp
[Kaggle terms]: https://www.kaggle.com/terms

## Takeaways for this hackathon

- **Best no-card path:** phones or boards → Apps Script web app → a Sheet in the licensed Workspace domain, read live through the GA Drive connector and Sheets actions, with an Apps Script time trigger polling a public feed into the same Sheet. If the licensed accounts turn out to be consumer Gmail, use Supabase Free with the Supabase connector instead.
- **Best with-card path:** device → Pub/Sub → BigQuery subscription → BigQuery connector in federated query mode, plus a Cloud Run custom MCP server that fetches public feeds on demand and returns their errors.
- **Strongest connectors for the technical score (inference from the presenter's emphasis on 1P and 3P):** 1P Drive and Sheets (read and write), Gmail send, and Calendar create event; 3P GA Jira Cloud create issue, ServiceNow create incident, Slack send message, and GitHub write issue or trigger workflow. Supabase, Salesforce, and Globalping are preview extras, and a custom MCP server is the add-on.
- **Avoid ingestion for live values:** index copies lag by at least 3 hours for third-party syncs and 1 day for Cloud Storage, and they keep serving old data when a source fails.
- **Ask the organisers now:** which account type the licences use (Workspace or consumer), whether the custom MCP org-policy constraint is off, and whether teams hold Discovery Engine Editor or Admin on their project.

## Not verified

- The account type, edition, and IAM roles of the sponsored licences.
- Whether prebuilt write actions ask for confirmation, and how that interacts with unattended workflows.
- Business edition's exact connector subset.
- Supabase sign-up card requirement, the device-side Supabase write API, and what Supabase counts as "inactivity".
- BigQuery federated query from a project without billing.
- SAP BTP trial terms; GitHub Free plan details; Globalping free limits; whether Salesforce Developer Edition or ServiceNow PDIs ship with demo records.
- The presenter's claim that SharePoint "comes for free" with a Microsoft account.
- Kaggle MCP registration in Gemini Enterprise; any free StreamableHTTP host other than Cloud Run.
- The "Access connector error logs" and sync-alert pages, which I didn't read.

## See also

- [Gemini Enterprise](/docs/research/gemini-enterprise.md): app surfaces, agent types, scheduling, editions, and trials.
- [Google tools](/docs/research/google-tools.md): free tiers, billing, and the no-card paths.
- [IoT and network](/docs/research/iot-and-network.md): devices, protocols, and the real-versus-simulated ruling.
- [Public data sources](/docs/research/public-data-sources.md): live public feeds near APU.
- [Brief](/docs/BRIEF.md): tools and judging as stated at the briefing.
- [Briefing transcript](/docs/sources/briefing-session/transcript.md): the connector and Antigravity demos.
- [Project conventions](/docs/references/project-conventions.md): the real-data rule.

[GE editions]: https://docs.cloud.google.com/gemini/enterprise/docs/editions
