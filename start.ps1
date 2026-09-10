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
        $dependencyStamp = Join-Path $PSScriptRoot 'frontend/node_modules/.t5-dependencies.sha256'
        $dependencyHash = ((Get-FileHash -Algorithm SHA256 -LiteralPath 'frontend/package.json', 'frontend/package-lock.json').Hash -join ':')
        $installedHash = if (Test-Path -LiteralPath $dependencyStamp) { (Get-Content -LiteralPath $dependencyStamp -Raw).Trim() } else { '' }
        $dependenciesReady = $installedHash -eq $dependencyHash
        if ($dependenciesReady) {
            npm --prefix frontend ls --all --silent *> $null
            $dependenciesReady = $LASTEXITCODE -eq 0
        }
        if (-not $dependenciesReady) {
            # npm ci removes node_modules first. Check loaded native bindings before it can
            # leave a partially deleted dependency tree on Windows.
            if (Test-Path -LiteralPath 'frontend/node_modules') {
                Get-ChildItem -LiteralPath 'frontend/node_modules' -Filter '*.node' -Recurse -File | ForEach-Object {
                    $binding = $null
                    try {
                        $binding = [System.IO.File]::Open($_.FullName, 'Open', 'ReadWrite', 'None')
                    } catch {
                        throw "Frontend native module is in use or not writable: $($_.Exception.Message). Stop this project's Vite/test process and retry. No dependencies have been removed."
                    } finally {
                        if ($null -ne $binding) { $binding.Dispose() }
                    }
                }
            }
            npm --prefix frontend ci
            if ($LASTEXITCODE -ne 0) { throw 'Frontend dependency installation failed. Stop this project''s Vite/test process before retrying if npm reports EPERM.' }
            Set-Content -LiteralPath $dependencyStamp -Value $dependencyHash -Encoding ASCII
        }
        npm --prefix frontend run build
        if ($LASTEXITCODE -ne 0) { throw 'Frontend build failed.' }
    }
    uv run --locked python -m uvicorn backend.main:app --host 127.0.0.1 --port $Port
    if ($LASTEXITCODE -ne 0) { throw 'Server exited with an error.' }
} finally {
    Pop-Location
}
