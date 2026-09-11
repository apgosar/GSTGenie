param (
    [string]$Username,
    [string]$StateCd = "27",
    [string]$Email = "ankur.gosar@vdsadvisory.com"
)

# Load .env file
$envPath = Join-Path $PSScriptRoot "..\.env"
if (Test-Path $envPath) {
    Get-Content $envPath | ForEach-Object {
        if ($_ -match '^\s*([^#=]+)=(.*)$') {
            $key = $matches[1].Trim()
            $val = $matches[2].Trim().Trim('"').Trim("'")
            [System.Environment]::SetEnvironmentVariable($key, $val)
        }
    }
}

$ClientId = $env:WHITEBOOKS_CLIENT_ID
$ClientSecret = $env:WHITEBOOKS_CLIENT_SECRET
$BaseUrl = if ($env:WHITEBOOKS_BASE_URL) { $env:WHITEBOOKS_BASE_URL } else { "https://api.whitebooks.in" }
$IpAddress = if ($env:WHITEBOOKS_IP_ADDRESS) { $env:WHITEBOOKS_IP_ADDRESS } else { "127.0.0.1" }

if (-not $Username) {
    $Username = Read-Host "Enter GST Username (e.g. shivam_mavji)"
}
if (-not $StateCd) {
    $StateCd = Read-Host "Enter State Code (e.g. 27)"
}

$url = "$BaseUrl/authentication/otprequest?email=$([System.Uri]::EscapeDataString($Email))"

$headers = @{
    "Content-Type"  = "application/json"
    "gst_username"  = $Username
    "state_cd"      = $StateCd
    "ip_address"    = $IpAddress
    "client_id"     = $ClientId
    "client_secret" = $ClientSecret
}

Write-Host "`n======================================================" -ForegroundColor Cyan
Write-Host "   STEP 1: REQUESTING OTP FROM WHITEBOOKS" -ForegroundColor Cyan
Write-Host "======================================================"
Write-Host "URL: $url"
Write-Host "Headers: gst_username=$Username, state_cd=$StateCd, ip_address=$IpAddress`n"

try {
    $response = Invoke-RestMethod -Uri $url -Method Get -Headers $headers
    Write-Host "RAW RESPONSE:" -ForegroundColor Yellow
    $response | ConvertTo-Json -Depth 5 | Write-Host

    $txn = if ($response.data.txn) { $response.data.txn } else { $response.txn }

    if ($response.status_cd -eq "0" -or $response.error) {
        Write-Host "`n❌ OTP REQUEST FAILED: $($response.error.errorMessage)" -ForegroundColor Red
    } else {
        Write-Host "`n✅ OTP REQUEST SUCCESSFUL!" -ForegroundColor Green
        Write-Host "TXN: $txn" -ForegroundColor Magenta
        Write-Host "`n👉 Run Step 2 (get-authtoken):" -ForegroundColor Cyan
        Write-Host ".\scripts\get-authtoken.ps1 -Username `"$Username`" -StateCd `"$StateCd`" -Txn `"$txn`" -Otp <OTP>`n"
    }
} catch {
    Write-Host "❌ Request Failed: $_" -ForegroundColor Red
}
