# Incident runbook

What the platform on-call does from a page to the written summary, with the clocks each step must meet. The targets are TRD's [observability and SLOs](/docs/TRD.md#observability-and-slos); a personal-data breach also follows the [breach runbook](breach.md).

Contents:

1.  [Incident clocks and owners](#incident-clocks-and-owners)
1.  [Incident steps](#incident-steps)
    1.  [Page](#page)
    1.  [Acknowledge](#acknowledge)
    1.  [Open the status incident](#open-the-status-incident)
    1.  [Mitigate](#mitigate)
    1.  [Update hourly](#update-hourly)
    1.  [Resolve](#resolve)
    1.  [Write the summary](#write-the-summary)
1.  [Error budgets and DEPLOY_FREEZE](#error-budgets-and-deploy_freeze)
1.  [See also](#see-also)

## Incident clocks and owners

| Clock                            | Limit                             | Starts at                    | Owner                                                              |
| -------------------------------- | --------------------------------- | ---------------------------- | ------------------------------------------------------------------ |
| Acknowledge the page             | 15 minutes in P1, 5 minutes in P2 | The page                     | On-call primary `kymil4`; then the on-call secondary `AlaskanTuna` |
| Open the `/status` incident      | 15 minutes                        | A page that affects users    | Whoever acknowledged                                               |
| Update the `/status` incident    | At least hourly                   | The last update              | Whoever acknowledged                                               |
| Post the summary                 | 5 working days                    | Resolution                   | Whoever acknowledged                                               |
| Notify the Commissioner (breach) | 72 hours                          | Becoming aware of the breach | Breach owner `kymil4`; then the breach deputy `AlaskanTuna`        |
| Notify affected people (breach)  | 7 days                            | Notifying the Commissioner   | Breach owner `kymil4`; then the breach deputy `AlaskanTuna`        |

The on-call primary and secondary are named in the [on-call runbook](on-call.md). The breach owner and deputy are named in the [breach runbook](breach.md#breach-owner-and-deputy); both clocks and their source are under [breach clocks](breach.md#breach-clocks).

## Incident steps

Keep a timeline in MYT (UTC+8) from the first page; the summary is built from it.

### Page

Cloud Monitoring pages the on-call primary by push and SMS ([#114](https://github.com/m1kulabs/Skyclause/issues/114)). A report from a user, a customer or a teammate counts as a page: the person who receives it pages the primary.

### Acknowledge

The primary acknowledges within 15 minutes in P1 (5 minutes from P2). If nobody has acknowledged by then, the secondary is paged and owns the incident once they acknowledge. Whoever acknowledges is the incident lead until they hand over by name.

Then decide:

- **Does it affect users?** If so, open the status incident next.
- **Could personal data be exposed, changed or lost?** If so, tell the breach owner now and follow the [breach runbook](breach.md) alongside this one; its clocks start when Skyclause becomes aware.

### Open the status incident

Within 15 minutes of a page that affects users, open an incident on `/status` ([PUB-6](/docs/PRD.md#public-pages-pub)) at `/admin/incidents` ([#187](https://github.com/m1kulabs/Skyclause/issues/187)). Only staff can, so every on-call person must be on the staff list, `SKYCLAUSE_STAFF_EMAILS` ([on-call](on-call.md#on-call-access)). Name the affected component (app, API, MCP, a poller or notice delivery) and what users see; an upstream source outage is a source incident, not ours.

### Mitigate

Restore service before finding the cause:

- A bad release: [roll back](rollback.md) to the previous revision.
- Damaged or deleted data: [restore](restore.md) from Neon's 6-hour window.
- The database suspended because the month's Neon allowance ran out: the database stays down until the month ends or the plan is upgraded ([#220](https://github.com/m1kulabs/Skyclause/issues/220)); tell the product lead.

### Update hourly

Post an update on the `/status` incident at least every hour until it is resolved, even if nothing changed: say what is known, what is being tried and when the next update is due.

### Resolve

Resolve the `/status` incident once the component is back and has stayed back, and note the resolution time.

### Write the summary

Within 5 working days of resolution, post the summary on the `/status` incident: what users saw, from when to when in MYT, the cause, what fixed it and what will stop it recurring. File each follow-up as a GitHub issue and link them. A summary never names a person outside the team or holds personal data.

## Error budgets and DEPLOY_FREEZE

When a 30-day error budget is spent, feature deploys touching that path stop until it recovers; fixes still ship ([TRD observability and SLOs](/docs/TRD.md#observability-and-slos)).

1.  Set the freeze. `DEPLOY_FREEZE` is a repository variable, and while it is `true` every deploy and Terraform apply from `main` is skipped with a notice:

    ```shell
    gh variable set DEPLOY_FREEZE --body true --repo m1kulabs/Skyclause
    ```

1.  Hold feature pull requests that touch the path: don't merge them until the budget recovers.
1.  Ship a fix: merge it, then dispatch `deploy` on `main` with `override_freeze`, which deploys it while the freeze stays on:

    ```shell
    gh workflow run deploy.yml --ref main -f override_freeze=true --repo m1kulabs/Skyclause
    ```

    The `terraform` workflow has no override: for an infrastructure fix, clear the freeze, dispatch `terraform` on `main` and set the freeze again once it has applied.

1.  Once the budget has recovered, clear the freeze and say so in the incident summary.

The freeze isn't per path: a fix's deploy ships whatever else `main` holds, which is why feature merges on the frozen path wait.

## See also

- [On-call runbook](on-call.md)
- [Breach runbook](breach.md)
- [Rollback runbook](rollback.md)
- [Restore runbook](restore.md)
