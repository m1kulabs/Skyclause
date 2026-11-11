# Personal-data breach runbook

What the breach owner does when personal data Skyclause holds may have been exposed, changed or lost, from the first report to the last notification. The clocks come from Malaysia's Personal Data Protection Act as amended in 2024 ([PRD AUD-7](/docs/PRD.md#audit-and-data-rights-aud)).

Contents:

1.  [Breach owner and deputy](#breach-owner-and-deputy)
1.  [Breach clocks](#breach-clocks)
1.  [Breach steps](#breach-steps)
    1.  [Detect](#detect)
    1.  [Contain](#contain)
    1.  [Assess](#assess)
    1.  [Notify the Commissioner](#notify-the-commissioner)
    1.  [Notify affected people](#notify-affected-people)
1.  [Breach record](#breach-record)
1.  [See also](#see-also)

## Breach owner and deputy

| Role          | Name          | Holds                                                                                                  |
| ------------- | ------------- | ------------------------------------------------------------------------------------------------------ |
| Breach owner  | `kymil4`      | Decides whether it is a breach, runs both clocks, sends both notifications and keeps the breach record |
| Breach deputy | `AlaskanTuna` | Acts as owner whenever the owner can't be reached, with the same authority                             |

Names are GitHub handles, named by the product lead on 6 November 2026.

The platform on-call ([on-call](on-call.md)) who first hears of a possible breach tells the owner, or the deputy if the owner doesn't answer, and keeps running the incident ([incident runbook](incident.md)) alongside.

## Breach clocks

1.  **72 hours:** notify the Commissioner within 72 hours of becoming aware of the breach.
1.  **7 days:** notify the affected people within 7 days after notifying the Commissioner, where the breach causes or is likely to cause them significant harm.

Write down the time Skyclause became aware, in MYT (UTC+8), before anything else: both clocks run from it.

Source: the 2024 amendment (Act A1727) requires notifying the Commissioner "as soon as practicable" and data subjects "without unnecessary delay" where there is significant harm. The 72-hour and 7-day figures are the Commissioner's guidelines as reported by DLA Piper, a secondary source, in force from 1 June 2025 ([PDPA research](/docs/research/judging.md#malaysias-pdpa-and-the-2024-amendment)). Read the Commissioner's current guideline before each notification; where it differs from this runbook, the guideline wins, and this file gets fixed afterwards.

## Breach steps

Record every step, with its time in MYT, in the [breach record](#breach-record) as you go.

### Detect

A breach can surface as a page, an auditor notification, a user or customer report, a support message or a staff member's own find. Whoever sees it:

1.  Opens an incident ([incident runbook](incident.md)) if none is open.
1.  Tells the breach owner, or the deputy.
1.  Writes down when Skyclause became aware.

### Contain

Stop further exposure first, and keep the evidence:

- Revoke what leaked: API keys, AI provider keys, device tokens, share links, sessions.
- Rotate exposed secrets with `gcloud secrets versions add <NAME> --project=skyclause --data-file=-`, then redeploy so revisions read the new version.
- If a release caused it, roll it back ([rollback runbook](rollback.md)) and set `DEPLOY_FREEZE` ([incident runbook](incident.md#error-budgets-and-deploy_freeze)).
- If data was changed or deleted, restore it while it is still inside Neon's 6-hour window ([restore runbook](restore.md)).
- Don't delete logs, audit rows or the affected rows' history: the assessment needs them.

### Assess

Work out, with counts rather than names:

- **Which data:** the tables and fields involved, and whether any is sensitive personal data.
- **How many people:** distinct accounts, subscribers or guests, and which organisations they belong to.
- **Since when and until when** it was exposed, and to whom.
- **Significant harm:** whether the breach causes or is likely to cause it, which decides the 7-day notice.

The evidence is the audit log (each organisation's `/{org}/settings/audit` and its export, [AUD-2](/docs/PRD.md#audit-and-data-rights-aud)), Cloud Logging (`gcloud logging read --project=skyclause`) and, for data that changed, a branch of the database from before the breach ([restore runbook](restore.md)).

### Notify the Commissioner

Within 72 hours of becoming aware, the breach owner notifies the Personal Data Protection Commissioner using the form, channel and content the Commissioner's current breach-notification guideline sets out. This runbook doesn't copy that form or address, because the guideline is the authority and may change. If some facts are still unknown at 72 hours, notify with what is known and say what is still being assessed.

### Notify affected people

Where the assessment finds significant harm, the breach owner notifies each affected person within 7 days after notifying the Commissioner, with the content the guideline requires. Record how many were notified and how many notices failed.

## Breach record

Keep one record per breach as a private issue in this repository, holding counts, IDs and times only, never a person's name, email address or other personal data. Close it after the last notification. One row per step:

| Time (MYT) | Step | Who | Evidence |
| ---------- | ---- | --- | -------- |

## See also

- [Incident runbook](incident.md)
- [TRD privacy and data retention](/docs/TRD.md#privacy-and-data-retention)
- [PDPA research](/docs/research/judging.md#malaysias-pdpa-and-the-2024-amendment)
