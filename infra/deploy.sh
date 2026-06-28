#!/bin/bash
# Deploy Sikizana backend to Google Cloud Run.
#
# Prerequisites:
#   - gcloud CLI installed and authenticated (gcloud auth login)
#   - A GCP project with billing enabled (gcloud config set project PROJECT_ID)
#   - Secret Manager API enabled (gcloud services enable secretmanager.googleapis.com)
#   - Cloud Run API enabled (gcloud services enable run.googleapis.com)
#
# Before first run:
#   1. Create the secrets (run once):
#        echo -n "$VALUE" | gcloud secrets create SECRET_NAME --data-file=-
#   2. Grant the Cloud Run service account access:
#        PROJECT_NUMBER=$(gcloud projects describe $PROJECT_ID --format='value(projectNumber)')
#        for S in daraja-consumer-key daraja-consumer-secret daraja-passkey gemini-api-key; do
#          gcloud secrets add-iam-policy-binding $S \
#            --member="serviceAccount:$PROJECT_NUMBER-compute@developer.gserviceaccount.com" \
#            --role="roles/secretmanager.secretAccessor"
#        done
#
# Usage:
#   ./infra/deploy.sh                  # deploy to default region
#   REGION=us-central1 ./infra/deploy.sh
#   REGION=africa-south1 ./infra/deploy.sh   # Nairobi-adjacent if available

set -euo pipefail

SERVICE_NAME="sikizana-api"
REGION="${REGION:-europe-west1}"
PROJECT_ID="${PROJECT_ID:-$(gcloud config get-value project)}"

echo "Deploying $SERVICE_NAME to Cloud Run in $REGION (project: $PROJECT_ID)..."

# Note: SQLite on Cloud Run is ephemeral. For production use Cloud SQL.
# For hackathon demo, the SQLite volume is wiped on each redeploy but
# records that survive a single deploy are sufficient for evidence.

gcloud run deploy "$SERVICE_NAME" \
    --source . \
    --region "$REGION" \
    --allow-unauthenticated \
    --memory 1Gi \
    --cpu 1 \
    --timeout 60 \
    --concurrency 80 \
    --min-instances 0 \
    --max-instances 4 \
    --set-env-vars="PORT=8080,DARAJA_ENV=production" \
    --set-secrets="DARAJA_CONSUMER_KEY=daraja-consumer-key:latest,DARAJA_CONSUMER_SECRET=daraja-consumer-secret:latest,DARAJA_PASSKEY=daraja-passkey:latest,GEMINI_API_KEY=gemini-api-key:latest" \ # pragma: allowlist secret
    --project "$PROJECT_ID"

echo ""
echo "Deployment complete!"
echo ""
echo "Post-deploy checklist:"
echo "  1. Copy the service URL from the output above"
echo "  2. Update DARAJA_CALLBACK_URL in the Safaricom Daraja portal to <URL>/api/payments/callback"
echo "  3. Update the frontend NEXT_PUBLIC_API_BASE env var to <URL>"
echo "  4. Rebuild and redeploy the web frontend to Cloud Run or Vercel"
