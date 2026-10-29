#!/usr/bin/env bash
set -euo pipefail
app_dir="${1:-$(cd "$(dirname "$0")/.." && pwd)}"
sudo apt-get update
sudo apt-get install -y podman python3-venv python3-pip
python3 -m venv "$HOME/.local/share/alien/inference"
"$HOME/.local/share/alien/inference/bin/pip" install 'vllm==0.32.0'
podman pull docker.io/library/node:22-alpine
podman build -t localhost/alien-evaluator:0.1.0 -f "$app_dir/sandbox/Dockerfile" "$app_dir"
printf '%s\n' 'Alien local inference and evaluator are ready. No model weights were downloaded.'
