# AlgoTrader — Start Frontend
Set-Location "$PSScriptRoot\frontend"

if (-not (Test-Path "node_modules")) {
    Write-Host "Installing npm dependencies..." -ForegroundColor Cyan
    npm install
}

Write-Host "`nStarting React frontend on http://localhost:5173" -ForegroundColor Green
npm run dev
