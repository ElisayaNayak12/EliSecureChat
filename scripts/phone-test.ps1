<#
  EliSecureChat "phone test mode": runs the hosted build on this PC and gives you a free, temporary
  https://....trycloudflare.com link that works on any phone (Android or iPhone), on any network.

  Used by start-stop-server.bat ("Phone test mode"). Can also be run directly:
    powershell -ExecutionPolicy Bypass -File scripts\phone-test.ps1 [-SkipBuild] [-NoBrowser]

  - Uses your normal local data (same accounts and chats as the dev servers), so the dev servers must be stopped.
  - Cloudflare's tunnel tool (cloudflared.exe) is downloaded once into tools\ and its digital signature is
    checked before it is used. No Cloudflare account is needed. The link stops working when you stop the test.
#>
param([switch]$SkipBuild, [switch]$NoBrowser)
$ErrorActionPreference = 'Stop'
$ProgressPreference = 'SilentlyContinue'

$root = Split-Path -Parent $PSScriptRoot
Set-Location $root
$tools = Join-Path $root 'tools'
$cf = Join-Path $tools 'cloudflared.exe'
$tunnelLog = Join-Path $root '.phone-test-tunnel.log'
$pidFile = Join-Path $root '.phone-test.pids'
$urlFile = Join-Path $root '.phone-test.url'

function Step($m) { Write-Host "`n==> $m" -ForegroundColor Green }
function Fail($m) { Write-Host "[ERROR] $m" -ForegroundColor Red; exit 1 }

# ---- 1. Cloudflare tunnel tool (one-time download, signature verified) ----
if (-not (Test-Path $cf)) {
  Step 'Downloading Cloudflare tunnel tool (one time, about 60 MB)...'
  New-Item -ItemType Directory -Force $tools | Out-Null
  $tmp = "$cf.download"
  try {
    Invoke-WebRequest -UseBasicParsing -Uri 'https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-windows-amd64.exe' -OutFile $tmp
  } catch { Fail "Download failed: $($_.Exception.Message)" }
  Move-Item -Force $tmp $cf
}
$sig = Get-AuthenticodeSignature $cf
if ($sig.Status -ne 'Valid' -or $sig.SignerCertificate.Subject -notmatch 'Cloudflare') {
  Remove-Item -Force $cf
  Fail "cloudflared.exe is not validly signed by Cloudflare (status: $($sig.Status)). It was deleted; nothing was run."
}

# ---- 2. Port 3000 must be free (the dev servers use the same data and port) ----
if (Get-NetTCPConnection -LocalPort 3000 -State Listen -ErrorAction SilentlyContinue) {
  Fail 'Port 3000 is in use. Stop the dev servers first (start-stop-server.bat -> Stop).'
}

# ---- 3. Build ----
if (-not $SkipBuild) {
  Step 'Building the web app, admin console and backend (about 1 minute)...'
  & npm.cmd run build:hosted --silent
  if ($LASTEXITCODE -ne 0) { Fail 'Build failed (see messages above).' }
}
foreach ($f in 'apps\web\dist\index.html', 'apps\admin\dist\index.html', 'apps\backend\dist\main.js') {
  if (-not (Test-Path (Join-Path $root $f))) { Fail "$f is missing; run without -SkipBuild." }
}

# ---- 4. Start the server (inherits these settings) ----
Step 'Starting the server...'
$env:NODE_ENV = ''                       # development settings: dev signing secret, local test accounts
$env:PORT = '3000'
$env:WEB_DIST_DIR = Join-Path $root 'apps\web\dist'
$env:ADMIN_DIST_DIR = Join-Path $root 'apps\admin\dist'
$env:TRUST_PROXY = '1'                   # requests arrive through the tunnel
$env:UPLOADS_DIR = Join-Path $root 'apps\backend\apps\backend\uploads'   # same folder the dev server uses
$server = Start-Process -FilePath 'cmd.exe' -ArgumentList '/k', 'title EliSecureChat Phone Test Server && node apps\backend\dist\main.js' -WorkingDirectory $root -PassThru
$ok = $false
for ($i = 0; $i -lt 40; $i++) {
  Start-Sleep -Milliseconds 750
  try { if ((Invoke-WebRequest -UseBasicParsing -TimeoutSec 3 'http://127.0.0.1:3000/api/health').StatusCode -eq 200) { $ok = $true; break } } catch {}
}
if (-not $ok) { Fail 'The server did not start. Check the "EliSecureChat Phone Test Server" window.' }

# ---- 5. Start the tunnel and read its public address ----
Step 'Opening a secure public link (Cloudflare tunnel)...'
Remove-Item -Force $tunnelLog, $urlFile -ErrorAction SilentlyContinue
$tunnel = Start-Process -FilePath $cf -ArgumentList 'tunnel', '--no-autoupdate', '--url', 'http://127.0.0.1:3000', '--logfile', "`"$tunnelLog`"" -WindowStyle Minimized -PassThru
Set-Content -Path $pidFile -Value "$($server.Id)`n$($tunnel.Id)" -Encoding ascii
$url = $null
for ($i = 0; $i -lt 60 -and -not $url; $i++) {
  Start-Sleep -Seconds 1
  if (Test-Path $tunnelLog) {
    $m = Select-String -Path $tunnelLog -Pattern 'https://[a-z0-9-]+\.trycloudflare\.com' -AllMatches | Select-Object -First 1
    if ($m) { $url = $m.Matches[0].Value }
  }
  if ($tunnel.HasExited) { break }
}
if (-not $url) { Fail "The tunnel did not start (see $tunnelLog). The app still works on this PC at http://localhost:3000" }
Set-Content -Path $urlFile -Value $url -Encoding ascii

# Wait until the link answers (new links can take a few seconds to become reachable).
for ($i = 0; $i -lt 30; $i++) {
  try { if ((Invoke-WebRequest -UseBasicParsing -TimeoutSec 5 "$url/api/health").StatusCode -eq 200) { break } } catch {}
  Start-Sleep -Seconds 2
}
try { Set-Clipboard -Value $url } catch {}

Write-Host ''
Write-Host '=====================================================================' -ForegroundColor Cyan
Write-Host '  Open this on your phone (copied to the clipboard):' -ForegroundColor Cyan
Write-Host ''
Write-Host "     $url" -ForegroundColor Yellow
Write-Host ''
Write-Host "  Admin console:  $url/admin/"
Write-Host '  Test accounts:  9111100001 (Asha) / 9111100002 (Ravi), password Test@1234'
Write-Host ''
Write-Host '  Tip: send the link to yourself (WhatsApp/email) and open it on the phone.'
Write-Host '  The link is temporary and works only while this test runs. Anyone with the'
Write-Host '  link can see the sign-in page, so stop the test when you are done.'
Write-Host '=====================================================================' -ForegroundColor Cyan
if (-not $NoBrowser) { Start-Process $url }
