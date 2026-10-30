#!/usr/bin/env bash
set -euo pipefail
app_dir="${1:-$(cd "$(dirname "$0")/.." && pwd)}"
sudo apt-get update
sudo apt-get install -y podman
podman pull docker.io/library/node:22-alpine
podman build -t localhost/alien-evaluator:0.1.0 -f "$app_dir/sandbox/Dockerfile" "$app_dir"
printf '%s\n' 'Alien container sandbox is ready. Ollama runs natively on Windows; no model weights were downloaded.'
