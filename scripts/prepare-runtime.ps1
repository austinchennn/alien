param([string]$Distro='Ubuntu')
$ErrorActionPreference='Stop'
if ($Distro -notmatch '^[a-zA-Z0-9._-]+$') { throw 'Invalid distribution name.' }
$App=Split-Path $PSScriptRoot -Parent
$Ready = & wsl.exe -d $Distro -- echo ALIEN_READY 2>$null
if ($LASTEXITCODE -ne 0 -or ($Ready -join '') -notmatch 'ALIEN_READY') {
  Write-Host 'WSL/Ubuntu is not ready. Windows may request administrator permission and a reboot.'
  & wsl.exe --install -d $Distro --no-launch
  Write-Host 'After any required reboot, open Ubuntu once to finish its user setup, then rerun this script.'
  exit 3010
}
$LinuxApp=(& wsl.exe -d $Distro -- wslpath -a $App).Trim()
& wsl.exe -d $Distro -- bash "$LinuxApp/scripts/prepare-runtime.sh" $LinuxApp
if ($LASTEXITCODE -ne 0) { throw 'Runtime preparation failed. See the terminal output.' }
