param (
    [string]$Username,
    [string]$StateCd = "27",
    [string]$Txn,
    [string]$Email = "ankur.gosar@vdsadvisory.com",
    [string]$BaseUrl = "https://api.whitebooks.in"
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
if ($env:WHITEBOOKS_BASE_URL) { $BaseUrl = $env:WHITEBOOKS_BASE_URL }
$IpAddress = if ($env:WHITEBOOKS_IP_ADDRESS) { $env:WHITEBOOKS_IP_ADDRESS } else { "127.0.0.1" }

if (-not $Username) {
    $Username = Read-Host "Enter GST Username (e.g. shivam_mavji)"
}
if (-not $StateCd) {
    $StateCd = Read-Host "Enter State Code (e.g. 27)"
}
if (-not $Txn) {
    $Txn = Read-Host "Enter active Token (txn to refresh)"
}

$url = "$BaseUrl/authentication/refreshtoken?email=$([System.Uri]::EscapeDataString($Email))"

$headers = @{
    "Content-Type"  = "application/json"
    "gst_username"  = $Username
    "state_cd"      = $StateCd
    "ip_address"    = $IpAddress
    "txn"           = $Txn
    "client_id"     = $ClientId
    "client_secret" = $ClientSecret
}

Write-Host "`n======================================================" -ForegroundColor Cyan
Write-Host "   REFRESHING / EXTENDING AUTH TOKEN" -ForegroundColor Cyan
Write-Host "======================================================"
Write-Host "URL: $url"
Write-Host "Headers: gst_username=$Username, state_cd=$StateCd, txn=$Txn, ip_address=$IpAddress`n"

try {
    $response = Invoke-RestMethod -Uri $url -Method Get -Headers $headers
    Write-Host "RAW RESPONSE:" -ForegroundColor Yellow
    $response | ConvertTo-Json -Depth 5 | Write-Host

    if ($response.status_cd -eq "0" -or $response.error) {
        Write-Host "`n❌ TOKEN REFRESH FAILED: $($response.error.errorMessage)" -ForegroundColor Red
    } else {
        $refreshed = if ($response.data.auth_token) { $response.data.auth_token } elseif ($response.data.txn) { $response.data.txn } else { $response.auth_token }
        if (-not $refreshed) { $refreshed = $Txn }

        Write-Host "`n✅ TOKEN REFRESHED / EXTENDED SUCCESSFULLY!" -ForegroundColor Green
        Write-Host "EXTENDED TOKEN: $refreshed" -ForegroundColor Magenta
        Write-Host "Session is extended for another 6 hours.`n"
    }
} catch {
    Write-Host "❌ Request Failed: $_" -ForegroundColor Red
}
