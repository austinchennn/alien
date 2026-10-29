param([Parameter(Mandatory=$true)][string]$ModelPath,[string]$Distro='Ubuntu',[int]$Context=8192)
$ErrorActionPreference='Stop'
if (!(Test-Path $ModelPath)) { throw 'Local model directory does not exist. Model download is intentionally manual.' }
if ($Distro -notmatch '^[a-zA-Z0-9._-]+$' -or $Context -lt 2048 -or $Context -gt 65536) { throw 'Invalid configuration.' }
$LinuxModel=(& wsl.exe -d $Distro -- wslpath -a (Resolve-Path $ModelPath).Path).Trim()
$LinuxHome=(& wsl.exe -d $Distro -- printenv HOME).Trim()
if ($LASTEXITCODE -ne 0 -or !$LinuxHome) { throw 'WSL home directory unavailable.' }
& wsl.exe -d $Distro -- env HF_HUB_OFFLINE=1 TRANSFORMERS_OFFLINE=1 VLLM_NO_USAGE_STATS=1 DO_NOT_TRACK=1 "$LinuxHome/.local/share/alien/inference/bin/vllm" serve $LinuxModel --served-model-name alien-local --host 127.0.0.1 --port 8000 --max-model-len $Context --max-num-seqs 1 --gpu-memory-utilization 0.85 --enforce-eager --language-model-only --enable-auto-tool-choice --tool-call-parser qwen3_coder --reasoning-parser qwen3
if ($LASTEXITCODE -ne 0) { throw 'Local inference did not start. Check GPU memory and the chosen quantization format.' }
