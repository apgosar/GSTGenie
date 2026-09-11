#!/usr/bin/env bash
set -e

# ==============================================================================
# Deploy GST Genie to GCP Cloud Run with GCS Volume Mount (SQLite) & Scheduler
# Project ID : gstgenie-506815
# Region     : asia-south1 (Mumbai)
# ==============================================================================

REGION="${REGION:-asia-south1}"
SERVICE_NAME="${SERVICE_NAME:-gst-genie}"
PROJECT_ID="${PROJECT_ID:-gstgenie-506815}"

echo "========================================================"
echo "  🚀 GST Genie: GCP Cloud Run Deployment Automation"
echo "========================================================"
echo "Project ID   : $PROJECT_ID"
echo "Region       : $REGION"
echo "Service Name : $SERVICE_NAME"
echo "========================================================"

# Load .env variables if present
if [ -f .env ]; then
  export $(grep -v '^#' .env | xargs)
fi

BUCKET_NAME="${PROJECT_ID}-db"
CRON_SECRET="${CRON_SECRET:-gstgenie-cron-secret-2026}"

echo ""
echo "1. Configuring gcloud project..."
gcloud config set project "$PROJECT_ID"
gcloud config set run/region "$REGION"

echo ""
echo "2. Enabling required Google Cloud APIs..."
gcloud services enable run.googleapis.com \
  cloudbuild.googleapis.com \
  cloudscheduler.googleapis.com \
  storage.googleapis.com \
  --project "$PROJECT_ID"

echo ""
echo "3. Ensuring GCS bucket exists (gs://$BUCKET_NAME)..."
if ! gcloud storage buckets describe "gs://$BUCKET_NAME" --project "$PROJECT_ID" >/dev/null 2>&1; then
  echo "Creating bucket gs://$BUCKET_NAME in $REGION..."
  gcloud storage buckets create "gs://$BUCKET_NAME" --project="$PROJECT_ID" --location="$REGION" --uniform-bucket-level-access
  echo "✓ Bucket created."
else
  echo "✓ Bucket already exists."
fi

# Seed database if local dev.db exists and remote does not
if [ -f dev.db ]; then
  if ! gcloud storage ls "gs://$BUCKET_NAME/dev.db" >/dev/null 2>&1; then
    echo "Uploading local dev.db to GCS bucket..."
    gcloud storage cp dev.db "gs://$BUCKET_NAME/dev.db"
    echo "✓ Uploaded local database to gs://$BUCKET_NAME/dev.db"
  fi
fi

# Create temporary env-vars.yaml
cat <<EOF > env-vars.yaml
DATABASE_URL: "file:/data/dev.db"
WHITEBOOKS_BASE_URL: "${WHITEBOOKS_BASE_URL:-https://api.whitebooks.in}"
WHITEBOOKS_CLIENT_ID: "${WHITEBOOKS_CLIENT_ID}"
WHITEBOOKS_CLIENT_SECRET: "${WHITEBOOKS_CLIENT_SECRET}"
GMAIL_USER: "${GMAIL_USER}"
GMAIL_APP_PASSWORD: "${GMAIL_APP_PASSWORD}"
CRON_SECRET: "${CRON_SECRET}"
EOF

echo ""
echo "4. Building & Deploying to GCP Cloud Run..."
gcloud run deploy "$SERVICE_NAME" \
  --source . \
  --project "$PROJECT_ID" \
  --region "$REGION" \
  --platform managed \
  --allow-unauthenticated \
  --memory 512Mi \
  --cpu 1 \
  --concurrency 80 \
  --max-instances 1 \
  --add-volume "name=db-volume,type=cloud-storage,bucket=$BUCKET_NAME" \
  --add-volume-mount "volume=db-volume,mount-path=/data" \
  --env-vars-file "env-vars.yaml"

rm -f env-vars.yaml

SERVICE_URL=$(gcloud run services describe "$SERVICE_NAME" --project "$PROJECT_ID" --region "$REGION" --format "value(status.url)")
echo ""
echo "✓ Deployed successfully!"
echo "🌐 Live URL: $SERVICE_URL"

echo ""
echo "5. Configuring Cloud Scheduler automated jobs..."

# Job 1: Token refresh every 5 hours
gcloud scheduler jobs delete gst-token-refresh --location "$REGION" --project "$PROJECT_ID" --quiet >/dev/null 2>&1 || true
gcloud scheduler jobs create http gst-token-refresh \
  --schedule "0 */5 * * *" \
  --uri "$SERVICE_URL/api/cron/refresh" \
  --http-method POST \
  --headers "x-cron-secret=$CRON_SECRET" \
  --time-zone "Asia/Kolkata" \
  --location "$REGION" \
  --project "$PROJECT_ID" \
  --description "Automated GST 5-hour Token Refresh"

# Job 2: Weekly notice fetch on Mondays at 10:00 AM IST
gcloud scheduler jobs delete gst-notice-fetch --location "$REGION" --project "$PROJECT_ID" --quiet >/dev/null 2>&1 || true
gcloud scheduler jobs create http gst-notice-fetch \
  --schedule "0 10 * * 1" \
  --uri "$SERVICE_URL/api/cron/fetch-notices" \
  --http-method POST \
  --headers "x-cron-secret=$CRON_SECRET" \
  --time-zone "Asia/Kolkata" \
  --location "$REGION" \
  --project "$PROJECT_ID" \
  --description "Automated Weekly GST Notice Fetch & Email Report"

echo ""
echo "========================================================"
echo "  🎉 Deployment Complete & Automated!"
echo "========================================================"
echo "App URL        : $SERVICE_URL"
echo "GCS Storage    : gs://$BUCKET_NAME"
echo "Cron Secret    : $CRON_SECRET"
echo "Estimated Cost : ₹0.00 / month (Always Free tier)"
echo "========================================================"
