$ErrorActionPreference = "Stop"
Set-Location $PSScriptRoot

if (-not (Test-Path .venv)) {
    python -m venv .venv
    .\.venv\Scripts\python -m pip install -q -r requirements.txt
}

docker compose up -d
.\.venv\Scripts\python -m app
