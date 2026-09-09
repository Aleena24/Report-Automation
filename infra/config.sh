# Shared settings for the deployment scripts. Nothing here is specific to one organisation:
# everything is taken from the active gcloud configuration and can be overridden in the environment, e.g.
#   PROJECT_ID=my-project REGION=asia-south1 APP_USERS=domain:example.edu ./infra/deploy.sh
gc() { gcloud config get-value "$1" 2>/dev/null | grep -v '(unset)' || true; }

PROJECT_ID="${PROJECT_ID:-$(gc project)}"
[ -n "$PROJECT_ID" ] || { echo "No project: set PROJECT_ID or run 'gcloud config set project <id>'"; exit 1; }
REGION="${REGION:-$(gc run/region)}"; REGION="${REGION:-europe-west1}"
SERVICE="${SERVICE:-daily-reports}"            # Cloud Run service: the PWA + API, behind IAP
JOB="${JOB:-daily-reports-job}"                # Cloud Run job: runs the scheduled batches
FIRESTORE_DB="${FIRESTORE_DB:-daily-reports}"
APP_SA_NAME="${APP_SA_NAME:-daily-reports-app}"
SCHED_SA_NAME="${SCHED_SA_NAME:-daily-reports-scheduler}"
SMTP_SECRET="${SMTP_SECRET:-daily-reports-smtp-password}"   # optional: only if the password is kept in Secret Manager instead of Settings

# When the batches run (HH:MM, 24 h) and in which time zone. Shown in the app and used for the Cloud Scheduler crons.
MORNING_TIME="${MORNING_TIME:-09:00}"
RETRY_TIME="${RETRY_TIME:-09:35}"
EVENING_TIME="${EVENING_TIME:-17:30}"
TIME_ZONE="${TIME_ZONE:-Asia/Kolkata}"

# Who may open the app (IAP). Comma-separated IAM members: user:x@example.edu, group:..., domain:example.edu
# Default: the account running gcloud. Add more later with infra/grant-access.sh.
APP_USERS="${APP_USERS:-user:$(gc account)}"

PROJECT_NUMBER="$(gcloud projects describe "$PROJECT_ID" --format='value(projectNumber)')"
APP_SA="${APP_SA_NAME}@${PROJECT_ID}.iam.gserviceaccount.com"
SCHED_SA="${SCHED_SA_NAME}@${PROJECT_ID}.iam.gserviceaccount.com"
APP_URL="https://${SERVICE}-${PROJECT_NUMBER}.${REGION}.run.app"
IAP_AUDIENCE="/projects/${PROJECT_NUMBER}/locations/${REGION}/services/${SERVICE}"

# "HH:MM" → cron "M H * * *"
cron_of() { local h="${1%%:*}" m="${1##*:}"; echo "$((10#$m)) $((10#$h)) * * *"; }
