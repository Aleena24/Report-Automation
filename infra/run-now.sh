#!/usr/bin/env bash
# Trigger a batch immediately from the command line (the app's "Run morning reports" button does the same).
#   infra/run-now.sh            → auto (morning before 12:00 IST, evening after)
#   infra/run-now.sh morning | evening | health
set -euo pipefail
cd "$(dirname "$0")/.."
source infra/config.sh
MODE="${1:-auto}"
gcloud run jobs execute "$JOB" --region "$REGION" --project "$PROJECT_ID" --args "server/dist/cli.js,$MODE" --wait
echo "Logs: gcloud logging read 'resource.type=cloud_run_job AND resource.labels.job_name=$JOB' --limit 50 --project $PROJECT_ID --format='value(textPayload)'"
