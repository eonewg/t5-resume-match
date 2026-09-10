param([string]$DistPath = 'dist', [string]$WorkPath = 'build')
$ErrorActionPreference = 'Stop'
if ($env:OS -ne 'Windows_NT') { throw 'Build on Windows with uv installed.' }
Push-Location (Split-Path $PSScriptRoot -Parent)
try {
    if (-not (Get-Command uv -ErrorAction SilentlyContinue)) { throw 'uv is required to build.' }
    if (-not (Get-Command npm -ErrorAction SilentlyContinue)) { throw 'Node/npm is required on the build machine only.' }
    npm --prefix frontend ci
    if ($LASTEXITCODE -ne 0) { throw 'Frontend dependency installation failed.' }
    npm --prefix frontend run build
    if ($LASTEXITCODE -ne 0) { throw 'Frontend build failed.' }
    uv sync --locked --group build
    if ($LASTEXITCODE -ne 0) { throw 'Dependency installation failed.' }
    $projectRoot = (Get-Location).Path
    # Explicit allowlist: never collect the project root, .env, or user databases.
    uv run --locked --group build pyinstaller --noconfirm --clean --onedir --console `
        --name T5-Resume-Match --distpath $DistPath --workpath $WorkPath --specpath $WorkPath --paths . `
        --hidden-import backend.modules.resume.public `
        --hidden-import backend.modules.jobs.public `
        --hidden-import backend.modules.diagnosis.public `
        --hidden-import backend.modules.analytics.public `
        --add-data "${projectRoot}/frontend/dist:frontend/dist" `
        --add-data "${projectRoot}/examples/fixtures/team.json:examples/fixtures" `
        --add-data "${projectRoot}/backend/modules/jobs/domain_terms.json:backend/modules/jobs" `
        --add-data "${projectRoot}/data/holdout/2026-09-08/jd:data/holdout/2026-09-08/jd" `
        backend/windows_launcher.py
    if ($LASTEXITCODE -ne 0) { throw 'PyInstaller failed.' }
    Set-Content -LiteralPath (Join-Path $DistPath 'T5-Resume-Match/.env.example') -Encoding ascii `
        -Value 'DEEPSEEK_API_KEY='
    Copy-Item -LiteralPath 'docs/windows-quickstart.txt' `
        -Destination (Join-Path $DistPath 'T5-Resume-Match/使用说明.txt')
    Write-Host (Join-Path $DistPath 'T5-Resume-Match/T5-Resume-Match.exe')
} finally {
    Pop-Location
}
