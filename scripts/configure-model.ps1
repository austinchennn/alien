param([string]$ModelName, [int]$Context = 0)
$ErrorActionPreference = 'Stop'

$Ollama = Get-Command ollama.exe -ErrorAction SilentlyContinue
if (!$Ollama) {
  $Bundled = Join-Path $env:LOCALAPPDATA 'Programs\Ollama\ollama.exe'
  if (Test-Path $Bundled) { $Ollama = @{ Source = $Bundled } }
}
if (!$Ollama) {
  throw 'Ollama is not installed. Install it from https://ollama.com/download/windows, then reopen this command.'
}
if (!$ModelName) {
  $ModelName = Read-Host 'Enter an already downloaded Ollama model (default qwen3.5:4b)'
  if (!$ModelName) { $ModelName = 'qwen3.5:4b' }
}
if ($Context -eq 0) {
  $ContextInput = Read-Host 'Context length in tokens (default 4096)'
  if (!$ContextInput) {
    $Context = 4096
  } else {
    [int]$ParsedContext = 0
    if (![int]::TryParse($ContextInput, [ref]$ParsedContext)) {
      throw 'Context must be a whole number.'
    }
    $Context = $ParsedContext
  }
}
if ($ModelName -notmatch '^[A-Za-z0-9][A-Za-z0-9._:/-]{0,127}$' -or $ModelName -match '^alien-local(?::.*)?$' -or $ModelName -match ':cloud$') {
  throw 'Enter a valid base model name other than alien-local.'
}
if ($Context -lt 2048 -or $Context -gt 65536) {
  throw 'Context must be between 2048 and 65536 tokens.'
}

& $Ollama.Source show $ModelName *> $null
if ($LASTEXITCODE -ne 0) {
  throw "Model '$ModelName' is not installed. Run 'ollama pull $ModelName' first. No model was downloaded by this script."
}

$Modelfile = Join-Path $env:TEMP ('alien-' + [guid]::NewGuid().ToString('N') + '.Modelfile')
try {
  @("FROM $ModelName", "PARAMETER num_ctx $Context") | Set-Content -Encoding ascii $Modelfile
  & $Ollama.Source create alien-local:latest -f $Modelfile
  if ($LASTEXITCODE -ne 0) { throw 'Could not create the Alien model alias.' }
} finally {
  Remove-Item -LiteralPath $Modelfile -Force -ErrorAction SilentlyContinue
}

$Data = if ($env:ALIEN_DATA) { $env:ALIEN_DATA } else { Join-Path $env:LOCALAPPDATA 'Alien\data' }
New-Item -ItemType Directory -Path $Data -Force | Out-Null
@{ Model = 'alien-local:latest'; Context = $Context } |
  ConvertTo-Json |
  Set-Content -Encoding UTF8 (Join-Path $Data 'model.json')
Write-Host "Alien is configured to use Ollama model '$ModelName' through the local alias 'alien-local:latest' with a $Context-token context. Restart Alien to apply it."
