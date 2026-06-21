# AlgoTrader — Start Backend
Set-Location "$PSScriptRoot\backend"

Write-Host "Installing Python dependencies..." -ForegroundColor Cyan
pip install -r requirements.txt

Write-Host "`nStarting FastAPI backend on http://localhost:8000" -ForegroundColor Green
Write-Host "API Docs: http://localhost:8000/docs" -ForegroundColor Yellow
uvicorn main:app --host 0.0.0.0 --port 8000 --reload
