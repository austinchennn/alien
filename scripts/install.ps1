param([string]$InstallRoot = "$env:LOCALAPPDATA\Alien")
$ErrorActionPreference = 'Stop'
$Version = 'v0.1.0'
$Release = "https://github.com/austinchennn/alien/releases/download/$Version"
$Stage = Join-Path $env:TEMP ("alien-" + [guid]::NewGuid().ToString('N'))
New-Item -ItemType Directory -Path $Stage -Force | Out-Null
Write-Host 'Downloading Alien application (no model weights)...'
Invoke-WebRequest "$Release/Alien-Windows.zip" -OutFile "$Stage\Alien-Windows.zip"
Invoke-WebRequest "$Release/SHA256SUMS.txt" -OutFile "$Stage\SHA256SUMS.txt"
$Expected = ((Get-Content "$Stage\SHA256SUMS.txt" | Where-Object { $_ -match '  Alien-Windows.zip$' }) -split '\s+')[0]
$Actual = (Get-FileHash "$Stage\Alien-Windows.zip" -Algorithm SHA256).Hash
if (!$Expected -or $Actual.ToLowerInvariant() -ne $Expected.ToLowerInvariant()) { throw 'Archive checksum mismatch.' }
Expand-Archive "$Stage\Alien-Windows.zip" "$Stage\unpacked"
New-Item -ItemType Directory -Path $InstallRoot -Force | Out-Null
$App = Join-Path $InstallRoot 'app'
if (Test-Path $App) {
  $Backup = Join-Path $InstallRoot ('app.previous-' + (Get-Date -Format 'yyyyMMddHHmmss'))
  Move-Item $App $Backup
}
try {
  Move-Item "$Stage\unpacked\alien" $App
  & "$App\scripts\setup.ps1" -InstallRoot $InstallRoot -NoLaunch
  if ($LASTEXITCODE -and $LASTEXITCODE -notin @(0,3010)) { throw 'Application setup failed.' }
} catch {
  if (Test-Path $App) { Move-Item $App (Join-Path $InstallRoot ('app.failed-' + (Get-Date -Format 'yyyyMMddHHmmss'))) }
  if ($Backup -and (Test-Path $Backup)) { Move-Item $Backup $App }
  throw
}
Remove-Item $Stage -Recurse -Force
& "$App\start.cmd"
