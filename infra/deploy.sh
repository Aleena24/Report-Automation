#!/usr/bin/env bash
# One-shot, idempotent deployment of the Daily Reports app to Google Cloud:
#   Firestore (database) · Cloud Run service (React PWA + API, sign-in via Identity-Aware Proxy)
#   · Cloud Run job (scheduled batches) · Cloud Scheduler (09:00, 09:35, 17:30 IST) · IAM
# Usage:  ./infra/deploy.sh            (needs: gcloud logged in as a project owner/editor)
set -euo pipefail
cd "$(dirname "$0")/.."
source infra/config.sh

step() { printf '\n\033[1;34m» %s\033[0m\n' "$*"; }
exists() { "$@" >/dev/null 2>&1; }

step "Project $PROJECT_ID ($PROJECT_NUMBER) · region $REGION"
gcloud config set project "$PROJECT_ID" >/dev/null

step "Enabling APIs"
gcloud services enable run.googleapis.com cloudbuild.googleapis.com artifactregistry.googleapis.com firestore.googleapis.com \
  cloudscheduler.googleapis.com iap.googleapis.com sheets.googleapis.com gmail.googleapis.com secretmanager.googleapis.com \
  iamcredentials.googleapis.com --quiet

step "Firestore database '$FIRESTORE_DB'"
if ! exists gcloud firestore databases describe --database="$FIRESTORE_DB"; then
  gcloud firestore databases create --database="$FIRESTORE_DB" --location="$REGION" --type=firestore-native --quiet
fi

step "Service accounts"
exists gcloud iam service-accounts describe "$APP_SA" || gcloud iam service-accounts create "$APP_SA_NAME" --display-name="Daily Reports app" --quiet
exists gcloud iam service-accounts describe "$SCHED_SA" || gcloud iam service-accounts create "$SCHED_SA_NAME" --display-name="Daily Reports scheduler" --quiet
for role in roles/datastore.user roles/logging.logWriter roles/secretmanager.secretAccessor; do
  gcloud projects add-iam-policy-binding "$PROJECT_ID" --member="serviceAccount:$APP_SA" --role="$role" --condition=None --quiet >/dev/null
done
# lets the app sign JWTs as itself → keyless Gmail domain-wide delegation
gcloud iam service-accounts add-iam-policy-binding "$APP_SA" --member="serviceAccount:$APP_SA" --role=roles/iam.serviceAccountTokenCreator --quiet >/dev/null

SECRET_FLAGS=()
if exists gcloud secrets describe "$SMTP_SECRET"; then SECRET_FLAGS=(--set-secrets "SMTP_PASS=${SMTP_SECRET}:latest"); fi

ENV_VARS="GOOGLE_CLOUD_PROJECT=${PROJECT_ID},REGION=${REGION},FIRESTORE_DATABASE=${FIRESTORE_DB},AUTH_MODE=iap,IAP_AUDIENCE=${IAP_AUDIENCE},APP_URL=${APP_URL},NODE_ENV=production"

step "Building the container and deploying the web service '$SERVICE' (Cloud Build)"
gcloud beta run deploy "$SERVICE" --source . --region "$REGION" --platform managed \
  --service-account "$APP_SA" --no-allow-unauthenticated --iap \
  --set-env-vars "$ENV_VARS" "${SECRET_FLAGS[@]}" \
  --memory 512Mi --cpu 1 --min-instances 0 --max-instances 3 --concurrency 40 --timeout 300 --quiet
IMAGE="$(gcloud run services describe "$SERVICE" --region "$REGION" --format='value(spec.template.spec.containers[0].image)')"
echo "image: $IMAGE"

step "Identity-Aware Proxy access"
gcloud run services add-iam-policy-binding "$SERVICE" --region "$REGION" \
  --member="serviceAccount:service-${PROJECT_NUMBER}@gcp-sa-iap.iam.gserviceaccount.com" --role=roles/run.invoker --quiet >/dev/null || true
IFS=',' read -ra USERS <<< "$APP_USERS"
for m in "${USERS[@]}"; do
  m="$(echo "$m" | xargs)"; [ -z "$m" ] && continue
  gcloud beta iap web add-iam-policy-binding --resource-type=cloud-run --service="$SERVICE" --region="$REGION" \
    --member="$m" --role=roles/iap.httpsResourceAccessor --quiet >/dev/null && echo "  access granted: $m"
done

step "Cloud Run job '$JOB' (same image, runs 'node server/dist/cli.js auto')"
JOB_ARGS=(--image "$IMAGE" --region "$REGION" --service-account "$APP_SA" --set-env-vars "$ENV_VARS" --command node --args server/dist/cli.js,auto --max-retries 1 --task-timeout 600 --memory 512Mi "${SECRET_FLAGS[@]}")
if exists gcloud run jobs describe "$JOB" --region "$REGION"; then gcloud run jobs update "$JOB" "${JOB_ARGS[@]}" --quiet; else gcloud run jobs create "$JOB" "${JOB_ARGS[@]}" --quiet; fi
gcloud run jobs add-iam-policy-binding "$JOB" --region "$REGION" --member="serviceAccount:$SCHED_SA" --role=roles/run.invoker --quiet >/dev/null

step "Cloud Scheduler (Asia/Kolkata)"
RUN_URI="https://${REGION}-run.googleapis.com/apis/run.googleapis.com/v1/namespaces/${PROJECT_ID}/jobs/${JOB}:run"
sched() { # name, cron, description
  local args=(--location "$REGION" --schedule "$2" --time-zone "Asia/Kolkata" --uri "$RUN_URI" --http-method POST --oauth-service-account-email "$SCHED_SA" --description "$3" --attempt-deadline 300s)
  if exists gcloud scheduler jobs describe "$1" --location "$REGION"; then gcloud scheduler jobs update http "$1" "${args[@]}" --quiet >/dev/null; else gcloud scheduler jobs create http "$1" "${args[@]}" --quiet >/dev/null; fi
  echo "  $1: $2"
}
sched daily-reports-morning "0 9 * * *"  "Daily Reports: morning batch (course plans, student profiles, status & queries, attendance, dev-team reminder)"
sched daily-reports-retry   "35 9 * * *" "Daily Reports: morning retry – only what is not yet in the mail log"
sched daily-reports-evening "30 17 * * *" "Daily Reports: evening module completion & testing digest"

cat <<MSG

Done.
  App:        $APP_URL   (sign in with a Google Workspace account that was granted access)
  Job:        gcloud run jobs execute $JOB --region $REGION      (or infra/run-now.sh)
  Grant more people access:   infra/grant-access.sh someone@sahrdaya.ac.in
  Enable real sending:        infra/set-smtp-password.sh   (then choose "smtp" in Settings → Mail)
  Share the tracking sheet (Viewer) with:  $APP_SA
MSG
