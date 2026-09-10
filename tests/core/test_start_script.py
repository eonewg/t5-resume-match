"""Windows startup must not delete installed dependencies during source rebuilds."""

import os
import subprocess
import sys
from pathlib import Path

import pytest

pytestmark = pytest.mark.skipif(sys.platform != "win32", reason="Windows launcher")
START_SCRIPT = Path(__file__).resolve().parents[2] / "start.ps1"


@pytest.mark.parametrize("scenario", ["reuse-locked", "install-locked", "repair"])
def test_rebuild_dependency_lifecycle(tmp_path: Path, scenario: str):
    (tmp_path / "start.ps1").write_bytes(START_SCRIPT.read_bytes())
    frontend = tmp_path / "frontend"
    modules = frontend / "node_modules"
    modules.mkdir(parents=True)
    (frontend / "package.json").write_text("{}", encoding="utf-8")
    (frontend / "package-lock.json").write_text("{}", encoding="utf-8")
    (modules / "binding.node").write_text("native module sentinel", encoding="utf-8")
    harness = tmp_path / "verify.ps1"
    harness.write_text(
        """
param([string]$Scenario)
$ErrorActionPreference = 'Stop'
Set-Location $PSScriptRoot
$global:calls = [System.Collections.Generic.List[string]]::new()
function global:uv { $global:calls.Add('uv ' + ($args -join ' ')); $global:LASTEXITCODE = 0 }
function global:npm {
    $global:calls.Add('npm ' + ($args -join ' '))
    $global:LASTEXITCODE = if ($Scenario -eq 'repair' -and $args -contains 'ls') { 1 } else { 0 }
}
$stamp = 'frontend/node_modules/.t5-dependencies.sha256'
$hash = ((Get-FileHash -Algorithm SHA256 -LiteralPath 'frontend/package.json', 'frontend/package-lock.json').Hash -join ':')
if ($Scenario -ne 'install-locked') { Set-Content -LiteralPath $stamp -Value $hash -Encoding ASCII }
$lock = $null
if ($Scenario -ne 'repair') { $lock = [System.IO.File]::Open((Join-Path $PSScriptRoot 'frontend/node_modules/binding.node'), 'Open', 'Read', 'None') }
$failure = ''
try { & ./start.ps1 -RebuildFrontend } catch { $failure = $_.Exception.Message } finally { if ($lock) { $lock.Dispose() } }
$install = $global:calls -contains 'npm --prefix frontend ci'
$build = $global:calls -contains 'npm --prefix frontend run build'
if ($Scenario -eq 'install-locked') {
    if (-not $failure.Contains('No dependencies have been removed') -or $install -or $build) { throw 'Locked module must stop startup before npm ci or build.' }
} else {
    if ($failure -or -not $build) { throw ('Rebuild did not complete: ' + $failure) }
    if ($install -ne ($Scenario -eq 'repair')) { throw 'Unexpected dependency installation.' }
    if ((Get-Content -LiteralPath $stamp -Raw).Trim() -ne $hash) { throw 'Dependency stamp is incorrect.' }
}
if ((Get-Content -LiteralPath 'frontend/node_modules/binding.node' -Raw) -ne 'native module sentinel') { throw 'Existing dependency was altered.' }
Write-Output "PASS $Scenario"
""",
        encoding="utf-8-sig",
    )
    # Python inherits PowerShell 7's module path. Let Windows PowerShell 5.1
    # initialize its own paths, as it does when launched directly by the user.
    environment = {key: value for key, value in os.environ.items() if key.lower() != "psmodulepath"}
    result = subprocess.run(
        [
            "powershell.exe",
            "-NoProfile",
            "-ExecutionPolicy",
            "Bypass",
            "-File",
            str(harness),
            scenario,
        ],
        capture_output=True,
        text=True,
        timeout=30,
        check=False,
        env=environment,
    )
    assert result.returncode == 0, result.stdout + result.stderr
    assert f"PASS {scenario}" in result.stdout
