# Skyclause infrastructure

Terraform for every Google Cloud, Neon and AWS resource P1 runs on. There is one environment, `production`, in the Google Cloud project `skyclause` beside the P0 pilot, whose resources it never manages (D10 in #79). Compute and storage sit in `asia-southeast1` and the Neon database in `aws-ap-southeast-1`, both Singapore. Amazon SES sits in AWS `ap-southeast-2`, Sydney, the only region the AWS account's organisation policy allows.

Contents:

1.  [Layout](#layout)
1.  [Bootstrap](#bootstrap)
1.  [Applying](#applying)
1.  [Values set by other tickets](#values-set-by-other-tickets)
1.  [Custom hosts](#custom-hosts)
1.  [AWS email](#aws-email)

## Layout

- `bootstrap/`: the state bucket, the APIs, the `skyclause-terraform` service account that CI impersonates, and the `NEON_API_KEY` secret. A project owner applies it by hand.
- `environments/production/`: everything else. CI plans and applies it from `main`.
- `aws/`: Amazon SES sending and receiving, their SNS topics, the inbound bucket and the role `web` and `worker` assume with Google ID tokens (#113), in AWS account `776566309118`. It has its own state in S3, and a person applies it by hand.
- `modules/`: `service` (Cloud Run service), `job` (Cloud Run job with an optional schedule), `topic` (Pub/Sub topic with a push subscription to the worker) and `queue` (Cloud Tasks).
- `scripts/check-region`: fails unless every located resource in a `terraform show -json` document is in Singapore. CI runs it on each plan before applying, and `scripts/check-region.test.sh` tests it.

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

- `app_config`: the #79 §6 TF values other tickets make, such as `GOOGLE_CLIENT_ID`, `TURNSTILE_SITE_KEY`, `VAPID_PUBLIC_KEY` and the SES values. Each is set on every service and job once given.
- `supplied_secrets`: `GOOGLE_CLIENT_SECRET`, `TURNSTILE_SECRET_KEY` and `SKYCLAUSE_STAFF_EMAILS` start as empty secrets. Add a version with `gcloud secrets versions add`, then list the name here to mount it. Cloud Run fails a revision whose secret has no version. Two wizards add the versions and print the public values:
  - `infra/wizards/google-sign-in.sh` (about 25 minutes): Google Auth Platform branding and the Web OAuth client (`GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`), and the app host's Turnstile widget (`TURNSTILE_SITE_KEY`, `TURNSTILE_SECRET_KEY`).
  - `infra/wizards/staff-and-ses.sh` (about 5 minutes): `SKYCLAUSE_STAFF_EMAILS`, then, optionally, SES sandbox verification of the team addresses.
- `vapid_private_key_ready`: set to `true` once #113's `vapid-keys` job has created `VAPID_PRIVATE_KEY`. A person runs the job once, after #90's first deploy has put the real image on it, and copies the public key it logs into `app_config` as `VAPID_PUBLIC_KEY` (5 minutes). A second run changes nothing, and the key never rotates by itself, since rotating drops every push subscription:

  ```shell
  gcloud run jobs execute vapid-keys --region=asia-southeast1 --project=skyclause --wait
  gcloud logging read 'resource.type="cloud_run_job" AND resource.labels.job_name="vapid-keys" AND jsonPayload.message="vapid public key"' \
    --project=skyclause --limit=1 --format='value(jsonPayload.VAPID_PUBLIC_KEY)'
  ```

## Custom hosts

`skyclause.m1ku.tech`, `app.`, `api.`, `mcp.`, `embed.` and `docs.` map to `web` through Cloud Run domain mappings.

1.  A person verifies `skyclause.m1ku.tech` as a Domain property in Google Search Console, choosing the CNAME record, and adds `skyclause-terraform@skyclause.iam.gserviceaccount.com` as an owner. A record at the `m1ku.tech` apex is never used. `infra/wizards/search-console.sh` walks through it in about 15 minutes and writes the CNAME itself.
1.  Set `map_domains = true`. After the apply, `terraform output dns_records` lists each host's records; create them in Cloudflare with `proxied: false` and the comment `owner: skyclause`. For a CNAME or TXT, `bun scripts/cloudflare-record.ts [--dry-run] <CNAME|TXT> <name> <content>` does that with `M1KU_CLOUDFLARE_API_TOKEN`, and refuses any name outside `skyclause.m1ku.tech` and any record not commented `owner: skyclause`.
1.  Once each certificate is active, set `host_mode = "multi"` and the six `origins`. Until then every origin is the `web` URL.

## AWS email

A person with AWS access to account `776566309118` applies `aws/` after the production apply has created `skyclause-web` and `skyclause-worker` and a worker revision with `/ses/inbound` is live (about 30 minutes plus DNS propagation). Pass `--region ap-southeast-2` to every `aws` command, since the CLI's default region may differ.

1.  Create the state bucket once. New buckets already block public access and encrypt objects:

    ```shell
    aws s3api create-bucket --bucket skyclause-tfstate-776566309118 --region ap-southeast-2 \
      --create-bucket-configuration LocationConstraint=ap-southeast-2
    aws s3api put-bucket-versioning --bucket skyclause-tfstate-776566309118 --region ap-southeast-2 \
      --versioning-configuration Status=Enabled
    ```

1.  `aws/terraform.tfvars` holds `google_service_account_ids`, each account's `uniqueId`. Recreating either account changes its ID, and the role refuses it until this is updated in a pull request and applied again:

    ```shell
    gcloud iam service-accounts describe skyclause-web@skyclause.iam.gserviceaccount.com \
      --project=skyclause --format='value(uniqueId)'
    gcloud iam service-accounts describe skyclause-worker@skyclause.iam.gserviceaccount.com \
      --project=skyclause --format='value(uniqueId)'
    ```

1.  Apply it. This also activates the receipt rule set, the only one in the region:

    ```shell
    terraform -chdir=infra/aws init
    terraform -chdir=infra/aws apply
    ```

1.  Enter the records from `terraform -chdir=infra/aws output dns_records` in Cloudflare with `proxied: false` and the comment `owner: skyclause` (#118). The DKIM values assume SES signs from `dkim.amazonses.com`, which Terraform can't read yet; first check that each identity prints it, and use the printed zone if it differs:

    ```shell
    for identity in notices.skyclause.m1ku.tech in.skyclause.m1ku.tech; do
      aws sesv2 get-email-identity --email-identity "$identity" --region ap-southeast-2 \
        --query DkimAttributes.SigningHostedZone --output text
    done
    ```

1.  Check that DKIM and MAIL FROM read `SUCCESS` for `notices.`, and DKIM for `in.`:

    ```shell
    aws sesv2 get-email-identity --email-identity notices.skyclause.m1ku.tech --region ap-southeast-2 \
      --query '[DkimAttributes.Status, MailFromAttributes.MailFromDomainStatus]'
    aws sesv2 get-email-identity --email-identity in.skyclause.m1ku.tech --region ap-southeast-2 \
      --query DkimAttributes.Status
    ```

1.  Check the subscriptions with `aws sns list-subscriptions-by-topic --region ap-southeast-2 --topic-arn <arn>` for both topic ARNs in the `app_config` output. The worker confirms each when its handler is live: `/ses/inbound` here, `/ses/events` with #158. If one still reads `PendingConfirmation` after its handler is live, send the confirmation again with `terraform -chdir=infra/aws apply -replace=aws_sns_topic_subscription.<inbound or ses_events>`.
1.  Copy the `app_config` output into `app_config` in `environments/production/terraform.tfvars` in a pull request.
1.  While `aws sesv2 get-account --region ap-southeast-2` shows `ProductionAccessEnabled: false`, SES delivers only to verified addresses, so live checks use team addresses verified with `infra/wizards/staff-and-ses.sh`. Mail to anyone else fails with `MessageRejected` until SES production access is granted (#118).
1.  Turn on `inbound_email` with the audited `flag:set` script (#92).
