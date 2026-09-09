param([int]$Port = 8000, [switch]$RebuildFrontend)
$ErrorActionPreference = 'Stop'
Push-Location $PSScriptRoot
try {
    if (-not (Get-Command uv -ErrorAction SilentlyContinue)) {
        throw 'Please install uv first: https://docs.astral.sh/uv/getting-started/installation/'
    }
    uv sync --locked
    if ($LASTEXITCODE -ne 0) { throw 'Dependency installation failed.' }
    if ($RebuildFrontend -or -not (Test-Path -LiteralPath 'frontend/dist/index.html')) {
        if (-not (Get-Command npm -ErrorAction SilentlyContinue)) { throw 'Build frontend with npm ci and npm run build, or use the portable EXE.' }
        npm --prefix frontend ci
        if ($LASTEXITCODE -ne 0) { throw 'Frontend dependency installation failed.' }
        npm --prefix frontend run build
        if ($LASTEXITCODE -ne 0) { throw 'Frontend build failed.' }
    }
    uv run --locked python -m uvicorn backend.main:app --host 127.0.0.1 --port $Port
    if ($LASTEXITCODE -ne 0) { throw 'Server exited with an error.' }
} finally {
    Pop-Location
}
