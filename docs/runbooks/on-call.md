# On-call runbook

Who carries the platform pager, what they need before their shift and how they hand over. The platform rota is separate from the approver rotas projects keep for their calls ([TRD observability and SLOs](/docs/TRD.md#observability-and-slos)).

Contents:

1.  [On-call rota](#on-call-rota)
1.  [On-call access](#on-call-access)
1.  [On-call duties](#on-call-duties)
1.  [On-call handover](#on-call-handover)
1.  [See also](#see-also)

## On-call rota

| Role      | Name          | Carries                                                                                 |
| --------- | ------------- | --------------------------------------------------------------------------------------- |
| Primary   | `kymil4`      | Every Cloud Monitoring page; acknowledges within 15 minutes in P1 and 5 minutes from P2 |
| Secondary | `AlaskanTuna` | Pages the primary hasn't acknowledged in time                                           |

Names are GitHub handles, named by the product lead on 6 November 2026. Phone numbers and email addresses are in the Secret Manager secret `ONCALL_CONTACTS` (`gcloud secrets versions access latest --secret=ONCALL_CONTACTS --project=skyclause`), never in this repository.

The breach owner and deputy are separate roles, named in the [breach runbook](breach.md#breach-owner-and-deputy); the same people hold them today.

## On-call access

Check each before the shift starts:

- **Paging:** the Cloud Monitoring app installed and signed in, with push and SMS notifications on ([#114](https://github.com/m1kulabs/Skyclause/issues/114)).
- **Staff list:** your sign-in email is in `SKYCLAUSE_STAFF_EMAILS`, so you can open `/status` incidents at `/admin/incidents`. An owner adds it with `gcloud secrets versions add SKYCLAUSE_STAFF_EMAILS --project=skyclause --data-file=-`, and it takes effect on the next deploy.
- **Google Cloud:** `gcloud auth login` works and you can run `gcloud run services list --project=skyclause --region=asia-southeast1`; rolling back needs `roles/run.developer` on the project ([rollback runbook](rollback.md)).
- **Neon:** you can sign in to the Neon Console for the `skyclause-production` project, which a restore needs ([restore runbook](restore.md)).
- **GitHub:** you can set the repository variable `DEPLOY_FREEZE` ([incident runbook](incident.md#error-budgets-and-deploy_freeze)).

## On-call duties

- Acknowledge every page within the limit and follow the [incident runbook](incident.md).
- Tell the breach owner at once about anything that could have exposed, changed or lost personal data ([breach runbook](breach.md)).
- Log each quarter's scheduled restore drill result in the [drill log](restore.md#drill-log) if it ran on your shift.

## On-call handover

At each handover, the outgoing primary tells the incoming one, in writing:

- Open incidents and their next update time.
- Whether `DEPLOY_FREEZE` is set, and why.
- Anything that paged and was silenced or left to recover.

## See also

- [Incident runbook](incident.md)
- [Breach runbook](breach.md)
