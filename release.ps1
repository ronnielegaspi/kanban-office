<#
  release.ps1 — cut a new Kanban Office release.

  Does the whole pipeline:
    1. bump package.json version
    2. sync source + package.json + icon into both dist builds
    3. re-stamp exe file/product version (rcedit)
    4. rebuild app.zip for each arch
    5. build both installers via IExpress (note: /Q makes iexpress fail silently -> /N only)
    6. commit + push to main
    7. gh release create vX.Y.Z with both installers attached

  Usage:
    powershell -ExecutionPolicy Bypass -File .\release.ps1 -Version 0.1.2
    powershell -ExecutionPolicy Bypass -File .\release.ps1 -Version 0.1.2 -Notes "Fixed scrolling on Surface Pro."
    powershell -ExecutionPolicy Bypass -File .\release.ps1 -Version 0.1.2 -NoRelease   # build only, no push/release
#>
param(
  [Parameter(Mandatory = $true)][string]$Version,
  [string]$Notes = "",
  [switch]$NoRelease
)
$ErrorActionPreference = 'Stop'
$base = $PSScriptRoot
$arm  = Join-Path $base 'dist\Kanban Office-win32-arm64'
$x64  = Join-Path $base 'dist\Kanban Office-win32-x64'
$rc   = Join-Path $base 'node_modules\rcedit\bin\rcedit-x64.exe'
$gh   = if (Get-Command gh -ErrorAction SilentlyContinue) { 'gh' } else { 'C:\Program Files\GitHub CLI\gh.exe' }
$tag  = "v$Version"
function Step($m) { Write-Host "`n==> $m" -ForegroundColor Cyan }

if (-not (Test-Path $arm) -or -not (Test-Path $x64)) { throw "dist build folders missing — package the app first (npm run package / package:x64)." }
if (-not (Test-Path $rc)) { throw "rcedit not found — run: npm install --no-save rcedit" }

Step "1/7  Bump package.json -> $Version"
$pkgPath = Join-Path $base 'package.json'
$pkg = Get-Content $pkgPath -Raw
$pkg = [regex]::Replace($pkg, '(?m)("version":\s*")[^"]*(")', "`${1}$Version`${2}")
Set-Content -Path $pkgPath -Value $pkg -Encoding UTF8 -NoNewline

Step "2/7  Sync source + icon into both builds"
$files = 'main.js','preload.js','office-floor.html','package.json','icon.ico','icon.png'
foreach ($d in @($arm,$x64)) {
  $app = Join-Path $d 'resources\app'
  foreach ($f in $files) { Copy-Item (Join-Path $base $f) (Join-Path $app $f) -Force }
}

Step "3/7  Stop running app + re-stamp exe version"
Get-Process -Name 'Kanban Office','electron' -ErrorAction SilentlyContinue | Stop-Process -Force
Start-Sleep -Milliseconds 500
foreach ($d in @($arm,$x64)) {
  $exe = Join-Path $d 'Kanban Office.exe'
  & $rc $exe --set-icon (Join-Path $base 'icon.ico') --set-file-version "$Version.0" --set-product-version "$Version.0" | Out-Null
}

Step "4/7  Rebuild app.zip (arm64 + x64)"
Remove-Item (Join-Path $base 'installer-build\app.zip'),(Join-Path $base 'installer-build-x64\app.zip') -ErrorAction SilentlyContinue
Compress-Archive -Path $arm -DestinationPath (Join-Path $base 'installer-build\app.zip') -Force
Compress-Archive -Path $x64 -DestinationPath (Join-Path $base 'installer-build-x64\app.zip') -Force

Step "5/7  Build installers (IExpress, /N only)"
$setupArm = Join-Path $base 'dist\KanbanOffice-Setup-arm64.exe'
$setupX64 = Join-Path $base 'dist\KanbanOffice-Setup-x64.exe'
Remove-Item $setupArm,$setupX64 -ErrorAction SilentlyContinue
$p1 = Start-Process iexpress -ArgumentList '/N',(Join-Path $base 'installer-build\installer.sed')     -Wait -PassThru -NoNewWindow
$p2 = Start-Process iexpress -ArgumentList '/N',(Join-Path $base 'installer-build-x64\installer.sed') -Wait -PassThru -NoNewWindow
if (-not (Test-Path $setupArm)) { throw "arm64 installer not produced (iexpress exit $($p1.ExitCode))" }
if (-not (Test-Path $setupX64)) { throw "x64 installer not produced (iexpress exit $($p2.ExitCode))" }
Write-Host ("   arm64: {0:N1} MB   x64: {1:N1} MB" -f ((Get-Item $setupArm).Length/1MB), ((Get-Item $setupX64).Length/1MB))

if ($NoRelease) { Step "Done (build only — skipped push & release)."; return }

Step "6/7  Commit + push"
git -C $base add package.json main.js preload.js office-floor.html icon.ico icon.png generate-icon.js
git -C $base commit -m "Release $tag$(if($Notes){" — $Notes"})" | Out-Null
git -C $base push origin main

Step "7/7  Create GitHub release $tag"
$relNotes = if ($Notes) { $Notes } else { "Kanban Office $tag." }
& $gh release create $tag $setupArm $setupX64 --target main --title "Kanban Office $tag" --notes $relNotes
Write-Host "`nReleased $tag" -ForegroundColor Green
& $gh release view $tag --json url --jq .url
