param(
    [ValidateSet('Start', 'Stop', 'Connect', 'Status')][string]$Action = 'Start',
    [string]$RuntimeRoot = (Join-Path $PSScriptRoot '../.verification/postgres'),
    [int]$Port = 55432
)
$ErrorActionPreference = 'Stop'
$t5Runtime = [IO.Path]::GetFullPath($RuntimeRoot)
$t5Bin = Join-Path $t5Runtime 'pgsql/bin'
$t5Data = Join-Path $t5Runtime 'cluster'
$t5PasswordFile = Join-Path $t5Runtime 'password.txt'
$t5Ctl = Join-Path $t5Bin 'pg_ctl.exe'
if (-not (Test-Path -LiteralPath $t5Ctl)) { throw 'Extract official PostgreSQL binaries under RuntimeRoot/pgsql first; see docs/postgres.md.' }
if ($Action -eq 'Stop') {
    & $t5Ctl -D $t5Data -w -m fast stop
    if ($LASTEXITCODE) { throw 'PostgreSQL stop failed' }
    return
}
if ($Action -eq 'Status') { & $t5Ctl -D $t5Data status; return }
if ($Action -eq 'Start') {
    if (-not (Test-Path -LiteralPath (Join-Path $t5Data 'PG_VERSION'))) {
        if (-not (Test-Path -LiteralPath $t5PasswordFile)) {
            [IO.File]::WriteAllText($t5PasswordFile, [Convert]::ToHexString([Security.Cryptography.RandomNumberGenerator]::GetBytes(24)))
        }
        & (Join-Path $t5Bin 'initdb.exe') -D $t5Data -U t5_local -A scram-sha-256 --pwfile=$t5PasswordFile --encoding=UTF8 --locale=C
        if ($LASTEXITCODE) { throw 'PostgreSQL initdb failed' }
        Add-Content -LiteralPath (Join-Path $t5Data 'postgresql.conf') "`nlisten_addresses = '127.0.0.1'`nport = $Port"
    }
    & $t5Ctl -D $t5Data status *> $null
    if ($LASTEXITCODE) {
        # Wait only for pg_ctl itself; Start-Process -Wait also waits for server descendants.
        $t5Log = Join-Path $t5Runtime 'server.log'
        $t5Process = Start-Process -FilePath $t5Ctl -ArgumentList "-D `"$t5Data`" -l `"$t5Log`" -w start" -WindowStyle Hidden -PassThru
        $t5Process.WaitForExit()
        if ($t5Process.ExitCode) { throw "PostgreSQL startup failed; inspect $t5Log" }
    }
}
$t5Password = [IO.File]::ReadAllText($t5PasswordFile)
$t5PreviousPassword = $env:PGPASSWORD
$env:PGPASSWORD = $t5Password
try {
    $t5Exists = & (Join-Path $t5Bin 'psql.exe') -h 127.0.0.1 -p $Port -U t5_local -d postgres -Atc "SELECT 1 FROM pg_database WHERE datname='t5'"
    if ($LASTEXITCODE) { throw 'PostgreSQL connection failed' }
    if ($t5Exists -ne '1') {
        & (Join-Path $t5Bin 'createdb.exe') -h 127.0.0.1 -p $Port -U t5_local t5
        if ($LASTEXITCODE) { throw 'Database creation failed' }
    }
} finally {
    if ($null -eq $t5PreviousPassword) { Remove-Item Env:PGPASSWORD -ErrorAction SilentlyContinue }
    else { $env:PGPASSWORD = $t5PreviousPassword }
}
$env:T5_DATABASE_URL = "postgresql+psycopg://t5_local:${t5Password}@127.0.0.1:${Port}/t5"
$env:T5_TEST_DATABASE_URL = $env:T5_DATABASE_URL
Write-Output 'PASS: local PostgreSQL connected; T5_DATABASE_URL and T5_TEST_DATABASE_URL set in this PowerShell process.'
