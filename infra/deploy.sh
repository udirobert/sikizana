#!/bin/bash

# Configuration
SERVICE_NAME="sikizana"
REGION="europe-west1" # Adjust as needed for Nairobi latency/availability
PROJECT_ID=$(gcloud config get-value project)

echo "Deploying $SERVICE_NAME to Google Cloud Run in $REGION..."

# Build and deploy
gcloud run deploy $SERVICE_NAME \
    --source . \
    --region $REGION \
    --allow-unauthenticated \
    --set-env-vars="PORT=8080" \
    --project $PROJECT_ID

echo "Deployment complete!"
