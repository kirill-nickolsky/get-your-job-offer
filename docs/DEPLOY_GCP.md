# GCP Deploy

## Current Scope (as of 2026-03-20)
- Addon can poll Cloud Run `/scrape-plan` and post `/scrape-result`.
- Cloud backend persists jobs/runs in Firestore and runs async stages:
  `normalize -> enrich -> rate -> notify -> sync-sheets -> stats-refresh`.
- Source configs are synced from GAS `ScrapeSources` into Firestore via `/internal/sync-source-configs`.
- Telegram webhook, bot job list, apply actions, today stats, and a lightweight Mini App UI already exist in `cloud/src/routes/*`.
- Current cloud rating is `rule-based` by default.
  `gemini` and `gas-fallback` providers are still stubs, not real integrations.
- Local cloud mode supports only fake Telegram session bootstrap (`/session/telegram` with `mode=fake`).
- Default Cloud Run rollout profile is conservative:
  `max-instances=1`, `concurrency=10`, `SCRAPE_PLAN_DAILY_CAP=24`,
  `TASK_ENQUEUE_DAILY_CAP=200`, `NOTIFY_DAILY_CAP=20`.
- Terraform now includes a billing budget scaffold and optional email notification channels.

## Prerequisites
- Enable billing for the GCP project.
- Enable APIs once: Cloud Run, Cloud Build, Firestore, Cloud Tasks, Secret Manager, Cloud Scheduler, BigQuery.
- Create Firestore in Native mode once in the target project.
- Install `gcloud` locally or run the same commands in CI.

## Fast Path After Billing Activation
Once the billing account is active, you can bootstrap the project with one command:

```bash
BILLING_ACCOUNT_ID=XXXXXX-XXXXXX-XXXXXX \
PROJECT_ID=hrscrape2mart \
REGION=europe-west1 \
FIRESTORE_LOCATION=europe-west1 \
./tools/gcp-postbilling-bootstrap.sh
```

This script will:
- set the active `gcloud` project
- link the project to the billing account
- enable the required APIs
- create the default Firestore Native database if it does not exist yet

It does not replace Terraform or Cloud Build.
You still need to fill `infra/terraform/terraform.tfvars`, run `terraform apply`,
deploy Cloud Run, then rerun `terraform apply` after the real `service_base_url`
is known.

## 1. Bootstrap infra (pass 1)
```bash
cd infra/terraform
cp terraform.tfvars.example terraform.tfvars
terraform init
terraform apply
```

What Terraform creates:
- runtime service account for Cloud Run
- Cloud Tasks queues (`vacancy-normalize`, `vacancy-enrich`, `vacancy-rate`, `vacancy-notify`, `sync-sheets`, `stats-refresh`)
- Cloud Scheduler jobs for source sync and daily stats (only when `service_base_url` is set)
- Firestore indexes
- BigQuery dataset/tables scaffold
- optional Monitoring email channels plus a billing budget for the selected project
- Secret Manager secrets and first versions

Important:
- In the current repo Terraform does **not** create the Cloud Run service itself.
- `service_base_url` can be left empty on the first apply.
  In that case Cloud Scheduler jobs are skipped until the real Cloud Run URL is known.
- Billing budget alerts are notifications only.
  They do **not** auto-stop Cloud Run, Firestore, or Cloud Tasks usage.

## 2. Deploy Cloud Run
From repo root:
```bash
gcloud builds submit --config cloudbuild.yaml \
  --substitutions=_REGION=europe-west1,_SERVICE_NAME=hrscrape2mart-cloud,_RUNTIME_SERVICE_ACCOUNT_ID=hrscrape2mart-runtime,_GAS_WEBAPP_URL='https://script.google.com/macros/s/your-webapp-id/exec' \
  .
```

Cloud Build will:
- build the image from `cloud/`
- deploy Cloud Run
- read the real Cloud Run URL
- update `SERVICE_BASE_URL` on the service
- configure Cloud Run for Firestore + Cloud Tasks + real Telegram mode
- use HMAC addon auth and shared-token task auth in the current deployment profile

## 3. Bootstrap infra (pass 2)
After the first successful deploy, take the real Cloud Run URL and rerun Terraform with:

- `service_base_url = "https://...a.run.app"`

Then:
```bash
cd infra/terraform
terraform apply
```

This second apply is what actually creates the Cloud Scheduler jobs against the real service URL.

## 4. Addon and Sheets settings
In Google Sheets `Settings` set:
- `CloudBackendUrl` = Cloud Run URL
- `CloudBackendToken` = the same value as `addon_hmac_secret`
- `CloudPollMinutes` = `5`
- `CloudMaxPlanCommands` = `1` or `2`

In `ScrapeSources` make sure these planner columns exist and are populated as needed:
- `Priority`
- `MinIntervalMin`
- `RetryLimit`
- `RetryBackoffMin`
- `DailySuccessCap`
- `ScrapePageUrl`
- `MaxTabsPerSite`

`appsscript/ScrapeSources.gs` now auto-expands the sheet header to include them.

## 5. Local pre-deploy smoke
```bash
cd cloud
npm install
npm run typecheck
npm run build
npm run smoke:e2e
npm run smoke:bot
```

Recommended local env for smoke/dev:
- `DATA_BACKEND=memory`
- `TASKS_INLINE=true`
- `TELEGRAM_MODE=fake`
- `ALLOW_FAKE_TELEGRAM_SESSION=true`

## 6. Smoke checks
```bash
curl "$CLOUD_RUN_URL/health"
```

Expected:
```json
{"ok":true,"service":"hrscrape2mart-cloud"}
```

Useful manual checks:
- `POST /internal/sync-source-configs` with `x-task-token`
- `GET /miniapp`
- `POST /telegram/webhook` with valid `x-telegram-bot-api-secret-token`

## Current limitations
- `SERVICE_BASE_URL` is set automatically by `cloudbuild.yaml`.
- Addon auth defaults to HMAC (`ADDON_AUTH_MODE=hmac`) and uses `addon_hmac_secret`.
- Internal task calls still use shared token auth (`x-task-token`) in this version.
- Notification fan-out is not implemented yet: `notify` sends to one configured `TELEGRAM_CHAT_ID`.
- `session/telegram` only implements fake local sessions, not real Telegram Mini App auth.
- `sync-sheets` still depends on `GAS_WEBAPP_URL`; cloud mode is not a Sheets replacement yet.
- Daily rollout caps are best-effort app guards, not a hard billing guarantee.
