$ErrorActionPreference = 'Stop'
$App = Split-Path $PSScriptRoot -Parent
$InstallRoot = Join-Path $env:USERPROFILE 'AppData\Local\Alien'
$Runtime = Join-Path $App '.runtime'
if (!(Test-Path (Join-Path $Runtime 'node.exe'))) {
  $Runtime = Join-Path $InstallRoot 'runtime'
}
$Data = Join-Path $InstallRoot 'data'
$Log = Join-Path $Data 'autostart.log'
try {
  New-Item -ItemType Directory -Path $Data -Force | Out-Null
  if (!(Test-Path (Join-Path $Runtime 'node.exe'))) {
    throw "Alien Node.js runtime was not found at $Runtime."
  }
  $env:ALIEN_ROOT = $App
  $env:ALIEN_DATA = $Data
  $env:PATH = "$Runtime;$env:PATH"
  $TokenSource = Join-Path $App '.runtime-access-token'
  if (!(Test-Path $TokenSource)) {
    $bytes = New-Object byte[] 32
    [Security.Cryptography.RandomNumberGenerator]::Create().GetBytes($bytes)
    $GeneratedToken = ($bytes | ForEach-Object { $_.ToString('x2') }) -join ''
    Set-Content -LiteralPath $TokenSource -Value $GeneratedToken -NoNewline
  }
  $MasterToken = Get-Content -Raw -LiteralPath $TokenSource
  if ($MasterToken -notmatch '^[a-f0-9]{64}$') { throw 'Alien access-token source is invalid.' }
  Set-Content -LiteralPath (Join-Path $Data 'access-token') -Value $MasterToken -NoNewline
  & icacls.exe $TokenSource /inheritance:r /grant:r "$($env:USERDOMAIN)\$($env:USERNAME):(R,W)" | Out-Null
  if ($LASTEXITCODE -ne 0) { throw 'Could not restrict the local access-token source.' }
  Set-Location $App
  & (Join-Path $Runtime 'node.exe') 'scripts\supervisor.mjs' *>> $Log
  if ($LASTEXITCODE -ne 0) { throw "Alien supervisor exited with code $LASTEXITCODE." }
} catch {
  $_ | Out-String | Add-Content -LiteralPath $Log
  exit 1
}
