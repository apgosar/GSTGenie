param (
    [string]$Username,
    [string]$StateCd = "27",
    [string]$Txn,
    [string]$Otp,
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
if (-not $Txn) {
    $Txn = Read-Host "Enter TXN from Step 1 (otprequest)"
}
if (-not $Otp) {
    $Otp = Read-Host "Enter OTP received by taxpayer"
}

$url = "$BaseUrl/authentication/authtoken?email=$([System.Uri]::EscapeDataString($Email))&otp=$([System.Uri]::EscapeDataString($Otp))"

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
Write-Host "   STEP 2: EXCHANGING OTP FOR 6-HOUR AUTH TOKEN" -ForegroundColor Cyan
Write-Host "======================================================"
Write-Host "URL: $url"
Write-Host "Headers: gst_username=$Username, state_cd=$StateCd, txn=$Txn, ip_address=$IpAddress`n"

try {
    $response = Invoke-RestMethod -Uri $url -Method Get -Headers $headers
    Write-Host "RAW RESPONSE:" -ForegroundColor Yellow
    $response | ConvertTo-Json -Depth 5 | Write-Host

    if ($response.status_cd -eq "0" -or $response.error) {
        Write-Host "`n❌ AUTH TOKEN FAILED: $($response.error.errorMessage)" -ForegroundColor Red
    } else {
        $authToken = if ($response.data.auth_token) { $response.data.auth_token } elseif ($response.data.txn) { $response.data.txn } else { $response.auth_token }
        if (-not $authToken) { $authToken = $Txn }

        Write-Host "`n✅ AUTHENTICATION SUCCESSFUL! (Valid 6 hours)" -ForegroundColor Green
        Write-Host "6-HOUR AUTH TOKEN: $authToken" -ForegroundColor Magenta
        Write-Host "`n👉 Pass this token in the 'txn' header when calling getnotices/noticedetails." -ForegroundColor Cyan
    }
} catch {
    Write-Host "❌ Request Failed: $_" -ForegroundColor Red
}
