param([string]$ModelPath,[string]$Distro='Ubuntu',[int]$Context=8192)
$ErrorActionPreference='Stop'
if (!$ModelPath) {
  Add-Type -AssemblyName System.Windows.Forms
  $Dialog=New-Object System.Windows.Forms.FolderBrowserDialog
  $Dialog.Description='Choose your EXISTING local model folder (config.json and safetensors). No models will be downloaded.'
  if ($Dialog.ShowDialog() -ne 'OK') { exit 0 }
  $ModelPath=$Dialog.SelectedPath
}
if (!(Test-Path (Join-Path $ModelPath 'config.json'))) { throw 'Select a complete Hugging Face model folder, not a GGUF file or cache parent.' }
if ($Distro -notmatch '^[a-zA-Z0-9._-]+$' -or $Context -lt 2048 -or $Context -gt 65536) { throw 'Invalid model settings.' }
$Data=if ($env:ALIEN_DATA) { $env:ALIEN_DATA } else { "$env:LOCALAPPDATA\Alien\data" }
New-Item -ItemType Directory -Path $Data -Force | Out-Null
@{ModelPath=(Resolve-Path $ModelPath).Path;Distro=$Distro;Context=$Context} | ConvertTo-Json | Set-Content -Encoding UTF8 (Join-Path $Data 'model.json')
Write-Host 'Local model selected. Restart Alien to start it automatically with vLLM. No model weights were downloaded.'
