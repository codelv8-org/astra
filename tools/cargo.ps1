param([ValidateSet('core-test','ipc-test','desktop-dev','desktop-build','desktop-installer','core-smoke','real-smoke','workflow-smoke','queue-smoke','real-workflow','core-clippy','remote-host-build')][string]$Action = 'core-test',[switch]$RetryFailed,[switch]$Reverify)
$ErrorActionPreference = 'Stop'
# เลือก Visual Studio ที่มี C++ workload จริง ไม่ใช้ installation ที่ขาด libraries
$vswhere = Join-Path ${env:ProgramFiles(x86)} 'Microsoft Visual Studio\Installer\vswhere.exe'
if (!(Test-Path -LiteralPath $vswhere)) { throw 'Visual Studio Installer/vswhere is required' }
$installation = & $vswhere -latest -products '*' -requires Microsoft.VisualStudio.Component.VC.Tools.x86.x64 -property installationPath
if (!$installation) { throw 'Install Desktop development with C++ and Windows SDK first' }
$developerScript = Join-Path $installation 'Common7\Tools\VsDevCmd.bat'
if (!(Test-Path -LiteralPath $developerScript)) { throw 'VsDevCmd.bat is unavailable' }
$environment = & $env:ComSpec /d /c "call `"$developerScript`" -arch=x64 -host_arch=x64 >nul && set"
if ($LASTEXITCODE -ne 0) { throw 'Cannot initialize MSVC environment' }
foreach ($entry in $environment) {
    if ($entry -match '^([^=]+)=(.*)$') { [Environment]::SetEnvironmentVariable($matches[1], $matches[2], 'Process') }
}
switch ($Action) {
    'remote-host-build' { & cargo build --package crewnest-core --example remote_host }
    'core-test' { & cargo test --package crewnest-core }
    'ipc-test' { & cargo test --package crewnest-desktop }
    'core-clippy' { & cargo clippy --package crewnest-core --all-targets -- -D warnings }
    'desktop-dev' { & pnpm --filter '@crewnest/desktop' tauri dev }
    'desktop-build' { & pnpm --filter '@crewnest/desktop' tauri build --no-bundle }
    'desktop-installer' { & pnpm --filter '@crewnest/desktop' tauri build --bundles nsis }
    'core-smoke' { & cargo run --package crewnest-core --example smoke }
    'real-smoke' { & cargo run --package crewnest-core --example smoke -- --real }
    'workflow-smoke' { & cargo run --package crewnest-core --example workflow_smoke }
    'queue-smoke' { & cargo run --package crewnest-core --example queue_smoke }
    'real-workflow' { if ($Reverify) { & cargo run --package crewnest-core --example real_workflow -- --reverify } elseif ($RetryFailed) { & cargo run --package crewnest-core --example real_workflow -- --retry-failed } else { & cargo run --package crewnest-core --example real_workflow } }
}
exit $LASTEXITCODE
