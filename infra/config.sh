# Shared settings for the deployment scripts. Override any of them in the environment.
PROJECT_ID="${PROJECT_ID:-perfect-crow-487208-q2}"
REGION="${REGION:-europe-west1}"
SERVICE="${SERVICE:-daily-reports}"            # Cloud Run service: the PWA + API, behind IAP
JOB="${JOB:-daily-reports-job}"                # Cloud Run job: runs the scheduled batches
FIRESTORE_DB="${FIRESTORE_DB:-daily-reports}"
APP_SA_NAME="${APP_SA_NAME:-daily-reports-app}"
SCHED_SA_NAME="${SCHED_SA_NAME:-daily-reports-scheduler}"
SMTP_SECRET="${SMTP_SECRET:-daily-reports-smtp-password}"
# Who may open the app (IAP). Comma-separated IAM members: user:x@sahrdaya.ac.in, group:..., domain:sahrdaya.ac.in
APP_USERS="${APP_USERS:-user:aleenavarghese@sahrdaya.ac.in,user:automation@sahrdaya.ac.in,user:george@sahrdaya.ac.in}"

PROJECT_NUMBER="$(gcloud projects describe "$PROJECT_ID" --format='value(projectNumber)')"
APP_SA="${APP_SA_NAME}@${PROJECT_ID}.iam.gserviceaccount.com"
SCHED_SA="${SCHED_SA_NAME}@${PROJECT_ID}.iam.gserviceaccount.com"
APP_URL="https://${SERVICE}-${PROJECT_NUMBER}.${REGION}.run.app"
IAP_AUDIENCE="/projects/${PROJECT_NUMBER}/locations/${REGION}/services/${SERVICE}"
