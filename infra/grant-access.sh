#!/usr/bin/env bash
# Allow a person (or group / whole domain) to open the app through Identity-Aware Proxy.
#   infra/grant-access.sh someone@example.edu
#   infra/grant-access.sh group:dev-team@example.edu
#   infra/grant-access.sh domain:example.edu
set -euo pipefail
cd "$(dirname "$0")/.."
source infra/config.sh
[ $# -ge 1 ] || { echo "usage: $0 <email | user:email | group:email | domain:example.edu> ..."; exit 1; }
for m in "$@"; do
  case "$m" in user:*|group:*|domain:*|serviceAccount:*) ;; *) m="user:$m" ;; esac
  gcloud beta iap web add-iam-policy-binding --resource-type=cloud-run --service="$SERVICE" --region="$REGION" \
    --member="$m" --role=roles/iap.httpsResourceAccessor --project "$PROJECT_ID" --quiet >/dev/null
  echo "access granted: $m  →  $APP_URL"
done
echo "Tip: also add the person to Settings → Access → Members if that list is in use."
