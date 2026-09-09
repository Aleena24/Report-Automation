#!/usr/bin/env bash
# Store the Gmail App Password used to send mail via SMTP, and wire it into the service and the job.
# 1. Sign in to Google as the sending account (Settings → Mail → "Send from", e.g. automation@sahrdaya.ac.in)
# 2. Google Account → Security → 2-Step Verification (must be ON) → App passwords → create one
# 3. Run this script and paste the 16-character password when asked.
set -euo pipefail
cd "$(dirname "$0")/.."
source infra/config.sh
read -r -s -p "App password for the sending account: " PASS; echo
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
echo "Stored. Now open $APP_URL → Settings → Mail → transport 'smtp' → Save → 'Send a test mail to me'."
