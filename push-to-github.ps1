param (
    [Parameter(Mandatory=$true, HelpMessage="Enter your GitHub Personal Access Token (PAT)")]
    [string]$GithubToken
)

$ErrorActionPreference = "Stop"

Write-Host "===================================================" -ForegroundColor Cyan
Write-Host "        ELiSecureChat GitHub Push Automator        " -ForegroundColor Cyan
Write-Host "===================================================" -ForegroundColor Cyan
Write-Host ""

# 1. Create remote repository using GitHub REST API
Write-Host "[1/3] Creating repository 'EliSecureChat' on GitHub..." -ForegroundColor Yellow
$headers = @{
    "Authorization" = "token $GithubToken"
    "Accept" = "application/vnd.github.v3+json"
}
$body = @{
    name = "EliSecureChat"
    description = "ELiSecureChat Monorepo: Realtime messaging with End-to-End Cryptography and Chat Erasure protocols."
    private = $true
} | ConvertTo-Json

try {
    $repoUrl = "https://api.github.com/user/repos"
    $response = Invoke-RestMethod -Uri $repoUrl -Method Post -Headers $headers -Body $body -ContentType "application/json"
    Write-Host "[SUCCESS] Successfully created private repository on GitHub!" -ForegroundColor Green
} catch {
    if ($_.Exception.Response) {
        $status = $_.Exception.Response.StatusCode.Value__
        if ($status -eq 422) {
            Write-Host "[INFO] Repository 'EliSecureChat' already exists on your GitHub account. Proceeding to push..." -ForegroundColor Yellow
        } else {
            Write-Host "[ERROR] API error: $_" -ForegroundColor Red
            Write-Host "Please ensure your token is valid and has the 'repo' scope enabled." -ForegroundColor Red
            return
        }
    } else {
        Write-Host "[ERROR] API error: $_" -ForegroundColor Red
        return
    }
}

# 2. Configure Git Remote
Write-Host "[2/3] Configuring Git Remote URL..." -ForegroundColor Yellow
try {
    # Remove existing origin if configured
    & git remote remove origin
} catch {
    # Ignore if remote origin didn't exist
}

$remoteUrl = "https://$GithubToken@github.com/ElisayaNayak12/EliSecureChat.git"
& git remote add origin $remoteUrl
Write-Host "[SUCCESS] Remote origin configured." -ForegroundColor Green

# 3. Push to main
Write-Host "[3/3] Pushing project codebase to GitHub main branch..." -ForegroundColor Yellow
try {
    & git branch -M main
    & git push -u origin main
    Write-Host ""
    Write-Host "===================================================" -ForegroundColor Green
    Write-Host "SUCCESS! Your code has been pushed to GitHub!" -ForegroundColor Green
    Write-Host "Repository URL: https://github.com/ElisayaNayak12/EliSecureChat" -ForegroundColor Green
    Write-Host "===================================================" -ForegroundColor Green
} catch {
    Write-Host "[ERROR] Push failed: $_" -ForegroundColor Red
}
