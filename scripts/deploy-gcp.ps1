# ==============================================================================
#  GST Genie: GCP Cloud Run Deployment Automation (Firestore Native Mode)
#  Project ID : gstgenie-506815
#  Region     : asia-south1 (Mumbai)
#  Database   : Google Cloud Firestore (Always Free Tier: ₹0.00/mo)
# ==============================================================================

param(
  [string]$ProjectId = "gstgenie-506815",
  [string]$Region = "asia-south1",
  [string]$ServiceName = "gst-genie",
  [string]$CronSecret = "gstgenie-cron-secret-2026"
)

# Prevent native CLI stderr from triggering false PowerShell termination
$ErrorActionPreference = "Continue"

Write-Host ""
Write-Host "========================================================" -ForegroundColor Cyan
Write-Host "  GST Genie: Deploying to GCP Cloud Run (Firestore)" -ForegroundColor Cyan
Write-Host "========================================================" -ForegroundColor Cyan
Write-Host "  GCP Project : $ProjectId" -ForegroundColor Green
Write-Host "  GCP Region  : $Region (Mumbai)" -ForegroundColor Green
Write-Host "  Service     : $ServiceName" -ForegroundColor Green
Write-Host "  Database    : Google Cloud Firestore (Native Mode)" -ForegroundColor Green
Write-Host "========================================================" -ForegroundColor Cyan
Write-Host ""

# 1. Check gcloud CLI
if (-not (Get-Command "gcloud" -ErrorAction SilentlyContinue)) {
  Write-Error "gcloud CLI is not installed or not in PATH. Please install Google Cloud SDK: https://cloud.google.com/sdk"
  exit 1
}

# 2. Set Active GCP Project and Region
Write-Host "1. Configuring gcloud project and default region..." -ForegroundColor Yellow
gcloud config set project $ProjectId | Out-Null
gcloud config set run/region $Region | Out-Null

# 3. Read Credentials from .env
$envFile = Join-Path $PSScriptRoot "..\.env"
$whitebooksClientId = "GSTPa3ab1bc8-e932-4173-8be9-7131ca5482c3"
$whitebooksClientSecret = "GSTP123fe93b-4066-4a32-9951-bc5604505a4e"
$whitebooksBaseUrl = "https://api.whitebooks.in"
$gmailUser = "gnggst2026@gmail.com"
$gmailAppPassword = "fifflyyolbpahneq"

if (Test-Path $envFile) {
  Get-Content $envFile | ForEach-Object {
    $line = $_.Trim()
    if ($line -and -not $line.StartsWith("#") -and $line.Contains("=")) {
      $parts = $line.Split("=", 2)
      $key = $parts[0].Trim()
      $val = $parts[1].Trim().Trim('"').Trim("'")
      if ($key -eq "WHITEBOOKS_CLIENT_ID" -and $val) { $whitebooksClientId = $val }
      if ($key -eq "WHITEBOOKS_CLIENT_SECRET" -and $val) { $whitebooksClientSecret = $val }
      if ($key -eq "WHITEBOOKS_BASE_URL" -and $val) { $whitebooksBaseUrl = $val }
      if ($key -eq "GMAIL_USER" -and $val) { $gmailUser = $val }
      if ($key -eq "GMAIL_APP_PASSWORD" -and $val) { $gmailAppPassword = $val }
      if ($key -eq "CRON_SECRET" -and $val) { $CronSecret = $val }
    }
  }
  Write-Host "[OK] Loaded credentials from local .env" -ForegroundColor Green
}

# Strip any whitespace from app password
$gmailAppPassword = $gmailAppPassword.Replace(" ", "")

# 4. Enable Required GCP APIs
Write-Host ""
Write-Host "2. Enabling required Google Cloud APIs..." -ForegroundColor Yellow
gcloud services enable run.googleapis.com `
  cloudbuild.googleapis.com `
  cloudscheduler.googleapis.com `
  firestore.googleapis.com `
  --project $ProjectId

# 5. Ensure Service Account has Firestore permissions
Write-Host ""
Write-Host "3. Ensuring Cloud Run Service Account has Firestore access..." -ForegroundColor Yellow
$projectNumber = (gcloud projects describe $ProjectId --format="value(projectNumber)" 2>$null).Trim()
if ($projectNumber) {
  $computeSa = "$projectNumber-compute@developer.gserviceaccount.com"
  gcloud projects add-iam-policy-binding $ProjectId `
    --member="serviceAccount:$computeSa" `
    --role="roles/datastore.user" `
    --condition=None | Out-Null
  Write-Host "[OK] Granted roles/datastore.user to $computeSa" -ForegroundColor Green
}

# 6. Generate temporary env-vars.yaml for Cloud Run deployment
$appDir = Resolve-Path (Join-Path $PSScriptRoot "..")
$envYamlPath = Join-Path $appDir "env-vars.yaml"

$yamlLines = @(
  "GCP_PROJECT: `"$ProjectId`"",
  "WHITEBOOKS_BASE_URL: `"$whitebooksBaseUrl`"",
  "WHITEBOOKS_CLIENT_ID: `"$whitebooksClientId`"",
  "WHITEBOOKS_CLIENT_SECRET: `"$whitebooksClientSecret`"",
  "GMAIL_USER: `"$gmailUser`"",
  "GMAIL_APP_PASSWORD: `"$gmailAppPassword`"",
  "CRON_SECRET: `"$CronSecret`""
)

$yamlLines | Set-Content -Path $envYamlPath -Encoding UTF8

# 7. Build and Deploy to Cloud Run
Write-Host ""
Write-Host "4. Building container with Cloud Build and deploying to Cloud Run..." -ForegroundColor Yellow
Push-Location $appDir

try {
  gcloud run deploy $ServiceName `
    --source . `
    --project $ProjectId `
    --region $Region `
    --platform managed `
    --allow-unauthenticated `
    --memory 512Mi `
    --cpu 1 `
    --concurrency 80 `
    --max-instances 1 `
    --clear-volumes `
    --env-vars-file "env-vars.yaml" `
    --quiet
  $deployExitCode = $LASTEXITCODE
} finally {
  # Clean up temporary yaml file
  if (Test-Path $envYamlPath) {
    Remove-Item $envYamlPath -Force
  }
  Pop-Location
}

if ($deployExitCode -ne 0) {
  Write-Host ""
  Write-Host "========================================================" -ForegroundColor Red
  Write-Host "  [FAILED] Cloud Run deployment failed! (Exit code: $deployExitCode)" -ForegroundColor Red
  Write-Host "  See Cloud Build error details above." -ForegroundColor Red
  Write-Host "========================================================" -ForegroundColor Red
  exit 1
}

# 8. Retrieve Service URL
$serviceUrl = (gcloud run services describe $ServiceName --project $ProjectId --region $Region --format "value(status.url)" 2>$null)
if ($serviceUrl) {
  $serviceUrl = $serviceUrl.Trim()
  Write-Host ""
  Write-Host "[OK] Service deployed successfully!" -ForegroundColor Green
  Write-Host "Live Application URL: $serviceUrl" -ForegroundColor Cyan

  # 9. Setup Cloud Scheduler Jobs
  Write-Host ""
  Write-Host "5. Configuring Cloud Scheduler automated cron jobs..." -ForegroundColor Yellow

  # Job 1: 5-Hour Token Refresh
  $job1 = "gst-token-refresh"
  $null = gcloud scheduler jobs describe $job1 --location $Region --project $ProjectId 2>&1
  if ($LASTEXITCODE -eq 0) {
    gcloud scheduler jobs delete $job1 --location $Region --project $ProjectId --quiet | Out-Null
  }
  gcloud scheduler jobs create http $job1 `
    --schedule "0 */5 * * *" `
    --uri "$serviceUrl/api/cron/refresh" `
    --http-method POST `
    --headers "x-cron-secret=$CronSecret" `
    --time-zone "Asia/Kolkata" `
    --location $Region `
    --project $ProjectId `
    --attempt-deadline "300s" `
    --description "Automated GST 5-hour Token Refresh"

  Write-Host "[OK] Scheduled: Token Refresh every 5 hours (0 */5 * * *)" -ForegroundColor Green

  # Job 2: Weekly Notice Fetch on Mondays at 10:00 AM IST
  $job2 = "gst-notice-fetch"
  $null = gcloud scheduler jobs describe $job2 --location $Region --project $ProjectId 2>&1
  if ($LASTEXITCODE -eq 0) {
    gcloud scheduler jobs delete $job2 --location $Region --project $ProjectId --quiet | Out-Null
  }
  gcloud scheduler jobs create http $job2 `
    --schedule "0 10 * * 1" `
    --uri "$serviceUrl/api/cron/fetch-notices" `
    --http-method POST `
    --headers "x-cron-secret=$CronSecret" `
    --time-zone "Asia/Kolkata" `
    --location $Region `
    --project $ProjectId `
    --attempt-deadline "300s" `
    --description "Automated Weekly GST Notice Fetch & Email Report"

  Write-Host "[OK] Scheduled: Notice Fetch & Report weekly on Mondays at 10:00 AM IST" -ForegroundColor Green

  # 10. Summary
  Write-Host ""
  Write-Host "========================================================" -ForegroundColor Green
  Write-Host "  Deployment Complete and Automated!" -ForegroundColor Green
  Write-Host "========================================================" -ForegroundColor Green
  Write-Host "Live App URL   : $serviceUrl" -ForegroundColor Cyan
  Write-Host "Database       : Google Cloud Firestore (Native Mode, asia-south1)" -ForegroundColor Cyan
  Write-Host "Region         : $Region (Mumbai)" -ForegroundColor Cyan
  Write-Host "Cron Secret    : $CronSecret" -ForegroundColor Cyan
  Write-Host "Monthly Cost   : Rs. 0.00 / month (Firestore Always Free Tier: 50k reads/day, 20k writes/day)" -ForegroundColor Yellow
  Write-Host "Volume Mounts  : None (0 GCS micro-IO fees)" -ForegroundColor Yellow
  Write-Host "========================================================" -ForegroundColor Green
  Write-Host ""
}
