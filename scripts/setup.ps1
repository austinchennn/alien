param([string]$InstallRoot = "$env:LOCALAPPDATA\Alien", [switch]$NoLaunch, [switch]$SkipRuntime)
$ErrorActionPreference = 'Stop'
$App = Split-Path $PSScriptRoot -Parent
$Runtime = Join-Path $InstallRoot 'runtime'
$Data = Join-Path $InstallRoot 'data'
New-Item -ItemType Directory -Path $InstallRoot,$Data -Force | Out-Null
if (!(Test-Path "$Runtime\node.exe")) {
  Write-Host 'Preparing free, local Node.js runtime...'
  $Index = Invoke-RestMethod 'https://nodejs.org/dist/index.json'
  $Node = $Index | Where-Object { $_.version -match '^v24\.' -and $_.lts } | Select-Object -First 1
  if (!$Node) { throw 'Node.js 24 LTS not found.' }
  $Name = "node-$($Node.version)-win-x64"
  $Download = Join-Path $env:TEMP ($Name + '.zip')
  Invoke-WebRequest "https://nodejs.org/dist/$($Node.version)/$Name.zip" -OutFile $Download
  $Checks = (Invoke-WebRequest "https://nodejs.org/dist/$($Node.version)/SHASUMS256.txt").Content
  $Expected = (($Checks -split "`n" | Where-Object { $_ -match "  $([regex]::Escape($Name)).zip\s*$" }) -split '\s+')[0]
  if (!$Expected -or (Get-FileHash $Download -Algorithm SHA256).Hash.ToLowerInvariant() -ne $Expected.ToLowerInvariant()) { throw 'Node.js checksum mismatch.' }
  $Extract = Join-Path $env:TEMP ('alien-node-' + [guid]::NewGuid().ToString('N'))
  Expand-Archive $Download $Extract
  Move-Item "$Extract\$Name" $Runtime
  Remove-Item $Download,$Extract -Recurse -Force
}
$env:PATH = "$Runtime;" + $env:PATH
$env:ALIEN_DATA = $Data
Push-Location $App
try {
  & "$Runtime\npm.cmd" ci --ignore-scripts --no-fund --no-audit --cache "$Data\cache\npm"
  if ($LASTEXITCODE -ne 0) { throw 'Dependency installation failed.' }
  & "$Runtime\npm.cmd" run build
  if ($LASTEXITCODE -ne 0) { throw 'Application build failed.' }
  & "$Runtime\node.exe" scripts/supervisor.mjs --snapshot
  if ($LASTEXITCODE -ne 0) { throw 'Recovery snapshot failed.' }
  # Restrict local credentials and data to the installing Windows user.
  & icacls.exe $Data /inheritance:r /grant:r "$($env:USERNAME):(OI)(CI)F" | Out-Null
  if ($LASTEXITCODE -ne 0) { throw 'Could not restrict the local data directory.' }
  $Shell = New-Object -ComObject WScript.Shell
  $Shortcut = $Shell.CreateShortcut((Join-Path ([Environment]::GetFolderPath('Desktop')) 'Alien.lnk'))
  $Shortcut.TargetPath = "$App\start.cmd"
  $Shortcut.WorkingDirectory = $App
  $Shortcut.Save()
  Write-Host 'Alien is installed. Model weights were not downloaded.'
  Write-Host 'Preparing WSL, free vLLM and Podman (software downloads only)...'
  if (!$SkipRuntime) {
    $Preparation=Start-Process -FilePath 'powershell.exe' -ArgumentList @('-NoProfile','-ExecutionPolicy','Bypass','-File',('"' + $App + '\scripts\prepare-runtime.ps1"')) -Wait -PassThru -NoNewWindow
    if ($Preparation.ExitCode -ne 0) { Write-Host 'Runtime setup is pending. After Windows/Ubuntu setup or a reboot, double-click Prepare-Runtime.cmd.' }
  }
  Write-Host 'When your model files are ready, double-click Configure-Model.cmd to select the local folder.'
  $Gpu=Get-Command nvidia-smi.exe -ErrorAction SilentlyContinue
  if ($Gpu) { & $Gpu.Source --query-gpu=name,memory.total --format=csv,noheader,nounits | Set-Content -Encoding UTF8 "$Data\gpu.txt" }
  if (!$NoLaunch) { & "$App\start.cmd" }
} finally { Pop-Location }
