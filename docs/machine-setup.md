# Alien deployment: Alienware m17 R4

This document records the dedicated host's hardware and deployment choices.

## Host hardware

| Component | Detected configuration |
| --- | --- |
| Model | Alienware m17 R4 |
| CPU | Intel Core i7-10870H, 8 cores / 16 threads, 2.20 GHz base |
| GPU | NVIDIA GeForce RTX 3070 Laptop GPU (Ampere), driver 581.32 |
| Dedicated VRAM | 8 GB (8192 MiB), confirmed by `nvidia-smi` |
| System memory | 16 GB (2 x 8 GB Micron), rated 3200 MHz and configured at 2933 MHz |
| Storage | 1 TB WDC PC SN730 NVMe SSD (953.9 GB reported by Windows) |
| OS | Windows 11 Home Chinese, 64-bit, build 26200 |
| BIOS | Alienware 1.23.0 |
| Display | 1920 x 1080 |

Windows' `Win32_VideoController.AdapterRAM` reported 4 GB on this host; `nvidia-smi` reports 8192 MiB and is the source used for the GPU configuration.

## Deployment

- Repository checkout: `C:\Alien`.
- Application data/runtime: `%LOCALAPPDATA%\Alien`.
- Ollama runs natively on Windows; no model weights are included. With 8 GB VRAM, start with Qwen3.5 4B at 4096 context. The 9B package can leave too little VRAM for the desktop, cache and runtime buffers.
- WSL/Ubuntu and Podman are optional and used only for the isolated tool/evaluator sandbox.
- A scheduled task starts Alien when the current Windows user logs in. This does not run before login, so the Windows session must remain active. AC sleep and hibernation are disabled, and closing the lid is set to do nothing while plugged in; keep the lid open and vents clear during sustained GPU use.

The hardware snapshot was recorded on 2026-10-31. Recheck `nvidia-smi` and the installed RAM before changing model settings.
