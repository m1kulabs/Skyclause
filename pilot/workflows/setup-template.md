# Gemini Enterprise setup, {{GE_SETUP_DATE}}

The setup record for [#49](https://github.com/m1kulabs/Skyclause/issues/49): the pilot owner's Gemini Enterprise app, its four data stores, Jira, the two calendars, mail authentication, the reviewer path and the eight spikes. [`ge-setup.sh`](ge-setup.sh) writes it from [`setup-template.md`](setup-template.md) with values the pilot owner copied from each console, no secrets, and keeps screenshots and the replay file in [the evidence folder](setup-{{GE_SETUP_DATE}}/). "pending" marks a step not done yet; last written {{RENDERED_AT}}.

Contents:

1.  [Licence and app](#licence-and-app)
1.  [Data stores and actions](#data-stores-and-actions)
1.  [Jira](#jira)
1.  [Calendars](#calendars)
1.  [Mail authentication](#mail-authentication)
1.  [Reviewer path](#reviewer-path)
1.  [Spike inputs](#spike-inputs)
1.  [Spike workflow](#spike-workflow)
1.  [Spikes](#spikes)
1.  [See also](#see-also)

## Licence and app

- **Licence:** {{GE_LICENCE}}
- **Project:** `{{GE_PROJECT_ID}}`, edition {{GE_EDITION}}
- **Pilot owner:** {{PILOT_OWNER_EMAIL}}, in the Workspace domain `{{WORKSPACE_DOMAIN}}`
- **Owner role:** {{GE_OWNER_ROLE}}
- **App:** {{GE_APP_NAME}}, ID `{{GE_APP_ID}}`, location `{{GE_APP_LOCATION}}`
- **Feature management:** {{GE_FEATURES}}
- **Screenshots:** [apps list](setup-{{GE_SETUP_DATE}}/app-list.png) and [feature management](setup-{{GE_SETUP_DATE}}/app-features.png)
- **12:00 MYT, 7 November check:** {{DEADLINE_CHECK}}

The owner's IAM roles on the project, from `gcloud projects get-iam-policy`:

```text
{{BLOCK:owner-roles}}
```

## Data stores and actions

Every store reads through federation or actions, never data ingestion: an indexed copy is the cached data the real-data convention forbids. Drive only searches files owned in the owner's domain.

| Store           | Data store              | Actions enabled               |
| --------------- | ----------------------- | ----------------------------- |
| Google Drive    | `{{GE_STORE_DRIVE}}`    | {{GE_STORE_DRIVE_ACTIONS}}    |
| Gmail           | `{{GE_STORE_GMAIL}}`    | {{GE_STORE_GMAIL_ACTIONS}}    |
| Google Calendar | `{{GE_STORE_CALENDAR}}` | {{GE_STORE_CALENDAR_ACTIONS}} |
| Jira Cloud      | `{{GE_STORE_JIRA}}`     | {{GE_STORE_JIRA_ACTIONS}}     |

Screenshot: [connected data stores](setup-{{GE_SETUP_DATE}}/data-stores.png).

## Jira

- **Site:** {{JIRA_SITE}}, Jira Cloud Free, instance ID `{{JIRA_CLOUD_ID}}` (the `cloudId` from `/_edge/tenant_info`)
- **Project:** `SKY`, issue type Task: {{JIRA_PROJECT}}
- **User management:** {{JIRA_USER_MANAGEMENT}}
- **OAuth app:** {{JIRA_OAUTH_APP_NAME}}, an OAuth 2.0 (3LO) integration with callback `https://vertexaisearch.cloud.google.com/oauth-redirect`, classic scopes `read:jira-user`, `read:jira-work`, `write:jira-work` and `manage:jira-project`, and distribution set to Sharing. Its client ID and secret live only in the Atlassian and Google consoles.
- **Admin consent:** group {{JIRA_ADMIN_GROUP}}, with Jira User access admin and Jira administration Product admin, holding the account the connector signs in with.
- **API token:** none in P0.
- **Replay issue created by the connector:** {{JIRA_REPLAY_ISSUE_KEY}}

## Calendars

Both calendars are owned by the pilot owner.

| Calendar                     | Calendar ID                  | Sharing                           | Logged-out check          |
| ---------------------------- | ---------------------------- | --------------------------------- | ------------------------- |
| Skyclause conditions (pilot) | `{{CONDITIONS_CALENDAR_ID}}` | Public, showing all event details | {{CONDITIONS_LOGGED_OUT}} |
| Skyclause replay (team)      | `{{REPLAY_CALENDAR_ID}}`     | Private, shared with the team     | {{REPLAY_LOGGED_OUT}}     |

- **Logged-out check:** a `curl` of `https://calendar.google.com/calendar/ical/<calendar ID>/public/basic.ics` with no session, last run {{ICS_CHECKED_AT}}. HTTP 200 means anyone can open the calendar and 404 means it's private. The owner also opened the public calendar in a private window: {{CONDITIONS_PRIVATE_WINDOW}}.
- **`CONDITIONS_CALENDAR_ID`:** stored in {{CONDITIONS_CALENDAR_ID_STORED}}.

## Mail authentication

Domain `{{WORKSPACE_DOMAIN}}`, DKIM selector `{{DKIM_SELECTOR}}`, DKIM signing {{DKIM_STARTED}}. Last `dig` at {{DNS_CHECKED_AT}}.

**SPF:**

```text
{{BLOCK:dig-spf}}
```

**DKIM:**

```text
{{BLOCK:dig-dkim}}
```

**DMARC:**

```text
{{BLOCK:dig-dmarc}}
```

## Reviewer path

For [#76](https://github.com/m1kulabs/Skyclause/issues/76) and [#78](https://github.com/m1kulabs/Skyclause/issues/78), which grant the seats and share the agent.

1.  **Seat:** each reviewer needs a Gemini Enterprise licence from the subscription in `{{GE_PROJECT_ID}}`.
1.  **Role:** Gemini Enterprise User (`roles/discoveryengine.agentspaceUser`) on the project, or Gemini Enterprise Restricted User on the project plus Gemini Enterprise User on app `{{GE_APP_ID}}`.
1.  **Sharing:** the owner shares the agent with each reviewer by email from the canvas **Share** button (**Enable agent sharing** is on), or an admin shares it from the console.
1.  **Domain policy:** an `iam.allowedPolicyMemberDomains` exception may be needed for reviewers outside `{{WORKSPACE_DOMAIN}}`. Exception needed: {{ORG_POLICY_EXCEPTION}}. The effective policy on the project:

    ```text
    {{BLOCK:org-policy}}
    ```

1.  **App URL:** {{GE_APP_URL}}, from **Integration** with **Enable the Web App** on.
1.  **Runs reviewers start themselves:** email the team inbox {{GE_TEAM_INBOX}}, or subscribe to the public calendar at {{CONDITIONS_ICS_URL}}.

## Spike inputs

- **Replay folder:** `Skyclause pilot/crossings-replay/sky/`, folder ID `{{CROSSINGS_REPLAY_FOLDER_ID}}`
- **Replay file:** [`crossing-20261102-1505-01.json`](setup-{{GE_SETUP_DATE}}/crossing-20261102-1505-01.json), the spec's "Crossing file" example with the real 2 November values and `replay: true`
- **Spike spreadsheet:** `{{SPIKE_SHEET_ID}}`, never the pilot `ledger`
- **Writes:** only to `TEAM_ALERT_EMAILS` (one Gmail address and one Outlook address), the replay calendar, Jira label `replay` and the spike spreadsheet
- **Subjects:** every email subject starts with `Replay (2 Nov 2026):`

## Spike workflow

- **Name:** {{GE_SPIKE_WORKFLOW}}, in app `{{GE_APP_ID}}`, built {{GE_SPIKE_BUILT_ON}} and edited in place. It is reused as the crossing replay copy.
- **Trigger:** Google Drive app event for a new file in the replay folder.
- **Nodes:** Draft (Gemini agent, Google Drive) → Request info → Approval → Write (Gemini agent; Jira Cloud, Google Calendar, Gmail and Google Drive with Add Or Update Data on).

**Draft node instructions:**

```text
{{BLOCK:node-draft}}
```

**Request info step:**

```text
{{BLOCK:request-info}}
```

**Write node instructions:**

```text
{{BLOCK:node-write}}
```

## Spikes

| #   | Question                                                                                     | Method            | Run ID         | Answer            | Affects                                                                                                        |
| --- | -------------------------------------------------------------------------------------------- | ----------------- | -------------- | ----------------- | -------------------------------------------------------------------------------------------------------------- |
| 1   | With Request info then Approval, can one call be edited and one rejected (CAL-6)?            | {{SPIKE1_METHOD}} | {{SPIKE1_RUN}} | {{SPIKE1_ANSWER}} | [#63](https://github.com/m1kulabs/Skyclause/issues/63)                                                         |
| 2   | Do four writes after one Approval need one review or four?                                   | {{SPIKE2_METHOD}} | {{SPIKE2_RUN}} | {{SPIKE2_ANSWER}} | [#63](https://github.com/m1kulabs/Skyclause/issues/63)                                                         |
| 3   | Does the Drive trigger pass file content, or only the name and ID?                           | {{SPIKE3_METHOD}} | {{SPIKE3_RUN}} | {{SPIKE3_ANSWER}} | [#63](https://github.com/m1kulabs/Skyclause/issues/63), [#55](https://github.com/m1kulabs/Skyclause/issues/55) |
| 4   | Does the Drive connector read `.json` content, and if not, a Google Doc?                     | {{SPIKE4_METHOD}} | {{SPIKE4_RUN}} | {{SPIKE4_ANSWER}} | [#63](https://github.com/m1kulabs/Skyclause/issues/63), [#55](https://github.com/m1kulabs/Skyclause/issues/55) |
| 5   | Can Calendar Create event target a non-primary calendar?                                     | {{SPIKE5_METHOD}} | {{SPIKE5_RUN}} | {{SPIKE5_ANSWER}} | [#63](https://github.com/m1kulabs/Skyclause/issues/63), [#71](https://github.com/m1kulabs/Skyclause/issues/71) |
| 6   | Does GE expose the current time to a node, for `drafted_at`? A model's guess doesn't count.  | {{SPIKE6_METHOD}} | {{SPIKE6_RUN}} | {{SPIKE6_ANSWER}} | [#63](https://github.com/m1kulabs/Skyclause/issues/63)                                                         |
| 7   | Does Gmail Send emit a `text/plain` part?                                                    | {{SPIKE7_METHOD}} | {{SPIKE7_RUN}} | {{SPIKE7_ANSWER}} | NTC-1, via [#63](https://github.com/m1kulabs/Skyclause/issues/63)                                              |
| 8   | How many agent creations does the owner's pool give per day, and does a workflow copy count? | {{SPIKE8_METHOD}} | {{SPIKE8_RUN}} | {{SPIKE8_ANSWER}} | [#47](https://github.com/m1kulabs/Skyclause/issues/47)                                                         |

- **Spike 1 limit:** the replay file holds one change, so it drafts one call. Edit and reject are each tested on that call, in separate runs; both inside one review needs a crossing file with two or more changes.
- **Spike 7 delivery:** the replay message's DMARC result in the received headers, as `Authentication-Results` excerpts.

  Gmail:

  ```text
  {{BLOCK:headers-gmail}}
  ```

  Outlook:

  ```text
  {{BLOCK:headers-outlook}}
  ```

- **Spec edits proposed on #47:** {{SPEC_EDITS}}
- **Comment on #47 linking the answers:** {{COMMENT_47}}

## See also

- [#49](https://github.com/m1kulabs/Skyclause/issues/49), the ticket, and [#47](https://github.com/m1kulabs/Skyclause/issues/47), its spec
- [#7](https://github.com/m1kulabs/Skyclause/issues/7), the open licence question
- [Gemini Enterprise research](/docs/research/gemini-enterprise.md)
