# GST Genie — GCP Cloud Run Deployment Guide

### Configuration Details
* **Project ID**: `gstgenie-506815`
* **Region**: `asia-south1` (Mumbai)
* **Service Name**: `gst-genie`
* **Database**: Persistent SQLite in GCS Bucket (`gs://gstgenie-506815-db`)
* **Monthly Cost**: **₹0.00 / month** (Always Free Tier)

---

## 🚀 How to Run the Deployment

Open your PowerShell terminal and run:

```powershell
cd c:\AnkurGosar\GSTNotifier\gst-notifier

# Run the automated deployment script
.\scripts\deploy-gcp.ps1
```

---

## 🛠️ What the Script Does Automatically:

1. **Sets Active Project**: Configures `gcloud` to project `gstgenie-506815` and region `asia-south1`.
2. **Enables APIs**: `run.googleapis.com`, `cloudbuild.googleapis.com`, `cloudscheduler.googleapis.com`, `storage.googleapis.com`.
3. **Creates GCS Bucket**: Creates `gs://gstgenie-506815-db` in `asia-south1` and uploads your current `dev.db` so existing client records are preserved.
4. **Builds & Deploys**: Builds the container image using Cloud Build and deploys to Cloud Run with the GCS bucket mounted at `/data`.
5. **Configures Cloud Scheduler**:
   - **`gst-token-refresh`**: Every **5 hours** (`0 */5 * * *`) calling `/api/cron/refresh`.
   - **`gst-notice-fetch`**: Every **Monday at 9:00 AM** (`0 9 * * 1`) calling `/api/cron/fetch-notices`.
6. **Outputs Live HTTPS URL**: Provides the final URL for your dashboard.

---

## 🔄 Redeploying Future Updates

Whenever you make updates to the code, simply run:

```powershell
.\scripts\deploy-gcp.ps1
```

Your data in the GCS bucket will remain preserved across all deployments.
