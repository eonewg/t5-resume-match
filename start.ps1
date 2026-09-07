param([int]$Port = 8000)
$ErrorActionPreference = 'Stop'
Push-Location $PSScriptRoot
try {
    if (-not (Get-Command uv -ErrorAction SilentlyContinue)) {
        throw 'Please install uv first: https://docs.astral.sh/uv/getting-started/installation/'
    }
    uv sync --locked
    if ($LASTEXITCODE -ne 0) { throw 'Dependency installation failed.' }
    uv run --locked python -m uvicorn backend.main:app --host 127.0.0.1 --port $Port
    if ($LASTEXITCODE -ne 0) { throw 'Server exited with an error.' }
} finally {
    Pop-Location
}
