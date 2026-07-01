$ErrorActionPreference = "Stop"
$root = Split-Path -Parent $PSScriptRoot
$port = 3302
$base = "http://localhost:$port"

Write-Host "Building backend..."
Push-Location $root
npm run backend:build | Out-Host
Pop-Location

$backend = Start-Process -FilePath powershell -ArgumentList "-NoProfile", "-Command", "`$env:PORT='$port'; node apps/backend/dist/main.js" -WorkingDirectory $root -PassThru
Start-Sleep -Seconds 2

try {
  $health = Invoke-RestMethod -Uri "$base/health"
  $login = Invoke-RestMethod -Method Post -Uri "$base/auth/dev-login" -ContentType "application/json" -Body '{"name":"Smoke User","phone":"6666666666","email":"smoke@example.com"}'
  $chat = Invoke-RestMethod -Method Post -Uri "$base/chats" -ContentType "application/json" -Body ("{`"type`":`"ONE_TO_ONE`",`"memberIds`":[`"" + $login.user.id + "`",`"peer-smoke`"]}")
  Invoke-RestMethod -Method Post -Uri "$base/messages" -ContentType "application/json" -Body ("{`"chatId`":`"" + $chat.id + "`",`"senderId`":`"" + $login.user.id + "`",`"encryptedContent`":`"aGVsbG8=`"}") | Out-Null
  $messages = Invoke-RestMethod -Uri ("$base/messages/" + $chat.id)
  if (-not $health.ok) { throw "Health check failed" }
  if ($messages.Count -lt 1) { throw "Message flow failed" }
  Write-Host ("Smoke test passed. chat=" + $chat.id + " messages=" + $messages.Count)
}
finally {
  if ($backend -and -not $backend.HasExited) {
    Stop-Process -Id $backend.Id -Force -ErrorAction SilentlyContinue
  }
  $listeners = Get-NetTCPConnection -LocalPort $port -State Listen -ErrorAction SilentlyContinue
  if ($listeners) {
    $listenerPids = $listeners | Select-Object -ExpandProperty OwningProcess -Unique
    foreach ($pidNumber in $listenerPids) {
      Stop-Process -Id $pidNumber -Force -ErrorAction SilentlyContinue
    }
  }
}
