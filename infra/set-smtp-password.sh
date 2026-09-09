#!/usr/bin/env bash
# OPTIONAL. The normal way to set the SMTP / app password is Settings → Mail inside the app.
# Use this script only if you prefer to keep the password in Secret Manager: it is then injected as the
# SMTP_PASS environment variable, which the app uses whenever no password is stored in Settings.
set -euo pipefail
cd "$(dirname "$0")/.."
source infra/config.sh
read -r -s -p "SMTP / app password for the sending account: " PASS; echo
PASS="$(echo "$PASS" | tr -d ' ')"
[ -n "$PASS" ] || { echo "empty password"; exit 1; }
if gcloud secrets describe "$SMTP_SECRET" --project "$PROJECT_ID" >/dev/null 2>&1; then
  printf '%s' "$PASS" | gcloud secrets versions add "$SMTP_SECRET" --data-file=- --project "$PROJECT_ID" >/dev/null
else
  printf '%s' "$PASS" | gcloud secrets create "$SMTP_SECRET" --data-file=- --replication-policy=automatic --project "$PROJECT_ID" >/dev/null
fi
gcloud secrets add-iam-policy-binding "$SMTP_SECRET" --member="serviceAccount:$APP_SA" --role=roles/secretmanager.secretAccessor --project "$PROJECT_ID" --quiet >/dev/null
gcloud run services update "$SERVICE" --region "$REGION" --update-secrets "SMTP_PASS=${SMTP_SECRET}:latest" --project "$PROJECT_ID" --quiet >/dev/null
gcloud run jobs update "$JOB" --region "$REGION" --update-secrets "SMTP_PASS=${SMTP_SECRET}:latest" --project "$PROJECT_ID" --quiet >/dev/null
echo "Stored. Now open $APP_URL → Settings → Mail → transport 'smtp', fill 'Send from' → Save → 'Send a test mail to me'."
