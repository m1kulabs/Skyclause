# Skyclause infrastructure

Terraform for every Google Cloud and Neon resource P1 runs on, and one unused AWS root that awaits teardown. There is one environment, `production`, in the Google Cloud project `skyclause` beside the P0 pilot, whose resources it never manages (D10 in #79). Compute and storage sit in `asia-southeast1` and the Neon database in `aws-ap-southeast-1`, both Singapore. Resend carries all email, with its sending and receiving domains in Tokyo (`ap-northeast-1`), the nearest Resend region to Malaysia.

Contents:

1.  [Layout](#layout)
1.  [Bootstrap](#bootstrap)
1.  [Applying](#applying)
1.  [Values set by other tickets](#values-set-by-other-tickets)
1.  [Monitoring](#monitoring)
1.  [Custom hosts](#custom-hosts)
1.  [Email on Resend](#email-on-resend)

## Layout

- `bootstrap/`: the state bucket, the APIs, the `skyclause-terraform` service account that CI impersonates, the `NEON_API_KEY` secret and the project's monthly budget alert (RM40, gate 2's US$10), so CI holds no billing role. A project owner who can manage the billing account's budgets applies it by hand, and again whenever it changes.
- `environments/production/`: everything else. CI plans and applies it from `main`.
- `aws/`: the Amazon SES, SNS and S3 stack mail ran on before Resend, with the role `web` and `worker` assumed with Google ID tokens (#113), in AWS account `776566309118`. It has its own state in S3. Nothing reads it any more and nobody applies it; the teardown (#661) destroys it from that state and deletes the directory.
- `modules/`: `service` (Cloud Run service), `job` (Cloud Run job with an optional schedule), `topic` (Pub/Sub topic with a push subscription to the worker) and `queue` (Cloud Tasks).
- `scripts/check-region`: fails unless every located resource in a `terraform show -json` document is in Singapore. CI runs it on each plan before applying, and `scripts/check-region.test.sh` tests it.
- `wizards/production-pilot.sh`: walks the repository owner through the human-only production pilot steps of #194, #531, #534, #536, #539 and #622. It only reads, through the product's API with a `read` key, `gcloud` lists and, when `RESEND_FULL_ACCESS_KEY` is exported, Resend's domain and webhook lists; every write is the person's, in the browser or printed for them to run. It records evidence in the git-ignored `infra/wizards/production-pilot.evidence.md` and refuses any section that holds a credential or an email address.

## Bootstrap

A `skyclause` owner runs this once, in about 30 minutes, after P0's WIF provider exists (#48). CI binds to that provider's `google.subject`, so the provider must map `google.subject` to `assertion.sub`.

1.  Sign in for Terraform with `gcloud auth application-default login`.
1.  Create the state bucket. The bootstrap stores its own state in it and then adopts it:

    ```shell
    gcloud storage buckets create gs://skyclause-production-tfstate --project=skyclause \
      --location=asia-southeast1 --uniform-bucket-level-access --public-access-prevention
    ```

1.  Apply the bootstrap:

    ```shell
    terraform -chdir=infra/bootstrap init
    terraform -chdir=infra/bootstrap apply
    ```

1.  Store a Neon API key without echoing it:

    ```shell
    read -rs NEON_API_KEY && printf '%s' "$NEON_API_KEY" |
      gcloud secrets versions add NEON_API_KEY --project=skyclause --data-file=-
    ```

The database runs on Neon's Free plan: 100 CU-hours a month at a fixed 0.25 CU, a compute that sleeps after 5 idle minutes, and a 6-hour restore window.

## Applying

A push to `main` that touches `infra/**`, or a dispatch of the `terraform` workflow on `main`, plans `environments/production`, runs the region check on the plan and applies it. The run is skipped with a notice while the repository variable `DEPLOY_FREEZE` is `true`.

To plan by hand, with your own credentials:

```shell
export NEON_API_KEY="$(gcloud secrets versions access latest --secret=NEON_API_KEY --project=skyclause)"
terraform -chdir=infra/environments/production init
terraform -chdir=infra/environments/production plan
```

## Values set by other tickets

Set these in a pull request, in `environments/production/terraform.tfvars`, which Terraform loads by itself. `variables.tf` describes and validates each one.

- `app_config`: the #79 §6 TF values other tickets make, such as `GOOGLE_CLIENT_ID`, `TURNSTILE_SITE_KEY`, `VAPID_PUBLIC_KEY`, the two mail sender addresses and the inbound domain. Each is set on every service and job once given, except the mail values, which reach only the services whose Resend secrets are supplied and never a job ([Email on Resend](#email-on-resend)).
- `supplied_secrets`: `GOOGLE_CLIENT_SECRET`, `TURNSTILE_SECRET_KEY`, `SKYCLAUSE_STAFF_EMAILS`, `RESEND_SENDING_API_KEY`, `RESEND_RECEIVING_API_KEY` and `RESEND_WEBHOOK_SECRET` start as empty secrets. Add a version with `gcloud secrets versions add`, then list the name here to mount it. Cloud Run fails a revision whose secret has no version. List the three Resend secrets together or not at all: Terraform refuses a part-set at plan time. Three wizards add the versions and print the public values:
  - `infra/wizards/google-sign-in.sh` (about 25 minutes): Google Auth Platform branding and the Web OAuth client (`GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`), and the app host's Turnstile widget (`TURNSTILE_SITE_KEY`, `TURNSTILE_SECRET_KEY`).
  - `infra/wizards/staff-emails.sh` (about 2 minutes): `SKYCLAUSE_STAFF_EMAILS`.
  - `infra/wizards/resend.sh` (about 20 minutes, see [Email on Resend](#email-on-resend)): `RESEND_SENDING_API_KEY`, `RESEND_RECEIVING_API_KEY` and `RESEND_WEBHOOK_SECRET`.
- `vapid_private_key_ready`: set to `true` once #113's `vapid-keys` job has created `VAPID_PRIVATE_KEY`. A person runs the job once, after #90's first deploy has put the real image on it, and copies the public key it logs into `app_config` as `VAPID_PUBLIC_KEY` (5 minutes). A second run changes nothing, and the key never rotates by itself, since rotating drops every push subscription:

  ```shell
  gcloud run jobs execute vapid-keys --region=asia-southeast1 --project=skyclause --wait
  gcloud logging read 'resource.type="cloud_run_job" AND resource.labels.job_name="vapid-keys" AND jsonPayload.message="vapid public key"' \
    --project=skyclause --limit=1 --format='value(jsonPayload.VAPID_PUBLIC_KEY)'
  ```

## Pilot archive

After 17 November a pilot team member with Sheets, Jira and Gemini Enterprise access exports the Sheets ledger, the Jira register and the run traces, uploads each to `incoming/` in the archive bucket with its `kind` (`sheets_ledger`, `jira_register` or `run_traces`) and its capture time, then runs the `pilot-archive` job once (about 1 hour, #79 §9 item 11). The job refuses the run if any object lacks a valid `kind` or `captured-at`. It copies each file to `orgs/{org_id}/pilot/{kind}/{sha256}-{name}`, records it for `PILOT_PROJECT` and writes no ledger entry (LED-8); a second run changes nothing:

```shell
gcloud storage cp ledger.csv gs://skyclause-production-archive/incoming/ \
  --custom-metadata=kind=sheets_ledger,captured-at=2026-11-17T18:00:00+08:00
gcloud run jobs execute pilot-archive --region=asia-southeast1 --project=skyclause --wait
```

## Monitoring

`environments/production/monitoring.tf` holds #114's uptime checks, SLOs and alert policies. Every policy opens an incident in the Cloud Monitoring console and notifies nobody, since no notification channel exists; the on-call primary watches the incidents page ([on-call runbook](/docs/runbooks/on-call.md)).

- **Availability:** an uptime check every minute on `/health` of each distinct app, API and MCP origin, one while `HOST_MODE=single`, with a 99.5% 30-day SLO and fast- and slow-burn pages.
- **Jobs:** a page on any failed Cloud Run job execution.
- **Pipeline:** a PromQL page per TRD SLI row, on the `breach` stat the worker's `sli` handler records each batch, and one per absent heartbeat (`auditor`, `minute_tick`). Each starts disabled; once its metric has flowed for a day, check its query in Metrics Explorer and set its `enabled` to `true`.

## Custom hosts

`skyclause.m1ku.tech`, `app.`, `api.`, `mcp.`, `embed.` and `docs.` map to `web` through Cloud Run domain mappings.

1.  A person verifies `skyclause.m1ku.tech` as a Domain property in Google Search Console, choosing the CNAME record, and adds `skyclause-terraform@skyclause.iam.gserviceaccount.com` as an owner. A record at the `m1ku.tech` apex is never used. `infra/wizards/search-console.sh` walks through it in about 15 minutes and writes the CNAME itself.
1.  Set `map_domains = true`. After the apply, `terraform output dns_records` lists each host's records; create them in Cloudflare with `proxied: false` and the comment `owner: skyclause`. For a CNAME, TXT or MX (content `<priority> <host>`), `bun scripts/cloudflare-record.ts [--dry-run] <CNAME|TXT|MX> <name> <content>` does that with `M1KU_CLOUDFLARE_API_TOKEN`, and refuses any name outside `skyclause.m1ku.tech` and any record not commented `owner: skyclause`.
1.  Once each certificate is active, set `host_mode = "multi"` and the six `origins`. Until then every origin is the `web` URL.

## Email on Resend

Resend sends, tracks and receives all of Skyclause's email. Its Free plan allows 100 emails a day and 3,000 a month (sent and received both count), 3 domains, 1 webhook endpoint and 10 requests a second, and an address on a verified domain needs no per-address setup. Resend has no Terraform provider, so Terraform holds only the secrets and `infra/wizards/resend.sh` does the rest.

- **Domains**, both in Tokyo (`ap-northeast-1`) with open and click tracking off: `notices.skyclause.m1ku.tech` sends (the two senders in `app_config`) and `in.skyclause.m1ku.tech` only receives (`INBOUND_DOMAIN`).
- **Secrets**, empty Secret Manager containers that Terraform makes and the wizard fills: `RESEND_SENDING_API_KEY` is a key that can only send, and only from `notices.` (web and worker); `RESEND_RECEIVING_API_KEY` is a full-access key the worker reads received mail with; `RESEND_WEBHOOK_SECRET` is the webhook's signing secret. The last two are the worker's alone. Each mounts once `supplied_secrets` lists it, and the three are listed together or not at all.
- **Webhook**, one endpoint: the worker's public URL plus `/resend/webhook`, subscribed to `email.delivered`, `email.bounced`, `email.complained`, `email.suppressed` and `email.received`. The worker is public for this route alone, and checks Resend's Svix signature in place of Google OIDC.

A service refuses to start with only some of its mail settings, so Terraform gives them out by group. The two sender addresses reach web and the worker only when `RESEND_SENDING_API_KEY` is in `supplied_secrets`, and `INBOUND_DOMAIN` reaches the worker only when `RESEND_RECEIVING_API_KEY` and `RESEND_WEBHOOK_SECRET` both are. Until then no service has any mail setting or mail secret, which is valid for the old image and the new one, and mail is off. No Cloud Run job ever gets a mail setting or a mail secret, `kms-rewrap` included. The addresses and the domain stay committed in `app_config`; only their delivery is conditional (`terraform test` in `environments/production` checks it).

The cutover order:

1.  Merge and deploy as usual. The secrets are empty, so mail is off from the deploy of this change until step 4: nothing is sent or received in between.
1.  Run the wizard below (about 20 minutes, plus Resend's DNS check, which usually takes up to 15 minutes). The production apply must have made the three secrets and the worker. It needs `gcloud` signed in as a `skyclause` owner, `bun`, `M1KU_CLOUDFLARE_API_TOKEN` in the shell, and a full-access Resend API key, which Resend shows once when you create it at <https://resend.com/api-keys>: export it as `RESEND_FULL_ACCESS_KEY` or paste it at the hidden prompt. The key is never written to disk, and becomes `RESEND_RECEIVING_API_KEY`.
1.  Commit the `supplied_secrets` line the wizard prints in `environments/production/terraform.tfvars`, in a pull request.
1.  The next apply turns mail on: Terraform mounts the three secrets and gives the services their sender addresses and the worker its inbound domain.
1.  Check with a real send, a bounce and an inbound reply. Until the Free plan is upgraded, the 100-a-day limit is the known limit that replaces the old SES sandbox. Then turn on `inbound_email` with the audited `flag:set` script (#92) if it is off.

```shell
M1KU_CLOUDFLARE_API_TOKEN=... ./infra/wizards/resend.sh
```

In order, the wizard:

1.  Checks its tools and the Cloudflare token, that the three secrets exist and the worker's URL, and takes the key. It refuses a key that can only send.
1.  Creates `notices.` (sending on, receiving off) and `in.` (sending off, receiving on) in `ap-northeast-1` with tracking off, or finds them and puts any difference right. A domain in another region stops it, because Resend can't move one.
1.  Reads the DNS records Resend returns for both domains and enters them in Cloudflare with `bun scripts/cloudflare-record.ts` (DNS only, comment `owner: skyclause`). Names, values and MX priorities are Resend's answer, since newer domains may get CNAME sending records and the receiving MX host varies. It also rewrites `_dmarc.notices.skyclause.m1ku.tech` to `v=DMARC1; p=quarantine`, without the report address. It dry-runs every record first, shows what would change and asks once. Besides that DMARC record, the only existing record it changes is the MX at `in.`, so mail to `in.` stops reaching SES from that point.
1.  Asks Resend to verify each domain and waits (Resend allows up to 72 hours).
1.  Creates the webhook with its five events, or finds it and puts its events and status right, and stores its signing secret as `RESEND_WEBHOOK_SECRET`.
1.  Creates the sending-only key for `notices.` and stores it as `RESEND_SENDING_API_KEY`. Resend shows a token only once, so a key whose token isn't stored is deleted and made again after a yes.
1.  Stores the full-access key as `RESEND_RECEIVING_API_KEY`, and prints the `supplied_secrets` line to commit.

Every step reads before it writes, so a re-run changes nothing that is already right, and a secret whose stored value differs is replaced only after a yes. Its closing message says the same as step 1: mail stays off until the printed line is committed and applied.

`./infra/wizards/production-pilot.sh` later reads both Resend domains' status and the webhook's status, with `RESEND_FULL_ACCESS_KEY` exported.

The wizard touches no SES record: Resend's records sit under other names (`resend._domainkey.…` and its own return-path name), so both providers' records coexist until the teardown (#661). That ticket destroys `aws/` from its state, then deletes the directory, its CI steps, the SES DNS records and this paragraph.

## Source jobs and buffered ingestion

`catalogue-sync` runs daily at 01:10 Asia/Kuala_Lumpur; `adapter-contracts` runs at 01:40. Both use the existing jobs identity and shared source configuration. An empty adapter registry reports zero adapters. Each real adapter ticket adds its own schedule and deployed image; this core does not substitute test data.

The worker's existing authenticated `/ticks/batch` route pulls `poll-results-worker`, verifies each immutable GCS result, persists requests and readings, emits tenant events, and publishes `readings-updated` before acknowledging. It then refreshes `control/plan.json` in `SOURCES_BUCKET`. Failed results remain unacknowledged; inspect worker error logs and repair their cause before redelivery. The subscription has no push endpoint. Polling uses the GCS plan, public HTTP and Pub/Sub without opening Postgres.

After deploying the worker image and applying infrastructure, operators can run the daily jobs manually:

```shell
gcloud run jobs execute catalogue-sync --region=asia-southeast1 --project=skyclause --wait
gcloud run jobs execute adapter-contracts --region=asia-southeast1 --project=skyclause --wait
gcloud scheduler jobs run ticks-batch --location=asia-southeast1 --project=skyclause
```

Set `app_config.ADAPTER_USER_AGENT` to the required upstream identification string; the runtime uses that configured value without a hardcoded override. Source execution validates `SOURCES_BUCKET`, `SCRATCH_BUCKET`, `GCP_PROJECT`, `ADAPTER_USER_AGENT` and `SOURCE_RESULTS_SUBSCRIPTION` when called. Unrelated worker routes and jobs can import the registry without source configuration or credentials.

The generic entrypoint is `node main.js job adapter <registered-kind> [--scheduled-at <ISO-instant>]`. Manual invocations retain a null scheduled slot. The current Scheduler-to-Cloud-Run job module cannot forward its dynamic scheduled time; #125's minute handler can pass the original slot to exported `runAdapter(kind, scheduledAt)`. Production dispatch-lag evidence remains unverified until that route supplies the real scheduled slot. Never use the execution clock as a replacement.

Before release, run `terraform fmt -check -recursive infra` and `terraform -chdir=infra/environments/production validate` against initialized providers. Live GCS generation checks, Pub/Sub replay, deployed IAM, real adapter contract results and the Skyflow beta journey require a separate deployment verification; offline doubles do not establish those results.
