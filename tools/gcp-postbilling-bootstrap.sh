#!/usr/bin/env bash
set -euo pipefail

usage() {
  cat <<'EOF'
Usage:
  BILLING_ACCOUNT_ID=XXXXXX-XXXXXX-XXXXXX [PROJECT_ID=hrscrape2mart] \
  [REGION=europe-west1] [FIRESTORE_LOCATION=europe-west1] \
  tools/gcp-postbilling-bootstrap.sh

What it does:
  1. Sets the active gcloud project and ADC quota project.
  2. Links the project to the billing account.
  3. Enables required GCP APIs.
  4. Creates the default Firestore Native database if it does not exist yet.

What it does not do:
  - It does not edit terraform.tfvars for you.
  - It does not deploy Cloud Run.
  - It does not create Scheduler jobs until after first deploy and second terraform apply.
EOF
}

require_cmd() {
  if ! command -v "$1" >/dev/null 2>&1; then
    printf 'Missing required command: %s\n' "$1" >&2
    exit 1
  fi
}

if [[ "${1:-}" == "--help" || "${1:-}" == "-h" ]]; then
  usage
  exit 0
fi

require_cmd gcloud

PROJECT_ID="${PROJECT_ID:-hrscrape2mart}"
REGION="${REGION:-europe-west1}"
FIRESTORE_LOCATION="${FIRESTORE_LOCATION:-europe-west1}"
BILLING_ACCOUNT_ID="${BILLING_ACCOUNT_ID:-}"

if [[ -z "$BILLING_ACCOUNT_ID" ]]; then
  printf 'BILLING_ACCOUNT_ID is required.\n\n' >&2
  usage >&2
  exit 1
fi

printf '==> Setting active project to %s\n' "$PROJECT_ID"
gcloud config set project "$PROJECT_ID" >/dev/null
gcloud auth application-default set-quota-project "$PROJECT_ID" >/dev/null

printf '==> Linking billing account %s\n' "$BILLING_ACCOUNT_ID"
gcloud billing projects link "$PROJECT_ID" --billing-account="$BILLING_ACCOUNT_ID"

printf '==> Enabling required APIs in %s\n' "$PROJECT_ID"
gcloud services enable \
  run.googleapis.com \
  cloudbuild.googleapis.com \
  firestore.googleapis.com \
  cloudtasks.googleapis.com \
  secretmanager.googleapis.com \
  cloudscheduler.googleapis.com \
  bigquery.googleapis.com \
  artifactregistry.googleapis.com \
  iam.googleapis.com \
  serviceusage.googleapis.com

printf '==> Ensuring Firestore Native database exists in %s\n' "$FIRESTORE_LOCATION"
if gcloud firestore databases describe --database='(default)' >/dev/null 2>&1; then
  printf 'Firestore database already exists, skipping create.\n'
else
  gcloud firestore databases create --location="$FIRESTORE_LOCATION"
fi

cat <<EOF

Bootstrap completed for project: $PROJECT_ID

Next steps:
1. Fill these fields in infra/terraform/terraform.tfvars:
   - billing_account_id = "$BILLING_ACCOUNT_ID"
   - gas_webapp_url
   - telegram_bot_token
   - telegram_chat_id
2. Run:
   terraform -chdir=infra/terraform init
   terraform -chdir=infra/terraform apply
3. First deploy:
   gcloud builds submit --config cloudbuild.yaml \\
     --substitutions=_REGION=$REGION,_SERVICE_NAME=hrscrape2mart-cloud,_RUNTIME_SERVICE_ACCOUNT_ID=hrscrape2mart-runtime,_GAS_WEBAPP_URL='https://script.google.com/macros/s/your-webapp-id/exec' \\
     .
4. Take the real Cloud Run URL, put it into service_base_url in terraform.tfvars, then rerun:
   terraform -chdir=infra/terraform apply
EOF
